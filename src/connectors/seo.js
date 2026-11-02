import fs from 'node:fs';
import { fetchJson, fetchText } from '../lib/http.js';
import { googlePost } from '../lib/googleAuth.js';
import { daysAgo, stripTags } from '../lib/text.js';

const GSC_SCOPE = ['https://www.googleapis.com/auth/webmasters.readonly'];

export const hasGoogleKey = (cfg) => Boolean(cfg.keys.googleServiceAccountFile && fs.existsSync(cfg.keys.googleServiceAccountFile));

/**
 * Google Search Console: real average positions, clicks, impressions per query (last 28 days,
 * ending 2 days ago because GSC data lags). Returns rows for the tracked keywords plus the top queries.
 */
export async function fetchSearchConsole(cfg) {
  const site = encodeURIComponent(cfg.keys.gscSiteUrl);
  const endDate = daysAgo(2);
  const json = await googlePost(cfg.keys.googleServiceAccountFile, GSC_SCOPE,
    `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`,
    { startDate: daysAgo(29), endDate, dimensions: ['query'], rowLimit: 250 });
  return (json.rows || []).map((r) => ({
    keyword: r.keys[0], date: endDate, source: 'gsc', position: Number(r.position.toFixed(1)),
    clicks: r.clicks, impressions: r.impressions, ctr: Number((r.ctr * 100).toFixed(2)), url: null,
  }));
}

/** SerpAPI live rank check: where does the brand domain appear for each tracked keyword? */
export async function fetchSerpRanks(cfg) {
  const out = [];
  for (const keyword of cfg.seoKeywords) {
    const json = await fetchJson(`https://serpapi.com/search.json?engine=google&num=100&q=${encodeURIComponent(keyword)}&api_key=${cfg.keys.serpapi}`);
    const hit = (json.organic_results || []).find((r) => (r.link || '').toLowerCase().includes(cfg.brand.domain));
    out.push({ keyword, date: daysAgo(0), source: 'serp', position: hit ? hit.position : null, clicks: null, impressions: null, ctr: null, url: hit?.link || null });
  }
  return out;
}

/** On-page SEO audit of the home page + robots/sitemap, and optional PageSpeed Insights. */
export async function auditSite(cfg) {
  const url = cfg.brand.siteUrl;
  const { body: html, res } = await fetchText(url, { timeout: 20000 });
  const pick = (re) => html.match(re)?.[1]?.trim() || '';
  const title = stripTags(pick(/<title[^>]*>([\s\S]*?)<\/title>/i));
  const metaDesc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || pick(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => stripTags(m[1]));
  const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
  const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join(' ');
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imgsNoAlt = imgs.filter((i) => !/\balt=["'][^"']+/i.test(i)).length;
  const words = stripTags(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')).split(/\s+/).length;
  const name = cfg.brand.name.toLowerCase();
  const socialDomains = ['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'tiktok.com'];
  const socialLinks = socialDomains.filter((d) => html.toLowerCase().includes(d));

  const probe = async (p) => { try { await fetchText(new URL(p, url).href, { timeout: 10000 }); return true; } catch { return false; } };
  const [robots, sitemap] = await Promise.all([probe('/robots.txt'), probe('/sitemap.xml')]);

  const checks = [
    { id: 'https', label: 'Served over HTTPS', pass: res.url.startsWith('https://'), weight: 10 },
    { id: 'title', label: 'Title tag present (30–60 chars)', pass: title.length >= 30 && title.length <= 60, value: title, weight: 10 },
    { id: 'title_name', label: `Title contains "${cfg.brand.name}"`, pass: title.toLowerCase().includes(name), weight: 10 },
    { id: 'meta_description', label: 'Meta description (70–160 chars)', pass: metaDesc.length >= 70 && metaDesc.length <= 160, value: metaDesc, weight: 8 },
    { id: 'h1', label: 'Exactly one H1', pass: h1s.length === 1, value: h1s.join(' | '), weight: 6 },
    { id: 'h1_name', label: `H1 mentions "${cfg.brand.name}"`, pass: h1s.some((h) => h.toLowerCase().includes(name)), weight: 6 },
    { id: 'canonical', label: 'Canonical URL set', pass: Boolean(canonical), value: canonical, weight: 5 },
    { id: 'og', label: 'Open Graph image for social sharing', pass: Boolean(ogImage), weight: 5 },
    { id: 'schema_person', label: 'Person schema (JSON-LD) for knowledge panel', pass: /"@type"\s*:\s*"Person"/i.test(jsonLd), weight: 10 },
    { id: 'schema_sameas', label: 'Schema "sameAs" links to social profiles', pass: /"sameAs"/i.test(jsonLd), weight: 8 },
    { id: 'social_links', label: 'Links to social profiles on page', pass: socialLinks.length >= 2, value: socialLinks.join(', '), weight: 4 },
    { id: 'img_alt', label: 'All images have alt text', pass: imgsNoAlt === 0, value: `${imgsNoAlt} of ${imgs.length} missing`, weight: 4 },
    { id: 'content', label: 'At least 300 words of content on home page', pass: words >= 300, value: `${words} words`, weight: 6 },
    { id: 'robots', label: 'robots.txt reachable', pass: robots, weight: 4 },
    { id: 'sitemap', label: 'sitemap.xml reachable', pass: sitemap, weight: 4 },
  ];

  let pagespeed = null;
  try {
    const k = cfg.keys.pagespeed ? `&key=${cfg.keys.pagespeed}` : '';
    const ps = await fetchJson(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=seo&category=accessibility&category=best-practices${k}`, { timeout: 60000 });
    const cats = ps.lighthouseResult?.categories || {};
    const audits = ps.lighthouseResult?.audits || {};
    pagespeed = {
      performance: Math.round((cats.performance?.score ?? 0) * 100),
      seo: Math.round((cats.seo?.score ?? 0) * 100),
      accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
      lcp: audits['largest-contentful-paint']?.displayValue,
      cls: audits['cumulative-layout-shift']?.displayValue,
      tbt: audits['total-blocking-time']?.displayValue,
    };
    checks.push({ id: 'speed', label: 'Mobile performance score ≥ 80', pass: pagespeed.performance >= 80, value: `${pagespeed.performance}/100`, weight: 10 });
  } catch (e) {
    pagespeed = { error: e.message };
  }

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const score = Math.round((checks.filter((c) => c.pass).reduce((a, c) => a + c.weight, 0) / total) * 100);
  return { url, score, checks, pagespeed };
}
