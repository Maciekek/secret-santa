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

test('lista: zakładanie, wpisy gości, zgłaszanie się do potrzebnych', () =>
  withServer(async (call) => {
    const created = await call('POST', '/lists', { name: 'Wigilia u babci', items: ['Barszcz', ' ', 'Makowiec'] });
    assert.equal(created.status, 201);
    const { slug, organizerKey } = created.body;
    const org = { 'x-organizer-key': organizerKey };

    let list = (await call('GET', `/lists/${slug}`)).body;
    assert.equal(list.name, 'Wigilia u babci');
    assert.equal(list.organizer, false);
    assert.deepEqual(list.items.map((i) => [i.title, i.who, i.requested]), [['Barszcz', null, true], ['Makowiec', null, true]]);
    assert.ok(list.items.every((i) => !('owner_key' in i)));
    assert.equal((await call('GET', `/lists/${slug}`, null, org)).body.organizer, true);

    // gość wpisuje swoje
    const added = await call('POST', `/lists/${slug}/items`, { title: 'Sałatka jarzynowa', note: 'duża miska', who: 'Ania' });
    assert.equal(added.status, 201);
    assert.ok(added.body.key);
    const aniaKey = { 'x-item-key': added.body.key };
    assert.equal((await call('POST', `/lists/${slug}/items`, { title: 'Ciasto' })).status, 400, 'bez imienia');
    assert.equal((await call('POST', `/lists/${slug}/items`, { title: 'Sernik', requested: true })).status, 403, 'gość nie dodaje potrzebnych');

    // zgłoszenie do potrzebnej rzeczy
    const barszcz = list.items[0];
    const claim = await call('POST', `/lists/${slug}/items/${barszcz.id}/claim`, { who: 'Bartek' });
    assert.equal(claim.status, 200);
    const bartekKey = { 'x-item-key': claim.body.key };
    assert.equal(claim.body.items.find((i) => i.id === barszcz.id).who, 'Bartek');
    assert.equal((await call('POST', `/lists/${slug}/items/${barszcz.id}/claim`, { who: 'Celina' })).status, 409);

    // cudzy wpis: nie wolno
    assert.equal((await call('PATCH', `/lists/${slug}/items/${added.body.id}`, { title: 'X' }, bartekKey)).status, 403);
    assert.equal((await call('DELETE', `/lists/${slug}/items/${added.body.id}`)).status, 403);
    assert.equal((await call('POST', `/lists/${slug}/items/${barszcz.id}/unclaim`, null, aniaKey)).status, 403);

    // swój wpis: zmiana i rezygnacja
    const edited = await call('PATCH', `/lists/${slug}/items/${added.body.id}`, { title: 'Sałatka', note: '' }, aniaKey);
    assert.equal(edited.status, 200);
    assert.equal(edited.body.items.find((i) => i.id === added.body.id).title, 'Sałatka');
    assert.equal((await call('DELETE', `/lists/${slug}/items/${barszcz.id}`, null, bartekKey)).status, 403, 'potrzebnej nie usuwa gość');
    const unclaimed = await call('POST', `/lists/${slug}/items/${barszcz.id}/unclaim`, null, bartekKey);
    assert.equal(unclaimed.body.items.find((i) => i.id === barszcz.id).who, null);
    // stary klucz Bartka już nic nie może
    await call('POST', `/lists/${slug}/items/${barszcz.id}/claim`, { who: 'Celina' });
    assert.equal((await call('POST', `/lists/${slug}/items/${barszcz.id}/unclaim`, null, bartekKey)).status, 403);

    // organizator może wszystko
    assert.equal((await call('POST', `/lists/${slug}/items`, { title: 'Kompot', requested: true }, org)).status, 201);
    assert.equal((await call('PATCH', `/lists/${slug}/items/${added.body.id}`, { who: 'Ania K.' }, org)).status, 200);
    const del = await call('DELETE', `/lists/${slug}/items/${added.body.id}`, null, aniaKey);
    assert.equal(del.status, 200);
    list = (await call('GET', `/lists/${slug}`)).body;
    assert.deepEqual(list.items.map((i) => i.title), ['Barszcz', 'Makowiec', 'Kompot']);

    // admin: lista list i usuwanie
    const { token } = (await call('POST', '/admin/login', { password: 'tajne' })).body;
    const admin = { authorization: `Bearer ${token}` };
    const all = (await call('GET', '/admin/lists', null, admin)).body;
    assert.deepEqual(all.map((l) => [l.name, l.total, l.taken]), [['Wigilia u babci', 3, 1]]);
    assert.equal((await call('DELETE', `/lists/${slug}`)).status, 403);
    assert.equal((await call('DELETE', `/lists/${slug}`, null, admin)).status, 204);
    assert.equal((await call('GET', `/lists/${slug}`)).status, 404);
  }));

test('lista: walidacja', () =>
  withServer(async (call) => {
    assert.equal((await call('POST', '/lists', { name: '  ' })).status, 400);
    const { slug } = (await call('POST', '/lists', { name: 'Pusta' })).body;
    assert.deepEqual((await call('GET', `/lists/${slug}`)).body.items, []);
    assert.equal((await call('POST', `/lists/${slug}/items`, { title: '', who: 'Ania' })).status, 400);
    assert.equal((await call('POST', `/lists/${slug}/items/999/claim`, { who: 'Ania' })).status, 404);
    assert.equal((await call('GET', '/lists/nie-ma')).status, 404);
  }));
