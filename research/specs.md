# Calculator specs research: KDP, Etsy, POD, ISBN barcodes

**Checked on: 2026-10-19** (all official pages fetched on this date; Etsy fee page itself says "Last updated Oct 5, 2026").
Legend: **UNVERIFIED** = not confirmed on an official page. Every table has a Source line; each number inherits that source unless a different URL is given.
KDP help base: `https://kdp.amazon.com/en_US/help/topic/`  (IDs below are appended to it)

---

## 1. KDP trim sizes, bleed, spine, cover, page counts, barcode

### 1.1 Paperback trim sizes (kdp.amazon.com) and page limits (min-max)
Source: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6 (also G201834560)

| Trim (in) | Class | B&W white | B&W cream | B&W groundwood | Std color (white) | Premium color (white) |
|---|---|---|---|---|---|---|
| 5 x 8, 5.06 x 7.81, 5.25 x 8, 5.5 x 8.5, 6 x 9 | Regular | 24-828 | 24-776 | 24-812 | 72-600 | 24-828 |
| 6.14 x 9.21, 6.69 x 9.61, 7 x 10, 7.44 x 9.69, 7.5 x 9.25, 8 x 10 | Large | 24-828 | 24-776 | 24-812 | 72-600 | 24-828 |
| 8.25 x 6, 8.25 x 8.25 | Large | 24-800 | 24-750 | 24-784 | 72-600 | 24-800 |
| 8.5 x 8.5, 8.5 x 11 | Large | 24-590 | 24-550 | 24-578 | 72-600 | 24-590 |
| 8.27 x 11.69 | Large | 24-780 | 24-730 | 24-764 | not available | 24-590 |

- Large trim = wider than 6.12" (155.5 mm) OR taller than 9" (228.6 mm); otherwise regular. Source: https://kdp.amazon.com/en_US/help/topic/G201834340
- 8.25 x 11 appears in the bleed table but NOT in the paperback specs table of that page (UNVERIFIED whether it is a current paperback trim; it is a hardcover trim).
- Japan (kdp.amazon.co.jp) trims: 4.06x7.17, 4.13x6.81, 4.41x6.85, 5x7.4, 5.04x7.17, 5.83x8.27, 5.98x8.58, 5.98x8.94, 7.17x10.12, 7.17x8.11 (24-828 B&W white); 8.27x10.12 and 8.27x11.69 (24-780); std color unavailable at JP. Source: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6

### 1.2 Hardcover trim sizes and page limits (not available on KDP Japan)
Source: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6 and https://kdp.amazon.com/en_US/help/topic/G201834180

| Trim (in) | Class | Pages (B&W white, B&W cream, premium color) |
|---|---|---|
| 5.5 x 8.5 | regular | 75-550 |
| 6 x 9 | regular | 75-550 |
| 6.14 x 9.21 | large | 75-550 |
| 7 x 10 | large | 75-550 |
| 8.25 x 11 | large | 75-550 |

Groundwood and standard color are not available for hardcover. Source: same two pages.

### 1.3 Bleed
- Bleed = 0.125" (3.2 mm) on top, bottom, outside edges. Interior with bleed: page width = trim width + 0.125"; page height = trim height + 0.25". Source: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6
- If any interior page bleeds, the whole interior file must be set up with bleed. Same source.
- Paperback cover bleed: 0.125" all sides (bottom bleed may not exceed 0.125"). Source: https://kdp.amazon.com/en_US/help/topic/G201834560 and G201953020

### 1.4 Paperback spine width per page
Source: https://kdp.amazon.com/en_US/help/topic/G201953020 (confirmed on https://kdp.amazon.com/en_US/help/topic/G201834560)

| Ink / paper | Inches per page | mm per page |
|---|---|---|
| B&W, white paper | 0.002252 | 0.0572 |
| B&W, cream paper | 0.0025 | 0.0635 |
| B&W, groundwood | 0.00235 | 0.0596 |
| Standard color | 0.002252 | 0.0572 |
| Premium color | 0.002347 | 0.0596 |

