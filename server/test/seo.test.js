import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaFor, renderHtml } from '../src/seo.js';

const find = {
  draw: (slug) => (slug === 'abc' ? 'Wigilia <Kowalskich>' : null),
  list: (slug) => (slug === 'xyz' ? 'Pierogi u babci' : null),
  mailbox: (slug) => (slug === 'm1' ? 'Listy Kowalskich' : null),
};

test('meta: strona główna indeksowalna, losowania i admin nie', () => {
  assert.equal(metaFor('/', find).robots, 'index, follow');
  assert.match(metaFor('/admin', find).robots, /noindex/);
  const draw = metaFor('/d/abc', find);
  assert.equal(draw.status, 200);
  assert.match(draw.title, /Wigilia <Kowalskich>/);
  assert.match(draw.robots, /noindex/);
  assert.match(metaFor('/d/abc/organizator', find).title, /^Organizator/);
  assert.equal(metaFor('/d/nope', find).status, 404);
  assert.equal(metaFor('/cokolwiek', find).status, 404);
});

test('meta: listy „kto co przynosi” i podstrony zakładania', () => {
  assert.equal(metaFor('/losowanie', find).robots, 'index, follow');
  assert.equal(metaFor('/lista', find).robots, 'index, follow');
  const list = metaFor('/l/xyz', find);
  assert.equal(list.status, 200);
  assert.match(list.title, /Pierogi u babci/);
  assert.match(list.robots, /noindex/);
  assert.match(metaFor('/l/xyz/organizator', find).title, /^Organizator/);
  assert.equal(metaFor('/l/nope', find).status, 404);
  assert.equal(metaFor('/l/abc', find).status, 404); // slug losowania to nie lista
});

test('renderHtml escapuje i ustawia absolutne URL-e', () => {
  const tpl = '<title>__TITLE__</title><meta content="__URL__"><meta content="__ORIGIN__/og.png?v=__OG_VERSION__">';
  const html = renderHtml(tpl, { ...metaFor('/d/abc', find), origin: 'https://x.pl', pathname: '/d/abc', ogVersion: 'abc123' });
  assert.ok(html.includes('Wigilia &lt;Kowalskich&gt;'));
  assert.ok(html.includes('https://x.pl/d/abc'));
  assert.ok(html.includes('https://x.pl/og.png?v=abc123'));
});

test('meta: skrzynki z listami do Mikołaja', () => {
  assert.equal(metaFor('/poczta', find).robots, 'index, follow');
  const box = metaFor('/p/m1', find);
  assert.equal(box.status, 200);
  assert.match(box.title, /Listy Kowalskich/);
  assert.match(box.robots, /noindex/);
  assert.match(metaFor('/p/m1/organizator', find).title, /^Organizator/);
  assert.equal(metaFor('/p/nope', find).status, 404);
  assert.match(metaFor('/p/m1/skrzynka', find).title, /skrzynka odbiorcza/);
  assert.equal(metaFor('/p/m1/skrzynka/12', find).status, 200);
  assert.match(metaFor('/p/m1/organizator/skrzynka/12', find).title, /^Organizator/);
  assert.equal(metaFor('/p/m1/skrzynka/abc', find).status, 404);
});
