import { esc, fmt, platformName, mentionItem, renderOverview, renderMentionsSummary, renderSocial, renderRankings, renderAnalytics, renderRecommendations } from './render.js';

const $ = (s) => document.querySelector(s);
const state = { rep: null, sources: null };
const TITLES = { overview: 'Overview', mentions: 'Web mentions', social: 'Social engagement', rankings: 'Rankings & SEO', analytics: 'Website analytics', plan: 'Action plan', share: 'Share updates', settings: 'Settings & sources' };

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) }, body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
const days = () => $('#days').value;

// ── Tabs ──
let current = 'overview';
function showTab(tab) {
  current = tab;
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.section').forEach((s) => s.classList.toggle('active', s.id === `tab-${tab}`));
  $('#page-title').textContent = TITLES[tab];
  history.replaceState(null, '', `#${tab}`);
  window.scrollTo(0, 0);
  renderTab(tab);
}
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });

function renderTab(tab) {
  const rep = state.rep;
  if (!rep) return;
  if (tab === 'overview') renderOverview($('#overview'), rep);
  if (tab === 'mentions') { renderMentionsSummary($('#mentions-summary'), rep); loadMentions(); }
  if (tab === 'social') renderSocial($('#social'), rep);
  if (tab === 'rankings') renderRankings($('#rankings'), rep);
  if (tab === 'analytics') renderAnalytics($('#analytics'), rep);
  if (tab === 'plan') { renderRecommendations($('#recommendations'), rep, { interactive: true }); loadTasks(); }
  if (tab === 'share') { loadSummary(); loadShares(); }
  if (tab === 'settings') renderSettings();
}

async function load() {
  state.rep = await api(`/api/report?days=${days()}`);
  const rep = state.rep;
  $('#brand-name').textContent = rep.brand.name;
  $('#brand-domain').textContent = rep.brand.domain;
  const demo = Object.entries(rep.demo).filter(([, v]) => v).map(([k]) => k);
  $('#demo-notice').hidden = !demo.length;
  $('#demo-notice').innerHTML = demo.length ? `Showing <b>sample data</b> for: ${demo.map(esc).join(', ')}. Connect these sources in <a href="#settings" data-goto="settings">Settings &amp; sources</a> to see real numbers.` : '';
  const hi = rep.recommendations.filter((r) => r.priority === 'high').length;
  $('#high-count').hidden = !hi;
  $('#high-count').textContent = hi;
  renderTab(current);
}
document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) { e.preventDefault(); showTab(g.dataset.goto); } });
$('#days').addEventListener('change', load);

$('#collect').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Collecting…';
  try {
    const { results } = await api('/api/collect', { method: 'POST' });
    const failed = Object.values(results).filter((r) => !r.ok).length;
    toast(failed ? `Done. ${failed} source(s) failed; see Settings.` : 'All sources updated');
    await load();
    state.sources = null;
  } catch (err) { toast(err.message); }
  e.target.disabled = false;
  e.target.textContent = 'Collect now';
});

// ── Mentions ──
let mTimer;
async function loadMentions() {
  const params = new URLSearchParams({ days: days(), minRelevance: $('#m-rel').value, q: $('#m-q').value, source: $('#m-source').value, status: $('#m-status').value });
  $('#csv').href = `/api/mentions.csv?days=${days()}&minRelevance=${$('#m-rel').value}`;
  const rows = await api(`/api/mentions?${params}`);
  $('#mentions-list').innerHTML = rows.map((m) => mentionItem(m, true)).join('') || '<p class="muted">No mentions match these filters.</p>';
}
['#m-source', '#m-status', '#m-rel'].forEach((s) => $(s).addEventListener('change', loadMentions));
$('#m-q').addEventListener('input', () => { clearTimeout(mTimer); mTimer = setTimeout(loadMentions, 250); });
$('#mentions-list').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-mention]');
  if (!b) return;
  await api(`/api/mentions/${b.dataset.mention}`, { method: 'PATCH', body: { status: b.dataset.status } });
  toast(b.dataset.status === 'irrelevant' ? 'Hidden. Marked as a different Pete Russo.' : `Marked ${b.dataset.status}`);
  loadMentions();
});

