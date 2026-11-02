import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseList, buildConfig } from '../src/config.js';
import { scoreRelevance, scoreSentiment } from '../src/lib/relevance.js';
import { parseRss } from '../src/lib/text.js';
import { engagementRate } from '../src/connectors/social.js';
import { buildRecommendations } from '../src/services/recommendations.js';

const cfg = buildConfig({ BRAND_EXCLUDE_KEYWORDS: 'House of Cards,AFL', BRAND_CONTEXT_KEYWORDS: 'keynote' });

test('parseList handles quoted entries with commas', () => {
  assert.deepEqual(parseList('"Pete Russo","Russo, Pete",peterusso.com'), ['Pete Russo', 'Russo, Pete', 'peterusso.com']);
  assert.deepEqual(parseList(''), []);
});

test('config normalises the domain', () => {
  const c = buildConfig({ BRAND_DOMAIN: 'https://PeteRusso.com/' });
  assert.equal(c.brand.domain, 'peterusso.com');
  assert.equal(c.brand.siteUrl, 'https://peterusso.com/');
});

test('relevance separates our Pete Russo from other people with the name', () => {
  const ours = scoreRelevance('Pete Russo keynote recap, more at peterusso.com', cfg.brand);
  const plain = scoreRelevance('Interview with Pete Russo', cfg.brand);
  const other = scoreRelevance("Corey Stoll's Peter Russo in House of Cards", cfg.brand);
  const lastOnly = scoreRelevance('Russo brothers announce film', cfg.brand);
  assert.ok(ours >= 0.9, `ours=${ours}`);
  assert.ok(plain >= 0.4, `plain=${plain}`);
  assert.equal(other, 0);
  assert.ok(lastOnly < 0.2);
});

test('sentiment', () => {
  assert.ok(scoreSentiment('An amazing, inspiring keynote. Highly recommend!') > 0);
  assert.ok(scoreSentiment('Lawsuit alleges fraud') < 0);
  assert.equal(scoreSentiment('He spoke on Tuesday'), 0);
});

test('parseRss extracts items with CDATA and entities', () => {
  const xml = `<rss><channel><item><title><![CDATA[Pete Russo &amp; friends]]></title><link>https://a.com/x</link>
    <pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><source url="https://a.com">A News</source></item></channel></rss>`;
  const [item] = parseRss(xml);
  assert.equal(item.title, 'Pete Russo & friends');
  assert.equal(item.link, 'https://a.com/x');
  assert.equal(item.source, 'A News');
});

test('engagement rate per post per follower', () => {
  assert.equal(engagementRate({ likes: 90, comments: 10, shares: 0 }, 1000, 2), 5);
  assert.equal(engagementRate({ likes: 1 }, 0, 2), null);
});

test('recommendations flag striking-distance keywords, failed checks and unlinked mentions', () => {
  const recs = buildRecommendations({
    cfg,
    audit: { checks: [{ id: 'schema_person', label: 'x', pass: false, weight: 10 }, { id: 'https', label: 'y', pass: true, weight: 10 }] },
    rankings: { tracked: [{ keyword: 'pete russo', position: 6, change: -3 }, { keyword: 'peter russo', position: null }], topQueries: [] },
    mentions: { unlinked: 4, sentiment: { negative: 1 }, total: 10, filteredOut: 2 },
    social: { platforms: [] },
    analytics: { daily: [], kpis: {}, breakdowns: {} },
  });
  const titles = recs.map((r) => r.title).join('\n');
  assert.match(titles, /Person schema/);
  assert.doesNotMatch(titles, /HTTPS/);
  assert.match(titles, /Close to the top for "pete russo"/);
  assert.match(titles, /Dropped 3 positions/);
  assert.match(titles, /Not ranking for "peter russo"/);
  assert.match(titles, /4 recent mentions/);
  assert.equal(recs[0].priority, 'high');
  assert.equal(recs.at(-1).priority, 'low');
});
