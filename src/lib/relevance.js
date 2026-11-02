/**
 * "Pete Russo" is a common name (there is a House of Cards character, an Australian footballer,
 * an Australian politician, a sports-radio host named Russo, ...). Every mention gets a relevance
 * score so the team only reviews the ones that are actually about our Pete Russo.
 */
const norm = (s) => (s || '').toLowerCase();
const re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function scoreRelevance(text, brand) {
  const t = norm(text);
  const name = norm(brand.name);
  const [first, ...rest] = name.split(/\s+/);
  const last = rest.join(' ');
  let score = 0;

  if (brand.domain && t.includes(brand.domain)) score += 0.5;
  if (new RegExp(`\\b${re(name)}\\b`).test(t)) score += 0.45;
  else if (last && new RegExp(`\\b(${re(first)}|peter)\\s+${re(last)}\\b`).test(t)) score += 0.3;
  else if (last && t.includes(last)) score += 0.05;

  const ctx = brand.contextKeywords.filter((k) => t.includes(norm(k))).length;
  score += Math.min(0.4, ctx * 0.15);

  const neg = brand.excludeKeywords.filter((k) => t.includes(norm(k))).length;
  score -= Math.min(0.8, neg * 0.5);

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

const POS = ['great', 'amazing', 'excellent', 'love', 'best', 'award', 'wins', 'win', 'success', 'inspiring', 'praised', 'recommend', 'congratulations', 'honored', 'thank', 'helpful', 'impressive', 'growth', 'launch', 'celebrate', 'top'];
const NEG = ['bad', 'worst', 'scam', 'fraud', 'lawsuit', 'sued', 'complaint', 'terrible', 'arrest', 'controversy', 'criticized', 'fail', 'failed', 'disappoint', 'angry', 'hate', 'fake', 'warning', 'problem', 'negative', 'accused'];

/** Lightweight lexicon sentiment, -1..1. Good enough to triage; flagged items get human review. */
export function scoreSentiment(text) {
  const words = norm(text).match(/[a-z']+/g) || [];
  let p = 0, n = 0;
  for (const w of words) {
    if (POS.includes(w)) p++;
    if (NEG.includes(w)) n++;
  }
  if (!p && !n) return 0;
  return Number(((p - n) / (p + n)).toFixed(2));
}

export function linksToSite(text, domain) {
  return domain ? norm(text).includes(domain) : false;
}