Spine width = page count x factor.
- Spine text allowed only above 79 pages (G201834560 says "more than 79"; G201953020 says minimum 79, or 80 if using Cover Creator). Keep >= 0.0625" (1.6 mm) clearance each side of spine; spine variance 0.0625" either side of folds. Source: G201953020 / G201834560. (G201953020 prints the shift tolerance as "0.0125" (3.2 mm)", an apparent typo; ignore.)

### 1.5 Paperback cover dimensions
Source: https://kdp.amazon.com/en_US/help/topic/G201953020
- Full cover width = bleed + back cover width + spine width + front cover width + bleed = 2 x trim width + spine + 0.25" (bleed 0.125" x2).
- Full cover height = bleed + trim height + bleed = trim height + 0.25".
- Cover images: CMYK, >= 300 DPI (max recommended 600), min font 7 pt, text >= 0.125" inside trim, cover file limit 650 MB. Source: G201834560.

### 1.6 Hardcover cover (case laminate) - see UNVERIFIED notes
Official numbers on https://kdp.amazon.com/en_US/help/topic/GDTKFJPNQCBTMRV6 ("Create a Hardcover Cover"):
- Cover images should extend 0.51" (15 mm) past the edge of the front cover (wrap).
- Text/images >= 0.635" (16 mm) from edge of book (0.125" inside the margin line).
- Spine hinge: 0.4" (10 mm) space between spine and safe area on front and back.
- Barcode 2" x 1.2" (50.8 x 30.5 mm), 300 DPI, >= 0.76" (19 mm) from bottom of cover and >= 0.25" (6 mm) from spine hinge. Default KDP barcode is a 2" x 1.2" white box lower right of back cover.
- Spine flat; headbands if > 120 pages; case board 2 mm; cover <= 40 MB recommended. Source: https://kdp.amazon.com/en_US/help/topic/GKZVNAAFYWVKZWL8 and GDTKFJPNQCBTMRV6.
- **UNVERIFIED:** KDP's public help pages give NO hardcover spine-per-page factor and NO total cover width/height formula; they live only in the KDP cover calculator (https://kdp.amazon.com/cover-calculator, JavaScript tool, inputs 76-550 pp for hardcover) and cover-template generator. A secondary site (https://kdpprintcover.com/blog/kdp-hardcover-vs-paperback-cover-specs/, "not affiliated with Amazon") claims: spine = pages x 0.002252 (B&W white) / 0.002740 (cream) / 0.002252 (premium color) + 0.189"; wrap 0.591", hinge 0.197", overhang 0.118"; width = 2 x trim w + spine + 2 x 0.591 + 2 x 0.197; example 6x9, 200 pp white: spine 0.6394", width 14.2154", height 10.4180". Its cream factor differs from paperback cream (0.0025) and its height formula is inconsistent. Do NOT ship hardcover cover math as exact; label calculator output "estimate - confirm in KDP cover calculator", or have the tool link to the KDP calculator.

### 1.7 Barcode (paperback)
Source: https://kdp.amazon.com/en_US/help/topic/G5HDYGP4BXLX4RUW
- Suggested area 2" x 1.2" (50.8 x 30.5 mm); minimum 1.4" x 0.8" (35.56 x 20.3 mm). Keep >= 0.25" (6.3 mm) from spine and trim.
- KDP places a free ISBN barcode in a 2" x 1.2" white box in the lower right of the back cover (lower left for right-to-left content). Keep it clear of text/images. Source: G201953020 and https://kdp.amazon.com/en_US/help/topic/GGE5T76TWKA85DJM

### 1.8 Interior margins
Source: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6

| Page count | Inside (gutter) margin |
|---|---|
| 24-150 | 0.375" (9.6 mm) |
| 151-300 | 0.5" (12.7 mm) |
| 301-500 | 0.625" (15.9 mm) |
| 501-700 | 0.75" (19.1 mm) |
| 701-828 | 0.875" (22.3 mm) |

