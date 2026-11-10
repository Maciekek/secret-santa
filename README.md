# 🎄 Gwiazdka

Świąteczne losowanie prezentów — kto komu robi prezent pod choinkę.

## Jak działa

1. Ktoś zakłada losowanie (np. „Wigilia u Kowalskich”) i dodaje uczestników (min. 3).
2. Serwer od razu losuje pary jako permutację bez punktów stałych — każdy daje i dostaje
   dokładnie jeden prezent, nikt nie losuje siebie. Pary są zapisane w SQLite **zaszyfrowane**
   (AES-256-GCM, klucz z `APP_SECRET`), więc nie widać ich nawet przy podglądzie bazy.
3. Organizator dostaje dwa linki:
   - `/d/<slug>` — do wysłania rodzinie,
   - `/d/<slug>/organizator#<klucz>` — status: kto już losował (bez par).
4. Uczestnik wchodzi w link, wybiera swoje imię, losuje. Wynik trafia do `localStorage`,
   a imię zostaje zablokowane dla kolejnych prób.
5. Admin (`/admin`, hasło z `ADMIN_PASSWORD`) widzi wszystkie losowania i status uczestników.
   Pary są ukryte — podgląd tylko przytrzymując 🔒 przy osobie (każdy podgląd logowany).

## Stack

- `server/` — Node 24, Express 5, wbudowany `node:sqlite` (brak natywnych zależności).
- `client/` — React 19 + Vite + React Router.
- Prod: jeden kontener — Express serwuje API i zbudowany frontend.

## Dev

```bash
make dev          # albo: docker compose -f docker-compose.dev.yml up
```

- front: http://localhost:5173 (hot reload), API: http://localhost:3000
- admin w dev: hasło `admin`
- testy backendu: `make test`

## Prod (VPS / Mikrus)

GitHub Actions (`.github/workflows/docker.yml`) przy każdym pushu na `main` puszcza testy
i buduje obraz `ghcr.io/maciekek/secret-santa` (amd64 + arm64). Serwer tylko go pobiera —
instrukcja w [`deploy/README.md`](deploy/README.md).

- Lokalny podgląd obrazu prod: `make preview` → http://localhost:3000
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
- `POST /api/admin/login` `{ password }` → `{ token }`
- `GET /api/admin/draws`, `GET /api/admin/draws/:slug`,
  `POST /api/admin/draws/:slug/participants/:id/reveal`, `POST /api/admin/draws/:slug/reshuffle`,
  `DELETE /api/admin/draws/:slug` — nagłówek `Authorization: Bearer <token>`

## SEO / Open Graph

- Meta (title, description, canonical, OG, Twitter, JSON-LD) są w `client/index.html` jako znaczniki `__X__`.
  W prod podmienia je serwer per ścieżka (`server/src/seo.js`), w dev plugin w `vite.config.js`.
- Link do losowania (`/d/<slug>`) ma w podglądzie (Messenger, WhatsApp…) nazwę losowania.
- `/` — indeksowane; `/d/*`, `/admin` — `noindex` (meta + nagłówek `X-Robots-Tag`).
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
