import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaFor, renderHtml } from '../src/seo.js';

const find = (slug) => (slug === 'abc' ? 'Wigilia <Kowalskich>' : null);

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

test('renderHtml escapuje i ustawia absolutne URL-e', () => {
  const tpl = '<title>__TITLE__</title><meta content="__URL__"><meta content="__ORIGIN__/og.png">';
  const html = renderHtml(tpl, { ...metaFor('/d/abc', find), origin: 'https://x.pl', pathname: '/d/abc' });
  assert.ok(html.includes('Wigilia &lt;Kowalskich&gt;'));
  assert.ok(html.includes('https://x.pl/d/abc'));
  assert.ok(html.includes('https://x.pl/og.png'));
});
