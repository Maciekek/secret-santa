# 🎄 Gwiazdka

Świąteczny organizator: losowanie prezentów (kto komu robi prezent pod choinkę), wspólna lista
„kto co przynosi” i skrzynka na listy do Świętego Mikołaja. Na stronie głównej wybiera się tryb
(`/losowanie`, `/lista`, `/poczta`).

## Jak działa losowanie

1. Ktoś zakłada losowanie (np. „Wigilia u Kowalskich”) i dodaje uczestników (min. 3).
2. Serwer od razu losuje pary jako permutację bez punktów stałych — każdy daje i dostaje
   dokładnie jeden prezent, nikt nie losuje siebie. Pary są zapisane w SQLite **zaszyfrowane**
   (AES-256-GCM, klucz z `APP_SECRET`), więc nie widać ich nawet przy podglądzie bazy.
3. Organizator dostaje dwa linki:
   - `/d/<slug>` — do wysłania rodzinie (slug = 8 losowych znaków + nazwa, np. `/d/k7m2qxa9-wigilia-u-kowalskich`;
     starsze losowania mają dawne losowe id i działają bez zmian),
   - `/d/<slug>/organizator#<klucz>` — status: kto już losował (bez par).
4. Uczestnik wchodzi w link, wybiera swoje imię, losuje. Wynik trafia do `localStorage`,
   a imię zostaje zablokowane dla kolejnych prób.
5. Admin (`/admin`, hasło z `ADMIN_PASSWORD`) widzi wszystkie losowania i status uczestników.
   Pary są ukryte — podgląd tylko przytrzymując 🔒 przy osobie (każdy podgląd logowany).

## Jak działa lista „kto co przynosi”

1. Organizator zakłada listę i opcjonalnie wpisuje, czego potrzeba (barszcz, makowiec…).
   Dostaje link `/l/<slug>` dla rodziny (slug = 6 losowych znaków + nazwa listy, np. `/l/k7m2qx-wigilia-u-babci`) i `/l/<slug>/organizator#<klucz>` dla siebie.
2. Gość wpisuje imię (pamiętane w `localStorage`), klika „Ja przyniosę” przy potrzebnej rzeczy
   albo dopisuje własną pozycję. Wszyscy widzą całą listę, pogrupowaną po osobach.
3. Uprawnienia: przy dodaniu wpisu przeglądarka dostaje klucz do niego (w bazie tylko HMAC).
   Zmienić / usunąć / zrezygnować może tylko autor (z tej przeglądarki), organizator i admin.
   Rzecz wpisaną przez organizatora gość może tylko oddać (wraca do „potrzebnych”), usuwa ją organizator.

## Jak działają listy do Mikołaja

1. Organizator zakłada skrzynkę (`/poczta`) i dostaje link `/p/<slug>` dla rodziny oraz `/p/<slug>/organizator#<klucz>`.
2. Każdy z linkiem pisze list (treść do 3000 znaków + podpis) i wrzuca go do skrzynki.
3. „📬 Skrzynka odbiorcza” ma własny adres `/p/<slug>/skrzynka` (a otwarty list `/p/<slug>/skrzynka/<id>`) —
   można go wysłać osobno. Każdy z linkiem może otworzyć i przeczytać koperty.
   Przeczytane listy przeglądarka zapamiętuje (koperta 💌 → 📭).
4. Autor może poprawić / usunąć swój list (klucz w `localStorage`), organizator i admin — każdy.

## Stack

- `server/` — Node 24, Express 5, wbudowany `node:sqlite` (brak natywnych zależności).
- `client/` — React 19 + Vite + React Router.
- Prod: jeden kontener — Express serwuje API i zbudowany frontend.

## Dev

```bash
make dev          # albo: docker compose -f docker-compose.dev.yml up
```

- front: http://localhost:5173 (hot reload), API: http://localhost:3001 (inne porty: `SERVER_PORT=… CLIENT_PORT=… make dev`)
- admin w dev: hasło `admin`
- testy backendu: `make test`

## Prod (VPS / Mikrus)

GitHub Actions (`.github/workflows/docker.yml`) przy każdym pushu na `main` puszcza testy
i buduje obraz `ghcr.io/maciekek/secret-santa` (amd64 + arm64). Serwer tylko go pobiera —
instrukcja w [`deploy/README.md`](deploy/README.md).

- Lokalny podgląd obrazu prod: `make preview` → http://localhost:3002 (`PREVIEW_PORT=…`)
- **Nie zmieniaj `APP_SECRET`** po utworzeniu losowań — stare pary przestaną się odszyfrowywać.

## API

- `POST /api/draws` `{ name, participants: string[] }` → `{ slug, organizerKey }`
- `GET /api/draws/:slug` → nazwa + uczestnicy ze statusem `drawn`
- `POST /api/draws/:slug/draw` `{ participantId }` → `{ name, target }` (409 gdy już losował)
- `GET /api/draws/:slug/manage`, `POST /api/draws/:slug/manage/reshuffle` — nagłówek `X-Organizer-Key`
  (albo `Authorization: Bearer <token admina>`)
- `POST /api/draws/:slug/manage/participants` `{ name }`, `PATCH …/participants/:id` `{ name }`,
  `DELETE …/participants/:id` → `{ participants, reset }` — edycja listy. Zmiana imienia nie rusza par.
  Przy dodaniu/usunięciu kto już losował zachowuje parę; pary pozostałych losowane od nowa. `reset` = kto
  już losował, a musi ponownie (jego osoba wypadła z listy).
