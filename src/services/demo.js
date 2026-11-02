/** Realistic sample data so the dashboard works before any API keys are connected. */
import { daysAgo } from '../lib/text.js';
import { saveMentions, saveSocial, saveRankings, saveAnalyticsDaily, saveBreakdowns, saveAudit } from './store.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function seedDemo(db, cfg, { days = 120, only } = {}) {
  const r = rng(42);
  const want = (k) => !only || only.includes(k);
  const name = cfg.brand.name;
  const domain = cfg.brand.domain;

  if (want('social')) {
    const plats = { instagram: [8400, 4.1], linkedin: [5200, 2.6], x: [3100, 1.4], youtube: [1250, 5.2], facebook: [2700, 0.9] };
    for (const [platform, [base, er]] of Object.entries(plats)) {
      let f = base;
      for (let i = days; i >= 0; i--) {
        f += Math.round((r() - 0.25) * base * 0.004);
        const likes = Math.round(f * (er / 100) * 20 * (0.7 + r() * 0.6));
        saveSocial(db, platform, daysAgo(i), {
          followers: f, posts: Math.round(300 - i / 3), likes, comments: Math.round(likes * 0.08), shares: Math.round(likes * 0.05),
          views: platform === 'youtube' ? Math.round(f * 30 + (days - i) * 40) : null,
          impressions: Math.round(f * (1.5 + r())), reach: Math.round(f * (0.8 + r() * 0.5)),
          engagement_rate: Number((er * (0.75 + r() * 0.5)).toFixed(2)),
        }, true);
      }
    }
  }

  if (want('analytics')) {
    const rows = [];
    for (let i = days; i >= 1; i--) {
      const weekday = new Date(daysAgo(i)).getUTCDay();
      const trend = 1 + (days - i) / days * 0.35;
      const users = Math.round((140 + r() * 60) * trend * (weekday === 0 || weekday === 6 ? 0.75 : 1));
      const sessions = Math.round(users * (1.2 + r() * 0.15));
      rows.push({ date: daysAgo(i), users, sessions, pageviews: Math.round(sessions * (2.1 + r() * 0.6)), engaged_sessions: Math.round(sessions * (0.55 + r() * 0.1)), avg_session_seconds: Number((95 + r() * 50).toFixed(1)), conversions: Math.round(sessions * 0.018 * (0.6 + r())) });
    }
    saveAnalyticsDaily(db, rows, true);
    const b = [
      ['channel', 'Organic Search', 2140], ['channel', 'Direct', 1480], ['channel', 'Organic Social', 1310], ['channel', 'Referral', 520], ['channel', 'Email', 210],
      ['page', '/', 3050], ['page', '/about', 1190], ['page', '/media', 640], ['page', '/contact', 410], ['page', '/blog', 380],
      ['country', 'United States', 4380], ['country', 'Canada', 420], ['country', 'United Kingdom', 310], ['country', 'Australia', 190],
      ['device', 'mobile', 3510], ['device', 'desktop', 2010], ['device', 'tablet', 140],
      ['referrer', 'google', 2050], ['referrer', '(direct)', 1480], ['referrer', 'instagram.com', 640], ['referrer', 'linkedin.com', 420], ['referrer', 'bing', 90],
    ];
    saveBreakdowns(db, b.map(([dimension, label, sessions]) => ({ dimension, label, sessions, users: Math.round(sessions * 0.82) })), daysAgo(1), true);
  }

  if (want('rankings')) {
    const kws = [...new Set([...cfg.seoKeywords.map((k) => k.toLowerCase()), `${name.toLowerCase()} bio`, `${name.toLowerCase()} interview`, domain])];
    const start = { 0: 6.5, 1: 14, 2: 4.2, 3: 18, 4: 9, 5: 1.1 };
    const rows = [];
    kws.forEach((kw, idx) => {
      let pos = start[idx] ?? 12 + idx;
      for (let i = 90; i >= 2; i -= 7) {
        pos = Math.max(1, pos - (r() - 0.35) * 0.9);
        const impressions = Math.round((idx === 0 ? 900 : 300 / (idx + 1)) * (1 + r() * 0.2));
        const ctr = Number(Math.max(0.5, 32 / pos - 1 + r()).toFixed(2));
        rows.push({ keyword: kw, date: daysAgo(i), source: 'gsc', position: Number(pos.toFixed(1)), impressions, clicks: Math.round(impressions * ctr / 100), ctr, url: null });
      }
    });
    saveRankings(db, rows, true);
  }

  if (want('mentions')) {
    const t = [
      ['google_news', `${name} named to regional business leaders list`, `Local leaders including ${name} were honored this week for community impact.`, 'Business Journal', 0.3],
      ['google_news', `Interview: ${name} on building a personal brand`, `In a wide-ranging interview, ${name} shares lessons learned. Visit ${domain} for more.`, 'Daily Herald', 0.6],
      ['reddit', `Has anyone worked with ${name}?`, `Saw his talk last month, really impressive and helpful. Would recommend.`, 'r/smallbusiness', 0.4],
      ['youtube', `${name} keynote – full session`, `Full keynote recording. Thank you to everyone who attended!`, 'YouTube', 0.5],
      ['google_news', `${name} launches new initiative`, `${name} announced a new initiative to celebrate local growth.`, 'City News', 0.5],
      ['web', `Podcast Ep. 112 with ${name}`, `We sit down with ${name} to talk strategy, growth and what's next.`, 'podcasts.example.com', 0.6],
      ['reddit', `${name} event was disappointing`, `The event had a problem with seating, kind of disappointing honestly.`, 'r/events', 0.4],
      ['google_news', `Peter Russo returns to House of Cards discussion`, `Fans revisit Corey Stoll's Peter Russo storyline on House of Cards.`, 'TV Guide', 0.05],
      ['gdelt', `AFL legend Peter Russo reflects on career`, `Former Australian rules footballer Peter Russo looks back.`, 'abc.net.au', 0.05],
      ['web', `${name} – Official Website`, `${name}'s official site at ${domain}.`, domain, 0.9],
      ['google_news', `Community gala honors ${name}`, `${name} was honored for years of service; the award was presented Friday.`, 'Gazette', 0.5],
      ['hacker_news', `Show HN: tool recommended by ${name}`, `Great discussion after ${name} mentioned this in a newsletter.`, 'Hacker News', 0.4],
    ];
    const items = [];
    for (let i = 0; i < 36; i++) {
      const [source, title, snippet, outlet] = t[i % t.length];
      const age = Math.floor(r() * 58);
      items.push({ url: `https://example.com/demo/${source}/${i}`, source, title, snippet, outlet, author: null, published_at: new Date(Date.now() - age * 864e5 - r() * 864e5).toISOString() });
    }
    saveMentions(db, items, cfg.brand, true);
  }

  if (want('audit')) {
    // Mirrors the real audit of PeteRusso.com run on 2026-11-02, so the first view is accurate.
    // Replaced by a live audit on the first collection.
    saveAudit(db, {
      url: cfg.brand.siteUrl, score: 52,
      checks: [
        { id: 'https', label: 'Served over HTTPS', pass: true, weight: 10 },
        { id: 'title', label: 'Title tag present (30–60 chars)', pass: true, value: `${name} - Executive Leadership Coaching`, weight: 10 },
        { id: 'title_name', label: `Title contains "${name}"`, pass: true, weight: 10 },
        { id: 'meta_description', label: 'Meta description (70–160 chars)', pass: false, value: '', weight: 8 },
        { id: 'h1', label: 'Exactly one H1', pass: true, value: `About ${name}`, weight: 6 },
        { id: 'h1_name', label: `H1 mentions "${name}"`, pass: true, weight: 6 },
        { id: 'canonical', label: 'Canonical URL set', pass: false, weight: 5 },
        { id: 'og', label: 'Open Graph image for social sharing', pass: false, weight: 5 },
        { id: 'schema_person', label: 'Person schema (JSON-LD) for knowledge panel', pass: false, weight: 10 },
        { id: 'schema_sameas', label: 'Schema "sameAs" links to social profiles', pass: false, weight: 8 },
        { id: 'social_links', label: 'Links to social profiles on page', pass: false, value: 'linkedin.com', weight: 4 },
        { id: 'img_alt', label: 'All images have alt text', pass: true, value: '0 of 4 missing', weight: 4 },
        { id: 'content', label: 'At least 300 words of content on home page', pass: true, value: '904 words', weight: 6 },
        { id: 'robots', label: 'robots.txt reachable', pass: false, weight: 4 },
        { id: 'sitemap', label: 'sitemap.xml reachable', pass: false, weight: 4 },
      ],
      pagespeed: null,
    }, true, new Date(Date.now() - 3600e3).toISOString());
  }
}
