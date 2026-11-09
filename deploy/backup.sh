#!/usr/bin/env sh
# Spójna kopia SQLite (VACUUM INTO — bezpieczne przy działającej aplikacji). Trzyma 30 dni.
set -eu
cd "$(dirname "$0")"
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M%S)
docker exec secret-santa rm -f /data/backup.tmp
docker exec secret-santa node --no-warnings -e "new (require('node:sqlite').DatabaseSync)(process.env.DB_PATH).exec(\"VACUUM INTO '/data/backup.tmp'\")"
docker cp secret-santa:/data/backup.tmp "backups/secret-santa-$stamp.db"
docker exec secret-santa rm -f /data/backup.tmp
find backups -name 'secret-santa-*.db' -mtime +30 -delete
echo "backups/secret-santa-$stamp.db"
