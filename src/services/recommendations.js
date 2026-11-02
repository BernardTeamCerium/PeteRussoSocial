/**
 * "What do we need to keep ranking Pete Russo and PeteRusso.com?"
 * Turns the collected data into a prioritised action plan.
 */
const FIXES = {
  https: ['Move the site fully to HTTPS', 'Serve the whole site over HTTPS and redirect http:// to https://.'],
  title: ['Rewrite the home-page title tag', 'Make the home-page <title> 30–60 characters and start it with "Pete Russo", e.g. "Pete Russo - Executive Leadership Coaching".'],
  title_name: ['Put "Pete Russo" in the home-page title', 'The title tag is the strongest on-page signal for a name search. Lead with "Pete Russo".'],
  meta_description: ['Write a meta description', 'Write a 70–160 character meta description that says who Pete Russo is and what visitors can do on the site. Google often uses it as the search snippet.'],
  h1: ['Use exactly one H1 heading', 'The home page should have one H1 that states the page topic.'],
  h1_name: ['Put "Pete Russo" in the H1', 'Make the main heading say "Pete Russo" so Google ties the page to the name.'],
  canonical: ['Add a canonical URL', 'Add <link rel="canonical" href="https://peterusso.com/"> so duplicate versions (www / non-www / trailing slash) don\'t split ranking signals.'],
  og: ['Add social sharing (Open Graph) tags', 'Add og:title, og:description and og:image so links to PeteRusso.com look good when shared on social media.'],
  schema_person: ['Add Person schema markup', 'Add Person JSON-LD (name, jobTitle "Executive Leadership Coach", image, url). It is the main input for a Google Knowledge Panel and tells Google which "Pete Russo" the site is about.'],
  schema_sameas: ['Link all official profiles in schema "sameAs"', 'List every official profile (Instagram, LinkedIn, X, YouTube, Facebook, Wikidata if any) in the Person schema "sameAs" array. This connects them into one entity across the web.'],
  social_links: ['Cross-link the site and social profiles', 'Link to the official social profiles from the site header or footer, and link back to PeteRusso.com from every profile bio.'],
  img_alt: ['Add alt text to images', 'Give every image descriptive alt text, e.g. "Pete Russo speaking at …".'],
  content: ['Add more content to the home page', 'Expand the home page to at least 300 words: a bio, credentials, and what Pete does. Thin pages rank poorly for name searches.'],
  robots: ['Publish robots.txt', 'Publish a robots.txt that allows crawling and points to the sitemap.'],
  sitemap: ['Publish and submit an XML sitemap', 'Publish /sitemap.xml and submit it in Google Search Console.'],
  speed: ['Improve mobile page speed', 'Compress images (WebP/AVIF), lazy-load media below the fold, and cut render-blocking scripts. Core Web Vitals are a ranking factor.'],
};

