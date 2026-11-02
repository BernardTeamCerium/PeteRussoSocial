import { config } from './config.js';
import { openDb } from './db.js';
import { collectAll } from './services/collector.js';
import { seedDemo } from './services/demo.js';

const db = openDb(config.dbFile);
const cmd = process.argv[2];

if (cmd === 'collect') {
  const { results } = await collectAll(db, config);
  console.table(Object.fromEntries(Object.entries(results).map(([k, r]) => [k, r.ok ? `ok (${r.count})` : `FAILED: ${r.error.slice(0, 80)}`])));
} else if (cmd === 'seed-demo') {
  seedDemo(db, config);
  console.log('Demo data seeded.');
} else {
  console.log('Usage: node src/cli.js <collect|seed-demo>');
  process.exitCode = 1;
}
