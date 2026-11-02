import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createHandler } from '../src/app.js';
import { ensureDemo } from '../src/services/collector.js';
import { saveMentions } from '../src/services/store.js';

let server, base;
const cfg = { ...buildConfig({ ADMIN_PASSWORD: 's3cret', BRAND_EXCLUDE_KEYWORDS: 'House of Cards' }), dbFile: ':memory:' };
const db = openDb(':memory:');
const auth = { authorization: `Basic ${Buffer.from('admin:s3cret').toString('base64')}` };
const req = async (path, { method = 'GET', body, headers = auth } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
};

before(async () => {
  ensureDemo(db, cfg);
  server = http.createServer(createHandler(db, cfg));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('dashboard and API require the admin password', async () => {
  assert.equal((await req('/api/report', { headers: {} })).status, 401);
  assert.equal((await req('/api/report', { headers: { authorization: `Basic ${Buffer.from('admin:wrong').toString('base64')}` } })).status, 401);
  assert.equal((await req('/', { headers: {} })).status, 401);
  assert.equal((await req('/assets/styles.css', { headers: {} })).status, 200);
});

test('report contains every section, populated from demo data', async () => {
  const { status, body } = await req('/api/report?days=30');
  assert.equal(status, 200);
  assert.ok(body.overview.followers.value > 0);
  assert.ok(body.social.platforms.length >= 4);
  assert.ok(body.analytics.daily.length >= 28);
  assert.ok(body.rankings.tracked.length >= 1);
  assert.ok(body.mentions.total > 0);
  assert.ok(body.mentions.filteredOut > 0, 'other Pete Russos are filtered out');
  assert.ok(body.recommendations.length > 0);
  assert.equal(body.demo.social, true);
});

test('mentions: list, mark as not him, export csv', async () => {
  saveMentions(db, [{ url: 'https://news.example/pete', source: 'google_news', title: 'Pete Russo opens new office', snippet: 'Visit peterusso.com', published_at: new Date().toISOString() }], cfg.brand);
  let list = (await req('/api/mentions?q=new%20office')).body;
  assert.equal(list.length, 1);
  assert.equal(list[0].links_to_site, 1);
  assert.equal((await req(`/api/mentions/${list[0].id}`, { method: 'PATCH', body: { status: 'irrelevant' } })).status, 200);
  list = (await req('/api/mentions?q=new%20office')).body;
  assert.equal(list.length, 0);
  assert.equal((await req('/api/mentions/1', { method: 'PATCH', body: { status: 'bogus' } })).status, 400);
  const csv = await req('/api/mentions.csv');
  assert.match(csv.body, /^published_at,source,outlet/);
});

test('manual social entry replaces demo rows for that platform', async () => {
  assert.equal((await req('/api/social/manual', { method: 'POST', body: { platform: 'linkedin', followers: '6000', likes: '120' } })).status, 200);
  const rep = (await req('/api/report')).body;
  const li = rep.social.platforms.find((p) => p.platform === 'linkedin');
  assert.equal(li.latest.followers, 6000);
  assert.equal(li.isDemo, false);
  assert.equal(li.series.length, 1);
});

test('share links are public, limited to chosen sections, and revocable', async () => {
  const created = await req('/api/shares', { method: 'POST', body: { label: 'Weekly', sections: ['overview', 'social'], days: 7 } });
  assert.equal(created.status, 201);
  const pub = await req(`/api/share/${created.body.token}`, { headers: {} });
  assert.equal(pub.status, 200);
  assert.equal(pub.body.label, 'Weekly');
  assert.ok(pub.body.social);
  assert.equal(pub.body.analytics, undefined);
  assert.equal(pub.body.mentions, undefined);
  assert.equal((await req(`/r/${created.body.token}`, { headers: {} })).status, 200);
  await req(`/api/shares/${created.body.token}`, { method: 'DELETE' });
  assert.equal((await req(`/api/share/${created.body.token}`, { headers: {} })).status, 404);
});

test('tasks checklist', async () => {
  const { body } = await req('/api/tasks', { method: 'POST', body: { title: 'Add Person schema', priority: 'high' } });
  await req(`/api/tasks/${body.id}`, { method: 'PATCH', body: { done: true } });
  const tasks = (await req('/api/tasks')).body;
  assert.equal(tasks.find((t) => t.id === body.id).done, 1);
});

test('markdown summary', async () => {
  const { body } = await req('/api/summary.md?days=7');
  assert.match(body, /Pete Russo brand update/);
  assert.match(body, /Top priorities/);
});

test('path traversal is blocked', async () => {
  for (const p of ['/assets/../../.env', '/assets/%2e%2e/%2e%2e/.env', '/assets/..%2f..%2fpackage.json']) {
    const r = await req(p, { headers: {} });
    assert.notEqual(r.status, 200, p);
  }
});
