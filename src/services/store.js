import { scoreRelevance, scoreSentiment, linksToSite } from '../lib/relevance.js';
import { daysAgo } from '../lib/text.js';

const nowIso = () => new Date().toISOString();

// ─── Writes ─────────────────────────────────────────────────────────
export function saveMentions(db, items, brand, isDemo = false) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO mentions
    (url, source, title, snippet, author, outlet, published_at, found_at, relevance, sentiment, links_to_site, status, is_demo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let added = 0;
  for (const m of items) {
    if (!m.url) continue;
    const text = `${m.title || ''} ${m.snippet || ''} ${m.url}`;
    const relevance = m.relevance ?? scoreRelevance(text, brand);
    const status = m.status || (relevance < 0.2 ? 'irrelevant' : 'new');
    const r = stmt.run(m.url, m.source, m.title || null, m.snippet || null, m.author || null, m.outlet || null,
      m.published_at || nowIso(), m.found_at || nowIso(), relevance, m.sentiment ?? scoreSentiment(text),
      linksToSite(text, brand.domain) ? 1 : 0, status, isDemo ? 1 : 0);
    added += Number(r.changes);
  }
  return added;
}

export function saveSocial(db, platform, date, s, isDemo = false) {
  db.prepare(`INSERT INTO social_snapshots
    (platform, date, followers, posts, impressions, reach, likes, comments, shares, views, engagement_rate, is_demo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(platform, date) DO UPDATE SET followers=excluded.followers, posts=excluded.posts,
      impressions=excluded.impressions, reach=excluded.reach, likes=excluded.likes, comments=excluded.comments,
      shares=excluded.shares, views=excluded.views, engagement_rate=excluded.engagement_rate, is_demo=excluded.is_demo`)
    .run(platform, date, s.followers ?? null, s.posts ?? null, s.impressions ?? null, s.reach ?? null, s.likes ?? null,
      s.comments ?? null, s.shares ?? null, s.views ?? null, s.engagement_rate ?? null, isDemo ? 1 : 0);
}

export function saveRankings(db, rows, isDemo = false) {
  const stmt = db.prepare(`INSERT INTO rankings (keyword, date, source, position, clicks, impressions, ctr, url, is_demo)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(keyword, date, source) DO UPDATE SET position=excluded.position, clicks=excluded.clicks,
      impressions=excluded.impressions, ctr=excluded.ctr, url=excluded.url, is_demo=excluded.is_demo`);
  for (const r of rows) stmt.run(r.keyword.toLowerCase(), r.date, r.source, r.position, r.clicks, r.impressions, r.ctr, r.url, isDemo ? 1 : 0);
}

export function saveAnalyticsDaily(db, rows, isDemo = false) {
  const stmt = db.prepare(`INSERT INTO analytics_daily (date, users, sessions, pageviews, engaged_sessions, avg_session_seconds, conversions, is_demo)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(date) DO UPDATE SET users=excluded.users, sessions=excluded.sessions, pageviews=excluded.pageviews,
      engaged_sessions=excluded.engaged_sessions, avg_session_seconds=excluded.avg_session_seconds,
      conversions=excluded.conversions, is_demo=excluded.is_demo`);
  for (const r of rows) stmt.run(r.date, r.users, r.sessions, r.pageviews, r.engaged_sessions, r.avg_session_seconds, r.conversions, isDemo ? 1 : 0);
}

export function saveBreakdowns(db, rows, periodEnd, isDemo = false) {
  db.prepare('DELETE FROM analytics_breakdowns WHERE period_end = ?').run(periodEnd);
  const stmt = db.prepare(`INSERT INTO analytics_breakdowns (period_end, dimension, label, sessions, users, is_demo) VALUES (?,?,?,?,?,?)`);
  for (const r of rows) stmt.run(periodEnd, r.dimension, r.label, r.sessions, r.users, isDemo ? 1 : 0);
}

export function saveAudit(db, audit, isDemo = false, runAt = nowIso()) {
  db.prepare('INSERT INTO site_audits (run_at, score, data, is_demo) VALUES (?,?,?,?)').run(runAt, audit.score, JSON.stringify(audit), isDemo ? 1 : 0);
}

// ─── Reads ──────────────────────────────────────────────────────────
const pct = (cur, prev) => (prev ? Number((((cur - prev) / prev) * 100).toFixed(1)) : null);

