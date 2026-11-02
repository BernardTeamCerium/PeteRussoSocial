import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './config.js';
import { MANUAL_PLATFORMS } from './connectors/social.js';
import { buildReport, createShareLink, getShareLink, reportToMarkdown, postToSlack, mentionsCsv, SECTIONS } from './services/reports.js';
import { listMentions, saveSocial } from './services/store.js';
import { collectAll, sourceStatus, lastRun } from './services/collector.js';
import { today } from './lib/text.js';

const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

async function readBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1e6) throw new Error('Body too large');
  }
  return data ? JSON.parse(data) : {};
}

function serveFile(res, file) {
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return send(res, 404, { error: 'Not found' });
  send(res, 200, fs.readFileSync(full), MIME[path.extname(full)] || 'application/octet-stream', { 'cache-control': 'no-cache' });
}

function authorized(req, cfg) {
  if (!cfg.adminPassword) return true;
  const m = (req.headers.authorization || '').match(/^Basic (.+)$/);
  if (!m) return false;
  const [, pass = ''] = Buffer.from(m[1], 'base64').toString().split(/:(.*)/s);
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(cfg.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

const intParam = (v, d, min, max) => Math.min(max, Math.max(min, Number.parseInt(v, 10) || d));

export function createHandler(db, cfg) {
  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const q = Object.fromEntries(url.searchParams);
    try {
      // ── Public: static assets and shared reports ──
      if (req.method === 'GET' && p.startsWith('/assets/')) return serveFile(res, p.slice(1));
      if (req.method === 'GET' && /^\/r\/[\w-]+$/.test(p)) return serveFile(res, 'report.html');
      if (req.method === 'GET' && p.startsWith('/api/share/')) {
        const link = getShareLink(db, p.split('/').pop());
        if (!link) return send(res, 404, { error: 'This report link is invalid or has expired.' });
        return send(res, 200, { label: link.label, ...buildReport(db, cfg, { days: link.days, sections: link.sections }) });
      }
      if (p === '/healthz') return send(res, 200, { ok: true });

      // ── Everything else requires the admin password ──
      if (!authorized(req, cfg)) return send(res, 401, { error: 'Authentication required' }, 'application/json', { 'www-authenticate': 'Basic realm="Pete Russo Social"' });

      if (req.method === 'GET' && (p === '/' || p === '/index.html')) return serveFile(res, 'index.html');

      if (req.method === 'GET' && p === '/api/report') {
        return send(res, 200, buildReport(db, cfg, { days: intParam(q.days, 30, 1, 365), minRelevance: Number(q.minRelevance ?? 0.4) }));
      }
      if (req.method === 'GET' && p === '/api/summary.md') {
        return send(res, 200, reportToMarkdown(buildReport(db, cfg, { days: intParam(q.days, 30, 1, 365) })), 'text/markdown; charset=utf-8');
      }
      if (req.method === 'GET' && p === '/api/mentions') {
        return send(res, 200, listMentions(db, { days: intParam(q.days, 30, 1, 365), minRelevance: Number(q.minRelevance ?? 0.4), status: q.status || undefined, source: q.source || undefined, q: q.q || undefined, limit: intParam(q.limit, 200, 1, 1000) }));
      }
      if (req.method === 'GET' && p === '/api/mentions.csv') {
        const rows = listMentions(db, { days: intParam(q.days, 30, 1, 365), minRelevance: Number(q.minRelevance ?? 0.4), limit: 5000 });
        return send(res, 200, mentionsCsv(rows), 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="pete-russo-mentions-${today()}.csv"` });
      }
      let m;
      if (req.method === 'PATCH' && (m = p.match(/^\/api\/mentions\/(\d+)$/))) {
        const { status } = await readBody(req);
        if (!['new', 'reviewed', 'flagged', 'irrelevant'].includes(status)) return send(res, 400, { error: 'Invalid status' });
        db.prepare('UPDATE mentions SET status = ? WHERE id = ?').run(status, Number(m[1]));
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/api/collect') return send(res, 200, await collectAll(db, cfg));
      if (req.method === 'GET' && p === '/api/sources') {
        return send(res, 200, { sources: sourceStatus(cfg), lastRun: lastRun(db), brand: cfg.brand, seoKeywords: cfg.seoKeywords, manualPlatforms: MANUAL_PLATFORMS, slack: Boolean(cfg.keys.slackWebhook), demoMode: cfg.demoMode });
      }
      if (req.method === 'POST' && p === '/api/social/manual') {
        const b = await readBody(req);
        const platform = String(b.platform || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!platform) return send(res, 400, { error: 'platform required' });
        const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : today();
        const n = (k) => (b[k] === '' || b[k] == null ? null : Number(b[k]));
        db.prepare('DELETE FROM social_snapshots WHERE platform = ? AND is_demo = 1').run(platform);
        saveSocial(db, platform, date, { followers: n('followers'), posts: n('posts'), likes: n('likes'), comments: n('comments'), shares: n('shares'), views: n('views'), impressions: n('impressions'), engagement_rate: n('engagement_rate') });
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && p === '/api/shares') {
        return send(res, 200, db.prepare('SELECT * FROM share_links ORDER BY created_at DESC').all().map((r) => ({ ...r, sections: JSON.parse(r.sections), url: `${cfg.baseUrl}/r/${r.token}` })));
      }
      if (req.method === 'POST' && p === '/api/shares') {
        const b = await readBody(req);
        const token = createShareLink(db, { label: String(b.label || 'Shared report').slice(0, 120), sections: Array.isArray(b.sections) ? b.sections : SECTIONS, days: intParam(b.days, 30, 1, 365), expiresInDays: b.expiresInDays === 0 ? 0 : intParam(b.expiresInDays, 90, 1, 3650) });
        return send(res, 201, { token, url: `${cfg.baseUrl}/r/${token}` });
      }
      if (req.method === 'DELETE' && (m = p.match(/^\/api\/shares\/([\w-]+)$/))) {
        db.prepare('DELETE FROM share_links WHERE token = ?').run(m[1]);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/api/slack') {
        if (!cfg.keys.slackWebhook) return send(res, 400, { error: 'SLACK_WEBHOOK_URL is not configured' });
        await postToSlack(cfg.keys.slackWebhook, reportToMarkdown(buildReport(db, cfg, { days: intParam(q.days, 7, 1, 365) })));
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && p === '/api/tasks') return send(res, 200, db.prepare('SELECT * FROM tasks ORDER BY done, id DESC').all());
      if (req.method === 'POST' && p === '/api/tasks') {
        const b = await readBody(req);
        if (!b.title) return send(res, 400, { error: 'title required' });
        const r = db.prepare('INSERT INTO tasks (title, detail, category, priority, created_at) VALUES (?,?,?,?,?)')
          .run(String(b.title).slice(0, 300), b.detail ? String(b.detail).slice(0, 2000) : null, b.category || null, ['high', 'medium', 'low'].includes(b.priority) ? b.priority : 'medium', new Date().toISOString());
        return send(res, 201, { id: Number(r.lastInsertRowid) });
      }
      if (req.method === 'PATCH' && (m = p.match(/^\/api\/tasks\/(\d+)$/))) {
        const b = await readBody(req);
        db.prepare('UPDATE tasks SET done = ? WHERE id = ?').run(b.done ? 1 : 0, Number(m[1]));
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE' && (m = p.match(/^\/api\/tasks\/(\d+)$/))) {
        db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(m[1]));
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Not found' });
    } catch (e) {
      console.error(e);
      return send(res, e instanceof SyntaxError ? 400 : 500, { error: e.message });
    }
  };
}
