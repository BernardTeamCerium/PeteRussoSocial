import fs from 'node:fs';
import crypto from 'node:crypto';

const cache = new Map();
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Exchange a service-account key for an OAuth access token (JWT bearer flow), no googleapis dependency. */
export async function getGoogleAccessToken(keyFile, scopes) {
  if (!keyFile || !fs.existsSync(keyFile)) throw new Error('Google service account file not configured');
  const cacheKey = `${keyFile}|${scopes.join(' ')}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now() + 60_000) return hit.token;

  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: scopes.join(' '), aud: key.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key);
  const assertion = `${header}.${claims}.${b64url(signature)}`;

  const res = await fetch(key.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google auth failed: ${json.error_description || json.error}`);
  cache.set(cacheKey, { token: json.access_token, expires: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

export async function googlePost(keyFile, scopes, url, body) {
  const token = await getGoogleAccessToken(keyFile, scopes);
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google API ${res.status}: ${json.error?.message || JSON.stringify(json).slice(0, 200)}`);
  return json;
}