Outside (top, bottom, outside) margin: >= 0.25" (6.4 mm) without bleed; >= 0.375" (9.6 mm) with bleed.

---

## 2. KDP print costs (current, post 10 June 2025 changes)
Formula: printing cost = fixed + (pages x per-page). Per-page applies only in the ranges shown. Large trim = see 1.1.
Paperback source: https://kdp.amazon.com/en_US/help/topic/G201834340 . Hardcover source: https://kdp.amazon.com/en_US/help/topic/GHT976ZKSKUXBB6H
"EU" = Amazon.de/es/fr/it/nl/ie/com.be (same EUR rates).

### 2.1 Paperback, B&W (white or cream paper)
Pages 24-110 (24-108 for .com.au): fixed only. Pages 110-828: fixed + per page. (The boundary is printed as "110"; treat 109-110 as ambiguous -> UNVERIFIED for exactly 109/110; KDP's tool uses even page counts.)

| Mkt | 24-110 reg | 24-110 large | 110-828 reg fixed / pp | 110-828 large fixed / pp |
|---|---|---|---|---|
| US USD | 2.30 | 2.84 | 1.00 / 0.012 | 1.00 / 0.017 |
| CA CAD | 2.99 | 3.53 | 1.26 / 0.016 | 1.26 / 0.021 |
| UK GBP | 1.93 | 2.15 | 0.85 / 0.010 | 0.85 / 0.012 |
| EU EUR | 2.05 | 2.48 | 0.75 / 0.012 | 0.75 / 0.016 |
| PL PLN | 9.58 | 11.61 | 3.51 / 0.056 | 3.51 / 0.075 |
| SE SEK | 22.84 | 27.67 | 8.37 / 0.134 | 8.37 / 0.179 |
| AU AUD | 4.74 | 5.28 | 2.42 / 0.022 | 2.42 / 0.027 |
| JP JPY | 422 | 530 | 206 / 2 | 206 / 3 |

### 2.2 Paperback, groundwood (24-112 fixed only; 114-828 fixed + per page)
| Mkt | 24-112 reg | 24-112 large | 114-828 reg | 114-828 large |
|---|---|---|---|---|
| US | 2.23 | 2.75 | 1.00 / 0.0114 | 1.00 / 0.0162 |
| CA | 2.90 | 3.42 | 1.26 / 0.0152 | 1.26 / 0.0200 |
| UK | 1.88 | 2.08 | 0.85 / 0.0095 | 0.85 / 0.0114 |
| EU | 1.98 | 2.39 | 0.75 / 0.0114 | 0.75 / 0.0152 |
| PL | 9.26 | 11.21 | 3.51 / 0.0532 | 3.51 / 0.0713 |
| SE | 22.12 | 26.74 | 8.37 / 0.1273 | 8.37 / 0.1701 |
| AU | 4.62 | 5.14 | 2.42 / 0.0209 | 2.42 / 0.0257 |
| JP | 411.20 | 513.80 | 206 / 1.90 | 206 / 2.85 |

### 2.3 Paperback, premium color (24-40 fixed only; 42-828 fixed + per page)
| Mkt | 24-40 reg | 24-40 large | 42-828 reg | 42-828 large |
|---|---|---|---|---|
| US | 3.60 | 4.20 | 1.00 / 0.065 | 1.00 / 0.08 |
| CA | 4.66 | 5.26 | 1.26 / 0.085 | 1.26 / 0.10 |
| UK | 2.59 | 3.24 | 0.85 / 0.0435 | 0.85 / 0.0598 |
| EU | 2.85 | 3.61 | 0.75 / 0.0525 | 0.75 / 0.0715 |
| PL | 12.86 | 15.32 | 3.51 / 0.267 | 3.51 / 0.337 |
| SE | 30.65 | 36.51 | 8.37 / 0.636 | 8.37 / 0.804 |
| AU | 5.82 | 6.42 | 2.42 / 0.085 | 2.42 / 0.100 |
| JP | 475 | 475 | 206 / 4 | 206 / 5 |

### 2.4 Paperback, standard color (72-600 pages, fixed + per page)
| Mkt | Regular fixed / pp | Large fixed / pp |
|---|---|---|
| US | 1.00 / 0.0255 | 1.00 / 0.0402 |
| CA | 1.26 / 0.037 | 1.26 / 0.052 |
| UK | 0.85 / 0.020 | 0.85 / 0.027 |
| EU | 0.75 / 0.024 | 0.75 / 0.035 |
| PL | 3.51 / 0.112 | 3.51 / 0.164 |
| SE | 8.37 / 0.268 | 8.37 / 0.3691 |
| JP | 206 / 3.50 | 206 / 4.50 |
| AU | not listed (UNVERIFIED; likely not offered) | not listed |

### 2.5 Hardcover (75-550 pages; markets listed: UK, US, EU group, PL, SE only)
| Mkt | B&W 75-108 reg / large (fixed) | B&W 110-550 reg fixed / pp | B&W 110-550 large fixed / pp | Premium color 75-550 reg fixed / pp | Premium color large fixed / pp |
|---|---|---|---|---|---|
| US USD | 6.80 / 7.49 | 5.65 / 0.012 | 5.65 / 0.017 | 5.65 / 0.065 | 5.65 / 0.080 |
| UK GBP | 5.23 / 5.45 | 4.15 / 0.010 | 4.15 / 0.012 | 4.15 / 0.045 | 4.15 / 0.060 |
| EU EUR | 5.95 / 6.35 | 4.65 / 0.012 | 4.65 / 0.016 | 4.65 / 0.057 | 4.65 / 0.072 |
| PL PLN | 27.85 / 29.87 | 20.34 / 0.056 | 20.34 / 0.075 | 21.78 / 0.267 | 21.78 / 0.337 |
| SE SEK | 66.38 / 71.21 | 48.49 / 0.134 | 48.49 / 0.179 | 51.91 / 0.636 | 51.91 / 0.804 |

Hardcover is not listed for CA, AU, JP (JP explicitly unsupported: https://kdp.amazon.com/en_US/help/topic/GGE5T76TWKA85DJM). WARNING: an older "Hardcover (Beta)" page (https://kdp.amazon.com/en_US/help/topic/GTTMJWM4H3BLQA9A) still shows stale numbers (US $5.50 fixed, $0.070 premium color); use GHT976ZKSKUXBB6H.
Check: US hardcover B&W 300 pp = $9.25 (official example).

### 2.6 Royalty and price rules (print)
Source: https://kdp.amazon.com/en_US/help/topic/G201834330
- Royalty = rate x list price - printing cost. Rate: 60% at or above the threshold, 50% below it. Expanded Distribution: 40% of list (not available for hardcover or low-content; paid ~90 days after sales month). Source: https://kdp.amazon.com/en_US/help/topic/G8BKPU9AGVZSF9QF
- Minimum list price = printing cost / royalty rate (50% or 60% as applicable). Source: G201834340.

| Marketplace | 50% rate up to | 60% rate from | Max list price |
|---|---|---|---|
| .com | 9.98 USD | 9.99 | 250 USD |
| .de/.fr/.it/.es/.nl/.ie/.com.be | 9.98 EUR | 9.99 | 250 EUR |
| .co.uk | 7.98 GBP | 7.99 | 250 GBP |
| .ca | 13.98 CAD | 13.99 | 350 CAD |
| .com.au | 13.98 AUD | 13.99 | 350 AUD |
| .co.jp | 999 JPY | 1000 | 30,000 JPY |
| .pl | 39 PLN | 40 | 1,200 PLN |
| .se | 109 SEK | 110 | 2,500 SEK |

- 10 June 2025 change (KDP email quoted on a forum, secondary: https://www.writingforums.com/threads/fyi-changes-to-kdp-royalty-rates-and-printing-costs.214165/): 60% -> 50% below thresholds, applying to paperback and hardcover; color print costs lowered (standard color .com; premium color UK/DE/FR/ES/IT/NL). That email quoted SEK 99, but the official KDP page above says 109/110 SEK. Use the official page; SEK threshold discrepancy noted.
- Official worked example: $9.99 list, $4.60 cost -> $1.39 royalty; $9.98 -> $0.39. Source: G8BKPU9AGVZSF9QF.

### 2.7 eBook royalty
Sources: https://kdp.amazon.com/en_US/help/topic/G200634500 (rules, delivery) and https://kdp.amazon.com/en_US/help/topic/G200634560 (price bands)
- 35% option: 35% x (list - VAT). 70% option: 70% x (list - VAT - delivery cost); delivery cost = file MB (rounded up to KB) x rate, applied only to 70%.
- 70% needs: price in band, list >= 20% below any physical edition on Amazon, available in all territories where rights are held; 70% only in listed territories (else 35%); Brazil/Japan/Mexico/India need KDP Select. Mostly public-domain books: 35% only.
- NEW: page states the US 70% band is $2.99-$12.99 effective July 7, 2026 (previously $2.99-$9.99), "other marketplaces change equivalently". Corroboration only from a news-style secondary (https://writeo.app/news/amazon-kdp-royalty-cap-12-99-july-2026, not fetched) -> treat as official-but-recent.

| Marketplace | 35% <3 MB | 35% 3-<10 MB | 35% >=10 MB | 70% band |
|---|---|---|---|---|
| .com USD | 0.99-200 | 1.99-200 | 2.99-200 | 2.99-12.99 |
| .ca CAD | 0.99-200 | 1.99-200 | 2.99-200 | 2.99-12.99 |
| .com.br BRL | 1.99-400 | 3.99-400 | 5.99-400 | 5.99-31.99 |
| .co.uk GBP | 0.77-150 | 1.25-150 | 1.49-150 | 1.77-12.99 |
| EUR stores | 0.89-215 | 1.79-215 | 2.69-215 | 2.69-12.99 |
| .co.jp JPY | 99-20,000 | 99-20,000 (>=3 MB) | same | 250-1,650 |
| .com.mx MXN | 11.99-2,500 | 23.99-2,500 | 34.99-2,500 | 34.99-199.99 |
| .com.au AUD | 0.99-220 | 1.99-220 | 3.99-220 | 3.99-15.99 |
| .in INR | 49-10,999 | 69-10,999 | 99-10,999 | 99-599 |

Delivery cost per MB (70% option; min charge in brackets): US $0.15 [0.01]; CA C$0.15 [0.01]; BR R$0.30 [0.01]; UK 0.10 GBP [0.01]; DE/FR/ES/IT/NL 0.12 EUR [0.01]; IN Rs 7 [1]; JP 1 JPY [1] (none deducted if file >= 10 MB); MX MXN 1 [1]; AU A$0.15 [0.01]. Source: https://kdp.amazon.com/en_US/help/topic/G200634500
Note: the old US 70% max of $9.99 should no longer be used per the page above.

---

## 3. Etsy seller fees (2026)

### 3.1 Core fees
Source: https://www.etsy.com/legal/fees and https://help.etsy.com/hc/en-us/articles/115014483627-What-are-the-Fees-and-Taxes-for-Selling-on-Etsy
| Fee | Amount |
|---|---|
| Listing fee | USD 0.20 per listing (4-month expiry; auto-renew when sold also 0.20 per extra qty; private listing 0.20 charged if bought) |
| Transaction fee | 6.5% of item price + shipping + gift wrap (US sales tax excluded) |
| Offsite Ads | 15% of attributed order total if < USD 10,000 sales in prior 365 days (can opt out); 12% if >= USD 10,000 (mandatory); capped at USD 100 per order; 30-day attribution window |
| Currency conversion | 2.5% (on conversion into payment account currency / listing in non-local currency) |
| Etsy Plus | USD 10/month (15 listing credits, USD 5 Ads credit) |
| Pattern | 30-day trial then USD 15/month |
| Set-up fee | one-time, amount not stated, may be waived |

### 3.2 Payment processing (by seller bank account location; % of total incl. shipping and tax + fixed)
Source: https://help.etsy.com/hc/en-us/articles/115015628847-What-are-Payment-Processing-Fees-for-Selling-on-Etsy (matches https://www.etsy.com/legal/etsy-payments/)
| Country | Fee |
|---|---|
| United States | 3% + 0.25 USD |
| United Kingdom | 4% + 0.20 GBP |
| Canada | 3% + 0.25 CAD (domestic or US orders); 4% + 0.25 CAD (international) |
| Australia | 3% + 0.25 AUD (domestic); 4% + 0.25 AUD (international) |
| New Zealand | 3% + 0.30 NZD domestic; 4% + 0.30 NZD international |
| Germany, France, Italy, Spain, Netherlands, Poland, other EU | 4% + 0.30 EUR |
| Sweden / Denmark / Norway / Switzerland | 4% + 3.00 SEK / 2.50 DKK / 2.50 NOK / 0.50 CHF |
| Japan, Thailand | 6% + 0.30 USD |
| India | 5% + 25 INR |
(~70 countries on the source page; deposit fees exist only for ID, IL, MY, MX, MA, PH, ZA, TR, VN.)

### 3.3 Regulatory operating fee (% of order total: item + shipping + gift wrap, excl. Etsy-collected tax)
Primary: https://help.etsy.com/hc/en-us/articles/1500011073202-What-is-a-Regulatory-Operating-Fee (no effective date on page). Effective date 22 June 2026 (announced 22 April 2026) and prior rates from secondary sources: https://www.growtsy.com/etsy-fees/regulatory-operating-fee , https://www.valueaddedresource.net/etsy-ups-regulatory-operating-fees/
| Country | Rate (current) | Prior |
|---|---|---|
| Canada | 0.50% | not published |
| France | 1.14% | 0.47% |
| Hungary | 1.97% | none |
| India | 0.05% | 0.29% |
| Italy | 0.80% | 0.32% |
| Spain | 0.88% | 0.72% |
| Turkiye | 1.67% | 2.27% |
| United Kingdom | 0.48% | 0.32% |
| Vietnam | 1.24% | not published |
| US, Germany, Australia and ~24 other seller countries | none (per Growtsy; Etsy's page simply lists only the nine above) | - |

### 3.4 New in 2025-2026
Confirmed on official pages: regulatory fee changes (above). Etsy's pages do not flag other new fees. No change found to listing/transaction/processing amounts.

---

## 4. Print-on-demand upload specs

### 4.1 Redbubble (official)
Source: https://help.redbubble.com/hc/en-us/articles/202270679-Dimensions-Format
- Formats: JPEG, PNG (PNG required for transparency on Other Apparel and Stickers); TIFF/PDF not accepted. DPI/PPI irrelevant, pixels only. Reject if > 300 MB or > 13,500 x 13,500 px.
- Minimum pixels (W x H): Premium T-shirts 2875 x 3900; Men's Graphic T-shirts 3873 x 4814; Other apparel 2400 x 3200; Stickers S/M/L/XL 600x800 / 1100x1100 / 1700x1700 / 2800x2800; Posters XS/S/M/L 2870x4100 / 4100x5840 / 5840x8310 / 8310x11790; Art prints 3840 x 3840; Mugs 2700 x 1120; Phone cases 1187 x 1852; Throw pillows 3225 x 3225; Cotton tote 2400 x 3200; Hats 2400 x 1140; Cards 2400 x 1600; Canvas S-XL 2400x1600 / 3240x2160 / 3840x2560 / 4800x4800.
- Recommendation: upload stickers at 2800 x 2800, art prints at 3840 x 3840. Sticker has ~1/8" (3.2 mm) border. Source: https://help.redbubble.com/hc/en-us/articles/360034868212-How-do-I-design-for-stickers
- Upload limits: 30 works/day, 15 tags. Source: https://help.redbubble.com/hc/en-us/articles/202982515-Uploading-Work

### 4.2 Merch on Demand / Merch by Amazon - **UNVERIFIED**
Official merch.amazon.com resource pages block automated fetch (robots) and require a login. Secondary sources agree: standard apparel 4500 x 5400 px, 300 DPI, transparent PNG only, sRGB, <= 25 MB; hoodie front-only 4500 x 4050 px.
Sources: https://merchtitans.com/blog/t-shirt-design-dimensions-guide , https://litcommerce.com/blog/amazon-merch-on-demand/ , https://community.adobe.com/t5/photoshop/4500-by-5400-png-under-25mb-for-amazon-merch/m-p/11527234 (none cites Amazon). Treat as widely used but unconfirmed; tell users to verify in the Merch dashboard.

### 4.3 TeePublic (partly official)
Source: https://www.teepublic.com/blog/designing-for-specific-product-dimensions
- Transparent PNG at 150 DPI; standard minimum 1500 x 1995 px (excluding outer transparent pixels); "to enable all products" at least 5000 x 5500 px. No file size limit stated. Per-product table is only an image -> per-product values UNVERIFIED.

### 4.4 Spreadshirt / Spreadshop (official help for Spreadshop designers)
Source: https://spreadshop.com/helpcenter/create-designs/optimizing-pixel-graphics
- Recommended >= 4000 px longest side; minimum 1000 px shorter side; max 10 MB; PNG/JPG/BMP/GIF (PNG recommended). DPI not mentioned. Marketplace-specific limits on spreadshirt.com UNVERIFIED (a secondary claims 4000x4000, 200 DPI min, 100 MB).

### 4.5 Printful (official)
- Files 150-300 DPI by product (150 minimum for most apparel; 300 for phone cases/stickers; do not exceed 300); PNG recommended, JPG/PDF accepted; sRGB; max file in file library 200 MB, max 20,000 x 20,000 px. Source: https://help.printful.com/hc/en-us/articles/28491464259740-How-should-I-prepare-my-print-file-for-the-best-results and https://www.printful.com/creating-dtg-file . A second Printful help article (https://support.printful.com/hc/en-us/articles/41396495537553-What-type-of-print-files-does-Printful-require) says 300 DPI recommended, JPEG/PNG/SVG, max 100 MB (SVG 20 MB). The two disagree on max size: UNVERIFIED which is current.
- DTG front print area 12 x 16 in (some products/sizes upgraded to 15 x 18 in). Pixels derived (inches x DPI): 12x16 @300 = 3600 x 4800; @150 = 1800 x 2400; 15x18 @300 = 4500 x 5400. Source: https://www.printful.com/blog/t-shirt-design-placement-guide . Printful gives no stated universal pixel size; use each product's File guidelines tab.

### 4.6 Others
- Spring (ex-Teespring): PNG, 50 MB, standard 3720 x 4950 px, min 120 DPI, rec 300. Source: https://kb.spri.ng/creators/articles/design-requirements-file-formatting-tips-faq.html
- Zazzle: 150 ppi apparel/bags/hats; 200 ppi mugs/cards/magnets/stickers; 300 ppi posters/photo prints; formats JPEG, PNG, PDF, SVG, AI, GIF, TIFF; no file size limit stated. Source: https://www.zazzle.ca/hc/article/creating_and_uploading_images_to_zazzle-219861927
- Society6: no official page found -> **UNVERIFIED** (no numbers).

### 4.7 Etsy listing photos
Source: https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop
- Recommended >= 2000 x 2000 px; first photo >= 635 x 635 px; formats jpg, gif, png, svg, heic (no animated gif / transparent png); sRGB; files > 1 MB may fail on slow connections; no max stated on that page. Shop logo 500 x 500; big banner 1600 x 400 rec.
- Aspect ratio and photo count (commonly 5:4 and 20 photos) were not stated on the fetched page: UNVERIFIED.

---

## 5. ISBN barcode (EAN-13 Bookland)
Source: BISG https://www.bisg.org/barcoding-guidelines-for-the-us-book-industry unless noted
- Prefix 978 or 979 (Bookland); 979 has no ISBN-10 equivalent. Check digit is the 13th digit. ISBN printed above barcode (>= 9 pt).
- 5-digit add-on: first digit 5 = US dollars; 50001-59998 = US$0.01-99.98 (e.g., 51995 = $19.95); 59999 = price not encoded/over $99.98; 90000 = no price / not encoded (recommended when no price); 00000 and 50000 should not be used. BISG defines only "5" (USD); "6 = CAD" is NOT on that page (UNVERIFIED here).
- Size: 100% symbol with add-on = 1" high x 2-3/16" wide; allowed magnification 80% to 200% (80% about 13/16" x 1-3/4"); quiet zone 3/32" each side; bottom of symbol 1/4" above bottom of back cover; no border. Practical areas: 92% needs 2.00" x 1.25"; 80% needs 1.75" x 1.0" (https://www.myidentifiers.com/barcode/faqs). ISO nominal size in mm (37.29 x 25.93) not confirmed on a fetched official page: UNVERIFIED.
- KDP own-barcode rules: Source https://kdp.amazon.com/en_US/help/topic/G5HDYGP4BXLX4RUW : vector or 300 PPI raster; 100% black on plain white; upright; not flattened into the cover image; ISBN must be valid and match the book; price code must match list price; area 2" x 1.2" suggested, 1.4" x 0.8" minimum; >= 0.25" from spine and trim; two-stage (Japanese) barcodes unsupported; covers with art in the barcode area are rejected if no barcode supplied.

---

## 6. KDP low-content and AI-content rules
Low-content source: https://kdp.amazon.com/en_US/help/topic/GGE5T76TWKA85DJM
- Definition: minimal or no content, repetitive, meant to be filled in. Examples: notebooks, planners, journals, log books, coupon books, score cards, blank sheet music. NOT generally low-content: novels, puzzle books, coloring books, photography, children's books, textbooks (exceptions exist).
- ISBN not required: use your own ISBN or none. Low-content books are NOT eligible for the free KDP ISBN. ISBN choice cannot be changed after publishing (unpublish and republish).
- Must tick the "Low-content" box under Categories or the book is rejected. No Expanded Distribution, no Series, no Read Sample/back-cover thumbnail without ISBN, no release-date option. Not eligible for Transparency codes (retired for books created after Nov 2025). KDP prints barcode only if ISBN assigned; none if none.
- Paperback and hardcover allowed (no hardcover on JP).
AI rules - source https://kdp.amazon.com/en_US/help/topic/G200672390 :
- You must tell KDP about AI-generated text/images/translations when publishing new or republishing edited books, even if substantially edited afterwards. AI-assisted (you wrote it; AI helped edit/refine) need not be disclosed. You remain responsible for content guideline compliance.
- Public domain allowed but "undifferentiated versions" of public domain titles with free versions are not accepted.
Daily title limit: reported as 3 new titles/day since Sept 2023 (not published by KDP; exemptions case by case): Source (secondary) https://selfpublishingadvice.org/self-publishing-news-kdp-ai-new-limits-on-titles/ -> UNVERIFIED current status.

---

## 7. Open items / UNVERIFIED summary
1. Hardcover spine factor, wrap and cover total dimensions (KDP publishes only in cover calculator).
2. Merch on Demand artwork spec (official pages blocked; secondary only).
3. TeePublic per-product sizes; Spreadshirt marketplace limits; Society6 (nothing); Printful max file size conflict (100 vs 200 MB).
4. Etsy listing photo aspect ratio / photo count; regulatory fee effective date (from secondary; rates themselves from Etsy's page); Etsy rates for US/DE/AU stated "none" only by secondary.
5. KDP SEK royalty threshold shown as 110 (official) vs 99 (forum quote of email).
6. KDP daily title limit (3/day) status; B&W page boundary "110" overlapping ranges; AU standard-color price; hardcover availability in CA/AU.
7. ISO mm size of EAN-13 Bookland; CAD "6" price-currency digit.
