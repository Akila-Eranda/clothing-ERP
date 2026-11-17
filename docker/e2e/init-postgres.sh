#!/bin/sh
set -eu

secret_file=/run/secrets/e2e_database_password
if [ ! -s "$secret_file" ]; then
  echo "E2E database-role password secret is missing or empty." >&2
  exit 1
fi

E2E_DATABASE_PASSWORD="$(cat "$secret_file")"
export E2E_DATABASE_PASSWORD

psql \
  --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
\getenv e2e_password E2E_DATABASE_PASSWORD
CREATE ROLE hexa_e2e
  WITH LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  PASSWORD :'e2e_password';
CREATE DATABASE hexa_e2e_wave1 OWNER hexa_e2e;
SQL

unset E2E_DATABASE_PASSWORD
