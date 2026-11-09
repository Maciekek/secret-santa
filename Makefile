.PHONY: dev dev-down test preview

# Dev z hot reloadem: front http://localhost:5173, API :3000
dev:
	docker compose -f docker-compose.dev.yml up

dev-down:
	docker compose -f docker-compose.dev.yml down

test:
	docker run --rm -v "$(PWD)/server":/app -w /app node:24-alpine sh -c "npm ci --no-audit --no-fund -s && npm test"

# Lokalny podgląd obrazu produkcyjnego: http://localhost:3000 (hasło admina: admin)
preview:
	docker build -t secret-santa:local .
	docker run --rm -p 3000:3000 -e ADMIN_PASSWORD=admin -e APP_SECRET=local-preview-secret-min-32-znaki-xx secret-santa:local
