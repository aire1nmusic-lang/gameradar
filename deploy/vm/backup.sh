#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"

: "${BACKUP_BUCKET:?Set a private Yandex Object Storage bucket}"
: "${BACKUP_GPG_RECIPIENT:?Set the off-VM restore key recipient}"
tmpdir="${BACKUP_TMP_DIR:-/tmp}"
archive="$(mktemp "${tmpdir%/}/gamescout-pgdump-XXXXXXXX")"
trap 'rm -f -- "$archive"' EXIT

docker compose exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  | gpg --batch --yes --trust-model always --recipient "$BACKUP_GPG_RECIPIENT" --encrypt --output "$archive"
test -s "$archive"

key="private-postgres/$(date -u +%Y/%m/%d)/gamescout-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
aws --endpoint-url https://storage.yandexcloud.net s3 cp "$archive" "s3://$BACKUP_BUCKET/$key" --storage-class STANDARD
size="$(aws --endpoint-url https://storage.yandexcloud.net s3api head-object --bucket "$BACKUP_BUCKET" --key "$key" --query ContentLength --output text)"
test "$size" -gt 0
printf 'backup_uploaded key=%s bytes=%s\n' "$key" "$size"
