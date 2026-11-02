import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env loader (no dependency). Existing process.env values win. */
export function loadEnvFile(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^'.*'$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

/** Split a comma list, honouring "double quoted" entries that may contain commas. */
export function parseList(value) {
  if (!value) return [];
  const out = [];
  const re = /\s*(?:"([^"]*)"|([^,]+))\s*(?:,|$)/g;
  let m;
  while ((m = re.exec(value)) && m[0] !== '') {
    const item = (m[1] ?? m[2] ?? '').trim();
    if (item) out.push(item);
  }
  return out;
}

const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

export function buildConfig(env = process.env) {
  const brandName = env.BRAND_NAME || 'Pete Russo';
  const domain = (env.BRAND_DOMAIN || 'peterusso.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  return {
    port: Number(env.PORT || 3000),
    adminPassword: env.ADMIN_PASSWORD || '',
    baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
    collectIntervalMinutes: Number(env.COLLECT_INTERVAL_MINUTES ?? 360),
    demoMode: bool(env.DEMO_MODE, true),
    dbFile: env.DB_FILE || path.join(ROOT, 'data', 'peterusso.db'),
    brand: {
      name: brandName,
      tagline: env.BRAND_TAGLINE ?? 'Executive Leadership Coaching',
      domain,
      siteUrl: `https://${domain}/`,
      queries: parseList(env.BRAND_QUERIES).length ? parseList(env.BRAND_QUERIES) : [`"${brandName}"`, domain],
      contextKeywords: parseList(env.BRAND_CONTEXT_KEYWORDS),
      excludeKeywords: parseList(env.BRAND_EXCLUDE_KEYWORDS),
    },
    seoKeywords: parseList(env.SEO_KEYWORDS).length ? parseList(env.SEO_KEYWORDS) : [brandName.toLowerCase()],
    keys: {
      serpapi: env.SERPAPI_KEY || '',
      youtube: env.YOUTUBE_API_KEY || '',
      youtubeChannelId: env.YOUTUBE_CHANNEL_ID || '',
      meta: env.META_ACCESS_TOKEN || '',
      instagramId: env.INSTAGRAM_BUSINESS_ID || '',
      facebookPageId: env.FACEBOOK_PAGE_ID || '',
      xBearer: env.X_BEARER_TOKEN || '',
      xUsername: (env.X_USERNAME || '').replace(/^@/, ''),
      googleServiceAccountFile: env.GOOGLE_SERVICE_ACCOUNT_FILE ? path.resolve(ROOT, env.GOOGLE_SERVICE_ACCOUNT_FILE) : '',
      gscSiteUrl: env.GSC_SITE_URL || `sc-domain:${domain}`,
      ga4PropertyId: env.GA4_PROPERTY_ID || '',
      pagespeed: env.PAGESPEED_API_KEY || '',
      slackWebhook: env.SLACK_WEBHOOK_URL || '',
    },
  };
}

loadEnvFile();
export const config = buildConfig();
