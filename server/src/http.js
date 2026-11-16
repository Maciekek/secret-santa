export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Jedna linia, bez nadmiarowych spacji, przycięta do `max` znaków. */
export const cleanText = (value, max) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

export const bearer = (req) => (req.get('authorization') || '').replace(/^Bearer /, '');

/**
 * Prosty limiter w pamięci (per IP, okno stałe). Wystarcza na jeden kontener.
 * `skip(req)` — np. pomiń zalogowanego admina.
 */
export function rateLimit({ windowMs, max, message, skip }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of hits) if (e.reset < now) hits.delete(ip);
  }, windowMs);
  sweep.unref();

  return (req, _res, next) => {
    if (skip?.(req)) return next();
    const now = Date.now();
    let e = hits.get(req.ip);
    if (!e || e.reset < now) hits.set(req.ip, (e = { count: 0, reset: now + windowMs }));
    e.count += 1;
    if (e.count > max) {
      if (e.count === max + 1) console.warn(`[limit] ${req.method} ${req.path} — przekroczony limit dla ${req.ip}`);
      return next(new HttpError(429, message));
    }
    next();
  };
}