// ── Manual social entry ──
$('#manual').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    await api('/api/social/manual', { method: 'POST', body });
    toast(`Saved ${platformName(body.platform)} numbers`);
    e.target.reset();
    load();
  } catch (err) { toast(err.message); }
});

// ── Action plan ──
$('#recommendations').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-add-task]');
  if (!b) return;
  const r = state.rep.recommendations[Number(b.dataset.addTask)];
  await api('/api/tasks', { method: 'POST', body: { title: r.title, detail: r.detail, category: r.category, priority: r.priority } });
  b.disabled = true;
  b.textContent = 'Added ✓';
  loadTasks();
});
async function loadTasks() {
  const tasks = await api('/api/tasks');
  $('#tasks').innerHTML = tasks.map((t) => `<div class="rec"><input type="checkbox" data-task="${t.id}" ${t.done ? 'checked' : ''} aria-label="Done">
    <div style="${t.done ? 'text-decoration:line-through;opacity:.6' : ''}"><b>${esc(t.title)}</b> <span class="pill ${t.priority}">${t.priority}</span>${t.category ? ` <span class="small muted">${esc(t.category)}</span>` : ''}${t.detail ? `<div class="small muted">${esc(t.detail)}</div>` : ''}</div>
    <button class="btn small" data-del-task="${t.id}">Remove</button></div>`).join('') || '<p class="muted small">No tasks yet. Add recommendations above with "+ Add to plan".</p>';
}
$('#tasks').addEventListener('change', async (e) => { if (e.target.dataset.task) { await api(`/api/tasks/${e.target.dataset.task}`, { method: 'PATCH', body: { done: e.target.checked } }); loadTasks(); } });
$('#tasks').addEventListener('click', async (e) => { const b = e.target.closest('[data-del-task]'); if (b) { await api(`/api/tasks/${b.dataset.delTask}`, { method: 'DELETE' }); loadTasks(); } });
$('#task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/tasks', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
  e.target.reset();
  loadTasks();
});

