import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derangement } from '../src/derangement.js';
import { openDb } from '../src/db.js';
import { createCrypto } from '../src/crypto.js';
import { createApp } from '../src/app.js';

test('derangement: nikt nie losuje siebie, każdy dokładnie raz', () => {
  for (let n = 2; n <= 30; n++) {
    for (let k = 0; k < 50; k++) {
      const p = derangement(n);
      assert.equal(new Set(p).size, n);
      p.forEach((t, i) => assert.notEqual(t, i));
    }
  }
});

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

test('pełny przepływ losowania', () =>
  withServer(async (call) => {
    const names = ['Ania', 'Bartek', 'Celina', 'Darek', 'Ela'];
    const created = await call('POST', '/draws', { name: 'Rodzina X', participants: names });
    assert.equal(created.status, 201);
    const { slug, organizerKey } = created.body;

    const draw = await call('GET', `/draws/${slug}`);
    assert.equal(draw.body.participants.length, 5);
    assert.ok(draw.body.participants.every((p) => !('target' in p) && !('target_enc' in p)));

    const targets = [];
    for (const p of draw.body.participants) {
      const r = await call('POST', `/draws/${slug}/draw`, { participantId: p.id });
      assert.equal(r.status, 200);
      assert.notEqual(r.body.target, p.name);
      targets.push(r.body.target);
    }
    assert.deepEqual([...targets].sort(), [...names].sort());

    const again = await call('POST', `/draws/${slug}/draw`, { participantId: draw.body.participants[0].id });
    assert.equal(again.status, 409);

    const badOrg = await call('GET', `/draws/${slug}/manage`, null, { 'x-organizer-key': 'zly' });
    assert.equal(badOrg.status, 403);
    const org = await call('GET', `/draws/${slug}/manage`, null, { 'x-organizer-key': organizerKey });
    assert.ok(org.body.participants.every((p) => p.drawnAt && !('target' in p)));

    assert.equal((await call('POST', '/admin/login', { password: 'nie' })).status, 401);
    const { token } = (await call('POST', '/admin/login', { password: 'tajne' })).body;
    const auth = { authorization: `Bearer ${token}` };
    const list = await call('GET', '/admin/draws', null, auth);
    assert.equal(list.body[0].drawn, 5);

    const first = draw.body.participants[0];
    const reveal = await call('POST', `/draws/${slug}/participants/${first.id}/reveal`.replace('/draws', '/admin/draws'), null, auth);
    assert.equal(reveal.body.target, targets[0]);

    const reshuffled = await call('POST', `/admin/draws/${slug}/reshuffle`, null, auth);
    assert.ok(reshuffled.body.participants.every((p) => p.drawnAt === null));
  }));

test('walidacja tworzenia', () =>
  withServer(async (call) => {
    assert.equal((await call('POST', '/draws', { name: 'X', participants: ['A', 'B'] })).status, 400);
    assert.equal((await call('POST', '/draws', { name: 'X', participants: ['A', 'a', 'B'] })).status, 400);
    assert.equal((await call('POST', '/draws', { name: '', participants: ['A', 'B', 'C'] })).status, 400);
    assert.equal((await call('GET', '/admin/draws')).status, 401);
  }));
