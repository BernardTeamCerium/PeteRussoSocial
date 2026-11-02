/* Shared renderers used by the admin dashboard (app.js) and the public shared report (report.js). */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? esc(u) : '#');
export const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d }));
const PLATFORM = { instagram: 'Instagram', facebook: 'Facebook', x: 'X (Twitter)', youtube: 'YouTube', linkedin: 'LinkedIn', tiktok: 'TikTok', threads: 'Threads' };
export const platformName = (p) => PLATFORM[p] || p;
const SOURCE = { google_news: 'Google News', reddit: 'Reddit', youtube: 'YouTube', hacker_news: 'Hacker News', gdelt: 'Global news', web: 'Web' };
export const sourceName = (s) => SOURCE[s] || s;

export function delta(change, { invert = false, suffix = '%' } = {}) {
  if (change == null) return '<span class="delta flat">no prior data</span>';
  const good = invert ? change < 0 : change > 0;
  const cls = change === 0 ? 'flat' : good ? 'up' : 'down';
  return `<span class="delta ${cls}">${change > 0 ? '▲' : change < 0 ? '▼' : '•'} ${Math.abs(change)}${suffix}</span>`;
}

const kpi = (label, value, extra = '') => `<div class="card kpi"><div class="label">${esc(label)}</div><div class="value">${value}</div>${extra}</div>`;
const demoPill = (on) => (on ? ' <span class="pill demo" title="Connect this data source in Settings to replace sample data">demo data</span>' : '');

// ── Charts (Chart.js loaded globally) ──
const charts = new Map();
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
// PeteRusso.com brand colours first (blue, navy, mint, pink), then supporting hues
export const PALETTE = ['#2a97fd', '#0f172a', '#02c98a', '#ff477e', '#f5a524', '#7c5cff', '#64748b'];

export function chart(id, type, data, options = {}) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  charts.get(id)?.destroy();
  window.Chart.defaults.font.family = css('--font');
  const grid = css('--line'), ink = css('--muted');
  charts.set(id, new window.Chart(el, {
    type, data,
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: ink, boxWidth: 12, font: { family: css('--font') } } } },
      scales: type === 'doughnut' ? {} : {
        x: { ticks: { color: ink, maxTicksLimit: 8 }, grid: { display: false } },
        y: { ticks: { color: ink }, grid: { color: grid } },
      },
      ...options,
    },
  }));
}
const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// ── Overview ──
export function renderOverview(el, rep) {
  const o = rep.overview;
  const [first, ...rest] = rep.brand.name.split(' ');
  el.innerHTML = `
    <div class="hero"><div class="hero-body">
      ${rep.brand.tagline ? `<div class="eyebrow">${esc(rep.brand.tagline)}</div>` : ''}
      <h2>${esc(first)} <span class="hl">${esc(rest.join(' '))}</span></h2>
      <p>Brand, search and social performance for ${esc(rep.brand.domain)}: last ${rep.days} days.</p>
    </div></div>
    <div class="grid kpis">
      ${kpi('Web mentions', fmt(o.mentions.value), delta(o.mentions.change))}
      ${kpi('Avg sentiment', `${o.sentiment > 0 ? '+' : ''}${o.sentiment}`, '<span class="small muted">−1 negative … +1 positive</span>')}
      ${kpi('Social followers', fmt(o.followers.value), delta(o.followers.change))}
      ${kpi(`${rep.brand.domain} sessions`, fmt(o.sessions.value), delta(o.sessions.change))}
      ${kpi('Avg Google position', o.avgPosition ?? '–', '<span class="small muted">Search Console, all queries</span>')}
      ${kpi('SEO health score', o.seoScore == null ? '–' : `${o.seoScore}<span class="small muted">/100</span>`, `<span class="small muted">${o.highPriority} high-priority actions</span>`)}
    </div>
    <div class="grid two">
      <div class="card"><h2>Mentions per day</h2><div class="chart"><canvas id="ov-mentions"></canvas></div></div>
      <div class="card"><h2>Website traffic</h2><div class="chart"><canvas id="ov-traffic"></canvas></div></div>
    </div>`;
  if (rep.mentions) chart('ov-mentions', 'bar', { labels: rep.mentions.byDay.map((d) => shortDate(d.date)), datasets: [{ label: 'Mentions', data: rep.mentions.byDay.map((d) => d.n), backgroundColor: PALETTE[0] }] }, { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: css('--muted'), maxTicksLimit: 8 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: css('--muted'), precision: 0 }, grid: { color: css('--line') } } } });
  if (rep.analytics) chart('ov-traffic', 'line', { labels: rep.analytics.daily.map((d) => shortDate(d.date)), datasets: [
    { label: 'Sessions', data: rep.analytics.daily.map((d) => d.sessions), borderColor: PALETTE[0], pointRadius: 0, tension: 0.3 },
    { label: 'Users', data: rep.analytics.daily.map((d) => d.users), borderColor: PALETTE[1], pointRadius: 0, tension: 0.3 },
  ] });
}

