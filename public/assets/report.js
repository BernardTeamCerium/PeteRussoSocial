import { esc, mentionItem, renderOverview, renderMentionsSummary, renderSocial, renderRankings, renderAnalytics, renderRecommendations } from './render.js';

const token = location.pathname.split('/').pop();
const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
const rep = await res.json();
const content = document.getElementById('content');

if (!res.ok) {
  document.getElementById('title').textContent = 'Report unavailable';
  content.innerHTML = `<div class="card">${esc(rep.error)}</div>`;
} else {
  document.title = `${rep.label} – ${rep.brand.name}`;
  document.getElementById('title').textContent = rep.label;
  document.getElementById('subtitle').textContent = `${rep.brand.name} · ${rep.brand.domain} · last ${rep.days} days · updated ${new Date(rep.generatedAt).toLocaleString()}`;
  if (Object.values(rep.demo).some(Boolean)) {
    const n = document.getElementById('demo-notice');
    n.hidden = false;
    n.textContent = 'Some sections show sample data because their data sources are not connected yet.';
  }
  const titles = { overview: 'Overview', mentions: 'Web mentions', social: 'Social engagement', rankings: 'Search rankings & SEO', analytics: 'Website analytics', recommendations: 'Priorities to keep ranking' };
  for (const s of rep.sections) {
    const sec = document.createElement('section');
    sec.innerHTML = `<h2>${titles[s]}</h2><div></div>`;
    content.append(sec);
    const el = sec.lastElementChild;
    if (s === 'overview') renderOverview(el, rep);
    if (s === 'mentions') {
      renderMentionsSummary(el, rep);
      const list = document.createElement('div');
      list.className = 'card';
      list.style.marginTop = '16px';
      list.innerHTML = `<h2>Latest mentions</h2>${rep.mentions.recent.slice(0, 25).map((m) => mentionItem(m, false)).join('') || '<p class="muted">No mentions in this period.</p>'}`;
      el.append(list);
    }
    if (s === 'social') renderSocial(el, rep);
    if (s === 'rankings') renderRankings(el, rep);
    if (s === 'analytics') renderAnalytics(el, rep);
    if (s === 'recommendations') renderRecommendations(el, rep);
  }
}
