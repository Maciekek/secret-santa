import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createCrypto } from '../src/crypto.js';
import { createApp } from '../src/app.js';

async function withServer(fn) {
  const config = { secret: 'test-secret', adminPassword: 'tajne', staticDir: null };
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

test('listy do Mikołaja: pisanie, skrzynka, uprawnienia', () =>
  withServer(async (call) => {
    assert.equal((await call('POST', '/mailboxes', { name: '' })).status, 400);
    const created = await call('POST', '/mailboxes', { name: 'Listy Kowalskich' });
    assert.equal(created.status, 201);
    const { slug, organizerKey } = created.body;
    assert.match(slug, /^[a-z2-9]{6}-listy-kowalskich$/);
    const org = { 'x-organizer-key': organizerKey };

    const sent = await call('POST', `/mailboxes/${slug}/letters`, {
      author: 'Zosia',
      body: 'Drogi Mikołaju,\r\n\r\n\r\n\r\nchcę rower.   \n\nZosia',
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.letters[0].body, 'Drogi Mikołaju,\n\nchcę rower.\n\nZosia', 'zachowuje akapity, czyści nadmiar');
    const zosia = { 'x-item-key': sent.body.key };
    await call('POST', `/mailboxes/${slug}/letters`, { author: 'Staś', body: 'Lego!' });
    assert.equal((await call('POST', `/mailboxes/${slug}/letters`, { author: 'X', body: '   ' })).status, 400);
    assert.equal((await call('POST', `/mailboxes/${slug}/letters`, { author: '', body: 'a' })).status, 400);

    // skrzynka: każdy z linkiem widzi wszystkie listy, najnowsze pierwsze, bez kluczy
    const box = (await call('GET', `/mailboxes/${slug}`)).body;
    assert.equal(box.organizer, false);
    assert.deepEqual(box.letters.map((l) => l.author), ['Staś', 'Zosia']);
    assert.ok(box.letters.every((l) => !('owner_key' in l)));
    const stas = box.letters[0];

    // autor poprawia swój list; cudzego nie ruszy
    const edited = await call('PATCH', `/mailboxes/${slug}/letters/${sent.body.id}`, { body: 'Rower i hulajnoga' }, zosia);
    assert.equal(edited.status, 200);
    assert.ok(edited.body.letters.find((l) => l.id === sent.body.id).updatedAt);
    assert.equal((await call('PATCH', `/mailboxes/${slug}/letters/${stas.id}`, { body: 'hack' }, zosia)).status, 403);
    assert.equal((await call('DELETE', `/mailboxes/${slug}/letters/${stas.id}`)).status, 403);

    // organizator usuwa każdy list
    assert.equal((await call('DELETE', `/mailboxes/${slug}/letters/${stas.id}`, null, org)).status, 200);
    assert.equal((await call('GET', `/mailboxes/${slug}`, null, org)).body.organizer, true);

    // admin: lista skrzynek, usunięcie z wpisem w dzienniku
    const { token } = (await call('POST', '/admin/login', { password: 'tajne' })).body;
    const admin = { authorization: `Bearer ${token}` };
    assert.deepEqual((await call('GET', '/admin/mailboxes', null, admin)).body.map((m) => [m.name, m.letters]), [['Listy Kowalskich', 1]]);
    assert.equal((await call('DELETE', `/mailboxes/${slug}`)).status, 403);
    assert.equal((await call('DELETE', `/mailboxes/${slug}`, null, admin)).status, 204);
    assert.equal((await call('GET', `/mailboxes/${slug}`)).status, 404);
    assert.equal((await call('GET', '/admin/log', null, admin)).body[0].action, 'usunięcie skrzynki');
  }));
