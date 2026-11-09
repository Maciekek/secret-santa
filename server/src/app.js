import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { derangement } from './derangement.js';
import { transaction } from './db.js';
import { randomToken, safeEqual } from './crypto.js';
import { metaFor, renderHtml, robotsTxt, sitemapXml } from './seo.js';

const MIN_PEOPLE = 3;
const MAX_PEOPLE = 100;
const MAX_NAME = 60;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const cleanName = (value) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';

export function createApp({ db, crypto, config }) {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

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
  };

  function getDraw(slug) {
    const draw = q.draw.get(slug);
    if (!draw) throw new HttpError(404, 'Nie ma takiego losowania 🎄');
    return draw;
  }

  /** Przydziela pary od nowa (derangement) i czyści status losowania. */
  function shuffle(slug) {
    const people = q.participants.all(slug);
    const targets = derangement(people.length);
    people.forEach((p, i) => q.setTarget.run(crypto.encrypt(people[targets[i]].id), p.id));
  }

  const statusView = (slug) =>
    q.participants.all(slug).map((p) => ({ id: p.id, name: p.name, drawnAt: p.drawn_at }));

  // ---------- autoryzacja ----------

  function requireAdmin(req, _res, next) {
    const token = (req.get('authorization') || '').replace(/^Bearer /, '');
    if (!crypto.verifyAdminToken(token)) return next(new HttpError(401, 'Zaloguj się ponownie'));
    next();
  }

  function requireOrganizer(req, _res, next) {
    const draw = getDraw(req.params.slug);
    const key = req.get('x-organizer-key') || '';
    if (!key || !safeEqual(crypto.hash(key), draw.organizer_key)) {
      return next(new HttpError(403, 'Nieprawidłowy link organizatora'));
    }
    req.draw = draw;
    next();
  }

  const loginAttempts = new Map();
  function loginLimiter(req, _res, next) {
    const now = Date.now();
    const entry = loginAttempts.get(req.ip) || { count: 0, reset: now + 15 * 60_000 };
    if (entry.reset < now) Object.assign(entry, { count: 0, reset: now + 15 * 60_000 });
    entry.count += 1;
    loginAttempts.set(req.ip, entry);
    if (entry.count > 10) return next(new HttpError(429, 'Za dużo prób, Mikołaj każe odczekać'));
    next();
  }

  // ---------- publiczne ----------

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/draws', (req, res) => {
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

    const slug = randomToken(9);
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
      return { name: me.name, target: target.name };
    });
    res.json(result);
  });

  // ---------- organizator (bez podglądu par) ----------

  app.get('/api/draws/:slug/manage', requireOrganizer, (req, res) => {
    res.json({ name: req.draw.name, createdAt: req.draw.created_at, participants: statusView(req.draw.slug) });
  });

  app.post('/api/draws/:slug/manage/reshuffle', requireOrganizer, (req, res) => {
    transaction(db, () => shuffle(req.draw.slug));
    res.json({ participants: statusView(req.draw.slug) });
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
    console.log(`[admin] podgląd pary: losowanie=${draw.slug} osoba=${me.id}`);
    res.json({ target: target.name });
  });

  app.post('/api/admin/draws/:slug/reshuffle', requireAdmin, (req, res) => {
    const draw = getDraw(req.params.slug);
    transaction(db, () => shuffle(draw.slug));
    res.json({ participants: statusView(draw.slug) });
  });

  app.delete('/api/admin/draws/:slug', requireAdmin, (req, res) => {
    getDraw(req.params.slug);
    q.deleteDraw.run(req.params.slug);
    res.status(204).end();
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Nie znaleziono')));

  // ---------- frontend (prod) ----------

  if (config.staticDir && fs.existsSync(config.staticDir)) {
    const template = fs.readFileSync(path.resolve(config.staticDir, 'index.html'), 'utf8');
    const origin = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

    app.get('/robots.txt', (req, res) => res.type('text/plain').send(robotsTxt(origin(req))));
    app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(sitemapXml(origin(req))));

    app.use(
      '/assets',
      express.static(path.resolve(config.staticDir, 'assets'), { maxAge: '1y', immutable: true }),
    );
    app.use(express.static(config.staticDir, { maxAge: '1d', index: false }));

    app.get('/{*path}', (req, res) => {
      const meta = metaFor(req.path, (slug) => q.draw.get(slug)?.name ?? null);
      res
        .status(meta.status)
        .set('Cache-Control', 'no-cache')
        .set('X-Robots-Tag', meta.robots)
        .type('html')
        .send(renderHtml(template, { ...meta, origin: origin(req), pathname: req.path }));
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
