#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"

: "${BACKUP_BUCKET:?Set a private Yandex Object Storage bucket}"
: "${BACKUP_GPG_RECIPIENT:?Set the off-VM restore key recipient}"
[[ "$BACKUP_BUCKET" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || { echo 'Invalid backup bucket name' >&2; exit 1; }
: "${BACKUP_UPLOAD_TIMEOUT_SECONDS:=3600}"
[[ "$BACKUP_UPLOAD_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid upload timeout' >&2; exit 1; }
tmpdir="${BACKUP_TMP_DIR:-/tmp}"
archive="$(mktemp "${tmpdir%/}/gamescout-pgdump-XXXXXXXX")"
headers="$(mktemp "${tmpdir%/}/gamescout-headers-XXXXXXXX")"
trap 'rm -f -- "$archive" "$headers"' EXIT

docker compose exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  | gpg --batch --yes --trust-model always --recipient "$BACKUP_GPG_RECIPIENT" --encrypt --output "$archive"
test -s "$archive"

key="private-postgres/$(date -u +%Y/%m/%d)/gamescout-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
size="$(stat -c %s "$archive")"
sha256="$(sha256sum "$archive" | cut -d' ' -f1)"
md5="$(openssl dgst -md5 -binary "$archive" | base64 -w0)"

# Use the VM-attached service account's short-lived IAM token, not a static S3 key.
token_json="$(curl --fail --silent --show-error --max-time 10 --noproxy '*' \
  -H 'Metadata-Flavor:Google' \
  http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token)"
token="$(printf '%s' "$token_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
unset token_json
[[ ${#token} -gt 20 ]] || { echo 'VM service account token unavailable' >&2; exit 1; }

url="https://storage.yandexcloud.net/$BACKUP_BUCKET/$key"
upload_status="$(curl --silent --show-error --max-time "$BACKUP_UPLOAD_TIMEOUT_SECONDS" --output /dev/null --write-out '%{http_code}' \
  --upload-file "$archive" -H "Authorization: Bearer $token" \
  -H 'If-None-Match: *' -H "Content-MD5: $md5" \
  -H "x-amz-meta-sha256: $sha256" -H 'x-amz-storage-class: STANDARD' "$url")"
[[ "$upload_status" == 200 || "$upload_status" == 201 || "$upload_status" == 412 ]] || {
  echo "Object Storage PUT failed: HTTP $upload_status" >&2; exit 1;
}

curl --fail --silent --show-error --max-time 20 --output /dev/null --dump-header "$headers" \
  -I -H "Authorization: Bearer $token" "$url"
unset token
remote_size="$(awk 'tolower($1)=="content-length:" {gsub("\r","",$2); print $2}' "$headers" | tail -n 1)"
remote_sha256="$(awk 'tolower($1)=="x-amz-meta-sha256:" {gsub("\r","",$2); print $2}' "$headers" | tail -n 1)"
[[ "$remote_size" == "$size" && "$remote_sha256" == "$sha256" ]] || {
  echo 'Object Storage backup verification failed' >&2; exit 1;
}
printf 'backup_uploaded key=%s bytes=%s\n' "$key" "$size"
