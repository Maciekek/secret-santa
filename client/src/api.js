async function request(method, path, { body, headers } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Coś poszło nie tak');
    err.status = res.status;
    throw err;
  }
  return data;
}

const org = (key) => ({ headers: { 'x-organizer-key': key } });
const admin = (token) => ({ headers: { authorization: `Bearer ${token}` } });

/** Nagłówki autoryzacji do edycji listy: organizator (klucz) albo admin (token). */
export const asOrganizer = (key) => org(key).headers;
export const asAdmin = (token) => admin(token).headers;

export const api = {
  createDraw: (name, participants) => request('POST', '/draws', { body: { name, participants } }),
  getDraw: (slug) => request('GET', `/draws/${slug}`),
  draw: (slug, participantId) => request('POST', `/draws/${slug}/draw`, { body: { participantId } }),

  manage: (slug, key) => request('GET', `/draws/${slug}/manage`, org(key)),
  organizerReshuffle: (slug, key) => request('POST', `/draws/${slug}/manage/reshuffle`, org(key)),

  addParticipant: (slug, auth, name) =>
    request('POST', `/draws/${slug}/manage/participants`, { headers: auth, body: { name } }),
  renameParticipant: (slug, auth, id, name) =>
    request('PATCH', `/draws/${slug}/manage/participants/${id}`, { headers: auth, body: { name } }),
  removeParticipant: (slug, auth, id) =>
    request('DELETE', `/draws/${slug}/manage/participants/${id}`, { headers: auth }),

  // lista „kto co przynosi”; `auth` = nagłówki organizatora/admina/klucza wpisu
  createList: (name, items) => request('POST', '/lists', { body: { name, items } }),
  getList: (slug, auth) => request('GET', `/lists/${slug}`, { headers: auth }),
  deleteList: (slug, auth) => request('DELETE', `/lists/${slug}`, { headers: auth }),
  addItem: (slug, auth, item) => request('POST', `/lists/${slug}/items`, { headers: auth, body: item }),
  editItem: (slug, auth, id, changes) => request('PATCH', `/lists/${slug}/items/${id}`, { headers: auth, body: changes }),
  claimItem: (slug, id, who) => request('POST', `/lists/${slug}/items/${id}/claim`, { body: { who } }),
  unclaimItem: (slug, auth, id) => request('POST', `/lists/${slug}/items/${id}/unclaim`, { headers: auth }),
  removeItem: (slug, auth, id) => request('DELETE', `/lists/${slug}/items/${id}`, { headers: auth }),

  login: (password) => request('POST', '/admin/login', { body: { password } }),
  adminDraws: (t) => request('GET', '/admin/draws', admin(t)),
  adminDraw: (t, slug) => request('GET', `/admin/draws/${slug}`, admin(t)),
  adminReveal: (t, slug, id) => request('POST', `/admin/draws/${slug}/participants/${id}/reveal`, admin(t)),
  adminReshuffle: (t, slug) => request('POST', `/admin/draws/${slug}/reshuffle`, admin(t)),
  adminDelete: (t, slug) => request('DELETE', `/admin/draws/${slug}`, admin(t)),
  adminLists: (t) => request('GET', '/admin/lists', admin(t)),
};
