#!/bin/sh
# scripts/local.sh : run PostgreSQL 17 and MongoDB 7 locally WITHOUT Docker (data in .localdb/).
# Does the same as docker-compose.yml: first start runs sql/0*.sql and sql/03_roles.sh, then
# generates and loads the dataset. Requires: brew install postgresql@17, npm install (fetches mongod).
#
#   sh scripts/local.sh up       start both databases (initialises and loads on first run)
#   sh scripts/local.sh down     stop both
#   sh scripts/local.sh status   show what is running
#   sh scripts/local.sh reset    stop, delete .localdb/ and start fresh
set -e
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo ".env.local not found - copy .env.example to .env.local and fill it in" >&2; exit 1; }
set -a; . ./.env.local; set +a

PGBIN=${PGBIN:-$(brew --prefix postgresql@17 2>/dev/null)/bin}
[ -x "$PGBIN/pg_ctl" ] || { echo "PostgreSQL 17 not found - run: brew install postgresql@17" >&2; exit 1; }
DATA=$PWD/.localdb
PGDATA=$DATA/pg
PORT=${POSTGRES_PORT:-5432}
export PGHOST=127.0.0.1 PGPORT=$PORT PGPASSWORD=$POSTGRES_PASSWORD
export LC_ALL=${LC_ALL:-en_US.UTF-8}   # postgres on macOS refuses to start without a valid locale

pg_up() {
  fresh=0
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    fresh=1
    mkdir -p "$PGDATA"
    printf '%s\n' "$POSTGRES_PASSWORD" > "$DATA/.pwfile"
    "$PGBIN/initdb" -D "$PGDATA" -U "$POSTGRES_USER" --pwfile="$DATA/.pwfile" \
        --auth-local=scram-sha-256 --auth-host=scram-sha-256 -E UTF8 >/dev/null
    rm -f "$DATA/.pwfile"
  fi
  if ! "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PGBIN/pg_ctl" -D "$PGDATA" -l "$DATA/postgres.log" -w \
        -o "-p $PORT -c listen_addresses=127.0.0.1 -k $DATA -c timezone=Asia/Kolkata" start >/dev/null
  fi
  echo "postgres  running on 127.0.0.1:$PORT"
  if [ $fresh = 1 ]; then
    "$PGBIN/createdb" -U "$POSTGRES_USER" "$POSTGRES_DB"
    for f in $(ls sql | sort); do
      case $f in
        *.sql) echo "  init $f"; "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "sql/$f" ;;
        *.sh)  echo "  init $f"; PATH=$PGBIN:$PATH sh "sql/$f" >/dev/null ;;
      esac
    done
    [ -f data/raw/daily_prices.csv ] || python3 ingestion/download_prices.py
    [ -f data/generated/orders.csv ] || python3 ingestion/generate_data.py
    PATH=$PGBIN:$PATH PSQL_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:$PORT/$POSTGRES_DB" \
        sh ingestion/load_data.sh
  fi
}

mongo_up() {
  mkdir -p "$DATA/mongo"
  if [ -f "$DATA/mongod.pid" ] && kill -0 "$(cat "$DATA/mongod.pid")" 2>/dev/null; then :; else
    BIN=$(node -e "require('mongodb-memory-server-core').MongoBinary.getPath({version:'7.0.14'}).then(p=>console.log(p))")
    nohup "$BIN" --dbpath "$DATA/mongo" --port 27017 --bind_ip 127.0.0.1 \
        --logpath "$DATA/mongod.log" --logappend >/dev/null 2>&1 &
    echo $! > "$DATA/mongod.pid"
    sleep 2
  fi
  echo "mongodb   running on 127.0.0.1:27017"
}

down() {
  "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1 && "$PGBIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null && echo "postgres  stopped"
  if [ -f "$DATA/mongod.pid" ]; then kill "$(cat "$DATA/mongod.pid")" 2>/dev/null && echo "mongodb   stopped"; rm -f "$DATA/mongod.pid"; fi
  true
}

case "${1:-up}" in
  up)     pg_up; mongo_up ;;
  down)   down ;;
  status) "$PGBIN/pg_ctl" -D "$PGDATA" status | head -1
          { [ -f "$DATA/mongod.pid" ] && kill -0 "$(cat "$DATA/mongod.pid")" 2>/dev/null && echo "mongodb is running"; } || echo "mongodb is not running" ;;
  reset)  down; rm -rf "$DATA"; pg_up; mongo_up ;;
  *)      echo "usage: sh scripts/local.sh up|down|status|reset" >&2; exit 1 ;;
esac
