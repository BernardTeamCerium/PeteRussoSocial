const UA = 'PeteRussoSocialMonitor/1.0 (+brand monitoring)';

export async function fetchText(url, { timeout = 15000, headers = {}, ...opts } = {}) {
  let res;
  try {
    res = await fetch(url, { ...opts, headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();
    throw new Error(`Could not reach ${host}: ${e.cause?.code || e.cause?.message || e.message}`);
  }
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url.replace(/(key|token|access_token)=[^&]+/gi, '$1=***')}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return { body, res };
}

export async function fetchJson(url, opts = {}) {
  const { body } = await fetchText(url, { ...opts, headers: { accept: 'application/json', ...(opts.headers || {}) } });
  return JSON.parse(body);
}
