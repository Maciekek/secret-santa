import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createCrypto } from '../src/crypto.js';
import { createApp } from '../src/app.js';

async function setup(names) {
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
  const { slug, organizerKey } = (await call('POST', '/draws', { name: 'Test', participants: names })).body;
  const org = { 'x-organizer-key': organizerKey };
  const { token } = (await call('POST', '/admin/login', { password: 'tajne' })).body;
  const admin = { authorization: `Bearer ${token}` };

  const people = async () => (await call('GET', `/draws/${slug}`)).body.participants;
  const byName = async (n) => (await people()).find((p) => p.name === n);
  const draw = async (n) => (await call('POST', `/draws/${slug}/draw`, { participantId: (await byName(n)).id })).body;
  /** Pełna mapa par (przez admina) + sprawdzenie, że to poprawne losowanie. */
  const pairs = async () => {
    const list = await people();
    const map = {};
    for (const p of list) {
      map[p.name] = (await call('POST', `/admin/draws/${slug}/participants/${p.id}/reveal`, null, admin)).body.target;
    }
    const targets = Object.values(map);
    assert.equal(new Set(targets).size, list.length, 'każdy dostaje dokładnie jeden prezent');
    for (const [giver, target] of Object.entries(map)) assert.notEqual(giver, target, 'nikt nie ma siebie');
    assert.deepEqual([...targets].sort(), list.map((p) => p.name).sort());
    return map;
  };
  const P = `/draws/${slug}/manage/participants`;
  return { call, org, admin, people, byName, draw, pairs, P, close: () => server.close() };
}

test('zmiana imienia nie rusza par ani statusu', async () => {
  const t = await setup(['Ania', 'Bartek', 'Celina', 'Darek']);
  try {
    await t.draw('Ania');
    const before = await t.pairs();
    const celina = await t.byName('Celina');
    const r = await t.call('PATCH', `${t.P}/${celina.id}`, { name: 'Celinka' }, t.org);
    assert.equal(r.status, 200);
    const after = await t.pairs();
    const rename = (n) => (n === 'Celina' ? 'Celinka' : n);
    for (const [g, tg] of Object.entries(before)) assert.equal(after[rename(g)], rename(tg));
    assert.ok((await t.byName('Ania')).drawn);
    // duplikat, także z polskimi znakami i inną wielkością liter
    await t.call('POST', t.P, { name: 'Łucja' }, t.org);
    const dup = await t.call('PATCH', `${t.P}/${celina.id}`, { name: 'łucja' }, t.org);
    assert.equal(dup.status, 400);
  } finally {
    t.close();
  }
});

test('dodanie osoby: kto losował, zachowuje parę', async () => {
  const t = await setup(['Ania', 'Bartek', 'Celina', 'Darek']);
  try {
    const a = await t.draw('Ania');
    const b = await t.draw('Bartek');
    const r = await t.call('POST', t.P, { name: 'Ela' }, t.org);
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.reset, []);
    const map = await t.pairs();
    assert.equal(map.Ania, a.target);
    assert.equal(map.Bartek, b.target);
  } finally {
    t.close();
  }
});

test('usunięcie osoby wylosowanej przez kogoś: ten ktoś losuje ponownie', async () => {
  const t = await setup(['Ania', 'Bartek', 'Celina', 'Darek', 'Ela']);
  try {
    const a = await t.draw('Ania');
    const victim = await t.byName(a.target);
    const r = await t.call('DELETE', `${t.P}/${victim.id}`, null, t.org);
    assert.equal(r.status, 200);
    assert.ok(r.body.reset.includes('Ania'));
    assert.equal((await t.byName('Ania')).drawn, false);
    await t.pairs();
  } finally {
    t.close();
  }
});

test('nie można zejść poniżej 3 osób; edycja wymaga organizatora lub admina', async () => {
  const t = await setup(['Ania', 'Bartek', 'Celina']);
  try {
    const ania = await t.byName('Ania');
    assert.equal((await t.call('DELETE', `${t.P}/${ania.id}`, null, t.org)).status, 400);
    assert.equal((await t.call('POST', t.P, { name: 'X' })).status, 403);
    assert.equal((await t.call('POST', t.P, { name: 'X' }, t.admin)).status, 201);
  } finally {
    t.close();
  }
});

test('losowe sekwencje zmian: zawsze poprawne pary, wylosowani bez resetu zachowują parę', async () => {
  const t = await setup(['A1', 'A2', 'A3', 'A4']);
  try {
    let n = 5;
    const known = {}; // giver -> target z momentu losowania
    for (let step = 0; step < 60; step++) {
      const list = await t.people();
      const op = Math.random();
      let reset = [];
      if (op < 0.35) {
        const free = list.filter((p) => !p.drawn);
        if (free.length) {
          const p = free[Math.floor(Math.random() * free.length)];
          known[p.name] = (await t.draw(p.name)).target;
        }
      } else if (op < 0.65) {
        reset = (await t.call('POST', t.P, { name: `A${n++}` }, t.org)).body.reset;
      } else if (list.length > 3) {
        const p = list[Math.floor(Math.random() * list.length)];
        reset = (await t.call('DELETE', `${t.P}/${p.id}`, null, t.org)).body.reset;
        delete known[p.name];
      }
      for (const name of reset) delete known[name];
      const map = await t.pairs();
      for (const [g, tg] of Object.entries(known)) assert.equal(map[g], tg, `krok ${step}: ${g} zmienił parę bez resetu`);
    }
  } finally {
    t.close();
  }
});
