# Wdrożenie na VPS

Serwer uruchamia gotowy obraz z GHCR (`ghcr.io/maciekek/secret-santa`), który buduje GitHub
Actions przy każdym pushu na `main`. Na serwerze nic się nie buduje. Kontener wystawia port
`HOST_PORT` (domyślnie `3005`, IPv4 + IPv6), a subdomena Mikrusa wskazuje prosto na niego —
HTTPS robi Mikrus.

## Pierwsze wdrożenie

Na serwerze trzymamy klon repo — skrypty i compose aktualizuje `git pull`, obraz `update.sh`.

```bash
git clone https://github.com/Maciekek/secret-santa.git ~/secret-santa
cd ~/secret-santa/deploy
cp .env.example .env
nano .env          # DOMAIN, HOST_PORT, ADMIN_PASSWORD, APP_SECRET

./update.sh        # pobiera obraz, startuje, sprawdza /api/health
docker compose logs -f
```

Repo prywatne → obraz w GHCR też jest prywatny. Wtedy raz na serwerze:
`echo <PAT z read:packages> | docker login ghcr.io -u Maciekek --password-stdin`
(albo ustaw paczkę jako publiczną w GitHub → Packages → secret-santa → Settings).

### Subdomena Mikrusa

W panelu Mikrusa: subdomena → port `HOST_PORT` (np. `3005`), checkbox „HTTPS” odznaczony.
Sprawdzenie na serwerze: `curl -s http://localhost:3005/api/health` → `{"ok":true}`.

## Aktualizacja

```bash
cd ~/secret-santa && git pull     # nowe skrypty / compose (nie zawsze potrzebne)
deploy/update.sh                   # nowy obraz z GHCR + restart, tylko jeśli się zmienił
```

Automatycznie co noc o 4:00:

```bash
(crontab -l 2>/dev/null; echo "0 4 * * * $HOME/secret-santa/deploy/update.sh >> $HOME/secret-santa/deploy/update.log 2>&1") | crontab -
```

## Kopie zapasowe

```bash
~/secret-santa/deploy/backup.sh   # -> deploy/backups/secret-santa-YYYYMMDD-HHMMSS.db, trzyma 30 dni
```

Spójna kopia (`VACUUM INTO`) przy działającej aplikacji. Automatycznie co noc o 3:00:

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * $HOME/secret-santa/deploy/backup.sh >> $HOME/secret-santa/deploy/backup.log 2>&1") | crontab -
```

Kopia tylko na tym samym VPS nie pomoże, gdy padnie serwer — od czasu do czasu ściągnij ją do siebie:

```bash
scp -P <port_ssh> <user>@<host>:secret-santa/deploy/backups/secret-santa-*.db ~/backupy/
```

**Bez `APP_SECRET` z `.env` kopia jest bezużyteczna** — pary losowań są nim zaszyfrowane. Trzymaj go
w menedżerze haseł. `deploy/backups/` i logi są w `.gitignore`.

## Przywracanie

```bash
cd ~/secret-santa/deploy
docker compose stop app
docker run --rm -v secret-santa_gwiazdka-data:/data -v "$PWD/backups":/backups alpine sh -c \
  'cp /backups/secret-santa-YYYYMMDD-HHMMSS.db /data/gwiazdka.db && rm -f /data/gwiazdka.db-wal /data/gwiazdka.db-shm && chown 1000:1000 /data/gwiazdka.db'
docker compose start app
```

## Konkretna wersja

`SECRET_SANTA_TAG=<sha commita>` (albo `1.0.0` z taga `v1.0.0`) w `deploy/.env`, potem `deploy/update.sh`.
