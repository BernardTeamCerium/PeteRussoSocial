/**
 * Social platform connectors. Each returns one snapshot for today:
 * { platform, followers, posts, impressions, reach, likes, comments, shares, views, engagement_rate }
 * likes/comments/shares/views are totals across the most recent posts (up to 25).
 */
import { fetchJson } from '../lib/http.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);

export function engagementRate({ likes = 0, comments = 0, shares = 0 }, followers, postCount) {
  if (!followers || !postCount) return null;
  return Number((((likes + comments + shares) / postCount / followers) * 100).toFixed(2));
}

export const socialConnectors = [
  {
    platform: 'youtube',
    label: 'YouTube',
    needs: ['youtube', 'youtubeChannelId'],
    async fetch({ keys }) {
      const json = await fetchJson(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${keys.youtubeChannelId}&key=${keys.youtube}`);
      const s = json.items?.[0]?.statistics;
      if (!s) throw new Error('YouTube channel not found');
      return { followers: +s.subscriberCount, posts: +s.videoCount, views: +s.viewCount };
    },
  },
  {
    platform: 'instagram',
    label: 'Instagram',
    needs: ['meta', 'instagramId'],
    async fetch({ keys }) {
      const t = `access_token=${keys.meta}`;
      const acct = await fetchJson(`${GRAPH}/${keys.instagramId}?fields=followers_count,media_count&${t}`);
      const media = (await fetchJson(`${GRAPH}/${keys.instagramId}/media?fields=like_count,comments_count,timestamp&limit=25&${t}`)).data || [];
      let reach = null;
      try {
        const ins = await fetchJson(`${GRAPH}/${keys.instagramId}/insights?metric=reach&period=day&${t}`);
        reach = ins.data?.[0]?.values?.at(-1)?.value ?? null;
      } catch { /* insights need extra permission; optional */ }
      const totals = { likes: sum(media, (m) => m.like_count), comments: sum(media, (m) => m.comments_count), shares: 0 };
      return { followers: acct.followers_count, posts: acct.media_count, reach, ...totals, engagement_rate: engagementRate(totals, acct.followers_count, media.length) };
    },
  },
  {
    platform: 'facebook',
    label: 'Facebook Page',
    needs: ['meta', 'facebookPageId'],
    async fetch({ keys }) {
      const t = `access_token=${keys.meta}`;
      const page = await fetchJson(`${GRAPH}/${keys.facebookPageId}?fields=followers_count,fan_count&${t}`);
      const posts = (await fetchJson(`${GRAPH}/${keys.facebookPageId}/posts?fields=shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)&limit=25&${t}`)).data || [];
      const totals = {
        likes: sum(posts, (p) => p.reactions?.summary?.total_count),
        comments: sum(posts, (p) => p.comments?.summary?.total_count),
        shares: sum(posts, (p) => p.shares?.count),
      };
      const followers = page.followers_count ?? page.fan_count;
      return { followers, posts: posts.length, ...totals, engagement_rate: engagementRate(totals, followers, posts.length) };
    },
  },
  {
    platform: 'x',
    label: 'X (Twitter)',
    needs: ['xBearer', 'xUsername'],
    async fetch({ keys }) {
      const headers = { authorization: `Bearer ${keys.xBearer}` };
      const user = (await fetchJson(`https://api.x.com/2/users/by/username/${keys.xUsername}?user.fields=public_metrics`, { headers })).data;
      const tweets = (await fetchJson(`https://api.x.com/2/users/${user.id}/tweets?max_results=25&tweet.fields=public_metrics&exclude=retweets`, { headers })).data || [];
      const totals = {
        likes: sum(tweets, (x) => x.public_metrics.like_count),
        comments: sum(tweets, (x) => x.public_metrics.reply_count),
        shares: sum(tweets, (x) => x.public_metrics.retweet_count + x.public_metrics.quote_count),
      };
      const views = sum(tweets, (x) => x.public_metrics.impression_count);
      const followers = user.public_metrics.followers_count;
      return { followers, posts: user.public_metrics.tweet_count, impressions: views || null, ...totals, engagement_rate: engagementRate(totals, followers, tweets.length) };
    },
  },
];

/** Platforms without an easy public API: entered manually from the dashboard. */
export const MANUAL_PLATFORMS = ['linkedin', 'tiktok', 'threads'];

export const isConfigured = (c, cfg) => c.needs.every((k) => Boolean(cfg.keys[k]));
