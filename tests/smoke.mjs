// Smoke test: node tests/smoke.mjs <path> [--click "#sel" ...] [--shot out.png] [--mobile]
// Serves dist/ (or $SMOKE_DIST) on port $SMOKE_PORT (default 8765), loads the page in Chromium,
// reports console errors, clicks the given selectors and saves any downloads to tests/out/.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = process.env.SMOKE_DIST || path.join(ROOT, 'dist');
const OUTDIR = process.env.SMOKE_OUT || '/tmp/bleedline-smoke';
fs.mkdirSync(OUTDIR, { recursive: true });
const args = process.argv.slice(2);
const target = args[0] || '';
const clicks = []; let shot = null; let mobile = false; let waitMs = 600;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--click') clicks.push(args[++i]);
  else if (args[i] === '--shot') shot = args[++i];
  else if (args[i] === '--mobile') mobile = true;
  else if (args[i] === '--wait') waitMs = +args[++i];
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(DIST, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404, { 'content-type': 'text/html' }); res.end(fs.readFileSync(path.join(DIST, '404.html'))); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
const port = +(process.env.SMOKE_PORT || 8765);
await new Promise((r) => server.listen(port, r)).catch(() => {});
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => { if (!/cloudflareinsights|goatcounter|gumroad/.test(r.url())) errors.push('requestfailed: ' + r.url()); });
await page.goto(`http://localhost:${port}/${target}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(waitMs);
for (const sel of clicks) {
  const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await page.click(sel);
  const d = await dl;
  if (d) { const out = path.join(OUTDIR, d.suggestedFilename()); await d.saveAs(out); console.log('download:', out, fs.statSync(out).size, 'bytes'); }
  else console.log('no download after clicking', sel);
}
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (overflow) errors.push('layout: page scrolls horizontally at this width');
if (shot) { await page.screenshot({ path: shot, fullPage: true }); console.log('screenshot:', shot); }
console.log(errors.length ? 'PROBLEMS:\n' + errors.join('\n') : 'no console errors');
await browser.close(); server.close();
