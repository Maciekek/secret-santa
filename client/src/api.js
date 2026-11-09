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

export const api = {
  createDraw: (name, participants) => request('POST', '/draws', { body: { name, participants } }),
  getDraw: (slug) => request('GET', `/draws/${slug}`),
  draw: (slug, participantId) => request('POST', `/draws/${slug}/draw`, { body: { participantId } }),

  manage: (slug, key) => request('GET', `/draws/${slug}/manage`, org(key)),
  organizerReshuffle: (slug, key) => request('POST', `/draws/${slug}/manage/reshuffle`, org(key)),

  login: (password) => request('POST', '/admin/login', { body: { password } }),
  adminDraws: (t) => request('GET', '/admin/draws', admin(t)),
  adminDraw: (t, slug) => request('GET', `/admin/draws/${slug}`, admin(t)),
  adminReveal: (t, slug, id) => request('POST', `/admin/draws/${slug}/participants/${id}/reveal`, admin(t)),
  adminReshuffle: (t, slug) => request('POST', `/admin/draws/${slug}/reshuffle`, admin(t)),
  adminDelete: (t, slug) => request('DELETE', `/admin/draws/${slug}`, admin(t)),
};
