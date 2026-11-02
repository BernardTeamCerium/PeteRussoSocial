import http from 'node:http';
import { config } from './config.js';
import { openDb, getMeta, setMeta } from './db.js';
import { createHandler } from './app.js';
import { collectAll, ensureDemo } from './services/collector.js';
import { buildReport, reportToMarkdown, postToSlack } from './services/reports.js';

const db = openDb(config.dbFile);
ensureDemo(db, config);

async function scheduledRun() {
  const { results } = await collectAll(db, config);
  const failed = Object.entries(results).filter(([, r]) => !r.ok).map(([k]) => k);
  console.log(`[collect] done, ${Object.keys(results).length} sources${failed.length ? `, failed: ${failed.join(', ')}` : ''}`);
  // Weekly Slack digest
  const last = Number(getMeta(db, 'slack_last_post') || 0);
  if (config.keys.slackWebhook && Date.now() - last > 6.5 * 864e5) {
    try {
      await postToSlack(config.keys.slackWebhook, reportToMarkdown(buildReport(db, config, { days: 7 })));
      setMeta(db, 'slack_last_post', Date.now());
    } catch (e) { console.warn(`[slack] ${e.message}`); }
  }
}

http.createServer(createHandler(db, config)).listen(config.port, () => {
  console.log(`Pete Russo Social running at http://localhost:${config.port}`);
  if (!config.adminPassword) console.warn('⚠  ADMIN_PASSWORD is not set; the dashboard is open to anyone who can reach this port.');
  if (config.collectIntervalMinutes > 0) {
    setTimeout(scheduledRun, 5_000);
    setInterval(scheduledRun, config.collectIntervalMinutes * 60_000);
  }
});