// ── Share ──
const SECTION_LABELS = { overview: 'Overview', mentions: 'Mentions', social: 'Social', rankings: 'Rankings & SEO', analytics: 'Website analytics', recommendations: 'Action plan' };
$('#share-sections').innerHTML = Object.entries(SECTION_LABELS).map(([k, v]) => `<label><input type="checkbox" name="sections" value="${k}" checked> ${v}</label>`).join('');
$('#share-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const { url } = await api('/api/shares', { method: 'POST', body: { label: fd.get('label'), days: fd.get('days'), expiresInDays: Number(fd.get('expiresInDays')), sections: fd.getAll('sections') } });
  try { await navigator.clipboard.writeText(url); toast('Link created and copied'); } catch { toast('Link created'); }
  loadShares();
});
async function loadShares() {
  const links = await api('/api/shares');
  $('#shares').innerHTML = links.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Link</th><th>Sections</th><th>Expires</th><th></th></tr></thead><tbody>${links.map((l) => `<tr>
    <td>${esc(l.label)}</td><td><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></td><td class="small">${l.sections.map((s) => esc(SECTION_LABELS[s] || s)).join(', ')}</td>
    <td class="small">${l.expires_at ? new Date(l.expires_at).toLocaleDateString() : 'never'}</td><td><button class="btn small" data-revoke="${esc(l.token)}">Revoke</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No share links yet.</p>';
}
$('#shares').addEventListener('click', async (e) => { const b = e.target.closest('[data-revoke]'); if (b && confirm('Revoke this link? Anyone using it will lose access.')) { await api(`/api/shares/${b.dataset.revoke}`, { method: 'DELETE' }); loadShares(); } });
async function loadSummary() {
  $('#summary').value = await api(`/api/summary.md?days=${days()}`);
  if (!state.sources) state.sources = await api('/api/sources');
  $('#slack').hidden = !state.sources.slack;
}
$('#copy-summary').addEventListener('click', async () => { await navigator.clipboard.writeText($('#summary').value); toast('Summary copied'); });
$('#slack').addEventListener('click', async () => { try { await api(`/api/slack?days=${days()}`, { method: 'POST' }); toast('Posted to Slack'); } catch (err) { toast(err.message); } });

// ── Settings ──
const ENV = { serpapi: 'SERPAPI_KEY', youtube: 'YOUTUBE_API_KEY', youtubeChannelId: 'YOUTUBE_CHANNEL_ID', meta: 'META_ACCESS_TOKEN', instagramId: 'INSTAGRAM_BUSINESS_ID', facebookPageId: 'FACEBOOK_PAGE_ID', xBearer: 'X_BEARER_TOKEN', xUsername: 'X_USERNAME', googleServiceAccountFile: 'GOOGLE_SERVICE_ACCOUNT_FILE', gscSiteUrl: 'GSC_SITE_URL', ga4PropertyId: 'GA4_PROPERTY_ID' };
async function renderSettings() {
  state.sources = await api('/api/sources');
  const s = state.sources;
  const run = s.lastRun?.results || {};
  const runKey = (src) => Object.keys(run).find((k) => k.endsWith(`:${src.id}`) || k === src.id);
  $('#settings').innerHTML = `
    <div class="card" style="margin-bottom:16px"><h2>Data sources</h2>
      <p class="small muted">Credentials go in the server's <code>.env</code> file (see <code>.env.example</code> and the README). Sources marked "needs setup" show sample data until connected.
      ${s.lastRun ? `Last collection: ${new Date(s.lastRun.finished_at).toLocaleString()}.` : 'No collection has run yet.'}</p>
      <div class="table-wrap"><table><thead><tr><th>Area</th><th>Source</th><th>Status</th><th>Last run</th><th>Setup</th></tr></thead><tbody>
      ${s.sources.map((src) => { const r = run[runKey(src)]; return `<tr><td>${esc(src.area)}</td><td>${esc(src.label)}</td>
        <td>${src.connected ? '<span class="pill ok">connected</span>' : '<span class="pill medium">needs setup</span>'}</td>
        <td class="small">${r ? (r.ok ? `<span class="up">ok</span> (${fmt(r.count)})` : `<span class="down" title="${esc(r.error)}">failed: ${esc(r.error.slice(0, 70))}</span>`) : '–'}</td>
        <td class="small muted">${src.connected ? '' : src.needs.map((n) => `<code>${ENV[n] || n}</code>`).join(' ')}</td></tr>`; }).join('')}
      </tbody></table></div></div>
    <div class="grid two">
      <div class="card"><h2>Monitored searches</h2><p class="small">${s.brand.queries.map((q) => `<code>${esc(q)}</code>`).join(' ')}</p>
        <h3 style="margin-top:12px">Context keywords <span class="small muted">(boost relevance)</span></h3><p class="small">${s.brand.contextKeywords.map((q) => `<code>${esc(q)}</code>`).join(' ') || '<span class="muted">None yet. Add words that describe Pete (industry, city, company) in BRAND_CONTEXT_KEYWORDS so his mentions are easier to tell apart from other Pete Russos.</span>'}</p>
        <h3 style="margin-top:12px">Exclude keywords <span class="small muted">(other Pete Russos)</span></h3><p class="small">${s.brand.excludeKeywords.map((q) => `<code>${esc(q)}</code>`).join(' ') || '<span class="muted">None</span>'}</p></div>
      <div class="card"><h2>Tracked ranking keywords</h2><p class="small">${s.seoKeywords.map((q) => `<code>${esc(q)}</code>`).join(' ')}</p><p class="small muted">Change these with <code>SEO_KEYWORDS</code>. Search Console also reports every other query the site appears for.</p></div>
    </div>`;
}

// manual-platform options
const MANUAL = ['linkedin', 'tiktok', 'threads', 'instagram', 'facebook', 'x', 'youtube'];
$('#manual-platform').innerHTML = MANUAL.map((p) => `<option value="${p}">${platformName(p)}</option>`).join('');

window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TITLES[t] && t !== current) showTab(t); });
const start = location.hash.slice(1);
await load();
if (TITLES[start]) showTab(start);
