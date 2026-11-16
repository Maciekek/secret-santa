import { transaction } from './db.js';
import { randomToken, safeEqual } from './crypto.js';
import { HttpError, bearer, cleanText } from './http.js';

/*
 * Lista „kto co przynosi” (wspólna zrzutka na Wigilię).
 * - Organizator zakłada listę, może od razu wpisać, czego potrzeba (`requested`).
 * - Goście wpisują, co przyniosą, albo zgłaszają się do potrzebnej rzeczy.
 * - Kto wpisał / zgłosił się, dostaje klucz do swojego wpisu (trzymany w localStorage) — tylko on
 *   i organizator (albo admin) mogą go zmienić. Wszyscy widzą całą listę — tu nie ma sekretów.
 */

const MAX_ITEMS = 200;
const LEN = { name: 60, title: 80, note: 120, who: 60 };

export function registerLists(app, { db, crypto, requireAdmin }) {
  const q = {
    list: db.prepare('SELECT slug, name, organizer_key, created_at FROM lists WHERE slug = ?'),
    items: db.prepare(
      'SELECT id, title, note, who, owner_key, requested, created_at FROM list_items WHERE list_slug = ? ORDER BY id',
    ),
    item: db.prepare(
      'SELECT id, title, note, who, owner_key, requested FROM list_items WHERE list_slug = ? AND id = ?',
    ),
    count: db.prepare('SELECT COUNT(*) AS n FROM list_items WHERE list_slug = ?'),
    insertList: db.prepare('INSERT INTO lists (slug, name, organizer_key) VALUES (?, ?, ?)'),
    insertItem: db.prepare(
      'INSERT INTO list_items (list_slug, title, note, who, owner_key, requested) VALUES (?, ?, ?, ?, ?, ?)',
    ),
    updateItem: db.prepare('UPDATE list_items SET title = ?, note = ?, who = ? WHERE id = ?'),
    claim: db.prepare('UPDATE list_items SET who = ?, owner_key = ? WHERE id = ? AND who IS NULL'),
    unclaim: db.prepare('UPDATE list_items SET who = NULL, owner_key = NULL WHERE id = ?'),
    deleteItem: db.prepare('DELETE FROM list_items WHERE id = ?'),
    deleteList: db.prepare('DELETE FROM lists WHERE slug = ?'),
    allLists: db.prepare(`
      SELECT l.slug, l.name, l.created_at AS createdAt,
             COUNT(i.id) AS total, COUNT(i.who) AS taken
      FROM lists l LEFT JOIN list_items i ON i.list_slug = l.slug
      GROUP BY l.slug ORDER BY l.created_at DESC`),
  };

  const view = (slug) =>
    q.items.all(slug).map((i) => ({
      id: i.id,
      title: i.title,
      note: i.note,
      who: i.who,
      requested: Boolean(i.requested),
      createdAt: i.created_at,
    }));

  function getList(slug) {
    const list = q.list.get(slug);
    if (!list) throw new HttpError(404, 'Nie ma takiej listy 🎄');
    return list;
  }

  function getItem(slug, id) {
    const item = q.item.get(slug, Number(id));
    if (!item) throw new HttpError(404, 'Tego wpisu już nie ma — odśwież stronę');
    return item;
  }

  /** Organizator (klucz z linku) albo zalogowany admin. */
  function isOrganizer(req, list) {
    const key = req.get('x-organizer-key') || '';
    return Boolean(key && safeEqual(crypto.hash(key), list.organizer_key)) || crypto.verifyAdminToken(bearer(req));
  }

  const isOwner = (req, item) => {
    const key = req.get('x-item-key') || '';
    return Boolean(key && item.owner_key && safeEqual(crypto.hash(key), item.owner_key));
  };

  function requireListOrganizer(req, _res, next) {
    req.list = getList(req.params.slug);
    if (!isOrganizer(req, req.list)) return next(new HttpError(403, 'Nieprawidłowy link organizatora'));
    next();
  }

  function loadItem(req, _res, next) {
    req.list = getList(req.params.slug);
    req.item = getItem(req.list.slug, req.params.id);
    req.organizer = isOrganizer(req, req.list);
    req.owner = isOwner(req, req.item);
    next();
  }

  const ensureRoom = (slug) => {
    if (q.count.get(slug).n >= MAX_ITEMS) throw new HttpError(400, `Lista może mieć najwyżej ${MAX_ITEMS} pozycji`);
  };

  // ---------- zakładanie i odczyt ----------

  app.post('/api/lists', (req, res) => {
    const name = cleanText(req.body?.name, LEN.name);
    const titles = Array.isArray(req.body?.items)
      ? req.body.items.map((t) => cleanText(t, LEN.title)).filter(Boolean)
      : [];
    if (!name) throw new HttpError(400, 'Podaj nazwę listy');
    if (titles.length > MAX_ITEMS) throw new HttpError(400, `Najwyżej ${MAX_ITEMS} pozycji`);

    const slug = randomToken(9);
    const organizerKey = randomToken(18);
    transaction(db, () => {
      q.insertList.run(slug, name, crypto.hash(organizerKey));
      titles.forEach((t) => q.insertItem.run(slug, t, '', null, null, 1));
    });
    res.status(201).json({ slug, organizerKey });
  });

  app.get('/api/lists/:slug', (req, res) => {
    const list = getList(req.params.slug);
    res.json({ name: list.name, createdAt: list.created_at, organizer: isOrganizer(req, list), items: view(list.slug) });
  });

  app.delete('/api/lists/:slug', requireListOrganizer, (req, res) => {
    q.deleteList.run(req.list.slug);
    res.status(204).end();
  });

  // ---------- wpisy ----------

  // Gość: „przyniosę X” (who wymagane, dostaje klucz). Organizator: może dodać też „potrzebne” bez osoby.
  app.post('/api/lists/:slug/items', (req, res) => {
    const list = getList(req.params.slug);
    const title = cleanText(req.body?.title, LEN.title);
    const note = cleanText(req.body?.note, LEN.note);
    const who = cleanText(req.body?.who, LEN.who) || null;
    const requested = Boolean(req.body?.requested);

    if (!title) throw new HttpError(400, 'Wpisz, co przyniesiesz');
    if (requested && !isOrganizer(req, list)) throw new HttpError(403, 'Tylko organizator dodaje potrzebne rzeczy');
    if (!requested && !who) throw new HttpError(400, 'Podaj swoje imię');
    ensureRoom(list.slug);

    const key = who ? randomToken(12) : null;
    const { lastInsertRowid } = q.insertItem.run(list.slug, title, note, who, key && crypto.hash(key), requested ? 1 : 0);
    res.status(201).json({ id: Number(lastInsertRowid), key, items: view(list.slug) });
  });

  // Zmiana treści — autor wpisu albo organizator.
  app.patch('/api/lists/:slug/items/:id', loadItem, (req, res) => {
    const { item } = req;
    if (!req.owner && !req.organizer) throw new HttpError(403, 'To nie Twój wpis');
    const title = req.body?.title === undefined ? item.title : cleanText(req.body.title, LEN.title);
    const note = req.body?.note === undefined ? item.note : cleanText(req.body.note, LEN.note);
    let who = item.who;
    if (req.body?.who !== undefined) who = cleanText(req.body.who, LEN.who) || null;
    if (!title) throw new HttpError(400, 'Wpisz, co przyniesiesz');
    if (!who && !item.requested) throw new HttpError(400, 'Podaj imię');
    q.updateItem.run(title, note, who, item.id);
    if (!who) q.unclaim.run(item.id);
    res.json({ items: view(req.list.slug) });
  });

  // „Ja przyniosę” przy potrzebnej rzeczy.
  app.post('/api/lists/:slug/items/:id/claim', loadItem, (req, res) => {
    const who = cleanText(req.body?.who, LEN.who);
    if (!who) throw new HttpError(400, 'Podaj swoje imię');
    const key = randomToken(12);
    if (q.claim.run(who, crypto.hash(key), req.item.id).changes === 0) {
      throw new HttpError(409, `Ktoś Cię uprzedził — ${req.item.who || 'ktoś'} już to przynosi 🙂`);
    }
    res.json({ key, items: view(req.list.slug) });
  });

  // „Rezygnuję” — potrzebna rzecz wraca na listę potrzebnych.
  app.post('/api/lists/:slug/items/:id/unclaim', loadItem, (req, res) => {
    if (!req.owner && !req.organizer) throw new HttpError(403, 'To nie Twój wpis');
    if (!req.item.requested) throw new HttpError(400, 'Ten wpis można tylko usunąć');
    q.unclaim.run(req.item.id);
    res.json({ items: view(req.list.slug) });
  });

  // Usunięcie: własny wpis gościa albo dowolny przez organizatora.
  app.delete('/api/lists/:slug/items/:id', loadItem, (req, res) => {
    const { item } = req;
    if (!req.organizer && !(req.owner && !item.requested)) throw new HttpError(403, 'To nie Twój wpis');
    q.deleteItem.run(item.id);
    res.json({ items: view(req.list.slug) });
  });

  // ---------- admin ----------

  app.get('/api/admin/lists', requireAdmin, (_req, res) => res.json(q.allLists.all()));
}
