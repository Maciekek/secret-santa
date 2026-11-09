#!/usr/bin/env sh
# Pobiera najnowszy obraz i restartuje tylko, jeśli się zmienił. Bezpieczne do crona.
set -eu
cd "$(dirname "$0")"
docker compose pull -q
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
