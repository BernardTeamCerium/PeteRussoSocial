/**
 * Web-mention sources. Each returns normalised items:
 * { url, source, title, snippet, author, outlet, published_at }
 */
import { fetchJson, fetchText } from '../lib/http.js';
import { parseRss, stripTags, toIso } from '../lib/text.js';

const enc = encodeURIComponent;

export const mentionSources = [
  {
    id: 'google_news',
    label: 'Google News',
    needs: [],
    async fetch(cfg, query) {
      const { body } = await fetchText(`https://news.google.com/rss/search?q=${enc(query)}&hl=en-US&gl=US&ceid=US:en`);
      return parseRss(body).map((i) => ({
        url: i.link, source: 'google_news', title: i.title, snippet: i.description,
        outlet: i.source || null, author: null, published_at: toIso(i.pubDate),
      }));
    },
  },
  {
    id: 'reddit',
    label: 'Reddit',
    needs: [],
    async fetch(cfg, query) {
      const json = await fetchJson(`https://www.reddit.com/search.json?q=${enc(query)}&sort=new&limit=50&t=month`);
      return (json.data?.children || []).map(({ data: p }) => ({
        url: `https://www.reddit.com${p.permalink}`, source: 'reddit', title: p.title,
        snippet: (p.selftext || '').slice(0, 500), author: p.author, outlet: `r/${p.subreddit}`,
        published_at: toIso(p.created_utc * 1000),
      }));
    },
  },
  {
    id: 'hacker_news',
    label: 'Hacker News',
    needs: [],
    async fetch(cfg, query) {
      const json = await fetchJson(`https://hn.algolia.com/api/v1/search_by_date?query=${enc(query.replace(/"/g, ''))}&hitsPerPage=30`);
      return (json.hits || []).map((h) => ({
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, source: 'hacker_news',
        title: h.title || h.story_title || 'Comment', snippet: stripTags(h.comment_text || h.story_text || '').slice(0, 500),
        author: h.author, outlet: 'Hacker News', published_at: toIso(h.created_at),
      }));
    },
  },
  {
    id: 'gdelt',
    label: 'GDELT (global news)',
    needs: [],
    async fetch(cfg, query) {
      const q = query.includes('"') ? query : `"${query}"`;
      const json = await fetchJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${enc(q)}&mode=artlist&format=json&maxrecords=50&timespan=1month&sort=datedesc`);
      return (json.articles || []).map((a) => ({
        url: a.url, source: 'gdelt', title: a.title, snippet: '', author: null, outlet: a.domain,
        published_at: toIso(a.seendate?.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')),
      }));
    },
  },
  {
    id: 'youtube',
    label: 'YouTube videos',
    needs: ['youtube'],
    async fetch(cfg, query) {
      const json = await fetchJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=25&q=${enc(query)}&key=${cfg.keys.youtube}`);
      return (json.items || []).map((v) => ({
        url: `https://www.youtube.com/watch?v=${v.id.videoId}`, source: 'youtube', title: stripTags(v.snippet.title),
        snippet: stripTags(v.snippet.description), author: v.snippet.channelTitle, outlet: 'YouTube',
        published_at: toIso(v.snippet.publishedAt),
      }));
    },
  },
  {
    id: 'web',
    label: 'Google web results (SerpAPI)',
    needs: ['serpapi'],
    async fetch(cfg, query) {
      const json = await fetchJson(`https://serpapi.com/search.json?engine=google&num=50&q=${enc(query)}&api_key=${cfg.keys.serpapi}`);
      return (json.organic_results || []).map((r) => ({
        url: r.link, source: 'web', title: r.title, snippet: r.snippet || '', author: null,
        outlet: r.displayed_link?.split('/')[0]?.replace(/^https?:\/\//, '') || null, published_at: toIso(r.date),
      }));
    },
  },
];

export const isConfigured = (src, cfg) => src.needs.every((k) => Boolean(cfg.keys[k]));
