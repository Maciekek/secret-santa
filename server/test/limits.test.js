import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createCrypto } from '../src/crypto.js';
import { createApp } from '../src/app.js';

async function withServer(rateLimits, fn) {
  const config = { secret: 'test-secret', adminPassword: 'tajne', staticDir: null, rateLimits };
  const app = createApp({ db: openDb(':memory:'), crypto: createCrypto(config.secret), config });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  try {
    await fn(call);
  } finally {
    server.close();
  }
}

test('limity: zakładanie i zapisy z jednego adresu; admin bez limitu', () =>
  withServer({ create: 2, writes: 6 }, async (call) => {
    const { token } = (await call('POST', '/admin/login', { password: 'tajne' })).body; // zapis nr 1
    const admin = { authorization: `Bearer ${token}` };
    assert.equal((await call('POST', '/lists', { name: 'A' })).status, 201);
    const { slug } = (await call('POST', '/lists', { name: 'B' })).body;
    const blocked = await call('POST', '/draws', { name: 'C', participants: ['a', 'b', 'c'] });
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.error, /Za dużo/);

    // GET bez limitu
    for (let i = 0; i < 10; i++) assert.equal((await call('GET', `/lists/${slug}`)).status, 200);

    // zapisy: login + 3 POST-y create już policzone — zostały 2
    assert.equal((await call('POST', `/lists/${slug}/items`, { title: 'x', who: 'Ala' })).status, 201);
    assert.equal((await call('POST', `/lists/${slug}/items`, { title: 'y', who: 'Ala' })).status, 201);
    assert.equal((await call('POST', `/lists/${slug}/items`, { title: 'z', who: 'Ala' })).status, 429);

    // admin (z tokenem) nie podlega limitom zakładania ani zapisów
    assert.equal((await call('POST', `/lists/${slug}/items`, { title: 'z', who: 'Ala' }, admin)).status, 201);
    assert.equal((await call('POST', '/lists', { name: 'D' }, admin)).status, 201);
  }));

test('dziennik admina: podgląd pary i usunięcia zostają w bazie', () =>
  withServer({}, async (call) => {
    const { token } = (await call('POST', '/admin/login', { password: 'tajne' })).body;
    const admin = { authorization: `Bearer ${token}` };
    const { slug } = (await call('POST', '/draws', { name: 'Rodzina', participants: ['Ala', 'Ola', 'Ela'] })).body;
    const [ala] = (await call('GET', `/draws/${slug}`)).body.participants;
    await call('POST', `/admin/draws/${slug}/participants/${ala.id}/reveal`, null, admin);
    await call('DELETE', `/admin/draws/${slug}`, null, admin);
    const list = (await call('POST', '/lists', { name: 'Pierogi' })).body;
    await call('DELETE', `/lists/${list.slug}`, null, admin);

    assert.equal((await call('GET', '/admin/log')).status, 401);
    const log = (await call('GET', '/admin/log', null, admin)).body;
    assert.deepEqual(log.map((e) => e.action), ['usunięcie listy', 'usunięcie losowania', 'podgląd pary']);
    assert.match(log[2].details, /Rodzina .* — Ala/);
    assert.ok(log.every((e) => !/Ola|Ela/.test(e.details)), 'dziennik nie zdradza, kogo wylosowano');
  }));

test('dziennik aktywności: wejścia, losowania, wpisy, listy — z imieniem i IP, bez wyników losowania', () =>
  withServer({}, async (call) => {
    const { token } = (await call('POST', '/admin/login', { password: 'tajne' })).body;
    const admin = { authorization: `Bearer ${token}` };
    const actor = (n) => ({ 'x-actor': encodeURIComponent(n) });

    const { slug: d } = (await call('POST', '/draws', { name: 'Rodzina', participants: ['Ala', 'Ola', 'Ela'] })).body;
    const [ala] = (await call('GET', `/draws/${d}`)).body.participants;
    assert.equal((await call('POST', '/visit', { area: 'losowanie', slug: d }, actor('Babcia Hela'))).status, 204);
    const drawn = (await call('POST', `/draws/${d}/draw`, { participantId: ala.id })).body;

    const { slug: l } = (await call('POST', '/lists', { name: 'Pierogi' })).body;
    await call('POST', `/lists/${l}/items`, { title: 'Barszcz', who: 'Józek' });
    const { slug: m } = (await call('POST', '/mailboxes', { name: 'Poczta' })).body;
    const letter = (await call('POST', `/mailboxes/${m}/letters`, { author: 'Zosia', body: 'Rower' })).body;
    await call('POST', '/visit', { area: 'skrzynka', slug: m, kind: 'otwarcie listu', details: `list nr ${letter.id} od Zosia` }, actor('Staś'));
    assert.equal((await call('POST', '/visit', { area: 'lista', slug: 'nie-ma' })).status, 404);

    assert.equal((await call('GET', '/admin/activity')).status, 401);
    const log = (await call('GET', '/admin/activity', null, admin)).body;
    const kinds = log.map((e) => `${e.kind}|${e.actor}`).reverse();
    assert.deepEqual(kinds, [
      'wejście|Babcia Hela',
      'losowanie|Ala',
      'dopisanie|Józek',
      'wysłanie listu|Zosia',
      'otwarcie listu|Staś',
    ]);
    assert.ok(log.every((e) => e.ip), 'zapisuje IP');
    assert.ok(!JSON.stringify(log).includes(drawn.target === 'Ala' ? '§' : drawn.target + '"'), 'nie zdradza wyniku');
    assert.equal((await call('GET', `/admin/activity?slug=${l}`, null, admin)).body.length, 1);
  }));
