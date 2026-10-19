// Reads the public visitor counters and writes stats/counts.json plus a daily row in stats/history.csv.
// Run by .github/workflows/stats.yml. Counter keys are set in src/assets/site.js.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const ns = config.analytics.counterNamespace;
const slugs = fs.readdirSync(path.join(ROOT, 'src/tools')).filter((d) => fs.existsSync(path.join(ROOT, 'src/tools', d, 'meta.json')));
const keys = ['visitors', 'views', 'page-home', 'page-pro', 'page-about', 'page-privacy', ...slugs.map((s) => 'page-' + s),
  ...['pdf', 'png', 'svg', 'zip', 'csv', 'jpg'].map((x) => 'ev-download-' + x),
  'ev-pro-modal-gate', 'ev-pro-modal-open', 'ev-buy-click-pro-page', 'ev-buy-click-modal', 'ev-pro-activated'];

const counts = {};
for (const k of keys) {
  const r = await fetch(`https://abacus.jasoncameron.dev/get/${ns}/${k}`);
  counts[k] = r.ok ? (await r.json()).value : 0;
  await new Promise((res) => setTimeout(res, 400)); // stay under 30 requests per 10 s
}
const now = new Date().toISOString();
fs.mkdirSync(path.join(ROOT, 'stats'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'stats/counts.json'), JSON.stringify({ updated: now, counts }, null, 2) + '\n');
const hist = path.join(ROOT, 'stats/history.csv');
if (!fs.existsSync(hist)) fs.writeFileSync(hist, 'date,visitors,views,downloads,pro_dialogs,buy_clicks,pro_activations\n');
const downloads = keys.filter((k) => k.startsWith('ev-download-')).reduce((a, k) => a + counts[k], 0);
const day = now.slice(0, 10);
const lines = fs.readFileSync(hist, 'utf8').trimEnd().split('\n').filter((l) => !l.startsWith(day + ','));
lines.push([day, counts.visitors, counts.views, downloads, counts['ev-pro-modal-gate'] + counts['ev-pro-modal-open'], counts['ev-buy-click-pro-page'] + counts['ev-buy-click-modal'], counts['ev-pro-activated']].join(','));
fs.writeFileSync(hist, lines.join('\n') + '\n');
console.log(JSON.stringify(counts));
