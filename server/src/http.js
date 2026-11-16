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
