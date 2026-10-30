#!/bin/bash
# 03_roles.sh : creates the limited database roles used by the app
# Runs on first start only. Reads names and passwords from the container environment,
# which docker-compose.yml fills from .env.local, so nothing is hard-coded here.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v db="$POSTGRES_DB" \
     -v app_user="$APP_DB_USER" -v app_pw="$APP_DB_PASSWORD" \
     -v ro_user="$READONLY_DB_USER" -v ro_pw="$READONLY_DB_PASSWORD" <<'EOSQL'

-- App role: reads and writes data, but cannot change the schema
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_pw';
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";

-- Read-only role: analytics endpoints only, and no access to login hashes
CREATE ROLE :"ro_user" LOGIN PASSWORD :'ro_pw';
GRANT CONNECT ON DATABASE :"db" TO :"ro_user";
GRANT USAGE ON SCHEMA public TO :"ro_user";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"ro_user";
REVOKE ALL ON app_user FROM :"ro_user";

-- Objects created later by the admin (views, tables) get the same grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO :"ro_user";
EOSQL