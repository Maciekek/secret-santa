// localStorage bywa niedostępny (tryb prywatny, zablokowane cookies) — wszystko w try/catch.

function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* brak miejsca / zablokowany storage */
  }
}

/**
 * Wyniki losowań z tej przeglądarki: [{ id, name, target, targetId, drawnAt }].
 * Lista, bo z jednego komputera może losować kilka osób (np. dziadkowie).
 * Dopasowanie po id (imię organizator może poprawić); starsze wpisy bez id — po imieniu.
 */
export const sameParticipant = (result, p) => (result.id != null ? result.id === p.id : result.name === p.name);

export const myResults = {
  all(slug) {
    const value = read(`gwiazdka:wynik:${slug}`, []);
    return Array.isArray(value) ? value : value ? [value] : []; // stary format: jeden obiekt
  },
  add: (slug, entry) =>
    write(`gwiazdka:wynik:${slug}`, [...myResults.all(slug).filter((r) => !sameParticipant(r, entry)), entry]),
  set: (slug, list) => write(`gwiazdka:wynik:${slug}`, list),
};

/** Losowania założone w tej przeglądarce: [{ slug, name, key, createdAt }]. */
export const myDraws = {
  all: () => read('gwiazdka:moje-losowania', []),
  add: (entry) => write('gwiazdka:moje-losowania', [entry, ...myDraws.all().filter((d) => d.slug !== entry.slug)]),
};

export const adminToken = {
  get: () => {
    try {
      return sessionStorage.getItem('gwiazdka:admin');
    } catch {
      return null;
    }
  },
  set: (token) => {
    try {
      if (token) sessionStorage.setItem('gwiazdka:admin', token);
      else sessionStorage.removeItem('gwiazdka:admin');
    } catch {
      /* ignore */
    }
  },
};

export const links = {
  draw: (slug) => `${window.location.origin}/d/${slug}`,
  organizer: (slug, key) => `${window.location.origin}/d/${slug}/organizator#${key}`,
};