- Listy: `POST /api/lists` `{ name, items?: string[] }` → `{ slug, organizerKey }`;
  `GET /api/lists/:slug` → `{ name, organizer, items }`; `DELETE /api/lists/:slug` (organizator).
- Wpisy: `POST /api/lists/:slug/items` `{ title, note?, who }` → `{ id, key, items }`
  (organizator może dodać `{ title, requested: true }` bez osoby); `PATCH …/items/:id` `{ title?, note?, who? }`;
  `POST …/items/:id/claim` `{ who }` → `{ key, items }` (409 gdy zajęte); `POST …/items/:id/unclaim`;
  `DELETE …/items/:id`. Autoryzacja: `X-Item-Key` (autor) albo `X-Organizer-Key` / token admina.
- Skrzynki: `POST /api/mailboxes` `{ name }` → `{ slug, organizerKey }`; `GET /api/mailboxes/:slug` → `{ name, organizer, letters }`;
  `DELETE /api/mailboxes/:slug` (organizator). Listy: `POST …/letters` `{ author, body }` → `{ id, key, letters }`,
  `PATCH …/letters/:id`, `DELETE …/letters/:id` — `X-Item-Key` (autor) albo organizator / admin.
- `POST /api/admin/login` `{ password }` → `{ token }`
- `GET /api/admin/draws`, `GET /api/admin/draws/:slug`,
  `POST /api/admin/draws/:slug/participants/:id/reveal`, `POST /api/admin/draws/:slug/reshuffle`,
  `DELETE /api/admin/draws/:slug`, `GET /api/admin/lists`, `GET /api/admin/mailboxes`, `GET /api/admin/log` — nagłówek `Authorization: Bearer <token>`

## Zabezpieczenia

- Limity na adres IP (w pamięci, 429 po przekroczeniu): zakładanie losowań i list 20/h, pozostałe zapisy
  300 / 10 min, logowanie admina 10 / 15 min. Zalogowany admin nie ma limitów. Pierwsze przekroczenie
  w oknie trafia do logu jako `[limit] …`.
- Dziennik admina (tabela `admin_log`, widok „📜 Dziennik admina” w `/admin`): podglądy par, losowanie od nowa,
  usunięcia. Zapisuje tylko, czyją parę podejrzano — nigdy wynik.
- Dziennik aktywności gości (tabela `activity_log`, widok „👀 Aktywność gości” w `/admin`): wejścia na strony,
  losowania (bez wyniku), dopisania / zmiany / usunięcia na listach, wysłane, poprawione i otwarte listy do Mikołaja.
  Zapisuje imię zapamiętane w przeglądarce (niezweryfikowane, nagłówek `X-Actor`), IP (`CF-Connecting-IP` albo
  `X-Forwarded-For`) i przeglądarkę. Sprząta się sam: 120 dni / 20 000 wpisów.
- Logi systemowe (`docker logs secret-santa`): każde żądanie zmieniające dane (`[api] POST … 201 12ms ip=…`)
  i każdy wpis aktywności (`[aktywność] …`). Rotacja 5 × 10 MB; po `update.sh` (nowy kontener) zaczynają się od nowa —
  trwała historia jest w bazie.

## SEO / Open Graph

- Meta (title, description, canonical, OG, Twitter, JSON-LD) są w `client/index.html` jako znaczniki `__X__`.
  W prod podmienia je serwer per ścieżka (`server/src/seo.js`), w dev plugin w `vite.config.js`.
- Link do losowania (`/d/<slug>`) ma w podglądzie (Messenger, WhatsApp…) nazwę losowania.
- `/`, `/losowanie`, `/lista`, `/poczta` — indeksowane; `/d/*`, `/l/*`, `/p/*`, `/admin` — `noindex` (meta + nagłówek `X-Robots-Tag`).
- `robots.txt` i `sitemap.xml` generuje serwer z `PUBLIC_URL`.
- Obrazek OG: `client/public/og.png` (1200×630), ikona: `client/public/icon-512.png`.

## Muzyka

Muzyka startuje sama: od razu, jeśli przeglądarka pozwala, a jeśli blokuje autoplay, to przy pierwszym
kliknięciu na stronie. Przycisk w nagłówku ją wyłącza, a wybór „wyłączone” jest zapamiętany w localStorage.
Nagrania w `client/public/music/` pochodzą z Wikimedia Commons. To dzieła zespołów US Air Force, więc jako
utwory rządu USA są w domenie publicznej. Melodie to tradycyjne kolędy, też w domenie publicznej.
Pliki przekodowane do 96 kb/s.

- *Good King Wenceslas and His Merry Band* — Airmen of Note (płyta „Christmas Time is Here”, 1998)
- *Jingle Bells* — Starlifter and Roots in Blue, USAF Band of Mid-America (2020)
- *Oh Christmas Tree* — Raptor, USAF Heartland of America Band (płyta „Christmas from the Heartland”, 1994)
- *Deck the Halls* — USAF Band, Concert Band
- *Joy to the World* (jazz) — Diplomats, USAF Band (płyta „Do You Hear What I Hear?”, 2002)
