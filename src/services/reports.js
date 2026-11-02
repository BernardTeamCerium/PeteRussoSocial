import crypto from 'node:crypto';
import { mentionsSummary, listMentions, socialSummary, rankingsSummary, analyticsSummary, latestAudit } from './store.js';
import { buildRecommendations } from './recommendations.js';
import { fetchText } from '../lib/http.js';

export const SECTIONS = ['overview', 'mentions', 'social', 'rankings', 'analytics', 'recommendations'];

/** One object with everything the dashboard (or a shared report) needs. */
export function buildReport(db, cfg, { days = 30, sections = SECTIONS, minRelevance = 0.4 } = {}) {
  const mentions = mentionsSummary(db, days, minRelevance);
  const social = socialSummary(db, days);
  const rankings = rankingsSummary(db, cfg.seoKeywords, days);
  const analytics = analyticsSummary(db, days);
  const audit = latestAudit(db);
  const recommendations = buildRecommendations({ audit, rankings, mentions, social, analytics, cfg });
  const has = (s) => sections.includes(s);
  return {
    brand: { name: cfg.brand.name, domain: cfg.brand.domain, tagline: cfg.brand.tagline },
    generatedAt: new Date().toISOString(),
    days,
    sections,
    demo: {
      mentions: db.prepare('SELECT COUNT(*) n FROM mentions WHERE is_demo=1').get().n > 0,
      social: social.platforms.some((p) => p.isDemo),
      rankings: Boolean(rankings.isDemo),
      analytics: analytics.isDemo,
      audit: Boolean(audit?.isDemo),
    },
    overview: has('overview') ? {
      mentions: { value: mentions.total, change: mentions.change },
      sentiment: mentions.avgSentiment,
      followers: { value: social.totalFollowers, change: social.followerGrowthPct },
      sessions: analytics.kpis.sessions,
      avgPosition: rankings.totals?.avgPosition ?? null,
      seoScore: audit?.score ?? null,
      highPriority: recommendations.filter((r) => r.priority === 'high').length,
    } : undefined,
    mentions: has('mentions') ? { ...mentions, recent: listMentions(db, { days, minRelevance, limit: 50 }) } : undefined,
    social: has('social') ? social : undefined,
    rankings: has('rankings') ? { ...rankings, audit } : undefined,
    analytics: has('analytics') ? analytics : undefined,
    recommendations: has('recommendations') ? recommendations : undefined,
  };
}

export function createShareLink(db, { label = 'Shared report', sections = SECTIONS, days = 30, expiresInDays = 90 } = {}) {
  const token = crypto.randomBytes(18).toString('base64url');
  const clean = sections.filter((s) => SECTIONS.includes(s));
  const expires = expiresInDays ? new Date(Date.now() + expiresInDays * 864e5).toISOString() : null;
  db.prepare('INSERT INTO share_links (token, label, sections, days, created_at, expires_at) VALUES (?,?,?,?,?,?)')
    .run(token, label, JSON.stringify(clean.length ? clean : SECTIONS), Number(days) || 30, new Date().toISOString(), expires);
  return token;
}

export function getShareLink(db, token) {
  const row = db.prepare('SELECT * FROM share_links WHERE token = ?').get(token);
  if (!row) return null;
  if (row.expires_at && row.expires_at < new Date().toISOString()) return null;
  return { ...row, sections: JSON.parse(row.sections) };
}

const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('en-US'));
const chg = (c) => (c == null ? '' : ` (${c > 0 ? '+' : ''}${c}%)`);

/** Plain-text / Markdown summary, used for Slack and the "Copy summary" button. */
export function reportToMarkdown(rep) {
  const o = rep.overview || {};
  const lines = [
    `*${rep.brand.name} brand update: last ${rep.days} days*`,
    `• Web mentions: ${fmt(o.mentions?.value)}${chg(o.mentions?.change)} | avg sentiment ${o.sentiment ?? '–'}`,
    `• Social followers (all platforms): ${fmt(o.followers?.value)}${chg(o.followers?.change)}`,
    `• ${rep.brand.domain} sessions: ${fmt(o.sessions?.value)}${chg(o.sessions?.change)}`,
    `• Avg Google position: ${o.avgPosition ?? '–'} | SEO health score: ${o.seoScore ?? '–'}/100`,
  ];
  if (rep.rankings?.tracked?.length) {
    lines.push('', '*Tracked keywords*');
    for (const k of rep.rankings.tracked) lines.push(`• "${k.keyword}": ${k.position == null ? 'not ranking' : `#${k.position}`}${k.change ? ` (${k.change > 0 ? '▲' : '▼'}${Math.abs(k.change)})` : ''}`);
  }
  if (rep.recommendations?.length) {
    lines.push('', '*Top priorities*');
    for (const r of rep.recommendations.filter((x) => x.priority === 'high').slice(0, 5)) lines.push(`• ${r.title}`);
  }
  if (Object.values(rep.demo).some(Boolean)) lines.push('', '_Some sections still show demo data until the data sources are connected._');
  return lines.join('\n');
}

export async function postToSlack(webhook, text) {
  await fetchText(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
}

export function mentionsCsv(rows) {
  const cols = ['published_at', 'source', 'outlet', 'title', 'url', 'relevance', 'sentiment', 'links_to_site', 'status'];
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