// ── Mentions ──
export function sentimentPill(s) {
  if (s > 0.15) return '<span class="pill pos">positive</span>';
  if (s < -0.15) return '<span class="pill neg">negative</span>';
  return '<span class="pill">neutral</span>';
}

export function mentionItem(m, interactive) {
  const date = m.published_at ? new Date(m.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const btn = (status, label) => `<button class="btn small" data-mention="${m.id}" data-status="${status}" ${m.status === status ? 'disabled' : ''}>${label}</button>`;
  return `<div class="mention">
    <div>
      <a class="title" href="${safeUrl(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.title || m.url)}</a>
      <div class="meta"><span class="pill">${esc(sourceName(m.source))}</span>${m.outlet ? `<span>${esc(m.outlet)}</span>` : ''}<span>${esc(date)}</span>
        ${sentimentPill(m.sentiment)}
        <span class="pill ${m.relevance >= 0.6 ? 'ok' : ''}" title="How likely this is about our Pete Russo">${Math.round(m.relevance * 100)}% match</span>
        ${m.links_to_site ? '<span class="pill ok">links to site</span>' : '<span class="pill low" title="Backlink outreach opportunity">no link</span>'}
        ${m.status === 'flagged' ? '<span class="pill high">flagged</span>' : ''}${m.status === 'reviewed' ? '<span class="pill">reviewed</span>' : ''}
      </div>
      ${m.snippet ? `<div class="snip">${esc(m.snippet.slice(0, 280))}</div>` : ''}
    </div>
    ${interactive ? `<div class="actions">${btn('reviewed', 'Reviewed')}${btn('flagged', 'Flag')}${btn('irrelevant', 'Not him')}</div>` : ''}
  </div>`;
}

export function renderMentionsSummary(el, rep) {
  const m = rep.mentions;
  el.innerHTML = `
    <div class="grid kpis">
      ${kpi('Relevant mentions', fmt(m.total), delta(m.change))}
      ${kpi('Positive / neutral / negative', `<span class="up">${m.sentiment.positive}</span> / ${m.sentiment.neutral} / <span class="down">${m.sentiment.negative}</span>`)}
      ${kpi('Backlink opportunities', fmt(m.unlinked), '<span class="small muted">Strong mentions without a link</span>')}
      ${kpi('Filtered out', fmt(m.filteredOut), '<span class="small muted">About a different Pete/Peter Russo</span>')}
    </div>
    <div class="grid two">
      <div class="card"><h2>By source${demoPill(rep.demo.mentions)}</h2><div class="chart"><canvas id="mn-source"></canvas></div></div>
      <div class="card"><h2>Top outlets</h2><table><tbody>${m.topOutlets.map((o) => `<tr><td>${esc(o.outlet)}</td><td class="num">${o.n}</td></tr>`).join('') || '<tr><td class="muted">No outlets yet</td></tr>'}</tbody></table></div>
    </div>`;
  chart('mn-source', 'doughnut', { labels: m.bySource.map((s) => sourceName(s.source)), datasets: [{ data: m.bySource.map((s) => s.n), backgroundColor: PALETTE, borderWidth: 0 }] }, { plugins: { legend: { position: 'right', labels: { color: css('--muted') } } } });
}

// ── Social ──
export function renderSocial(el, rep) {
  const s = rep.social;
  if (!s.platforms.length) { el.innerHTML = '<div class="card muted">No social data yet. Connect accounts in Settings or enter numbers manually.</div>'; return; }
  el.innerHTML = `
    <div class="grid kpis">
      ${kpi('Total followers', fmt(s.totalFollowers), delta(s.followerGrowthPct))}
      ${kpi('Net new followers', `${s.followerGrowth >= 0 ? '+' : ''}${fmt(s.followerGrowth)}`, `<span class="small muted">last ${rep.days} days</span>`)}
    </div>
    <div class="card" style="margin-bottom:16px"><h2>Platforms${demoPill(rep.demo.social)}</h2><div class="table-wrap"><table>
      <thead><tr><th>Platform</th><th class="num">Followers</th><th class="num">Growth</th><th class="num">Avg engagement</th><th class="num">Likes*</th><th class="num">Comments*</th><th class="num">Shares*</th><th class="num">Views</th><th>Updated</th></tr></thead>
      <tbody>${s.platforms.map((p) => `<tr>
        <td><b>${esc(platformName(p.platform))}</b>${p.isDemo ? ' <span class="pill demo">demo</span>' : ''}</td>
        <td class="num">${fmt(p.latest.followers)}</td>
        <td class="num">${p.followerGrowth >= 0 ? '+' : ''}${fmt(p.followerGrowth)} ${delta(p.followerGrowthPct)}</td>
        <td class="num">${p.avgEngagementRate == null ? '–' : `${p.avgEngagementRate}%`}</td>
        <td class="num">${fmt(p.latest.likes)}</td><td class="num">${fmt(p.latest.comments)}</td><td class="num">${fmt(p.latest.shares)}</td><td class="num">${fmt(p.latest.views)}</td>
        <td class="small muted">${esc(p.latest.date)}</td></tr>`).join('')}</tbody></table></div>
      <div class="small muted" style="margin-top:6px">* totals across the most recent posts at the last snapshot</div></div>
    <div class="grid two">
      <div class="card"><h2>Followers over time</h2><div class="chart tall"><canvas id="so-followers"></canvas></div></div>
      <div class="card"><h2>Engagement rate (%)</h2><div class="chart tall"><canvas id="so-er"></canvas></div></div>
    </div>`;
  const labels = [...new Set(s.platforms.flatMap((p) => p.series.map((x) => x.date)))].sort();
  const ds = (key) => s.platforms.map((p, i) => {
    const byDate = Object.fromEntries(p.series.map((x) => [x.date, x[key]]));
    return { label: platformName(p.platform), data: labels.map((d) => byDate[d] ?? null), borderColor: PALETTE[i % PALETTE.length], backgroundColor: PALETTE[i % PALETTE.length], pointRadius: 0, tension: 0.3, spanGaps: true };
  });
  chart('so-followers', 'line', { labels: labels.map(shortDate), datasets: ds('followers') });
  chart('so-er', 'line', { labels: labels.map(shortDate), datasets: ds('engagement_rate') });
}

// ── Rankings & SEO ──
export function renderRankings(el, rep) {
  const r = rep.rankings;
  const a = r.audit;
  const srcLabel = r.source === 'gsc' ? 'Google Search Console (28-day average position)' : r.source === 'serp' ? 'Live Google results (SerpAPI)' : 'No ranking source connected';
  el.innerHTML = `
    <div class="grid kpis">
      ${kpi('SEO health score', a ? `${a.score}<span class="small muted">/100</span>` : '–', a ? `<span class="small muted">audited ${new Date(a.runAt).toLocaleDateString()}</span>` : '')}
      ${kpi('Avg position', r.totals?.avgPosition ?? '–', '<span class="small muted">all queries, impression-weighted</span>')}
      ${kpi('Search clicks (28d)', fmt(r.totals?.clicks))}
      ${kpi('Search impressions (28d)', fmt(r.totals?.impressions))}
      ${a?.pagespeed?.performance != null ? kpi('Mobile speed', `${a.pagespeed.performance}<span class="small muted">/100</span>`, `<span class="small muted">LCP ${esc(a.pagespeed.lcp || '–')} · CLS ${esc(a.pagespeed.cls || '–')}</span>`) : ''}
    </div>
    <div class="grid two" style="margin-bottom:16px">
      <div class="card"><h2>Tracked keywords${demoPill(rep.demo.rankings)}</h2><div class="small muted" style="margin-bottom:8px">${esc(srcLabel)}</div>
        <table><thead><tr><th>Keyword</th><th class="num">Position</th><th class="num">Change</th><th class="num">Clicks</th><th class="num">Impr.</th></tr></thead>
        <tbody>${r.tracked.map((k) => `<tr><td>${esc(k.keyword)}</td><td class="num"><b>${k.position == null ? '<span class="pill fail">not ranking</span>' : `#${k.position}`}</b></td>
          <td class="num">${k.change == null ? '–' : delta(k.change, { suffix: '' })}</td><td class="num">${fmt(k.clicks)}</td><td class="num">${fmt(k.impressions)}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><h2>Position history</h2><div class="chart tall"><canvas id="rk-history"></canvas></div><div class="small muted">Lower is better. #1 is the top of Google.</div></div>
    </div>
    ${r.topQueries?.length ? `<div class="card" style="margin-bottom:16px"><h2>Top search queries bringing people to ${esc(rep.brand.domain)}</h2><div class="table-wrap"><table>
      <thead><tr><th>Query</th><th class="num">Position</th><th class="num">Clicks</th><th class="num">Impressions</th><th class="num">CTR</th></tr></thead>
      <tbody>${r.topQueries.map((q) => `<tr><td>${esc(q.keyword)}</td><td class="num">${q.position}</td><td class="num">${fmt(q.clicks)}</td><td class="num">${fmt(q.impressions)}</td><td class="num">${q.ctr}%</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${a ? `<div class="card"><h2>Site audit: ${esc(a.url)}${demoPill(a.isDemo)}</h2><div class="table-wrap"><table><thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
      <tbody>${a.checks.map((c) => `<tr><td>${esc(c.label)}</td><td>${c.pass ? '<span class="pill pass">pass</span>' : '<span class="pill fail">fix</span>'}</td><td class="small muted">${esc(c.value ?? '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  const labels = [...new Set(r.tracked.flatMap((k) => k.history.map((h) => h.date)))].sort();
  chart('rk-history', 'line', {
    labels: labels.map(shortDate),
    datasets: r.tracked.map((k, i) => {
      const by = Object.fromEntries(k.history.map((h) => [h.date, h.position]));
      return { label: k.keyword, data: labels.map((d) => by[d] ?? null), borderColor: PALETTE[i % PALETTE.length], backgroundColor: PALETTE[i % PALETTE.length], pointRadius: 2, tension: 0.2, spanGaps: true };
    }),
  }, { scales: { x: { ticks: { color: css('--muted'), maxTicksLimit: 8 }, grid: { display: false } }, y: { reverse: true, min: 1, ticks: { color: css('--muted') }, grid: { color: css('--line') } } } });
}

// ── Analytics ──
export function renderAnalytics(el, rep) {
  const a = rep.analytics;
  if (!a.daily.length) { el.innerHTML = '<div class="card muted">No analytics yet. Connect Google Analytics 4 in Settings.</div>'; return; }
  const k = a.kpis;
  const list = (dim, title) => {
    const rows = a.breakdowns[dim] || [];
    const total = rows.reduce((s, r) => s + r.sessions, 0) || 1;
    return `<div class="card"><h2>${title}</h2><table><tbody>${rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${fmt(r.sessions)}</td><td class="num muted">${Math.round((r.sessions / total) * 100)}%</td></tr>`).join('') || '<tr><td class="muted">No data</td></tr>'}</tbody></table></div>`;
  };
  el.innerHTML = `
    <div class="grid kpis">
      ${kpi('Users', fmt(k.users.value), delta(k.users.change))}
      ${kpi('Sessions', fmt(k.sessions.value), delta(k.sessions.change))}
      ${kpi('Page views', fmt(k.pageviews.value), delta(k.pageviews.change))}
      ${kpi('Engagement rate', `${k.engagementRate.value}%`)}
      ${kpi('Avg session', `${Math.floor(k.avgSessionSeconds.value / 60)}m ${k.avgSessionSeconds.value % 60}s`, delta(k.avgSessionSeconds.change))}
      ${kpi('Key events / conversions', fmt(k.conversions.value), delta(k.conversions.change))}
    </div>
    <div class="card" style="margin-bottom:16px"><h2>Daily traffic: ${esc(rep.brand.domain)}${demoPill(rep.demo.analytics)}</h2><div class="chart tall"><canvas id="an-daily"></canvas></div></div>
    <div class="grid two" style="margin-bottom:16px">
      <div class="card"><h2>Traffic channels</h2><div class="chart"><canvas id="an-channels"></canvas></div></div>
      ${list('page', 'Top pages')}
    </div>
    <div class="grid two">${list('referrer', 'Top sources')}${list('country', 'Countries')}${list('device', 'Devices')}</div>`;
  chart('an-daily', 'line', { labels: a.daily.map((d) => shortDate(d.date)), datasets: [
    { label: 'Page views', data: a.daily.map((d) => d.pageviews), borderColor: PALETTE[2], pointRadius: 0, tension: 0.3 },
    { label: 'Sessions', data: a.daily.map((d) => d.sessions), borderColor: PALETTE[0], pointRadius: 0, tension: 0.3 },
    { label: 'Users', data: a.daily.map((d) => d.users), borderColor: PALETTE[1], pointRadius: 0, tension: 0.3 },
  ] });
  const ch = a.breakdowns.channel || [];
  chart('an-channels', 'doughnut', { labels: ch.map((c) => c.label), datasets: [{ data: ch.map((c) => c.sessions), backgroundColor: PALETTE, borderWidth: 0 }] }, { plugins: { legend: { position: 'right', labels: { color: css('--muted') } } } });
}

// ── Recommendations ──
export function renderRecommendations(el, rep, { interactive = false } = {}) {
  const recs = rep.recommendations;
  const counts = { high: 0, medium: 0, low: 0 };
  recs.forEach((r) => counts[r.priority]++);
  el.innerHTML = `
    <div class="card"><div class="card-head"><h2>What we need to keep ${esc(rep.brand.name)} and ${esc(rep.brand.domain)} ranking</h2>
      <span class="small muted"><span class="pill high">${counts.high} high</span> <span class="pill medium">${counts.medium} medium</span> <span class="pill low">${counts.low} low</span></span></div>
      ${recs.map((r, i) => `<div class="rec"><span class="pill ${r.priority}">${r.priority}</span>
        <div><b>${esc(r.title)}</b>${r.metric ? ` <span class="small muted">· ${esc(r.metric)}</span>` : ''}<div class="cat">${esc(r.category)}</div><div style="margin-top:4px">${esc(r.detail)}</div></div>
        ${interactive ? `<button class="btn small" data-add-task="${i}">+ Add to plan</button>` : '<span></span>'}</div>`).join('')}
    </div>`;
}