export function listMentions(db, { days = 30, minRelevance = 0.4, status, source, q, limit = 200 } = {}) {
  const where = ['published_at >= ?', 'relevance >= ?'];
  const args = [daysAgo(days), Number(minRelevance)];
  if (status) { where.push('status = ?'); args.push(status); }
  else where.push("status != 'irrelevant'");
  if (source) { where.push('source = ?'); args.push(source); }
  if (q) { where.push('(title LIKE ? OR snippet LIKE ? OR outlet LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  return db.prepare(`SELECT * FROM mentions WHERE ${where.join(' AND ')} ORDER BY published_at DESC LIMIT ?`).all(...args, Number(limit));
}

export function mentionsSummary(db, days = 30, minRelevance = 0.4) {
  const base = `FROM mentions WHERE relevance >= ? AND status != 'irrelevant'`;
  const count = (from, to) => db.prepare(`SELECT COUNT(*) n, AVG(sentiment) s ${base} AND published_at >= ? AND published_at < ?`).get(minRelevance, from, to);
  const cur = count(daysAgo(days), '9999');
  const prev = count(daysAgo(days * 2), daysAgo(days));
  const bySource = db.prepare(`SELECT source, COUNT(*) n ${base} AND published_at >= ? GROUP BY source ORDER BY n DESC`).all(minRelevance, daysAgo(days));
  const byDayRaw = db.prepare(`SELECT substr(published_at,1,10) date, COUNT(*) n, AVG(sentiment) sentiment ${base} AND published_at >= ? GROUP BY date ORDER BY date`).all(minRelevance, daysAgo(days));
  const counts = Object.fromEntries(byDayRaw.map((d) => [d.date, d]));
  const byDay = [];
  for (let i = days - 1; i >= 0; i--) { const d = daysAgo(i); byDay.push(counts[d] || { date: d, n: 0, sentiment: null }); }
  const topOutlets = db.prepare(`SELECT outlet, COUNT(*) n ${base} AND published_at >= ? AND outlet IS NOT NULL GROUP BY outlet ORDER BY n DESC LIMIT 8`).all(minRelevance, daysAgo(days));
  const sentiment = db.prepare(`SELECT SUM(sentiment > 0.15) positive, SUM(sentiment BETWEEN -0.15 AND 0.15) neutral, SUM(sentiment < -0.15) negative ${base} AND published_at >= ?`).get(minRelevance, daysAgo(days));
  const unlinked = db.prepare(`SELECT COUNT(*) n ${base} AND published_at >= ? AND links_to_site = 0 AND relevance >= 0.45`).get(minRelevance, daysAgo(days)).n;
  const filteredOut = db.prepare(`SELECT COUNT(*) n FROM mentions WHERE published_at >= ? AND (relevance < ? OR status = 'irrelevant')`).get(daysAgo(days), minRelevance).n;
  return {
    total: cur.n, change: pct(cur.n, prev.n), avgSentiment: cur.s == null ? 0 : Number(cur.s.toFixed(2)),
    bySource, byDay, topOutlets, sentiment: { positive: sentiment.positive || 0, neutral: sentiment.neutral || 0, negative: sentiment.negative || 0 },
    unlinked, filteredOut,
  };
}

export function socialSummary(db, days = 30) {
  const platforms = db.prepare('SELECT DISTINCT platform FROM social_snapshots ORDER BY platform').all().map((r) => r.platform);
  const result = [];
  for (const platform of platforms) {
    const series = db.prepare('SELECT * FROM social_snapshots WHERE platform = ? AND date >= ? ORDER BY date').all(platform, daysAgo(days));
    if (!series.length) continue;
    const latest = series.at(-1);
    const first = series[0];
    const er = series.filter((s) => s.engagement_rate != null).map((s) => s.engagement_rate);
    result.push({
      platform, latest, isDemo: Boolean(latest.is_demo),
      followerGrowth: latest.followers - first.followers,
      followerGrowthPct: pct(latest.followers, first.followers),
      avgEngagementRate: er.length ? Number((er.reduce((a, b) => a + b, 0) / er.length).toFixed(2)) : null,
      series: series.map((s) => ({ date: s.date, followers: s.followers, engagement_rate: s.engagement_rate, likes: s.likes, comments: s.comments, shares: s.shares, views: s.views, impressions: s.impressions })),
    });
  }
  const totalFollowers = result.reduce((a, p) => a + (p.latest.followers || 0), 0);
  const startFollowers = result.reduce((a, p) => a + (p.series[0].followers || 0), 0);
  return { platforms: result, totalFollowers, followerGrowth: totalFollowers - startFollowers, followerGrowthPct: pct(totalFollowers, startFollowers) };
}

export function rankingsSummary(db, trackedKeywords, days = 30) {
  const latestDate = (source) => db.prepare('SELECT MAX(date) d FROM rankings WHERE source = ?').get(source).d;
  const out = { tracked: [], topQueries: [], totals: null, source: null };
  const gscDate = latestDate('gsc');
  const serpDate = latestDate('serp');
  out.source = gscDate ? 'gsc' : serpDate ? 'serp' : null;
  for (const kw of trackedKeywords.map((k) => k.toLowerCase())) {
    const history = db.prepare(`SELECT date, position, clicks, impressions, ctr, source, url FROM rankings WHERE keyword = ? AND date >= ? ORDER BY date`).all(kw, daysAgo(Math.max(days, 90)));
    const pref = history.filter((h) => h.source === out.source);
    const latest = pref.at(-1) || null;
    const baseline = pref.find((h) => h.date >= daysAgo(days)) || null;
    out.tracked.push({
      keyword: kw, position: latest?.position ?? null, clicks: latest?.clicks ?? null, impressions: latest?.impressions ?? null, ctr: latest?.ctr ?? null,
      change: latest && baseline && latest.position && baseline.position ? Number((baseline.position - latest.position).toFixed(1)) : null,
      history: pref.map((h) => ({ date: h.date, position: h.position })),
    });
  }
  if (gscDate) {
    out.topQueries = db.prepare(`SELECT keyword, position, clicks, impressions, ctr FROM rankings WHERE source='gsc' AND date = ? ORDER BY clicks DESC, impressions DESC LIMIT 25`).all(gscDate);
    out.totals = db.prepare(`SELECT SUM(clicks) clicks, SUM(impressions) impressions, ROUND(SUM(position*impressions)/MAX(SUM(impressions),1),1) avgPosition FROM rankings WHERE source='gsc' AND date = ?`).get(gscDate);
    out.isDemo = Boolean(db.prepare(`SELECT MAX(is_demo) d FROM rankings WHERE date = ?`).get(gscDate).d);
  }
  return out;
}

export function analyticsSummary(db, days = 30) {
  const daily = db.prepare('SELECT * FROM analytics_daily WHERE date >= ? ORDER BY date').all(daysAgo(days));
  const prev = db.prepare('SELECT * FROM analytics_daily WHERE date >= ? AND date < ?').all(daysAgo(days * 2), daysAgo(days));
  const total = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const avg = (rows, k) => (rows.length ? rows.reduce((a, r) => a + (r[k] || 0), 0) / rows.length : 0);
  const kpi = (k) => ({ value: total(daily, k), change: pct(total(daily, k), total(prev, k)) });
  const sessions = total(daily, 'sessions');
  const periodEnd = db.prepare('SELECT MAX(period_end) p FROM analytics_breakdowns').get().p;
  const breakdowns = {};
  if (periodEnd) {
    for (const r of db.prepare('SELECT dimension, label, sessions, users FROM analytics_breakdowns WHERE period_end = ? ORDER BY sessions DESC').all(periodEnd)) {
      (breakdowns[r.dimension] ||= []).push(r);
    }
  }
  return {
    isDemo: daily.some((d) => d.is_demo),
    kpis: {
      users: kpi('users'), sessions: kpi('sessions'), pageviews: kpi('pageviews'), conversions: kpi('conversions'),
      engagementRate: { value: sessions ? Number(((total(daily, 'engaged_sessions') / sessions) * 100).toFixed(1)) : 0 },
      avgSessionSeconds: { value: Math.round(avg(daily, 'avg_session_seconds')), change: pct(avg(daily, 'avg_session_seconds'), avg(prev, 'avg_session_seconds')) },
    },
    daily: daily.map(({ date, users, sessions: s, pageviews }) => ({ date, users, sessions: s, pageviews })),
    breakdowns,
  };
}

export function latestAudit(db) {
  const rows = db.prepare('SELECT run_at, score, data, is_demo FROM site_audits ORDER BY run_at DESC LIMIT 10').all();
  if (!rows.length) return null;
  return { ...JSON.parse(rows[0].data), runAt: rows[0].run_at, isDemo: Boolean(rows[0].is_demo), history: rows.map((r) => ({ runAt: r.run_at, score: r.score })).reverse() };
}
