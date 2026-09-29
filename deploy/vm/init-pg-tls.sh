#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"

mkdir -p pg-tls
chmod 0755 pg-tls
if [[ -e pg-tls/server.key || -e pg-tls/server.crt || -e pg-tls/ca.crt ]]; then
  echo 'PostgreSQL TLS files already exist; rotate with a reviewed procedure.' >&2
  exit 1
fi

# The Docker service is named postgres; Node verifies that exact DNS name.
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 90 \
  -subj '/CN=postgres' -addext 'subjectAltName=DNS:postgres' \
  -keyout pg-tls/server.key -out pg-tls/server.crt
cp pg-tls/server.crt pg-tls/ca.crt
openssl verify -CAfile pg-tls/ca.crt pg-tls/server.crt

# Official image UID/GID is resolved from the image instead of hard-coded.
postgres_ids="$(docker run --rm --entrypoint sh postgres:17-bookworm -c 'printf "%s:%s" "$(id -u postgres)" "$(id -g postgres)"')"
chown "$postgres_ids" pg-tls/server.key pg-tls/server.crt
chmod 0600 pg-tls/server.key
chmod 0644 pg-tls/server.crt pg-tls/ca.crt
echo 'PostgreSQL TLS files created; keep pg-tls/ out of Git and off public storage.'
