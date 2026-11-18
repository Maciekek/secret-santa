import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomInt } from 'node:crypto';
import { randomMatching } from './derangement.js';
import { transaction } from './db.js';
import { randomToken, safeEqual } from './crypto.js';
import { metaFor, renderHtml, robotsTxt, sitemapXml } from './seo.js';
import { HttpError, bearer, cleanText, rateLimit } from './http.js';
import { registerLists } from './lists.js';
import { registerMailboxes } from './mailboxes.js';
import { clientIp, createActivity } from './activity.js';
import { readableSlug } from './slug.js';

const MIN_PEOPLE = 3;
const MAX_PEOPLE = 100;
const MAX_NAME = 60;

const cleanName = (value) => cleanText(value, MAX_NAME);

export function createApp({ db, crypto, config }) {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  // Log systemowy (docker logs): każda zmiana przez API — metoda, ścieżka, status, czas, IP.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET') return next();
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms ip=${clientIp(req)}`);
    });
    next();
  });

  const activity = createActivity(db);

  // ---------- dostęp do danych ----------

  const q = {
    draw: db.prepare('SELECT slug, name, organizer_key, created_at FROM draws WHERE slug = ?'),
    participants: db.prepare(
      'SELECT id, name, target_enc, drawn_at FROM participants WHERE draw_slug = ? ORDER BY id',
    ),
    participant: db.prepare(
      'SELECT id, name, target_enc, drawn_at FROM participants WHERE draw_slug = ? AND id = ?',
    ),
    insertDraw: db.prepare('INSERT INTO draws (slug, name, organizer_key) VALUES (?, ?, ?)'),
    insertParticipant: db.prepare('INSERT INTO participants (draw_slug, name) VALUES (?, ?)'),
    renameParticipant: db.prepare('UPDATE participants SET name = ? WHERE draw_slug = ? AND id = ?'),
    deleteParticipant: db.prepare('DELETE FROM participants WHERE draw_slug = ? AND id = ?'),
    setTarget: db.prepare('UPDATE participants SET target_enc = ?, drawn_at = NULL WHERE id = ?'),
    markDrawn: db.prepare(
      "UPDATE participants SET drawn_at = datetime('now') WHERE id = ? AND drawn_at IS NULL",
    ),
    allDraws: db.prepare(`
      SELECT d.slug, d.name, d.created_at,
             COUNT(p.id) AS total, COUNT(p.drawn_at) AS drawn
      FROM draws d LEFT JOIN participants p ON p.draw_slug = d.slug
      GROUP BY d.slug ORDER BY d.created_at DESC`),
    deleteDraw: db.prepare('DELETE FROM draws WHERE slug = ?'),
    insertLog: db.prepare('INSERT INTO admin_log (action, details) VALUES (?, ?)'),
    log: db.prepare('SELECT id, at, action, details FROM admin_log ORDER BY id DESC LIMIT 200'),
  };

  function getDraw(slug) {
    const draw = q.draw.get(slug);
    if (!draw) throw new HttpError(404, 'Nie ma takiego losowania 🎄');
    return draw;
  }

  /**
   * Przydziela pary (nikt nie ma siebie, każdy daje i dostaje dokładnie raz).
   * - `resetAll`: wszystko od nowa, wszyscy losują ponownie.
   * - inaczej (po zmianie listy): kto już losował i ma nadal poprawną parę — zachowuje ją;
   *   pary pozostałych losujemy od nowa (nikt ich jeszcze nie widział). Jeśli się nie da
   *   (np. jedyna wolna osoba trafiłaby na siebie), cofamy losowanie losowo wybranej osobie.
   * Zwraca imiona osób, które już losowały, a muszą losować ponownie.
   */
  function assign(slug, { resetAll = false } = {}) {
    const people = q.participants.all(slug);
    const ids = people.map((p) => p.id);
    const exists = new Set(ids);
    const targetOf = new Map(people.map((p) => [p.id, p.target_enc ? Number(crypto.decrypt(p.target_enc)) : null]));
    const drawn = people.filter((p) => p.drawn_at);

    const locked = new Set();
    if (!resetAll) {
      for (const p of drawn) {
        const t = targetOf.get(p.id);
        if (exists.has(t) && t !== p.id && ![...locked].some((l) => targetOf.get(l) === t)) locked.add(p.id);
      }
    }

    for (;;) {
      const givers = ids.filter((id) => !locked.has(id));
      const taken = new Set([...locked].map((id) => targetOf.get(id)));
      const targets = ids.filter((id) => !taken.has(id));
      const match = randomMatching(givers, targets);
      if (match) {
        givers.forEach((g, i) => q.setTarget.run(crypto.encrypt(match[i]), g)); // czyści też drawn_at
        break;
      }
      const pool = [...locked];
      locked.delete(pool[randomInt(pool.length)]);
    }
    return drawn.filter((p) => !locked.has(p.id)).map((p) => p.name);
  }
  const shuffle = (slug) => assign(slug, { resetAll: true });

  /** Imię niepuste i unikalne w losowaniu (bez względu na wielkość liter, także ą/Ą). */
  function validateName(slug, name, exceptId = null) {
    if (!name) throw new HttpError(400, 'Podaj imię');
    const lower = name.toLocaleLowerCase('pl');
    if (q.participants.all(slug).some((p) => p.id !== exceptId && p.name.toLocaleLowerCase('pl') === lower)) {
      throw new HttpError(400, `${name} już jest na liście (dodaj np. inicjał nazwiska)`);
    }
  }

  const statusView = (slug) =>
    q.participants.all(slug).map((p) => ({ id: p.id, name: p.name, drawnAt: p.drawn_at }));

  // ---------- autoryzacja ----------

  function requireAdmin(req, _res, next) {
    if (!crypto.verifyAdminToken(bearer(req))) return next(new HttpError(401, 'Zaloguj się ponownie'));
    next();
  }

  /** Organizator (klucz z linku) albo admin (token). */
  function requireOrganizer(req, _res, next) {
    const draw = getDraw(req.params.slug);
    const key = req.get('x-organizer-key') || '';
    const isOrganizer = key && safeEqual(crypto.hash(key), draw.organizer_key);
    if (!isOrganizer && !crypto.verifyAdminToken(bearer(req))) {
      return next(new HttpError(403, 'Nieprawidłowy link organizatora'));
    }
    req.draw = draw;
    next();
  }

  // ---------- limity (ochrona przed zasypaniem bazy na słabym VPS) ----------

  const limits = { create: 20, writes: 300, login: 10, ...config.rateLimits };
  const isAdmin = (req) => crypto.verifyAdminToken(bearer(req));
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: limits.login,
    message: 'Za dużo prób, Mikołaj każe odczekać',
  });
  // Zakładanie losowań i list: na godzinę z jednego adresu.
  const createLimiter = rateLimit({
    windowMs: 60 * 60_000,
    max: limits.create,
    message: 'Za dużo nowych losowań i list naraz — elfy nie nadążają. Spróbuj za godzinę.',
    skip: isAdmin,
  });
  // Wszystkie inne zapisy (losowanie, wpisy na listach, edycje) — na 10 minut z jednego adresu.
  const writeLimiter = rateLimit({
    windowMs: 10 * 60_000,
    max: limits.writes,
    message: 'Za dużo zmian naraz — odczekaj kilka minut.',
    skip: isAdmin,
  });
  app.use('/api', (req, res, next) => (req.method === 'GET' ? next() : writeLimiter(req, res, next)));

  // ---------- dziennik admina (trwały, w bazie) ----------

  const logAdmin = (action, details) => {
    q.insertLog.run(action, details);
    console.log(`[admin] ${action}: ${details}`);
  };

  // ---------- publiczne ----------

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/draws', createLimiter, (req, res) => {
    const name = cleanName(req.body?.name);
    const names = Array.isArray(req.body?.participants)
      ? req.body.participants.map(cleanName).filter(Boolean)
      : [];

    if (!name) throw new HttpError(400, 'Podaj nazwę losowania');
    if (names.length < MIN_PEOPLE) throw new HttpError(400, `Potrzeba co najmniej ${MIN_PEOPLE} osób`);
    if (names.length > MAX_PEOPLE) throw new HttpError(400, `Maksymalnie ${MAX_PEOPLE} osób`);
    const lower = names.map((n) => n.toLocaleLowerCase('pl'));
    if (new Set(lower).size !== lower.length) {
      throw new HttpError(400, 'Imiona muszą być unikalne (dodaj np. inicjał nazwiska)');
    }

    // Losowanie: 8 losowych znaków — zgadnięty link pozwalałby losować za kogoś. Stare slugi działają bez zmian.
    let slug = readableSlug(name, 'losowanie', 8);
    while (q.draw.get(slug)) slug = readableSlug(name, 'losowanie', 8);
    const organizerKey = randomToken(18);
    transaction(db, () => {
      q.insertDraw.run(slug, name, crypto.hash(organizerKey));
      names.forEach((n) => q.insertParticipant.run(slug, n));
      shuffle(slug);
    });
    res.status(201).json({ slug, organizerKey });
  });

  app.get('/api/draws/:slug', (req, res) => {
    const draw = getDraw(req.params.slug);
    res.json({
      name: draw.name,
      participants: q.participants
        .all(draw.slug)
        .map((p) => ({ id: p.id, name: p.name, drawn: Boolean(p.drawn_at) })),
    });
  });

  app.post('/api/draws/:slug/draw', (req, res) => {
    const draw = getDraw(req.params.slug);
    const id = Number(req.body?.participantId);
    const result = transaction(db, () => {
      const me = q.participant.get(draw.slug, id);
      if (!me) throw new HttpError(404, 'Nie ma takiej osoby w losowaniu');
      if (me.drawn_at || q.markDrawn.run(me.id).changes === 0) {
        throw new HttpError(409, `${me.name} już losował(a). Jeśli to Ty — wynik jest w przeglądarce, na której losowałeś(-aś).`);
      }
      const target = q.participant.get(draw.slug, Number(crypto.decrypt(me.target_enc)));
      return { id: me.id, name: me.name, target: target.name, targetId: target.id };
    });
    // bez wyniku — dziennik nie może zdradzać par
    activity.log(req, 'losowanie', { area: 'losowanie', slug: draw.slug, name: draw.name, actor: result.name });
    res.json(result);
  });

  // ---------- organizator (bez podglądu par) ----------

  app.get('/api/draws/:slug/manage', requireOrganizer, (req, res) => {
    res.json({ name: req.draw.name, createdAt: req.draw.created_at, participants: statusView(req.draw.slug) });
  });

  /** Działania organizatora losowania w dzienniku aktywności. */
  const orgAct = (req, kind, details = '') =>
    activity.log(req, kind, { area: 'losowanie', slug: req.draw.slug, name: req.draw.name, details: `[${isAdmin(req) ? 'admin' : 'organizator'}] ${details}` });

  app.post('/api/draws/:slug/manage/reshuffle', requireOrganizer, (req, res) => {
    transaction(db, () => shuffle(req.draw.slug));
    orgAct(req, 'losowanie par od nowa');
    res.json({ participants: statusView(req.draw.slug) });
  });

  // Edycja listy. Odpowiedź: aktualna lista + `reset` — kto już losował, a musi losować ponownie.
  const PARTICIPANTS = '/api/draws/:slug/manage/participants';

  app.post(PARTICIPANTS, requireOrganizer, (req, res) => {
    const { slug } = req.draw;
    const name = cleanName(req.body?.name);
    validateName(slug, name);
    if (q.participants.all(slug).length >= MAX_PEOPLE) throw new HttpError(400, `Maksymalnie ${MAX_PEOPLE} osób`);
    const reset = transaction(db, () => {
      q.insertParticipant.run(slug, name);
      return assign(slug);
    });
    orgAct(req, 'dodanie osoby', `${name}${reset.length ? ` — do ponownego losowania: ${reset.join(', ')}` : ''}`);
    res.status(201).json({ participants: statusView(slug), reset });
  });

  app.patch(`${PARTICIPANTS}/:id`, requireOrganizer, (req, res) => {
    const { slug } = req.draw;
    const id = Number(req.params.id);
    if (!q.participant.get(slug, id)) throw new HttpError(404, 'Nie ma takiej osoby');
    const name = cleanName(req.body?.name);
    validateName(slug, name, id);
    orgAct(req, 'zmiana imienia', `${q.participant.get(slug, id).name} → ${name}`);
    q.renameParticipant.run(name, slug, id); // pary trzymamy po id — zmiana imienia ich nie rusza
    res.json({ participants: statusView(slug), reset: [] });
  });

  app.delete(`${PARTICIPANTS}/:id`, requireOrganizer, (req, res) => {
    const { slug } = req.draw;
    const id = Number(req.params.id);
    if (!q.participant.get(slug, id)) throw new HttpError(404, 'Nie ma takiej osoby');
    if (q.participants.all(slug).length <= MIN_PEOPLE) {
      throw new HttpError(400, `Losowanie musi mieć co najmniej ${MIN_PEOPLE} osoby`);
    }
    const removed = q.participant.get(slug, id).name;
    const reset = transaction(db, () => {
      q.deleteParticipant.run(slug, id);
      return assign(slug);
    });
    orgAct(req, 'usunięcie osoby', `${removed}${reset.length ? ` — do ponownego losowania: ${reset.join(', ')}` : ''}`);
    res.json({ participants: statusView(slug), reset });
  });

  // ---------- admin ----------

  app.post('/api/admin/login', loginLimiter, (req, res) => {
    if (!safeEqual(req.body?.password ?? '', config.adminPassword)) {
      throw new HttpError(401, 'Złe hasło, elfie');
    }
    res.json({ token: crypto.issueAdminToken() });
  });

  app.get('/api/admin/draws', requireAdmin, (_req, res) => {
    res.json(q.allDraws.all().map((d) => ({ ...d, createdAt: d.created_at, created_at: undefined })));
  });

  app.get('/api/admin/draws/:slug', requireAdmin, (req, res) => {
    const draw = getDraw(req.params.slug);
    res.json({ slug: draw.slug, name: draw.name, createdAt: draw.created_at, participants: statusView(draw.slug) });
  });

  // Podgląd pary tylko na świadome żądanie, pojedynczo, z logiem.
  app.post('/api/admin/draws/:slug/participants/:id/reveal', requireAdmin, (req, res) => {
    const draw = getDraw(req.params.slug);
    const me = q.participant.get(draw.slug, Number(req.params.id));
    if (!me) throw new HttpError(404, 'Nie ma takiej osoby');
    const target = q.participant.get(draw.slug, Number(crypto.decrypt(me.target_enc)));
    logAdmin('podgląd pary', `${draw.name} (${draw.slug}) — ${me.name}`);
    res.json({ target: target.name });
  });

  app.post('/api/admin/draws/:slug/reshuffle', requireAdmin, (req, res) => {
    const draw = getDraw(req.params.slug);
    transaction(db, () => shuffle(draw.slug));
    logAdmin('losowanie od nowa', `${draw.name} (${draw.slug})`);
    res.json({ participants: statusView(draw.slug) });
  });

  app.delete('/api/admin/draws/:slug', requireAdmin, (req, res) => {
    const draw = getDraw(req.params.slug);
    q.deleteDraw.run(req.params.slug);
    logAdmin('usunięcie losowania', `${draw.name} (${draw.slug})`);
    res.status(204).end();
  });

  app.get('/api/admin/log', requireAdmin, (_req, res) => res.json(q.log.all()));
  app.get('/api/admin/activity', requireAdmin, (req, res) =>
    res.json(req.query.slug ? activity.listFor(String(req.query.slug), req.query.limit) : activity.list(req.query.limit)),
  );

  // Wejście na stronę (losowanie / lista / skrzynka / otwarty list) — zgłasza przeglądarka gościa.
  const VISIT_AREAS = {
    losowanie: (slug) => q.draw.get(slug)?.name,
    lista: (slug) => db.prepare('SELECT name FROM lists WHERE slug = ?').get(slug)?.name,
    skrzynka: (slug) => db.prepare('SELECT name FROM mailboxes WHERE slug = ?').get(slug)?.name,
  };
  app.post('/api/visit', (req, res) => {
    const area = String(req.body?.area || '');
    const slug = String(req.body?.slug || '');
    const name = VISIT_AREAS[area]?.(slug);
    if (!name) throw new HttpError(404, 'Nie znaleziono');
    if (!isAdmin(req)) {
      activity.log(req, cleanText(req.body?.kind, 40) || 'wejście', {
        area,
        slug,
        name,
        actor: req.body?.actor,
        details: cleanText(req.body?.details, 200),
      });
    }
    res.status(204).end();
  });

  registerLists(app, { db, crypto, requireAdmin, createLimiter, logAdmin, isAdmin, activity });
  const mailboxes = registerMailboxes(app, { db, crypto, requireAdmin, createLimiter, logAdmin, isAdmin, activity });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Nie znaleziono')));

  // ---------- frontend (prod) ----------

  if (config.staticDir && fs.existsSync(config.staticDir)) {
    const template = fs.readFileSync(path.resolve(config.staticDir, 'index.html'), 'utf8');
    // Wersja obrazka podglądu w adresie (og.png?v=…): po każdej zmianie pliku Cloudflare i Facebook pobiorą go od nowa.
    const ogFile = path.resolve(config.staticDir, 'og.png');
    const ogVersion = fs.existsSync(ogFile)
      ? createHash('sha256').update(fs.readFileSync(ogFile)).digest('hex').slice(0, 10)
      : '1';
    const origin = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

    app.get('/robots.txt', (req, res) => res.type('text/plain').send(robotsTxt(origin(req))));
    app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(sitemapXml(origin(req))));

    app.use(
      '/assets',
      express.static(path.resolve(config.staticDir, 'assets'), { maxAge: '1y', immutable: true }),
    );
    app.use(express.static(config.staticDir, { maxAge: '1d', index: false }));

    app.get('/{*path}', (req, res) => {
      const meta = metaFor(req.path, {
        draw: (slug) => q.draw.get(slug)?.name ?? null,
        list: (slug) => db.prepare('SELECT name FROM lists WHERE slug = ?').get(slug)?.name ?? null,
        mailbox: mailboxes.findName,
      });
      res
        .status(meta.status)
        .set('Cache-Control', 'no-cache')
        .set('X-Robots-Tag', meta.robots)
        .type('html')
        .send(renderHtml(template, { ...meta, origin: origin(req), pathname: req.path, ogVersion }));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Coś poszło nie tak w fabryce elfów' : err.message });
  });

  return app;
}
