import { googlePost } from '../lib/googleAuth.js';

const SCOPE = ['https://www.googleapis.com/auth/analytics.readonly'];

async function runReport(cfg, body) {
  return googlePost(cfg.keys.googleServiceAccountFile, SCOPE,
    `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.keys.ga4PropertyId}:runReport`, body);
}

const dateRanges = (days) => [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }];

/** GA4 Data API: daily totals for PeteRusso.com. */
export async function fetchGa4Daily(cfg, days = 90) {
  const json = await runReport(cfg, {
    dateRanges: dateRanges(days),
    dimensions: [{ name: 'date' }],
    metrics: ['activeUsers', 'sessions', 'screenPageViews', 'engagedSessions', 'averageSessionDuration', 'keyEvents'].map((name) => ({ name })),
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });
  return (json.rows || []).map((r) => {
    const d = r.dimensionValues[0].value;
    const m = r.metricValues.map((v) => Number(v.value));
    return {
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      users: m[0], sessions: m[1], pageviews: m[2], engaged_sessions: m[3],
      avg_session_seconds: Number(m[4].toFixed(1)), conversions: m[5],
    };
  });
}

const BREAKDOWNS = {
  channel: 'sessionDefaultChannelGroup',
  page: 'pagePath',
  country: 'country',
  device: 'deviceCategory',
  referrer: 'sessionSource',
};

/** GA4 breakdowns (last 30 days): channels, top pages, countries, devices, referrers. */
export async function fetchGa4Breakdowns(cfg) {
  const out = [];
  for (const [dimension, gaName] of Object.entries(BREAKDOWNS)) {
    const json = await runReport(cfg, {
      dateRanges: dateRanges(30),
      dimensions: [{ name: gaName }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    });
    for (const r of json.rows || []) {
      out.push({ dimension, label: r.dimensionValues[0].value, sessions: Number(r.metricValues[0].value), users: Number(r.metricValues[1].value) });
    }
  }
  return out;
}
