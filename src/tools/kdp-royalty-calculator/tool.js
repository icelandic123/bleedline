/* KDP royalty calculator: paperback, hardcover and eBook. Math in calc.js (BL.royalty). */
(function () {
  var BL = window.BL, $ = BL.$, R = BL.royalty, K = BL.kdp;
  var form = $('#ry-form');
  var trimSel = $('#trim'), paperSel = $('#paper'), storeSel = $('#store');
  var PAPER_IDX = { white: 0, cream: 1, groundwood: 2, stdcolor: 3, premcolor: 4 };
  var HC_PAPERS = { white: 1, cream: 1, premcolor: 1 };
  var STEP = { USD: 1, EUR: 1, GBP: 1, CAD: 1, AUD: 1, JPY: 100, PLN: 5, SEK: 10, BRL: 2, MXN: 10, INR: 50 };
  var chartState = null;

  function money(n, cur) { return BL.money(n, cur); }
  function unitOf(cur) { return cur === 'JPY' ? 1 : 0.01; }
  function pct(r) { return Math.round(r * 100) + '%'; }
  function stat(k, v, s, cls) { return '<div class="stat ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + BL.esc(v) + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>'; }
  function note(cls, html) { return '<div class="note ' + cls + '">' + html + '</div>'; }

  /* ---------- form setup ---------- */
  function fillTrims(format) {
    var keep = trimSel.value;
    trimSel.innerHTML = K.trims.filter(function (t) { return !format || (format === 'hardcover' ? t.hardcover : t.paperback); })
      .map(function (t) { return '<option value="' + t.id + '">' + BL.esc(t.label) + (t.large ? ' · large' : ' · regular') + '</option>'; }).join('');
    trimSel.value = keep;
    if (!keep || trimSel.value !== keep) trimSel.value = '6x9';
  }
  function syncOptions() {
    var format = BL.radio('format'), hard = format === 'hardcover', trim = K.trim(trimSel.value);
    Array.prototype.forEach.call(paperSel.options, function (o) {
      var off = hard ? !HC_PAPERS[o.value] : !trim.maxPages[PAPER_IDX[o.value]];
      o.disabled = off;
    });
    if (paperSel.selectedOptions[0] && paperSel.selectedOptions[0].disabled) paperSel.value = 'white';
    Array.prototype.forEach.call(storeSel.options, function (o) {
      var mk = R.PRINT[R.STORES[o.value][1]];
      o.disabled = hard && !mk.hc;
    });
    if (storeSel.selectedOptions[0] && storeSel.selectedOptions[0].disabled) storeSel.value = 'us';
  }

  fillTrims(null);
  BL.persist(form, 'kdp-royalty');
  (function applyUrl() {
    var q = new URLSearchParams(location.search);
    var f = q.get('format');
    if (/^(paperback|hardcover|ebook)$/.test(f || '')) form.querySelector('input[name=format][value=' + f + ']').checked = true;
    if (q.get('trim') && K.trims.some(function (t) { return t.id === q.get('trim'); })) trimSel.value = q.get('trim');
    if (/^\d{1,4}$/.test(q.get('pages') || '')) $('#pages').value = q.get('pages');
    if (q.get('paper') && PAPER_IDX[q.get('paper')] !== undefined) paperSel.value = q.get('paper');
  })();
  fillTrims(BL.radio('format') === 'hardcover' ? 'hardcover' : 'paperback');
  syncOptions();

  /* ---------- print ---------- */
  function pageLimits(format, trim, paper) {
    if (format === 'hardcover') return { min: 75, max: 550 };
    return { min: paper === 'stdcolor' ? 72 : 24, max: trim.maxPages[PAPER_IDX[paper]] };
  }

  function renderPrint(format) {
    var hard = format === 'hardcover';
    var store = storeSel.value, trim = K.trim(trimSel.value), paper = paperSel.value;
    var pages = Math.round(BL.num('#pages')), price = BL.num('#price');
    var low = !hard && $('#lowcontent').checked;
    var msgs = [], foot = [];
    $('#lowcontent-row').hidden = hard;
    $('#edcopies-row').hidden = hard || low;
    $('#trim-hint').textContent = trim.large ? 'Large trim: wider than 6.12 in or taller than 9 in, so a higher per-page cost.' : 'Regular trim (6.12 × 9 in or smaller).';
    var lim = pageLimits(format, trim, paper);
    var err = null;
    if (!isFinite(pages)) err = 'Enter the page count.';
    else if (pages < lim.min) err = (hard ? 'Hardcovers' : paper === 'stdcolor' ? 'Standard color books' : 'Paperbacks') + ' need at least ' + lim.min + ' pages.';
    else if (pages > lim.max) err = 'The most pages KDP prints for this trim and paper is ' + lim.max + '.';
    var c = err ? null : R.printCost(store, format, paper, trim.large, pages);
    if (c && c.error) { err = c.error; c = null; }
    var cur = c ? c.cur : R.PRINT[R.STORES[store][1]].cur;
    $('#price-l').textContent = 'List price (' + cur + ')';
    $('#price').step = cur === 'JPY' ? '1' : '0.01';
    $('#target-l').textContent = 'Royalty you want per copy (' + cur + ')';
    if (!err && !(price > 0)) err = 'Enter your list price.';
    if (err) { showError(err); return; }
    if (price > c.max) msgs.push(note('err', 'The highest list price KDP allows on ' + R.STORES[store][0] + ' is ' + money(c.max, cur) + '.'));

    var r = R.printRoyalty(c, price);
    var min = R.priceFor(c.cost, c.thr, 0, cur);
    var edMin = R.ceilUnit(c.cost / 0.4, cur);
    var edOk = !hard && !low;
    $('#ry-stats').innerHTML =
      stat('Royalty per sale', money(r.royalty, cur), pct(r.rate) + ' × ' + money(price, cur) + ' − ' + money(c.cost, cur) + ' printing', 'hi ry-big' + (r.royalty < 0 ? ' ry-neg' : '')) +
      stat('Royalty rate', pct(r.rate), r.rate === 0.6 ? 'list price at or above ' + money(c.thr, cur) : '60% starts at ' + money(c.thr, cur)) +
      stat('Printing cost', money(c.cost, cur), BL.esc(c.how) + ' · ' + (trim.large ? 'large' : 'regular') + ' trim') +
      stat('Minimum list price', money(min.price, cur), 'where your royalty reaches zero') +
      stat('Expanded Distribution', edOk ? money(r.ed, cur) : 'Not available',
        edOk ? '40% × list − printing; earns from ' + money(edMin, cur) : (hard ? 'not offered for hardcovers' : 'not offered for low-content books'), edOk && r.ed < 0 ? 'ry-neg' : '');

    if (price < min.price) msgs.push(note('err', 'Below the minimum list price. KDP won\'t accept a price under ' + money(min.price, cur) + ' for this book, because the printing cost would be more than your share.'));
    if (r.rate === 0.5 && c.thr <= c.max) {
      var atThr = R.printRoyalty(c, c.thr).royalty;
      if (atThr > r.royalty) msgs.push(note('warn', 'Pricing at <strong>' + money(c.thr, cur) + '</strong> instead (+' + money(c.thr - price, cur) + ') moves you to 60% and pays <strong>' + money(atThr, cur) + '</strong> per copy, ' + money(atThr - r.royalty, cur) + ' more.'));
    }
    if (edOk && price >= min.price && r.ed < 0) msgs.push(note('', 'Expanded Distribution needs a list price of at least ' + money(edMin, cur) + ' for this book (printing cost ÷ 40%). Below that it would earn nothing.'));
    if (c.group !== 'us' && c.group !== 'ca' && c.group !== 'au' && c.group !== 'jp') msgs.push(note('', 'Enter the price without VAT. Amazon adds VAT on top in ' + R.STORES[store][0] + ', and your royalty is worked out on the price without it.'));
    if (store === 'jp') msgs.push(note('', 'KDP Japan has its own trim sizes. The cost only depends on whether the trim is regular or large, so pick a trim of similar size.'));
    var bw = R.INK[paper] === 'bw';
    if (bw && !hard && store !== 'au' && (pages === 109 || pages === 110)) msgs.push(note('warn', 'KDP\'s price table lists 110 pages in both the flat-price range and the per-page range. We use the flat price; the per-page price would be ' + money(R.round2(R.PRINT[c.group][hard ? 'hc' : 'bw'][2] + pages * R.PRINT[c.group].bw[trim.large ? 4 : 3]), cur) + '. Check KDP\'s previewer for the exact cost.'));
    if (pages % 2) msgs.push(note('', 'Printed books have an even page count, so a ' + pages + '-page interior is printed (and charged) with a blank page at the end. Try ' + (pages + 1) + ' pages.'));
    $('#ry-msg').innerHTML = msgs.join('');

    // Target price.
    var T = BL.num('#target', 0);
    var tp = R.priceFor(c.cost, c.thr, T, cur);
    var tEd = R.ceilUnit((c.cost + T) / 0.4, cur);
    $('#ry-target').innerHTML = T > 0 ? '<div class="result-grid">' +
      stat('List price for ' + money(T, cur) + ' per copy', tp.price > c.max ? 'Over the maximum' : money(tp.price, cur), tp.price > c.max ? 'would need ' + money(tp.price, cur) + ', above ' + money(c.max, cur) : 'at ' + pct(tp.rate) + ': ' + money(tp.rate * tp.price - c.cost, cur) + ' royalty', 'hi') +
      (edOk ? stat('Same royalty through Expanded Distribution', tEd > c.max ? 'Over the maximum' : money(tEd, cur), '40% × ' + money(tEd, cur) + ' − ' + money(c.cost, cur)) : '') +
      '</div>' + (tp.rate === 0.6 && tp.price === c.thr && T < R.printRoyalty(c, c.thr).royalty - unitOf(cur) ? '<p class="small muted">Below ' + money(c.thr, cur) + ' the 50% rate can\'t reach it, and at ' + money(c.thr, cur) + ' you already earn ' + money(R.printRoyalty(c, c.thr).royalty, cur) + '.</p>' : '') :
      '<p class="muted">Enter the royalty you want per copy to see the list price you need.</p>';

    // Projection.
    var copies = Math.max(0, BL.num('#copies', 0)), edc = edOk ? Math.max(0, BL.num('#edcopies', 0)) : 0;
    var month = copies * r.royalty + edc * r.ed;
    $('#ry-proj').innerHTML =
      stat('Per month', money(month, cur), copies + ' Amazon' + (edc ? ' + ' + edc + ' Expanded' : '') + ' copies', 'hi') +
      stat('Per year', money(month * 12, cur), 'at the same pace') +
      stat('Printing costs', money((copies + edc) * c.cost * 12, cur), 'per year, already taken off the royalties above');

    // Table and chart.
    var step = STEP[cur] || 1, u = unitOf(cur);
    var pts = [min.price, c.thr - 2 * step, c.thr - step, c.thr - u, c.thr, c.thr + step, c.thr + 2 * step, c.thr + 5 * step, price];
    pts = uniq(pts.map(function (p) { return R.ceilUnit(p, cur); }).filter(function (p) { return p >= min.price && p <= c.max; }));
    var rows = pts.map(function (p) {
      var x = R.printRoyalty(c, p), cls = [];
      if (Math.abs(p - price) < 1e-6) cls.push('you');
      if (Math.abs(p - c.thr) < 1e-6) cls.push('jump');
      return '<tr class="' + cls.join(' ') + '"><td class="num">' + money(p, cur) + (Math.abs(p - price) < 1e-6 ? '<span class="ry-tag">your price</span>' : '') + '</td><td class="num">' + pct(x.rate) + '</td><td class="num' + (x.royalty < 0 ? ' neg' : '') + '">' + money(x.royalty, cur) + '</td>' +
        (edOk ? '<td class="num' + (x.ed < 0 ? ' neg' : '') + '">' + money(x.ed, cur) + '</td>' : '') + '</tr>';
    });
    $('#ry-table').innerHTML = '<caption class="sr-only">Royalty per copy at different list prices</caption><thead><tr><th class="num">List price</th><th class="num">Rate</th><th class="num">Royalty on Amazon</th>' + (edOk ? '<th class="num">Expanded Distribution</th>' : '') + '</tr></thead><tbody>' + rows.join('') + '</tbody>';
    $('#ry-chart-h').textContent = 'Royalty at different list prices';
    $('#ry-chart-lead').textContent = 'Royalty per copy on ' + R.STORES[store][0] + ' for this book. Notice the jump where the rate goes from 50% to 60%.';
    var lo = Math.max(0, Math.min(min.price, price, c.thr) * 0.85), hi = Math.max(price, c.thr) * 1.6;
    chartState = { cur: cur, lo: lo, hi: hi, price: price, f: function (p) { return R.printRoyalty(c, p).royalty; },
      label: function (p) { return pct(R.rate(c.thr, p)); }, marks: [{ x: c.thr, t: '60% from ' + money(c.thr, cur) }] };
    drawChart();

    foot.push('Printing costs and thresholds from KDP\'s help pages, checked 2026-10-19. Printing costs are rounded to the cent; KDP\'s previewer shows the exact figure for your file.');
    if (bw && !hard) foot.push('Black-and-white page boundary: KDP\'s table gives a flat price for 24–110 pages (24–108 on Amazon.com.au) and the per-page price for 110–828 pages, so 110 appears in both. We use the flat price up to 110 pages; the difference is a few cents.');
    if (c.group === 'se') foot.push('Amazon.se threshold: KDP\'s help page says 60% from 110 SEK. An earlier KDP announcement quoted 99 SEK, so double-check it in your Bookshelf.');
    $('#ry-foot').innerHTML = foot.map(function (f) { return '<p>' + f + '</p>'; }).join('');
  }

  /* ---------- eBook ---------- */
  function niceE(v, cur) {
    if (cur === 'JPY' || cur === 'INR') return Math.max(1, Math.round(v / 50) * 50 - 1);
    return Math.floor(v) + 0.99;
  }
  function renderEbook() {
    var store = $('#estore').value, info = R.ebookInfo(store), cur = info.cur;
    var price = BL.num('#eprice'), mb = BL.num('#mb'), opt = +BL.radio('eopt');
    var msgs = [], foot = [];
    $('#eprice-l').textContent = 'List price (' + cur + ')';
    $('#eprice').step = cur === 'JPY' || cur === 'INR' ? '1' : '0.01';
    $('#target-l').textContent = 'Royalty you want per copy (' + cur + ')';
    $('#vat-block').hidden = !info.vat;
    var vat = 0;
    if (info.vat && $('#vatinc').checked) {
      vat = BL.num('#vatrate', 0);
      if (!(BL.num('#vatrate') >= 0)) msgs.push(note('warn', 'Enter the e-book VAT rate for ' + info.name + ' to take VAT off the price. Until then the royalty is shown on the full price, so it\'s too high.'));
      if (vat > 30) { msgs.push(note('err', 'That VAT rate looks too high.')); vat = 0; }
    }
    if (!(price > 0)) { showError('Enter your eBook list price.'); return; }
    if (!(mb > 0)) { showError('Enter your eBook file size in MB. KDP shows it after you upload the manuscript.'); return; }
    var e = R.ebookRoyalty(store, price, mb, vat);
    var eff = opt === 70 && e.in70 ? 70 : 35;
    var royalty = eff === 70 ? e.r70 : e.r35;
    var b = info.band70;
    $('#ry-stats').innerHTML =
      stat('Royalty per sale', money(royalty, cur), eff + '% option' + (opt === 70 && !e.in70 ? ' (70% not available at this price)' : ''), 'hi ry-big') +
      stat('70% option', e.in70 ? money(e.r70, cur) : 'Not available', e.in70 ? '70% × (' + money(e.net, cur) + ' − ' + money(e.delivery, cur) + ' delivery)' : 'price outside ' + money(b[0], cur) + '–' + money(b[1], cur)) +
      stat('35% option', money(e.r35, cur), '35% × ' + money(e.net, cur) + (vat ? ' (price without VAT)' : '')) +
      stat('Delivery cost', money(e.delivery, cur), '70% option only · ' + BL.fmt(mb, 1) + ' MB' + (store === 'jp' && mb >= 10 ? ', none at 10 MB or more' : ' × ' + money(info.perMB, cur))) +
      (vat ? stat('VAT taken off', money(e.vat, cur), vat + '% included in ' + money(price, cur)) : '') +
      stat('70% price band', money(b[0], cur) + '–' + money(b[1], cur), store === 'us' ? 'since July 7, 2026 (was $2.99–$9.99)' : 'list price range for 70%');

    if (price > info.max35) msgs.push(note('err', 'The highest eBook list price on ' + info.name + ' is ' + money(info.max35, cur) + '.'));
    if (price < e.min35) msgs.push(note('err', 'Too low for a ' + BL.fmt(mb, 1) + ' MB file. The lowest list price on ' + info.name + ' is ' + money(e.min35, cur) + ' at this size.'));
    if (opt === 70 && !e.in70) msgs.push(note('warn', 'At ' + money(price, cur) + ' this book only qualifies for 35%. The 70% band on ' + info.name + ' is ' + money(b[0], cur) + ' to ' + money(b[1], cur) + '.' + (price > b[1] ? ' At ' + money(b[1], cur) + ' you\'d earn ' + money(R.ebookRoyalty(store, b[1], mb, vat).r70, cur) + ' per copy on 70%.' : '')));
    if (e.in70 && e.r35 > e.r70) msgs.push(note('warn', 'With a ' + BL.fmt(mb, 1) + ' MB file the delivery cost is high enough that 35% pays more than 70% at this price (' + money(e.r35, cur) + ' vs ' + money(e.r70, cur) + ').'));
    else if (e.in70 && opt === 35) msgs.push(note('', 'The 70% option would pay ' + money(e.r70, cur) + ' per copy at this price, ' + money(e.r70 - e.r35, cur) + ' more.'));
    if (info.needsSelect && opt === 70) msgs.push(note('', 'On ' + info.name + ' the 70% option needs the book to be enrolled in KDP Select.'));
    var pb = BL.num('#pbprice');
    if (pb > 0 && opt === 70 && price > pb * 0.8 + 1e-9) msgs.push(note('warn', 'For 70%, the eBook must be at least 20% cheaper than the print edition on Amazon: ' + money(Math.floor(pb * 0.8 * (cur === 'JPY' ? 1 : 100)) / (cur === 'JPY' ? 1 : 100), cur) + ' or less with a ' + money(pb, cur) + ' paperback.'));
    $('#ry-msg').innerHTML = msgs.join('');

    var T = BL.num('#target', 0);
    if (T > 0) {
      var p70 = R.ebookPriceFor(store, T, mb, vat, 70), p35 = R.ebookPriceFor(store, T, mb, vat, 35);
      var ok70 = R.in70(store, p70) || (p70 < b[0]);
      $('#ry-target').innerHTML = '<div class="result-grid">' +
        stat('70% option', p70 > b[1] ? 'Not possible' : money(Math.max(p70, b[0]), cur), p70 > b[1] ? 'needs ' + money(p70, cur) + ', above the 70% band' : (p70 < b[0] ? 'lowest 70% price; earns ' + money(R.ebookRoyalty(store, b[0], mb, vat).r70, cur) : 'earns ' + money(R.ebookRoyalty(store, p70, mb, vat).r70, cur)), ok70 ? 'hi' : '') +
        stat('35% option', p35 > info.max35 ? 'Over the maximum' : money(Math.max(p35, e.min35), cur), 'earns ' + money(R.ebookRoyalty(store, Math.max(p35, e.min35), mb, vat).r35, cur)) + '</div>';
    } else $('#ry-target').innerHTML = '<p class="muted">Enter the royalty you want per copy to see the list price you need.</p>';

    var copies = Math.max(0, BL.num('#copies', 0));
    $('#ry-proj').innerHTML = stat('Per month', money(copies * royalty, cur), copies + ' copies', 'hi') +
      stat('Per year', money(copies * royalty * 12, cur), 'at the same pace') +
      (eff === 70 ? stat('Delivery costs', money(copies * e.delivery * 12, cur), 'per year on the 70% option') : '');

    // Table and chart.
    var stepUp = cur === 'JPY' ? 100 : cur === 'INR' ? 50 : 1;
    var pts = [e.min35, b[0], niceE(b[0] + (b[1] - b[0]) / 3, cur), niceE(b[0] + 2 * (b[1] - b[0]) / 3, cur), b[1], b[1] + stepUp, price];
    pts = uniq(pts.filter(function (p) { return p >= e.min35 && p <= info.max35; }));
    $('#ry-table').innerHTML = '<caption class="sr-only">eBook royalty per copy at different list prices</caption><thead><tr><th class="num">List price</th><th class="num">35% option</th><th class="num">70% option</th><th class="num">Best</th></tr></thead><tbody>' +
      pts.map(function (p) {
        var x = R.ebookRoyalty(store, p, mb, vat), best = x.in70 ? Math.max(x.r70, x.r35) : x.r35;
        var you = Math.abs(p - price) < 1e-6;
        return '<tr class="' + (you ? 'you' : '') + '"><td class="num">' + money(p, cur) + (you ? '<span class="ry-tag">your price</span>' : '') + '</td><td class="num">' + money(x.r35, cur) + '</td><td class="num">' + (x.in70 ? money(x.r70, cur) : '<span class="muted">n/a</span>') + '</td><td class="num">' + money(best, cur) + '</td></tr>';
      }).join('') + '</tbody>';
    $('#ry-chart-h').textContent = 'eBook royalty at different list prices';
    $('#ry-chart-lead').textContent = 'Best royalty per copy on ' + info.name + ' for a ' + BL.fmt(mb, 1) + ' MB file' + (vat ? ' with ' + vat + '% VAT' : '') + '. Inside the 70% band you earn far more per copy.';
    chartState = { cur: cur, lo: Math.max(0, e.min35 * 0.9), hi: Math.max(price, b[1]) * 1.35, price: price,
      f: function (p) { var x = R.ebookRoyalty(store, p, mb, vat); return p < e.min35 ? NaN : x.in70 ? Math.max(x.r70, x.r35) : x.r35; },
      label: function (p) { var x = R.ebookRoyalty(store, p, mb, vat); return x.in70 && x.r70 >= x.r35 ? '70%' : '35%'; },
      marks: [{ x: b[0], t: '70% from ' + money(b[0], cur) }, { x: b[1], t: 'up to ' + money(b[1], cur) }] };
    drawChart();

    foot.push('eBook price bands and delivery costs from KDP\'s help pages, checked 2026-10-19. The US 70% band of $2.99–$12.99 applies from July 7, 2026; KDP says other marketplaces changed in the same way.');
    foot.push('The 70% option also needs your book to be available in every territory where you hold rights, and it applies only to sales in the territories KDP lists. Sales elsewhere earn 35%.');
    $('#ry-foot').innerHTML = foot.map(function (f) { return '<p>' + f + '</p>'; }).join('');
  }

  function uniq(a) {
    return a.sort(function (x, y) { return x - y; }).filter(function (v, i, arr) { return isFinite(v) && (i === 0 || Math.abs(v - arr[i - 1]) > 1e-6); });
  }

  function showError(msg) {
    $('#ry-stats').innerHTML = '';
    $('#ry-msg').innerHTML = note('err', BL.esc(msg));
    $('#ry-target').innerHTML = ''; $('#ry-proj').innerHTML = '';
    $('#ry-table').innerHTML = ''; $('#ry-chart').innerHTML = ''; $('#ry-foot').innerHTML = '';
    chartState = null;
  }

  /* ---------- chart: royalty vs list price, single series with a hover readout ---------- */
  function drawChart() {
    var box = $('#ry-chart'), s = chartState;
    if (!s) { box.innerHTML = ''; return; }
    var W = Math.max(280, box.clientWidth || 600), H = W < 500 ? 200 : 240;
    var pl = 58, pr = 14, pt = 10 + 14 * s.marks.length, pb = 30;
    var N = 600, xs = [], ys = [];
    for (var i = 0; i <= N; i++) {
      var p = s.lo + (s.hi - s.lo) * i / N;
      p = Math.round(p * 100) / 100;
      xs.push(p); ys.push(s.f(p));
    }
    // Make sure the exact break points are sampled on both sides.
    s.marks.forEach(function (m) { var u = unitOf(s.cur); [m.x - u, m.x].forEach(function (p) { if (p > s.lo && p < s.hi) { xs.push(p); ys.push(s.f(p)); } }); });
    var order = xs.map(function (x, i) { return i; }).sort(function (a, b) { return xs[a] - xs[b]; });
    xs = order.map(function (i) { return xs[i]; }); ys = order.map(function (i) { return ys[i]; });
    var fin = ys.filter(isFinite);
    var ymin = Math.min(0, Math.min.apply(null, fin)), ymax = Math.max(Math.max.apply(null, fin), 0.01);
    var span = ymax - ymin; ymax += span * 0.08; ymin -= ymin < 0 ? span * 0.05 : 0;
    function X(v) { return pl + (v - s.lo) / (s.hi - s.lo) * (W - pl - pr); }
    function Y(v) { return pt + (ymax - v) / (ymax - ymin) * (H - pt - pb); }
    var cur = s.cur, out = [];
    // Grid and y labels.
    ticks(ymin, ymax, 4).forEach(function (t) {
      out.push('<line class="' + (Math.abs(t) < 1e-9 ? 'zero' : 'grid') + '" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/>');
      out.push('<text class="axis" x="' + (pl - 6) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + BL.esc(money(t, cur)) + '</text>');
    });
    ticks(s.lo, s.hi, W < 500 ? 4 : 7).forEach(function (t) {
      if (t < s.lo || t > s.hi) return;
      out.push('<text class="axis" x="' + X(t).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + BL.esc(money(t, cur)) + '</text>');
    });
    // Break-point markers.
    s.marks.forEach(function (m, k) {
      if (m.x <= s.lo || m.x >= s.hi) return;
      out.push('<line class="mark" x1="' + X(m.x).toFixed(1) + '" x2="' + X(m.x).toFixed(1) + '" y1="' + pt + '" y2="' + (H - pb) + '"/>');
      var right = X(m.x) < W * 0.7;
      out.push('<text class="mark-t" x="' + (X(m.x) + (right ? 5 : -5)).toFixed(1) + '" y="' + (20 + 14 * k) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + BL.esc(m.t) + '</text>');
    });
    // The line; break it at gaps and at jumps so the step reads as a step.
    var d = '', prev = null;
    for (i = 0; i < xs.length; i++) {
      if (!isFinite(ys[i])) { prev = null; continue; }
      d += (prev === null ? 'M' : 'L') + X(xs[i]).toFixed(1) + ' ' + Y(ys[i]).toFixed(1);
      prev = i;
    }
    out.push('<path class="line" d="' + d + '"/>');
    if (s.price >= s.lo && s.price <= s.hi && isFinite(s.f(s.price))) out.push('<circle class="you" r="5" cx="' + X(s.price).toFixed(1) + '" cy="' + Y(s.f(s.price)).toFixed(1) + '"><title>Your price</title></circle>');
    out.push('<g id="ry-hover" style="display:none"><line class="cross" y1="' + pt + '" y2="' + (H - pb) + '"/><circle class="dot" r="4.5"/></g>');
    out.push('<rect x="' + pl + '" y="' + pt + '" width="' + (W - pl - pr) + '" height="' + (H - pt - pb) + '" fill="transparent" id="ry-hit"/>');
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Line chart of royalty per copy against list price. The table below lists the same values.">' + out.join('') + '</svg><div class="ry-tip" id="ry-tip" hidden></div>';
    var hit = $('#ry-hit'), hov = $('#ry-hover'), tip = $('#ry-tip');
    function move(ev) {
      var rect = box.querySelector('svg').getBoundingClientRect();
      var x = (ev.clientX - rect.left) * W / rect.width;
      var p = s.lo + (x - pl) / (W - pl - pr) * (s.hi - s.lo);
      p = Math.min(s.hi, Math.max(s.lo, Math.round(p / unitOf(cur)) * unitOf(cur)));
      var v = s.f(p);
      if (!isFinite(v)) { hov.style.display = 'none'; tip.hidden = true; return; }
      hov.style.display = '';
      hov.querySelector('line').setAttribute('x1', X(p)); hov.querySelector('line').setAttribute('x2', X(p));
      hov.querySelector('circle').setAttribute('cx', X(p)); hov.querySelector('circle').setAttribute('cy', Y(v));
      tip.hidden = false;
      tip.innerHTML = '<b>' + BL.esc(money(v, cur)) + ' per copy</b>' + BL.esc(money(p, cur)) + ' list · ' + s.label(p);
      var px = X(p) * rect.width / W, tw = tip.offsetWidth;
      tip.style.left = Math.min(rect.width - tw, Math.max(0, px + (px > rect.width / 2 ? -tw - 10 : 10))) + 'px';
      tip.style.top = Math.max(0, Y(v) * rect.height / H - 44) + 'px';
    }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', function () { hov.style.display = 'none'; tip.hidden = true; });
  }
  function ticks(a, b, n) {
    var span = b - a; if (!(span > 0)) return [a];
    var step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var out = [];
    for (var t = Math.ceil(a / step) * step; t <= b + 1e-9; t += step) { var v = Math.round(t / step) * step; out.push(Math.abs(v) < 1e-9 ? 0 : v); }
    return out;
  }

  /* ---------- wiring ---------- */
  function render() {
    var format = BL.radio('format');
    var ebook = format === 'ebook';
    $('#print-fields').hidden = ebook; $('#ebook-fields').hidden = !ebook;
    if (ebook) { $('#edcopies-row').hidden = true; renderEbook(); }
    else renderPrint(format);
  }
  form.addEventListener('change', function (e) {
    if (e.target.name === 'format' && BL.radio('format') !== 'ebook') { fillTrims(BL.radio('format')); }
    if (e.target.name === 'format' || e.target.name === 'trim') syncOptions();
    render();
  });
  form.addEventListener('input', render);
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(drawChart, 150); });
  render();
})();
