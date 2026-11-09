.PHONY: dev dev-down prod prod-down logs test backup

dev:
	docker compose -f docker-compose.dev.yml up

dev-down:
	docker compose -f docker-compose.dev.yml down

prod:
	docker compose up -d --build

prod-down:
	docker compose down

logs:
	docker compose logs -f --tail=100

test:
	docker run --rm -v "$(PWD)/server":/app -w /app node:24-alpine sh -c "npm ci --no-audit --no-fund -s && npm test"

# Kopia bazy z kontenera prod do ./backup-YYYYMMDD.db
backup:
	docker compose exec app node -e "const{DatabaseSync}=require('node:sqlite');new DatabaseSync(process.env.DB_PATH).exec(\"VACUUM INTO '/data/backup.db'\")"
	docker compose cp app:/data/backup.db ./backup-$$(date +%Y%m%d).db
	docker compose exec app rm /data/backup.db
