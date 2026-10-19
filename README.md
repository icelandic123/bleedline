# Bleedline

Free, in-browser tools for self-publishers and print-on-demand sellers: KDP cover and spine calculator, royalty and margin calculators, journal interiors, word search and sudoku books, ISBN barcodes, DPI checker, POD image resizer, transparent PNG trimmer, Etsy fee calculator and poster tiler.

Everything runs client-side. There is no server and nothing is uploaded.

- `node build.mjs` builds `src/` into `dist/` (pass `--base <url>` for canonical links).
- `node tests/smoke.mjs <page>/` loads a page in Chromium and reports console errors.
- Pushing to `main` deploys to GitHub Pages through `.github/workflows/pages.yml`.
- Settings (Gumroad product, analytics, Search Console) live in `site.config.json`.

See BUILDING.md for how tools are put together. Specs come from `research/specs.md`, which cites each platform's help page.
