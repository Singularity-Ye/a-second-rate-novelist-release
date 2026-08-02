#!/bin/sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${SHARED_DEV_DB_NAME:?SHARED_DEV_DB_NAME is required}"
: "${SHARED_DEV_DB_USER:?SHARED_DEV_DB_USER is required}"
: "${SHARED_DEV_DB_PASSWORD:?SHARED_DEV_DB_PASSWORD is required}"
: "${STAGING_DB_NAME:?STAGING_DB_NAME is required}"
: "${STAGING_DB_USER:?STAGING_DB_USER is required}"
: "${STAGING_DB_PASSWORD:?STAGING_DB_PASSWORD is required}"

psql \
  -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=shared_dev_db="$SHARED_DEV_DB_NAME" \
  --set=shared_dev_user="$SHARED_DEV_DB_USER" \
  --set=shared_dev_password="$SHARED_DEV_DB_PASSWORD" \
  --set=staging_db="$STAGING_DB_NAME" \
  --set=staging_user="$STAGING_DB_USER" \
  --set=staging_password="$STAGING_DB_PASSWORD" <<'EOSQL'
SELECT format('CREATE ROLE %I LOGIN', :'shared_dev_user')
WHERE NOT EXISTS (
  SELECT FROM pg_catalog.pg_roles WHERE rolname = :'shared_dev_user'
)
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L',
  :'shared_dev_user',
  :'shared_dev_password'
)
\gexec

SELECT format('CREATE ROLE %I LOGIN', :'staging_user')
WHERE NOT EXISTS (
  SELECT FROM pg_catalog.pg_roles WHERE rolname = :'staging_user'
)
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L',
  :'staging_user',
  :'staging_password'
)
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'shared_dev_db', :'shared_dev_user')
WHERE NOT EXISTS (
  SELECT FROM pg_catalog.pg_database WHERE datname = :'shared_dev_db'
)
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'shared_dev_db', :'shared_dev_user')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'staging_db', :'staging_user')
WHERE NOT EXISTS (
  SELECT FROM pg_catalog.pg_database WHERE datname = :'staging_db'
)
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'staging_db', :'staging_user')
\gexec
EOSQL
