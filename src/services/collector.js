import { mentionSources, isConfigured as mentionReady } from '../connectors/mentions.js';
import { socialConnectors, isConfigured as socialReady } from '../connectors/social.js';
import { fetchSearchConsole, fetchSerpRanks, auditSite, hasGoogleKey } from '../connectors/seo.js';
import { fetchGa4Daily, fetchGa4Breakdowns } from '../connectors/analytics.js';
import { clearDemo } from '../db.js';
import { today, daysAgo } from '../lib/text.js';
import { saveMentions, saveSocial, saveRankings, saveAnalyticsDaily, saveBreakdowns, saveAudit } from './store.js';
import { seedDemo } from './demo.js';

/** List every data source and whether it is connected (used by the Settings page). */
export function sourceStatus(cfg) {
  const google = hasGoogleKey(cfg);
  return [
    ...mentionSources.map((s) => ({ area: 'Mentions', id: s.id, label: s.label, connected: mentionReady(s, cfg), needs: s.needs })),
    ...socialConnectors.map((c) => ({ area: 'Social', id: c.platform, label: c.label, connected: socialReady(c, cfg), needs: c.needs })),
    { area: 'Social', id: 'manual', label: 'LinkedIn / TikTok / Threads (manual entry)', connected: true, needs: [] },
    { area: 'Rankings', id: 'gsc', label: 'Google Search Console', connected: google && Boolean(cfg.keys.gscSiteUrl), needs: ['googleServiceAccountFile', 'gscSiteUrl'] },
    { area: 'Rankings', id: 'serp', label: 'Live rank tracking (SerpAPI)', connected: Boolean(cfg.keys.serpapi), needs: ['serpapi'] },
    { area: 'Rankings', id: 'audit', label: `Site audit + PageSpeed (${cfg.brand.domain})`, connected: true, needs: [] },
    { area: 'Analytics', id: 'ga4', label: 'Google Analytics 4', connected: google && Boolean(cfg.keys.ga4PropertyId), needs: ['googleServiceAccountFile', 'ga4PropertyId'] },
  ];
}

const isEmpty = (db, table) => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n === 0;

/** Fill empty areas with demo data so the dashboard is usable before keys are connected. */
export function ensureDemo(db, cfg) {
  if (!cfg.demoMode) return;
  const only = [];
  if (isEmpty(db, 'social_snapshots')) only.push('social');
  if (isEmpty(db, 'analytics_daily')) only.push('analytics');
  if (isEmpty(db, 'rankings')) only.push('rankings');
  if (isEmpty(db, 'mentions')) only.push('mentions');
  if (isEmpty(db, 'site_audits')) only.push('audit');
  if (only.length) seedDemo(db, cfg, { only });
}

let running = null;

export async function collectAll(db, cfg, log = console) {
  if (running) return running;
  running = (async () => {
    const startedAt = new Date().toISOString();
    const results = {};
    const attempt = async (key, fn) => {
      try {
        const count = await fn();
        results[key] = { ok: true, count };
      } catch (e) {
        results[key] = { ok: false, error: e.message };
        log.warn?.(`[collect] ${key} failed: ${e.message}`);
      }
    };

    // Mentions
    let realMentionSuccess = false;
    for (const src of mentionSources.filter((s) => mentionReady(s, cfg))) {
      await attempt(`mentions:${src.id}`, async () => {
        let added = 0;
        const errors = [];
        for (const q of cfg.brand.queries) {
          try { added += saveMentions(db, await src.fetch(cfg, q), cfg.brand); realMentionSuccess = true; }
          catch (e) { errors.push(e.message); }
        }
        if (errors.length === cfg.brand.queries.length) throw new Error(errors[0]);
        return added;
      });
    }
    if (realMentionSuccess) clearDemo(db, 'mentions');

    // Social
    for (const c of socialConnectors.filter((x) => socialReady(x, cfg))) {
      await attempt(`social:${c.platform}`, async () => {
        const snap = await c.fetch(cfg);
        clearDemo(db, 'social_snapshots', `AND platform = '${c.platform}'`);
        saveSocial(db, c.platform, today(), snap);
        return 1;
      });
    }

    // Rankings
    if (hasGoogleKey(cfg) && cfg.keys.gscSiteUrl) {
      await attempt('rankings:gsc', async () => {
        const rows = await fetchSearchConsole(cfg);
        clearDemo(db, 'rankings');
        saveRankings(db, rows);
        return rows.length;
      });
    }
    if (cfg.keys.serpapi) {
      await attempt('rankings:serp', async () => {
        const rows = await fetchSerpRanks(cfg);
        clearDemo(db, 'rankings');
        saveRankings(db, rows);
        return rows.length;
      });
    }
    await attempt('audit', async () => {
      const audit = await auditSite(cfg);
      clearDemo(db, 'site_audits');
      saveAudit(db, audit);
      return audit.score;
    });

    // Analytics
    if (hasGoogleKey(cfg) && cfg.keys.ga4PropertyId) {
      await attempt('analytics:ga4', async () => {
        const daily = await fetchGa4Daily(cfg);
        const breakdowns = await fetchGa4Breakdowns(cfg);
        clearDemo(db, 'analytics_daily');
        clearDemo(db, 'analytics_breakdowns');
        saveAnalyticsDaily(db, daily);
        saveBreakdowns(db, breakdowns, daysAgo(1));
        return daily.length;
      });
    }

    ensureDemo(db, cfg);
    db.prepare('INSERT INTO collection_runs (started_at, finished_at, results) VALUES (?,?,?)').run(startedAt, new Date().toISOString(), JSON.stringify(results));
    return { startedAt, results };
  })();
  try { return await running; } finally { running = null; }
}

export function lastRun(db) {
  const r = db.prepare('SELECT * FROM collection_runs ORDER BY id DESC LIMIT 1').get();
  return r ? { ...r, results: JSON.parse(r.results || '{}') } : null;
}
