/* KDP royalty math. Pure functions, used by the page and by the Node tests.
   Every number comes from research/specs.md section 2 (checked 2026-10-19).
   Print costs: https://kdp.amazon.com/en_US/help/topic/G201834340 (paperback), GHT976ZKSKUXBB6H (hardcover).
   Print royalty: G201834330 and G8BKPU9AGVZSF9QF. eBook: G200634500 and G200634560. */
(function (g) {
  var BL = g.BL = g.BL || {};

  // Print cost rows: [fixed-only regular, fixed-only large, fixed, per page regular, per page large].
  // std (standard color) is always fixed + per page: [fixed, per page regular, per page large].
  // hc.prem: [fixed regular, per page regular, fixed large, per page large].
  var PRINT = {
    us: { cur: 'USD', thr: 9.99, max: 250,
      bw: [2.30, 2.84, 1.00, 0.012, 0.017], gw: [2.23, 2.75, 1.00, 0.0114, 0.0162], prem: [3.60, 4.20, 1.00, 0.065, 0.08], std: [1.00, 0.0255, 0.0402],
      hc: { bw: [6.80, 7.49, 5.65, 0.012, 0.017], prem: [5.65, 0.065, 5.65, 0.080] } },
    uk: { cur: 'GBP', thr: 7.99, max: 250,
      bw: [1.93, 2.15, 0.85, 0.010, 0.012], gw: [1.88, 2.08, 0.85, 0.0095, 0.0114], prem: [2.59, 3.24, 0.85, 0.0435, 0.0598], std: [0.85, 0.020, 0.027],
      hc: { bw: [5.23, 5.45, 4.15, 0.010, 0.012], prem: [4.15, 0.045, 4.15, 0.060] } },
    eu: { cur: 'EUR', thr: 9.99, max: 250,
      bw: [2.05, 2.48, 0.75, 0.012, 0.016], gw: [1.98, 2.39, 0.75, 0.0114, 0.0152], prem: [2.85, 3.61, 0.75, 0.0525, 0.0715], std: [0.75, 0.024, 0.035],
      hc: { bw: [5.95, 6.35, 4.65, 0.012, 0.016], prem: [4.65, 0.057, 4.65, 0.072] } },
    ca: { cur: 'CAD', thr: 13.99, max: 350,
      bw: [2.99, 3.53, 1.26, 0.016, 0.021], gw: [2.90, 3.42, 1.26, 0.0152, 0.0200], prem: [4.66, 5.26, 1.26, 0.085, 0.10], std: [1.26, 0.037, 0.052], hc: null },
    au: { cur: 'AUD', thr: 13.99, max: 350, bwFixedMax: 108,
      bw: [4.74, 5.28, 2.42, 0.022, 0.027], gw: [4.62, 5.14, 2.42, 0.0209, 0.0257], prem: [5.82, 6.42, 2.42, 0.085, 0.100], std: null, hc: null },
    jp: { cur: 'JPY', thr: 1000, max: 30000,
      bw: [422, 530, 206, 2, 3], gw: [411.20, 513.80, 206, 1.90, 2.85], prem: [475, 475, 206, 4, 5], std: [206, 3.50, 4.50], hc: null },
    pl: { cur: 'PLN', thr: 40, max: 1200,
      bw: [9.58, 11.61, 3.51, 0.056, 0.075], gw: [9.26, 11.21, 3.51, 0.0532, 0.0713], prem: [12.86, 15.32, 3.51, 0.267, 0.337], std: [3.51, 0.112, 0.164],
      hc: { bw: [27.85, 29.87, 20.34, 0.056, 0.075], prem: [21.78, 0.267, 21.78, 0.337] } },
    se: { cur: 'SEK', thr: 110, max: 2500,
      bw: [22.84, 27.67, 8.37, 0.134, 0.179], gw: [22.12, 26.74, 8.37, 0.1273, 0.1701], prem: [30.65, 36.51, 8.37, 0.636, 0.804], std: [8.37, 0.268, 0.3691],
      hc: { bw: [66.38, 71.21, 48.49, 0.134, 0.179], prem: [51.91, 0.636, 51.91, 0.804] } }
  };
  // Print stores. EU stores share one price list.
  var STORES = {
    us: ['Amazon.com', 'us'], uk: ['Amazon.co.uk', 'uk'], de: ['Amazon.de', 'eu'], fr: ['Amazon.fr', 'eu'], it: ['Amazon.it', 'eu'],
    es: ['Amazon.es', 'eu'], nl: ['Amazon.nl', 'eu'], ie: ['Amazon.ie', 'eu'], be: ['Amazon.com.be', 'eu'], ca: ['Amazon.ca', 'ca'],
    au: ['Amazon.com.au', 'au'], jp: ['Amazon.co.jp', 'jp'], pl: ['Amazon.pl', 'pl'], se: ['Amazon.se', 'se']
  };

  // Last page count that is "fixed price only". B&W: specs list 24-110 as fixed only (24-108 on .com.au);
  // 110 also appears in the next range, see the footnote on the page. Groundwood 24-112, premium color 24-40.
  // Hardcover B&W: 75-108 fixed only, 110-550 fixed + per page.
  function fixedMax(mk, ink, format) {
    if (format === 'hardcover') return ink === 'bw' ? 108 : 0;
    if (ink === 'bw') return mk.bwFixedMax || 110;
    if (ink === 'gw') return 112;
    if (ink === 'prem') return 40;
    return 0;
  }
  var INK = { white: 'bw', cream: 'bw', groundwood: 'gw', stdcolor: 'std', premcolor: 'prem' };

  function round2(n) { return Math.round(n * 100 + 1e-9) / 100; }
  function ceilUnit(n, cur) { var f = cur === 'JPY' ? 1 : 100; return Math.ceil(n * f - 1e-7) / f; }

  // Printing cost per copy, or {error}.
  function printCost(store, format, paper, large, pages) {
    var s = STORES[store]; if (!s) return { error: 'Unknown marketplace.' };
    var mk = PRINT[s[1]], ink = INK[paper];
    var table = format === 'hardcover' ? (mk.hc && mk.hc[ink === 'bw' ? 'bw' : ink]) : mk[ink];
    if (format === 'hardcover' && !mk.hc) return { error: 'KDP doesn\'t list hardcover printing for ' + s[0] + '. Hardcovers are listed for Amazon.com, Amazon.co.uk, the EU stores, Amazon.pl and Amazon.se.' };
    if (!table) return { error: (format === 'hardcover' ? 'Hardcovers come in black & white or premium color only.' : 'KDP doesn\'t list standard color printing for ' + s[0] + '.') };
    var cost, how, fixedOnly = false;
    if (format === 'hardcover' && ink === 'prem') {
      cost = large ? table[2] + pages * table[3] : table[0] + pages * table[1];
      how = BL.royalty.fmtN(large ? table[2] : table[0]) + ' + ' + pages + ' × ' + BL.royalty.fmtN(large ? table[3] : table[1]);
    } else if (ink === 'std') {
      cost = table[0] + pages * (large ? table[2] : table[1]);
      how = BL.royalty.fmtN(table[0]) + ' + ' + pages + ' × ' + BL.royalty.fmtN(large ? table[2] : table[1]);
    } else if (pages <= fixedMax(mk, ink, format)) {
      cost = large ? table[1] : table[0]; fixedOnly = true;
      how = 'flat price up to ' + fixedMax(mk, ink, format) + ' pages';
    } else {
      cost = table[2] + pages * (large ? table[4] : table[3]);
      how = BL.royalty.fmtN(table[2]) + ' + ' + pages + ' × ' + BL.royalty.fmtN(large ? table[4] : table[3]);
    }
    return { cost: round2(cost), how: how, fixedOnly: fixedOnly, cur: mk.cur, thr: mk.thr, max: mk.max, group: s[1] };
  }

  function rate(thr, price) { return price >= thr - 1e-9 ? 0.6 : 0.5; }

  // Lowest list price where rate × price - cost >= target (target 0 gives KDP's minimum list price).
  function priceFor(cost, thr, target, cur) {
    var need = cost + (target || 0);
    var p50 = ceilUnit(need / 0.5, cur);
    if (p50 < thr) return { price: p50, rate: 0.5 };
    var p60 = ceilUnit(need / 0.6, cur);
    return p60 >= thr ? { price: p60, rate: 0.6 } : { price: thr, rate: 0.6 };
  }

  function printRoyalty(c, price) {
    var r = rate(c.thr, price);
    return { rate: r, royalty: r * price - c.cost, ed: 0.4 * price - c.cost };
  }

  /* ---------- eBook ---------- */
  // [currency, 35% min price for <3 MB, 3-<10 MB, >=10 MB, 35% max, 70% band min, 70% band max, delivery per MB, delivery minimum]
  var EBOOK = {
    us: ['Amazon.com', 'USD', 0.99, 1.99, 2.99, 200, 2.99, 12.99, 0.15, 0.01],
    ca: ['Amazon.ca', 'CAD', 0.99, 1.99, 2.99, 200, 2.99, 12.99, 0.15, 0.01],
    br: ['Amazon.com.br', 'BRL', 1.99, 3.99, 5.99, 400, 5.99, 31.99, 0.30, 0.01],
    uk: ['Amazon.co.uk', 'GBP', 0.77, 1.25, 1.49, 150, 1.77, 12.99, 0.10, 0.01],
    de: ['Amazon.de', 'EUR', 0.89, 1.79, 2.69, 215, 2.69, 12.99, 0.12, 0.01],
    fr: ['Amazon.fr', 'EUR', 0.89, 1.79, 2.69, 215, 2.69, 12.99, 0.12, 0.01],
    es: ['Amazon.es', 'EUR', 0.89, 1.79, 2.69, 215, 2.69, 12.99, 0.12, 0.01],
    it: ['Amazon.it', 'EUR', 0.89, 1.79, 2.69, 215, 2.69, 12.99, 0.12, 0.01],
    nl: ['Amazon.nl', 'EUR', 0.89, 1.79, 2.69, 215, 2.69, 12.99, 0.12, 0.01],
    jp: ['Amazon.co.jp', 'JPY', 99, 99, 99, 20000, 250, 1650, 1, 1],
    mx: ['Amazon.com.mx', 'MXN', 11.99, 23.99, 34.99, 2500, 34.99, 199.99, 1, 1],
    au: ['Amazon.com.au', 'AUD', 0.99, 1.99, 3.99, 220, 3.99, 15.99, 0.15, 0.01],
    in: ['Amazon.in', 'INR', 49, 69, 99, 10999, 99, 599, 7, 1]
  };
  var VAT_STORES = { uk: 1, de: 1, fr: 1, es: 1, it: 1, nl: 1 };
  var SELECT_70 = { br: 1, jp: 1, mx: 1, in: 1 };

  function ebookInfo(store) {
    var e = EBOOK[store];
    return { name: e[0], cur: e[1], min35: [e[2], e[3], e[4]], max35: e[5], band70: [e[6], e[7]], perMB: e[8], minDelivery: e[9],
      vat: !!VAT_STORES[store], needsSelect: !!SELECT_70[store] };
  }
  function deliveryCost(store, mb) {
    var e = ebookInfo(store);
    if (store === 'jp' && mb >= 10) return 0;
    var size = Math.ceil(mb * 1024 - 1e-9) / 1024; // rounded up to the kilobyte
    return round2(Math.max(e.minDelivery, size * e.perMB));
  }
  function min35(store, mb) { var m = ebookInfo(store).min35; return mb < 3 ? m[0] : mb < 10 ? m[1] : m[2]; }
  function in70(store, price) { var b = ebookInfo(store).band70; return price >= b[0] - 1e-9 && price <= b[1] + 1e-9; }
  // vatRate in percent; when the list price includes VAT, royalty is figured on the price without it.
  function ebookRoyalty(store, price, mb, vatRate) {
    var net = vatRate > 0 ? price / (1 + vatRate / 100) : price;
    var del = deliveryCost(store, mb);
    return { net: net, vat: price - net, delivery: del, r35: 0.35 * net, r70: 0.7 * (net - del), in70: in70(store, price), min35: min35(store, mb) };
  }
  function ebookPriceFor(store, target, mb, vatRate, option) {
    var cur = ebookInfo(store).cur, k = 1 + (vatRate > 0 ? vatRate / 100 : 0);
    var net = option === 70 ? target / 0.7 + deliveryCost(store, mb) : target / 0.35;
    return ceilUnit(net * k, cur);
  }

  BL.royalty = {
    PRINT: PRINT, STORES: STORES, EBOOK: EBOOK, INK: INK,
    fmtN: function (n) { return String(+n.toFixed(4)); },
    fixedMax: fixedMax, printCost: printCost, rate: rate, priceFor: priceFor, printRoyalty: printRoyalty, ceilUnit: ceilUnit, round2: round2,
    ebookInfo: ebookInfo, deliveryCost: deliveryCost, min35: min35, in70: in70, ebookRoyalty: ebookRoyalty, ebookPriceFor: ebookPriceFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
