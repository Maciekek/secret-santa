import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../src/db.js';
import { createCrypto } from '../src/crypto.js';
import { createApp } from '../src/app.js';
import { createNotifier } from '../src/notify.js';

test('ntfy: powiadomienie o nowym liście z gotową wiadomością na WhatsApp', async () => {
  const received = [];
  const ntfy = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push(JSON.parse(body));
      res.end('{}');
    });
  });
  await new Promise((r) => ntfy.listen(0, r));

  const notifier = createNotifier({ NTFY_TOPIC: 'test-temat', NTFY_URL: `http://127.0.0.1:${ntfy.address().port}` });
  const config = { secret: 'test-secret', adminPassword: 'tajne', staticDir: null, publicUrl: 'https://swieta.example', notifier };
  const app = createApp({ db: openDb(':memory:'), crypto: createCrypto(config.secret), config });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, body) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

  try {
    const { slug } = await post('/mailboxes', { name: 'Listy Kowalskich' });
    const letter = await post(`/mailboxes/${slug}/letters`, { author: 'Zosia', body: 'Chcę rower i psa.' });
    const { slug: l } = await post('/lists', { name: 'Wigilia' });
    await post(`/lists/${l}/items`, { title: 'Barszcz', who: 'Józek' }); // „lista” domyślnie wyłączona
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(received.length, 1);
    const n = received[0];
    assert.equal(n.topic, 'test-temat');
    assert.equal(n.title, '✉️ Nowy list od: Zosia');
    assert.match(n.message, /Listy Kowalskich: „Chcę rower i psa\.”/);
    assert.ok(n.click.startsWith('https://wa.me/?text='));
    assert.match(decodeURIComponent(n.click), /Zosia napisał\(a\) list.*https:\/\/swieta\.example\/p\/.+\/skrzynka/);
    assert.deepEqual(n.actions.map((a) => a.label), ['Wyślij na WhatsApp', 'Otwórz']);
    assert.ok(n.actions[1].url.endsWith(`/skrzynka/${letter.id}`));
  } finally {
    server.close();
    ntfy.close();
  }
});

test('ntfy: bez NTFY_TOPIC nic nie wysyła', async () => {
  const n = createNotifier({});
  assert.equal(n.enabled, false);
  await n.notify('listy', { title: 'x' }); // nie rzuca, nic nie robi
});