export function buildRecommendations({ audit, rankings, mentions, social, analytics, cfg }) {
  const recs = [];
  const add = (priority, category, title, detail, metric) => recs.push({ priority, category, title, detail, metric });

  // 1. Technical / on-page SEO
  if (audit?.checks) {
    for (const c of audit.checks.filter((x) => !x.pass)) {
      const [title, detail] = FIXES[c.id] || [c.label, 'Fix this check.'];
      add(c.weight >= 8 ? 'high' : 'medium', 'On-page SEO', title, detail, c.value ? `now: ${c.value}` : null);
    }
  } else {
    add('high', 'On-page SEO', 'Run a site audit', `The audit of ${cfg.brand.siteUrl} has not run yet. Click "Collect now" or check that the server can reach the site.`);
  }

  // 2. Rankings
  for (const k of rankings?.tracked || []) {
    if (k.position == null) {
      add('high', 'Rankings', `Not ranking for "${k.keyword}"`, `PeteRusso.com does not appear in the tracked results for "${k.keyword}". Create or optimise a page targeting this phrase and build links to it.`);
    } else if (k.position > 3 && k.position <= 20) {
      add('high', 'Rankings', `Close to the top for "${k.keyword}" (position ${k.position})`, `This is a near-win. Strengthen the page that ranks: add the phrase to the title and H1, add internal links from other pages, and get 2–3 quality backlinks that use "${k.keyword}" as anchor text.`, `#${k.position}`);
    } else if (k.position > 20) {
      add('medium', 'Rankings', `Weak ranking for "${k.keyword}" (position ${k.position})`, 'Publish dedicated content (bio page, articles, press page) that targets this phrase.', `#${k.position}`);
    }
    if (k.change != null && k.change <= -2) {
      add('high', 'Rankings', `Dropped ${Math.abs(k.change)} positions for "${k.keyword}"`, 'Check for recent site changes, lost backlinks, or a competing "Pete Russo" page that is gaining ground.', `${k.change}`);
    }
  }
  for (const q of (rankings?.topQueries || []).filter((x) => x.impressions >= 50 && x.ctr < 2 && x.position <= 10).slice(0, 3)) {
    add('medium', 'Rankings', `Low click-through on "${q.keyword}"`, `${q.impressions} impressions but only ${q.ctr}% CTR at position ${q.position}. Rewrite the page title and meta description so the search result is more compelling.`, `${q.ctr}% CTR`);
  }

  // 3. Mentions → backlinks & reputation
  if (mentions) {
    if (mentions.unlinked > 0) {
      add('high', 'Off-page / backlinks', `${mentions.unlinked} recent mentions don't link to PeteRusso.com`, 'Ask these authors or outlets to add a link to PeteRusso.com. Turning existing mentions into links is the quickest way to earn authoritative backlinks.', `${mentions.unlinked} opportunities`);
    }
    if (mentions.sentiment?.negative > 0) {
      add('high', 'Reputation', `${mentions.sentiment.negative} negative mentions to review`, 'Review the flagged mentions and respond where appropriate. Publishing positive owned content helps push negative results down the page.');
    }
    if (mentions.total < 5) {
      add('medium', 'Off-page / backlinks', 'Few web mentions this period', 'Pitch guest articles, podcasts, interviews and local press. Fresh, authoritative mentions of the name build search authority.');
    }
    if (mentions.filteredOut > mentions.total) {
      add('medium', 'Brand clarity', 'Many results are about other people named Pete/Peter Russo', 'Use a consistent descriptor everywhere (e.g. "Pete Russo, <profession>") and add Person schema with sameAs links so Google can tell him apart from the others. Add context keywords in settings to improve mention filtering.');
    }
  }

  // 4. Social
  const connected = new Set((social?.platforms || []).map((p) => p.platform));
  for (const p of ['instagram', 'linkedin', 'youtube', 'x', 'facebook']) {
    if (!connected.has(p)) add('low', 'Social', `No data for ${p}`, `Connect ${p} or enter its numbers manually. Active, linked social profiles often rank on page 1 for a person's name.`);
  }
  for (const p of social?.platforms || []) {
    if (p.followerGrowthPct != null && p.followerGrowthPct < 0) add('medium', 'Social', `${p.platform} followers are down ${Math.abs(p.followerGrowthPct)}%`, 'Review posting frequency and content mix for this platform.');
    if (p.avgEngagementRate != null && p.avgEngagementRate < 1) add('low', 'Social', `Low engagement on ${p.platform} (${p.avgEngagementRate}%)`, 'Post more native video, ask questions, and reply to comments within the first hour.');
  }

  // 5. Analytics
  const organic = analytics?.breakdowns?.channel?.find((c) => /organic search/i.test(c.label));
  const totalSessions = (analytics?.breakdowns?.channel || []).reduce((a, c) => a + c.sessions, 0);
  if (totalSessions && organic && organic.sessions / totalSessions < 0.3) {
    add('medium', 'Analytics', `Organic search is only ${Math.round((organic.sessions / totalSessions) * 100)}% of traffic`, 'Publish search-targeted content regularly (articles, FAQs, media page) to build sustainable organic traffic.');
  }
  if (analytics?.kpis?.sessions?.change != null && analytics.kpis.sessions.change < -10) {
    add('high', 'Analytics', `Site sessions down ${Math.abs(analytics.kpis.sessions.change)}%`, 'Check the channel breakdown to find which source dropped. Compare it with ranking changes and any recent site changes.');
  }
  if (!analytics?.daily?.length) add('medium', 'Analytics', 'Connect Google Analytics 4', 'Add the GA4 property ID and service account so website traffic shows up here.');

  // Evergreen essentials for personal-brand ranking
  add('low', 'Content', 'Publish fresh content monthly', 'Post a blog article, news update or media appearance to PeteRusso.com at least once a month and share it on every social channel. Freshness and internal links keep the domain ranking for "Pete Russo".');
  add('low', 'Brand clarity', 'Claim the entity', 'Keep Google Business Profile (if relevant), Wikidata, Crunchbase, LinkedIn and podcast/author profiles consistent, all linking to PeteRusso.com.');

  const order = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => order[a.priority] - order[b.priority]);
}
