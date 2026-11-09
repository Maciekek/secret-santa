# Wdrożenie na VPS

Serwer uruchamia gotowy obraz z GHCR (`ghcr.io/maciekek/secret-santa`), który buduje GitHub
Actions przy każdym pushu na `main`. Na serwerze nic się nie buduje. TLS i routing robi wspólny
stack [vps-proxy](https://github.com/Maciekek/vps-proxy) — ten compose tylko deklaruje domenę
labelami i dołącza do sieci `web`.

## Pierwsze wdrożenie

```bash
mkdir -p ~/secret-santa && cd ~/secret-santa
curl -fsSLO https://raw.githubusercontent.com/Maciekek/secret-santa/main/deploy/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/Maciekek/secret-santa/main/deploy/update.sh
curl -fsSLO https://raw.githubusercontent.com/Maciekek/secret-santa/main/deploy/backup.sh
curl -fsSL  https://raw.githubusercontent.com/Maciekek/secret-santa/main/deploy/.env.example -o .env
chmod +x update.sh backup.sh
nano .env          # DOMAIN, CADDY_SITE, ADMIN_PASSWORD, APP_SECRET

docker compose up -d
docker compose logs -f
```

Repo prywatne → obraz w GHCR też jest prywatny. Wtedy raz na serwerze:
`echo <PAT z read:packages> | docker login ghcr.io -u Maciekek --password-stdin`
(albo ustaw paczkę jako publiczną w GitHub → Packages → secret-santa → Settings).

### Domena

- **Subdomena Mikrusa** (np. `prezenty.toadres.pl`): w panelu Mikrusa port `80`, checkbox
  „HTTPS” odznaczony; w `.env` `CADDY_SITE=http://<domena>`. HTTPS robi Mikrus.
- **Własna domena**: rekord `AAAA`/`A` na VPS, bez `CADDY_SITE` — Caddy sam wystawi certyfikat.

## Aktualizacja

```bash
./update.sh
```

Automatycznie co noc:

```bash
(crontab -l 2>/dev/null; echo "0 4 * * * $HOME/secret-santa/update.sh >> $HOME/secret-santa/update.log 2>&1") | crontab -
```

## Kopie zapasowe

```bash
./backup.sh            # -> backups/secret-santa-YYYYMMDD-HHMMSS.db, trzyma 30 dni
```

## Przywracanie

```bash
docker compose stop app
docker run --rm -v secret-santa_gwiazdka-data:/data -v "$PWD/backups":/backups alpine sh -c \
  'cp /backups/secret-santa-YYYYMMDD-HHMMSS.db /data/gwiazdka.db && rm -f /data/gwiazdka.db-wal /data/gwiazdka.db-shm && chown 1000:1000 /data/gwiazdka.db'
docker compose start app
```

## Konkretna wersja

`SECRET_SANTA_TAG=<sha commita>` (albo `1.0.0` z taga `v1.0.0`) w `.env`, potem `./update.sh`.
