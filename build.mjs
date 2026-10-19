// Builds the static site from src/ into dist/. Run: node build.mjs [--base https://host/path/]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.join(ROOT, 'src');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const baseArg = process.argv.indexOf('--base');
if (baseArg > -1) config.baseUrl = process.argv[baseArg + 1];
if (!config.baseUrl.endsWith('/')) config.baseUrl += '/';
const today = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const read = (p) => fs.readFileSync(p, 'utf8');
const layout = read(path.join(SRC, 'layout.html'));

const CATEGORIES = {
  kdp: { name: 'Self-publishing tools', short: 'Self-publishing', blurb: 'Covers, spines, royalties, interiors, puzzle books and barcodes for Amazon KDP and other print-on-demand book printers.' },
  pod: { name: 'Print-on-demand and Etsy tools', short: 'Print-on-demand', blurb: 'Check DPI, resize artwork to each marketplace\'s spec, trim transparent edges, work out fees and print big posters at home.' },
};

// Load tools.
const toolsDir = path.join(SRC, 'tools');
const tools = fs.readdirSync(toolsDir)
  .filter((d) => fs.existsSync(path.join(toolsDir, d, 'meta.json')) && fs.existsSync(path.join(toolsDir, d, 'tool.html')))
  .map((d) => {
    const meta = JSON.parse(read(path.join(toolsDir, d, 'meta.json')));
    meta.dir = path.join(toolsDir, d);
    meta.slug = meta.slug || d;
    if (meta.draft) return null;
    for (const k of ['title', 'h1', 'description', 'card', 'category']) if (!meta[k]) throw new Error(`${d}/meta.json is missing ${k}`);
    if (meta.description.length > 165) console.warn(`warn: ${d} description is ${meta.description.length} chars`);
    if (meta.title.length > 70) console.warn(`warn: ${d} title is ${meta.title.length} chars`);
    return meta;
  })
  .filter(Boolean)
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.slug.localeCompare(b.slug));
const bySlug = Object.fromEntries(tools.map((t) => [t.slug, t]));

const version = crypto.createHash('sha1').update(String(Date.now())).digest('hex').slice(0, 8);
const publicConfig = { gumroad: config.gumroad, analytics: config.analytics, name: config.name };

function footLinks(cat, root) {
  return tools.filter((t) => t.category === cat).map((t) => `<a href="${root}${t.slug}/">${esc(t.h1)}</a>`).join('\n      ');
}

function page({ outPath, title, description, body, jsonld = [], scripts = '', bodyClass = '', absolute = false }) {
  const depth = outPath.split('/').length - 1;
  // 404.html is served at any path, so it links from the site's own base path.
  const root = absolute ? new URL(config.baseUrl).pathname : depth === 0 ? './' : '../'.repeat(depth);
  const urlPath = outPath.replace(/index\.html$/, '');
  const canonical = config.baseUrl + urlPath;
  const ld = jsonld.length ? `<script type="application/ld+json">${JSON.stringify(jsonld.length === 1 ? jsonld[0] : { '@context': 'https://schema.org', '@graph': jsonld })}</script>` : '';
  const vars = {
    title: esc(title), description: esc(description), canonical, siteName: esc(config.name), baseUrl: config.baseUrl,
    root, version, configJson: JSON.stringify(publicConfig).replace(/</g, '\\u003c'), jsonld: ld, body, scripts,
    bodyClass, tagline: esc(config.tagline), footKdp: footLinks('kdp', root), footPod: footLinks('pod', root),
    verification: config.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">` : '',
  };
  const html = layout.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m)).replace(/\{\{root\}\}/g, root);
  const file = path.join(OUT, outPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Tool bodies may use {{root}} too.
  fs.writeFileSync(file, html.replace(/\{\{root\}\}/g, root));
  return canonical;
}

function card(t, root) {
  const tag = t.proFeature ? '<span class="badge free">Free</span> <span class="badge pro">Pro extras</span>' : '<span class="badge free">Free</span>';
  return `<a class="card" href="${root}${t.slug}/"><h3>${esc(t.h1)}</h3><p>${esc(t.card)}</p>${tag}</a>`;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true });
const urls = [];

