# Building Bleedline tools

Bleedline is a static site of free, in-browser tools for self-publishers (Amazon KDP) and print-on-demand / Etsy sellers. No server: every tool runs client-side. Pro features unlock with a Gumroad license key (src/assets/pro.js).

## Layout
- `build.mjs` builds `src/` into `dist/`. Build to your own folder so parallel builders don't clobber each other: `node build.mjs --base http://localhost:PORT/ --out /tmp/bl-NAME`.
- `src/layout.html`, `src/assets/site.css`, `src/assets/site.js`, `src/assets/pro.js`, `src/assets/kdp.js` are shared and owned by the lead. Don't edit them. If you need a shared helper or CSS change, keep it in your tool's files and mention it in your report.
- Each tool is a folder `src/tools/<slug>/` with:
  - `meta.json`: `slug`, `category` (`kdp` or `pod`), `order`, `title` (<=65 chars, the SEO title: lead with the exact phrase people search), `h1`, `description` (<=160 chars), `intro` (optional HTML lead paragraph), `card` (one short line for cards), `free` and `pro` (what each tier gets, for the compare table on /pro/; omit `pro` when the tool is fully free), `proFeature` (true if it has Pro extras), `related` (slugs), `faq` ([{q, a}], 4–7 real questions; answers may contain simple HTML), `scripts` (extra scripts to load before tool.js, e.g. `"assets/kdp.js"`), `lastReviewed` and `sources` ([{name, url}]) when the tool relies on platform specs.
  - `tool.html`: the tool UI plus the explanatory content below it (how to use, what the numbers mean). Tool-specific CSS goes in a `<style>` block at the top of this file. Use `{{root}}` for links to the site root.
  - `tool.js`: plain browser JS in an IIFE, no modules, no build step. Any other files in the folder are copied as-is.
- The build adds the breadcrumb, H1, lead, FAQ section with FAQPage JSON-LD, related tools, and footer.

## Shared helpers (window.BL, see src/assets/site.js and pro.js)
`BL.$/$$`, `BL.store.get/set` (safe localStorage), `BL.persist(formEl, key)` (remembers form fields), `BL.num(el)`, `BL.radio(name)`, `BL.fmt(n, digits)`, `BL.money(n, currency)`, `BL.esc`, `BL.toast(msg)`, `BL.fail(err, targetEl)`, `BL.download(blob, filename)`, `BL.canvasBlob(canvas, type, q)`, `BL.loadImage(file)`, `BL.dropzone(el, onFiles)`, `BL.loadScript(path)`, `BL.pdfLib(withFontkit)` (lazy-loads pdf-lib, resolves PDFLib), `BL.embedFonts(pdfDoc)` (embeds Atkinson Hyperlegible regular and bold, subset, returns {regular, bold}), `BL.zip([{name, data: Uint8Array}])` (fflate), `BL.blobBytes(blob)`, `BL.track(event, label)`.
Pro: `BL.pro.active()`, `BL.pro.gate(needsPro, reasonText)` (returns true if allowed, otherwise opens the upgrade dialog and returns false), `BL.pro.onChange(cb)`, `BL.pro.open(reason)`. Any element with `data-pro-open="reason"` opens the dialog. `body.is-pro` is set when Pro is active; `.hide-if-pro` and `.show-if-pro` classes exist. To test Pro locally run in the console: `localStorage.setItem('bl:pro', JSON.stringify({key:'test', ok:true, verifiedAt: Date.now()}))`.
KDP specs: `BL.kdp` in src/assets/kdp.js (trims, bleed, insideMargin(pages), outsideMargin(bleed), pageSize(trim, bleed), liveArea(trim, pages, n, bleed, extra) in PDF points, evenPages(n)). Load it via `"scripts": ["assets/kdp.js"]`.

## CSS building blocks (site.css)
`.tool` (two-column grid: controls panel + `.preview` column; add `.single` for one column), `.panel`, `.field` with `label` + `.hint`, `.row`/`.row3`, `.seg` (segmented radio buttons: `<div class="seg"><label><input type="radio" ...>Text</label>…</div>`), `.check`, `.btn` (`.secondary`, `.ghost`, `.pro`, `.block`), `.btn-row`, `.result-grid` with `.stat` (`.k` label, `.v` value, `.s` sub, `.hi` highlight), `.note` (`.warn`, `.err`, `.ok`, `.pro`), `.table-wrap` + `table`, `.canvas-box` (checkerboard preview; `.plain` for grey), `.drop` (dropzone with hidden file input), `.pro-box`, `.badge.pro`, `.badge.free`, `.progress > div`, `.spinner`, `.content` (readable prose width). Colors are CSS variables and the site supports dark mode: never hard-code text or background colors in tool CSS (canvas/PDF output is exempt).

## Quality bar
- Correct first: every number from platform specs must match /mnt/project-files/web-tools/research/specs.md, which cites the official pages. Don't invent specs.
- PDFs for KDP must embed every font (use `BL.embedFonts`; never pdf-lib StandardFonts) and have exact page sizes. Check with `pdffonts` and `pdfinfo`.
- Generous free tier, clear Pro limit: show what Pro adds next to the limit (a `.pro-box` or a button with `data-pro-open`), never nag. A free user must be able to finish a real, useful job.
- Works on a phone (390 px wide, no horizontal scroll), keyboard accessible, labels on every input, dark mode safe.
- Large jobs must not freeze the tab: yield to the event loop (await a setTimeout 0 between chunks) and show progress.
- Errors are shown to the person in plain words (`BL.fail(err, el)`), never swallowed.
- Content: the text under the tool should genuinely teach (what bleed is, why DPI matters, how to fill the form) in plain, specific language. No filler, no keyword stuffing, no claims of affiliation with Amazon, Etsy or anyone else, no trademarks in product names.
- Test in a real browser: build, then `SMOKE_DIST=/tmp/bl-NAME SMOKE_PORT=PORT node tests/smoke.mjs <slug>/ --click "#button" --shot /tmp/x.png [--mobile]`. It reports console errors and saves downloads to /tmp/bleedline-smoke (override with SMOKE_OUT). Look at the screenshots. For deeper checks write your own Playwright script in /tmp (playwright is at /opt/node22/lib/node_modules/playwright, chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome).
- The reference tool is `src/tools/isbn-barcode-generator/` — copy its patterns.

## Shared folder rules
/mnt/project-files is a network mount shared with other sessions. Write only inside your own tool folders. Don't run whole-folder content searches over /mnt/project-files. Build and test output goes in /tmp, never in the shared folder.
