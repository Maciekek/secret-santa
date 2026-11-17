import { randomToken, safeEqual } from './crypto.js';
import { HttpError, bearer, cleanText } from './http.js';
import { readableSlug } from './slug.js';

/*
 * Listy do Świętego Mikołaja.
 * - Organizator zakłada „skrzynkę” i rozsyła link.
 * - Każdy z linkiem pisze list (od kogo + treść) i wrzuca go do skrzynki.
 * - Skrzynka jest wspólna: każdy z linkiem widzi koperty i może je otworzyć.
 * - Autor dostaje klucz do swojego listu (localStorage) — tylko on i organizator / admin mogą go zmienić.
 */

const MAX_LETTERS = 200;
const LEN = { name: 60, author: 60, body: 3000 };

/** Wielolinijkowy tekst: bez \r, bez spacji na końcach linii, max 2 puste linie z rzędu. */
const cleanBody = (value) =>
  typeof value === 'string'
    ? value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((l) => l.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, LEN.body)
    : '';

export function registerMailboxes(app, { db, crypto, requireAdmin, createLimiter, logAdmin, isAdmin }) {
  const q = {
    box: db.prepare('SELECT slug, name, organizer_key, created_at FROM mailboxes WHERE slug = ?'),
    letters: db.prepare(
      'SELECT id, author, body, created_at, updated_at FROM letters WHERE mailbox_slug = ? ORDER BY id DESC',
    ),
    letter: db.prepare('SELECT id, author, body, owner_key FROM letters WHERE mailbox_slug = ? AND id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM letters WHERE mailbox_slug = ?'),
    insertBox: db.prepare('INSERT INTO mailboxes (slug, name, organizer_key) VALUES (?, ?, ?)'),
    insertLetter: db.prepare('INSERT INTO letters (mailbox_slug, author, body, owner_key) VALUES (?, ?, ?, ?)'),
    updateLetter: db.prepare("UPDATE letters SET author = ?, body = ?, updated_at = datetime('now') WHERE id = ?"),
    deleteLetter: db.prepare('DELETE FROM letters WHERE id = ?'),
    deleteBox: db.prepare('DELETE FROM mailboxes WHERE slug = ?'),
    allBoxes: db.prepare(`
      SELECT m.slug, m.name, m.created_at AS createdAt, COUNT(l.id) AS letters
      FROM mailboxes m LEFT JOIN letters l ON l.mailbox_slug = m.slug
      GROUP BY m.slug ORDER BY m.created_at DESC`),
  };

  const view = (slug) =>
    q.letters.all(slug).map((l) => ({
      id: l.id,
      author: l.author,
      body: l.body,
      createdAt: l.created_at,
      updatedAt: l.updated_at,
    }));

  function getBox(slug) {
    const box = q.box.get(slug);
    if (!box) throw new HttpError(404, 'Nie ma takiej skrzynki 🎄');
    return box;
  }

  const isOrganizer = (req, box) => {
    const key = req.get('x-organizer-key') || '';
    return Boolean(key && safeEqual(crypto.hash(key), box.organizer_key)) || crypto.verifyAdminToken(bearer(req));
  };

  /** Autor listu (klucz z przeglądarki) albo organizator / admin. */
  function loadLetter(req, _res, next) {
    req.box = getBox(req.params.slug);
    const letter = q.letter.get(req.box.slug, Number(req.params.id));
    if (!letter) throw new HttpError(404, 'Tego listu już nie ma — odśwież stronę');
    const key = req.get('x-item-key') || '';
    const owner = Boolean(key && letter.owner_key && safeEqual(crypto.hash(key), letter.owner_key));
    if (!owner && !isOrganizer(req, req.box)) throw new HttpError(403, 'To nie Twój list');
    req.letter = letter;
    next();
  }

  app.post('/api/mailboxes', createLimiter, (req, res) => {
    const name = cleanText(req.body?.name, LEN.name);
    if (!name) throw new HttpError(400, 'Podaj nazwę skrzynki');
    let slug = readableSlug(name, 'listy');
    while (q.box.get(slug)) slug = readableSlug(name, 'listy');
    const organizerKey = randomToken(18);
    q.insertBox.run(slug, name, crypto.hash(organizerKey));
    res.status(201).json({ slug, organizerKey });
  });

  app.get('/api/mailboxes/:slug', (req, res) => {
    const box = getBox(req.params.slug);
    res.json({ name: box.name, createdAt: box.created_at, organizer: isOrganizer(req, box), letters: view(box.slug) });
  });

  app.delete('/api/mailboxes/:slug', (req, res) => {
    const box = getBox(req.params.slug);
    if (!isOrganizer(req, box)) throw new HttpError(403, 'Nieprawidłowy link organizatora');
    q.deleteBox.run(box.slug);
    if (isAdmin(req)) logAdmin('usunięcie skrzynki', `${box.name} (${box.slug})`);
    res.status(204).end();
  });

  app.post('/api/mailboxes/:slug/letters', (req, res) => {
    const box = getBox(req.params.slug);
    const author = cleanText(req.body?.author, LEN.author);
    const body = cleanBody(req.body?.body);
    if (!author) throw new HttpError(400, 'Podpisz się — od kogo jest list?');
    if (!body) throw new HttpError(400, 'Napisz coś w liście');
    if (q.count.get(box.slug).n >= MAX_LETTERS) throw new HttpError(400, 'Skrzynka jest pełna — Mikołaj ma już dość czytania 🎅');
    const key = randomToken(12);
    const { lastInsertRowid } = q.insertLetter.run(box.slug, author, body, crypto.hash(key));
    res.status(201).json({ id: Number(lastInsertRowid), key, letters: view(box.slug) });
  });

  app.patch('/api/mailboxes/:slug/letters/:id', loadLetter, (req, res) => {
    const { letter } = req;
    const author = req.body?.author === undefined ? letter.author : cleanText(req.body.author, LEN.author);
    const body = req.body?.body === undefined ? letter.body : cleanBody(req.body.body);
    if (!author) throw new HttpError(400, 'Podpisz się — od kogo jest list?');
    if (!body) throw new HttpError(400, 'Napisz coś w liście');
    q.updateLetter.run(author, body, letter.id);
    res.json({ letters: view(req.box.slug) });
  });

  app.delete('/api/mailboxes/:slug/letters/:id', loadLetter, (req, res) => {
    q.deleteLetter.run(req.letter.id);
    res.json({ letters: view(req.box.slug) });
  });

  app.get('/api/admin/mailboxes', requireAdmin, (_req, res) => res.json(q.allBoxes.all()));

  return { findName: (slug) => q.box.get(slug)?.name ?? null };
}