// Tool pages.
for (const t of tools) {
  const root = '../';
  const cat = CATEGORIES[t.category];
  const toolHtml = read(path.join(t.dir, 'tool.html'));
  const faq = (t.faq || []);
  const faqHtml = faq.length ? `<section class="faq content"><h2>Questions people ask</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join('')}</section>` : '';
  const related = (t.related || []).map((s) => bySlug[s]).filter(Boolean);
  const more = related.length < 3 ? tools.filter((x) => x.category === t.category && x.slug !== t.slug && !related.includes(x)).slice(0, 3 - related.length) : [];
  const relHtml = `<section><h2>More free tools</h2><div class="related">${[...related, ...more].map((r) => card(r, root)).join('')}</div></section>`;
  const reviewed = t.lastReviewed ? `<p class="small muted">Specs last checked ${esc(t.lastReviewed)}${t.sources ? '. Sources: ' + t.sources.map((s) => `<a href="${esc(s.url)}" rel="nofollow noopener" target="_blank">${esc(s.name)}</a>`).join(', ') : ''}.</p>` : '';
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="${root}">${esc(config.name)}</a> › <a href="${root}#${t.category}">${esc(cat.short)}</a></nav>
<h1>${esc(t.h1)}</h1>
<p class="lead">${t.intro || esc(t.description)}</p>
${toolHtml}
${faqHtml}
${reviewed}
${relHtml}`;
  const canonical = config.baseUrl + t.slug + '/';
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: t.h1, url: canonical, description: t.description, applicationCategory: 'DesignApplication', operatingSystem: 'Any (runs in the browser)', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: config.name, item: config.baseUrl },
      { '@type': 'ListItem', position: 2, name: t.h1, item: canonical } ] },
  ];
  if (faq.length) jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '') } })) });
  const scripts = (t.scripts || []).map((s) => `<script src="${root}${s}?v=${version}"></script>`).join('\n') + `\n<script src="tool.js?v=${version}"></script>`;
  urls.push(page({ outPath: `${t.slug}/index.html`, title: t.title, description: t.description, body, jsonld: jsonld.map(({ ['@context']: c, ...rest }) => rest), scripts, bodyClass: 'tool-page' }));
  for (const f of fs.readdirSync(t.dir)) {
    if (['meta.json', 'tool.html'].includes(f)) continue;
    fs.cpSync(path.join(t.dir, f), path.join(OUT, t.slug, f), { recursive: true });
  }
}

// Home page.
{
  const root = './';
  const sections = Object.entries(CATEGORIES).map(([key, c]) => {
    const list = tools.filter((t) => t.category === key);
    if (!list.length) return '';
    return `<section id="${key}"><h2>${esc(c.name)}</h2><p class="muted">${esc(c.blurb)}</p><div class="cards">${list.map((t) => card(t, root)).join('')}</div></section>`;
  }).join('');
  const body = `
<section class="hero">
  <h1>Print-ready files without the guesswork</h1>
  <p class="lead">Free calculators, generators and image tools for self-publishers, KDP authors and print-on-demand sellers. Get the spine width, bleed, DPI and fees right the first time.</p>
  <ul class="trust"><li>Free, no sign-up</li><li>Files never leave your device</li><li>Specs checked against the platforms' own help pages</li></ul>
</section>
${sections}
<section class="pro-box hide-if-pro"><p><strong>Making books or listings in bulk?</strong> Bleedline Pro adds full-length puzzle books, batch image exports and bigger posters for one payment. <a href="${root}pro/">See what Pro adds</a>.</p></section>`;
  urls.unshift(page({ outPath: 'index.html', title: `${config.name}: free KDP, print-on-demand and Etsy file tools`, description: 'Free in-browser tools for self-publishers and print-on-demand sellers: KDP cover and spine calculator, royalty calculator, puzzle book maker, DPI checker, POD resizer and more.', body,
    jsonld: [{ '@type': 'WebSite', name: config.name, url: config.baseUrl, description: config.tagline }] }));
}

// Static pages (pro, about, privacy, 404).
const pagesDir = path.join(SRC, 'pages');
for (const f of fs.readdirSync(pagesDir).filter((f) => f.endsWith('.json'))) {
  const meta = JSON.parse(read(path.join(pagesDir, f)));
  let body = read(path.join(pagesDir, f.replace(/\.json$/, '.html')));
  const outPath = meta.out;
  const depth = outPath.split('/').length - 1;
  const root = meta.absolute ? new URL(config.baseUrl).pathname : depth === 0 ? './' : '../'.repeat(depth);
  body = body.replace('{{compareRows}}', tools.map((t) => `<tr><td><a href="${root}${t.slug}/">${esc(t.h1)}</a></td><td>${t.free || 'Everything'}</td><td>${t.pro || '<span class="muted">Same as free</span>'}</td></tr>`).join(''))
    .replace(/\{\{price\}\}/g, esc(config.gumroad.price || ''))
    .replace(/\{\{buyUrl\}\}/g, esc(config.gumroad.productUrl || '#'))
    .replace(/\{\{contact\}\}/g, config.contactEmail ? ` Email <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>.` : '')
    .replace(/\{\{siteName\}\}/g, esc(config.name))
    .replace(/\{\{today\}\}/g, today);
  const u = page({ outPath, title: meta.title, description: meta.description, body, bodyClass: meta.bodyClass || '', absolute: !!meta.absolute });
  if (!meta.noindex) urls.push(u);
}

fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${config.baseUrl}sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`Built ${tools.length} tools, ${urls.length} URLs into dist/ (base ${config.baseUrl})`);
