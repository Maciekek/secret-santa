import { cleanText } from './http.js';

/*
 * Dziennik aktywności gości (tabela activity_log) — żeby dało się odtworzyć, kto co robił:
 * wejścia na strony, losowania, dopisania do list, wysłane i otwarte listy.
 * - `actor` to imię, które ktoś sam wpisał (z przeglądarki) — nie jest weryfikowane.
 * - IP: Cloudflare podaje prawdziwe w CF-Connecting-IP; inaczej req.ip (X-Forwarded-For).
 * - Nigdy nie zapisujemy, kogo ktoś wylosował.
 * - Sprzątanie: wpisy starsze niż 120 dni i powyżej 20 000 najnowszych są usuwane.
 */

const KEEP_DAYS = 120;
const KEEP_ROWS = 20_000;

/** Imię z przeglądarki, wysyłane przez klienta w nagłówku X-Actor (zakodowane URI, bo nagłówki to ASCII). */
export function headerActor(req) {
  try {
    return decodeURIComponent(req.get('x-actor') || '');
  } catch {
    return '';
  }
}

export const clientIp = (req) => (req.get('cf-connecting-ip') || req.ip || '').replace(/^::ffff:/, '');

export function createActivity(db) {
  const insert = db.prepare(
    'INSERT INTO activity_log (kind, area, slug, name, actor, details, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const list = db.prepare(
    'SELECT id, at, kind, area, slug, name, actor, details, ip, user_agent AS userAgent FROM activity_log ORDER BY id DESC LIMIT ?',
  );
  const listFor = db.prepare(
    'SELECT id, at, kind, area, slug, name, actor, details, ip, user_agent AS userAgent FROM activity_log WHERE slug = ? ORDER BY id DESC LIMIT ?',
  );
  const pruneOld = db.prepare(`DELETE FROM activity_log WHERE at < datetime('now', '-${KEEP_DAYS} days')`);
  const pruneMany = db.prepare(
    `DELETE FROM activity_log WHERE id <= (SELECT id FROM activity_log ORDER BY id DESC LIMIT 1 OFFSET ${KEEP_ROWS})`,
  );
  let inserts = 0;

  /**
   * @param req   żądanie (IP, przeglądarka)
   * @param kind  co się stało, np. „dopisanie”, „otwarcie listu”
   * @param area  'losowanie' | 'lista' | 'skrzynka'
   */
  function log(req, kind, { area, slug, name, actor, details = '' }) {
    const who = cleanText(actor, 60) || cleanText(headerActor(req), 60) || null;
    const ip = clientIp(req);
    const ua = (req.get('user-agent') || '').slice(0, 200);
    insert.run(kind, area, slug, name ?? null, who, details, ip, ua);
    console.log(`[aktywność] ${kind} | ${area} ${name ?? ''} (${slug}) | kto: ${who ?? '—'} | ${details} | ip=${ip}`);
    if (++inserts % 200 === 0) {
      pruneOld.run();
      pruneMany.run();
    }
  }

  return {
    log,
    list: (limit = 300) => list.all(Math.min(Number(limit) || 300, 2000)),
    listFor: (slug, limit = 500) => listFor.all(slug, Math.min(Number(limit) || 500, 2000)),
  };
}
