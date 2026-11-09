#!/usr/bin/env sh
# Pobiera najnowszy obraz i restartuje tylko, jeśli się zmienił. Bezpieczne do crona.
# Użycie: ./update.sh   (z katalogu deploy/ albo z dowolnego miejsca)
set -eu
cd "$(dirname "$0")"

docker compose pull -q
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

# Sprawdzenie, czy aplikacja wstała (do 30 s)
port=$(grep -E '^HOST_PORT=' .env 2>/dev/null | cut -d= -f2)
port=${port:-3005}
i=0
until curl -fsS "http://localhost:$port/api/health" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "✗ Aplikacja nie odpowiada na porcie $port. Ostatnie logi:"
    docker logs secret-santa --tail 20
    exit 1
  fi
  sleep 1
done
echo "✓ secret-santa działa na porcie $port ($(docker inspect -f '{{.Config.Image}}' secret-santa))"
