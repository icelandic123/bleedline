/* Etsy fee calculator. The fee maths (calc, solve) is plain and side-effect free so it can be
   unit-tested in Node; the UI below only reads the form and renders the result.
   Rates from research/specs.md (checked 2026-10-19). */
(function () {
  // Payment processing by bank account location: pct (domestic), pctIntl (if different), fixed, fixedCur.
  var COUNTRIES = {
    US: { name: 'United States', cur: 'USD', pct: 3, fixed: 0.25, reg: 0 },
    UK: { name: 'United Kingdom', cur: 'GBP', pct: 4, fixed: 0.20, reg: 0.48 },
    CA: { name: 'Canada', cur: 'CAD', pct: 3, pctIntl: 4, fixed: 0.25, reg: 0.50, dom: 'Canada or US', intl: 'Other countries' },
    AU: { name: 'Australia', cur: 'AUD', pct: 3, pctIntl: 4, fixed: 0.25, reg: 0 },
    NZ: { name: 'New Zealand', cur: 'NZD', pct: 3, pctIntl: 4, fixed: 0.30, reg: 0 },
    DE: { name: 'Germany', cur: 'EUR', pct: 4, fixed: 0.30, reg: 0 },
    FR: { name: 'France', cur: 'EUR', pct: 4, fixed: 0.30, reg: 1.14 },
    IT: { name: 'Italy', cur: 'EUR', pct: 4, fixed: 0.30, reg: 0.80 },
    ES: { name: 'Spain', cur: 'EUR', pct: 4, fixed: 0.30, reg: 0.88 },
    NL: { name: 'Netherlands', cur: 'EUR', pct: 4, fixed: 0.30, reg: 0 },
    PL: { name: 'Poland', cur: 'EUR', pct: 4, fixed: 0.30, reg: 0 },
    HU: { name: 'Hungary', cur: 'EUR', pct: 4, fixed: 0.30, reg: 1.97 },
    EU: { name: 'Other EU country', cur: 'EUR', pct: 4, fixed: 0.30, reg: 0 },
    SE: { name: 'Sweden', cur: 'SEK', pct: 4, fixed: 3.00, reg: 0 },
    DK: { name: 'Denmark', cur: 'DKK', pct: 4, fixed: 2.50, reg: 0 },
    NO: { name: 'Norway', cur: 'NOK', pct: 4, fixed: 2.50, reg: 0 },
    CH: { name: 'Switzerland', cur: 'CHF', pct: 4, fixed: 0.50, reg: 0 },
    JP: { name: 'Japan', cur: 'JPY', pct: 6, fixed: 0.30, fixedCur: 'USD', reg: 0 },
    TH: { name: 'Thailand', cur: 'THB', pct: 6, fixed: 0.30, fixedCur: 'USD', reg: 0 },
    IN: { name: 'India', cur: 'INR', pct: 5, fixed: 25, reg: 0.05 },
    custom: { name: 'your country', cur: 'USD', pct: 3, fixed: 0.25, reg: 0 }
  };
  var CORE = { txPct: 6.5, listUsd: 0.20, capUsd: 100, convPct: 2.5 };
  // Rough exchange rates (1 USD = x), only used to convert Etsy's USD-denominated fees. Editable in the UI.
  var FX = { USD: 1, GBP: 0.75, CAD: 1.38, AUD: 1.53, NZD: 1.72, EUR: 0.86, SEK: 9.5, DKK: 6.4, NOK: 10.1, CHF: 0.8, JPY: 150, THB: 33, INR: 88 };

  function digitsFor(cur) {
    try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits; }
    catch (e) { return 2; }
  }
  function roundTo(x, d) { var f = Math.pow(10, d); return Math.round(x * f + 1e-7 * Math.sign(x)) / f; }

  // inp: price, qty, ship, wrap, taxPct, txPct, listUsd, procPct, procFixed, procFixedUsd (bool),
  //      regPct, offsitePct, capUsd, conv (bool), convPct, fx (account currency per USD),
  //      cost (per item), shipCost, pack, ads, digits
  function calc(inp) {
    var d = inp.digits === undefined ? 2 : inp.digits;
    var r = function (x) { return roundTo(x, d); };
    var fx = inp.fx > 0 ? inp.fx : 1;
    var qty = Math.max(1, Math.round(inp.qty || 1));
    var items = inp.price * qty;
    var order = items + (inp.ship || 0) + (inp.wrap || 0);       // what fees are charged on
    var tax = r(order * (inp.taxPct || 0) / 100);                  // collected and remitted by Etsy
    var paid = order + tax;                                        // what the buyer pays
    var fixed = inp.procFixed * (inp.procFixedUsd ? fx : 1);
    var lines = [];
    function add(key, label, amount, formula) { lines.push({ key: key, label: label, amount: r(amount), formula: formula }); }
    add('listing', 'Listing fee', inp.listUsd * fx * qty, { t: 'list', qty: qty, fx: fx });
    add('transaction', 'Transaction fee', order * inp.txPct / 100, { t: 'pct', pct: inp.txPct, base: order });
    add('processing', 'Payment processing', paid * inp.procPct / 100 + fixed, { t: 'proc', pct: inp.procPct, base: paid, fixed: fixed });
    if (inp.regPct > 0) add('regulatory', 'Regulatory operating fee', order * inp.regPct / 100, { t: 'pct', pct: inp.regPct, base: order });
    if (inp.offsitePct > 0) {
      var cap = inp.capUsd * fx, raw = order * inp.offsitePct / 100;
      add('offsite', 'Offsite Ads', Math.min(raw, cap), { t: 'offsite', pct: inp.offsitePct, base: order, cap: cap, capped: raw > cap });
    }
    if (inp.conv) add('conversion', 'Currency conversion', order * inp.convPct / 100, { t: 'pct', pct: inp.convPct, base: order });
    var fees = lines.reduce(function (a, l) { return a + l.amount; }, 0);
    var goods = r((inp.cost || 0) * qty);
    var costs = goods + (inp.shipCost || 0) + (inp.pack || 0);
    var ads = inp.ads || 0;
    var profit = order - fees - costs - ads;
    return {
      qty: qty, items: r(items), order: r(order), tax: tax, paid: r(paid), lines: lines,
      fees: r(fees), goods: goods, costs: r(costs), ads: r(ads), profit: r(profit), payout: r(order - fees),
      feePct: order > 0 ? fees / order * 100 : NaN, margin: order > 0 ? profit / order * 100 : NaN
    };
  }

  // Lowest item price (in the smallest currency unit) whose profit or margin reaches the target.
  // Profit and margin both rise with price, so a binary search over whole cents is enough.
  function solve(inp, target) {
    var d = inp.digits === undefined ? 2 : inp.digits, unit = Math.pow(10, -d);
    function ok(units) {
      var res = calc(Object.assign({}, inp, { price: units * unit }));
      return target.type === 'margin' ? res.margin >= target.value - 1e-9 : res.profit >= target.value - 1e-9;
    }
    var lo = 0, hi = Math.round(1e7 / unit);
    if (!ok(hi)) return null;
    if (ok(0)) return 0;
    while (hi - lo > 1) { var mid = Math.floor((lo + hi) / 2); if (ok(mid)) hi = mid; else lo = mid; }
    return roundTo(hi * unit, d);
  }

  // Share of each extra unit of price that Etsy keeps at high prices (used to explain an unreachable
  // margin). Offsite Ads is left out because its US$100 cap makes it a fixed amount on big orders.
  function pctTake(inp) {
    return inp.txPct + inp.procPct * (1 + (inp.taxPct || 0) / 100) + (inp.regPct || 0) + (inp.conv ? inp.convPct : 0) + (inp.capUsd > 0 ? 0 : (inp.offsitePct || 0));
  }

  var api = { calc: calc, solve: solve, pctTake: pctTake, COUNTRIES: COUNTRIES, CORE: CORE, FX: FX, digitsFor: digitsFor };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  /* ---------------- UI ---------------- */
  var BL = window.BL, $ = BL.$;
  var form = $('#ef-form');
  var KEY = 'etsy-fee-calculator';

  function country() { return COUNTRIES[$('#country').value] || COUNTRIES.US; }
  function currency() {
    if ($('#country').value === 'custom') {
      var c = ($('#customCur').value || '').trim().toUpperCase();
      return /^[A-Z]{3}$/.test(c) ? c : 'USD';
    }
    return country().cur;
  }
  function fixedIsUsd() { return country().fixedCur === 'USD' && currency() !== 'USD'; }

  function applyRates(resetCore) {
    var c = country();
    var intl = BL.radio('dest') === 'intl' && c.pctIntl;
    $('#procPct').value = intl ? c.pctIntl : c.pct;
    $('#procFixed').value = c.fixed.toFixed(2);
    $('#regPct').value = c.reg;
    if (resetCore) {
      $('#txPct').value = CORE.txPct; $('#listUsd').value = CORE.listUsd.toFixed(2);
      $('#capUsd').value = CORE.capUsd; $('#convPct').value = CORE.convPct;
    }
  }
  function applyFx() { var cur = currency(); $('#fx').value = FX[cur] || 1; }

  function syncUi() {
    var c = country(), cur = currency(), pod = BL.radio('mode') === 'pod';
    $('#custom-cur-row').hidden = $('#country').value !== 'custom';
    $('#dest-row').hidden = !c.pctIntl;
    if (c.pctIntl) {
      $('#dest-dom').textContent = c.dom || 'Same country';
      $('#dest-intl').textContent = c.intl || 'Another country';
      $('#dest-hint').textContent = 'Processing is ' + c.pct + '% for ' + (c.dom || 'domestic').toLowerCase().replace('canada or us', 'Canadian or US') + ' orders and ' + c.pctIntl + '% for ' + (c.intl ? 'orders from other countries' : 'international orders') + '.';
    }
    $('#fx-row').hidden = cur === 'USD';
    BL.$$('.cc').forEach(function (el) { el.textContent = cur; });
    $('#fixed-cc').textContent = fixedIsUsd() ? 'USD, converted' : cur;
    $('#fx-hint-fixed').textContent = fixedIsUsd() ? ' and the US$' + BL.num('#procFixed', 0).toFixed(2) + ' processing fee' : '';
    $('#cost-label').textContent = pod ? 'POD base price (per item)' : 'Item cost (per item)';
    $('#cost-hint').textContent = pod ? 'What your print provider (Printful, Printify…) charges for one item.' : 'Materials and labour for one item.';
    $('#shipcost-label').textContent = pod ? 'POD shipping charge' : 'Your shipping cost';
    $('#shipcost-hint').textContent = pod ? 'What the provider charges to ship this order.' : 'Postage label for the whole order.';
    $('#pack-row').hidden = pod;
    var regNote = c.reg > 0 ? 'Regulatory operating fee for ' + c.name + ': ' + c.reg + '% of the order total.' :
      ($('#country').value === 'custom' ? 'Enter your country\'s processing fee from Etsy\'s payment processing page, and its regulatory fee if it has one (Türkiye 1.67%, Vietnam 1.24%).' : 'Etsy lists no regulatory operating fee for ' + c.name + '.');
    $('#rates-hint').textContent = regNote + ' Processing: ' + c.pct + '%' + (c.pctIntl ? ' (' + c.pctIntl + '% international)' : '') + ' + ' + c.fixed.toFixed(2) + ' ' + (c.fixedCur || c.cur) + '.';
    var tv = BL.radio('target') === 'margin';
    $('#target-val-label').textContent = tv ? 'Margin on the order' : 'Profit per order';
    $('#target-unit').textContent = tv ? '%' : cur;
  }

  function readInput() {
    var cur = currency();
    var pod = BL.radio('mode') === 'pod';
    return {
      price: BL.num('#price', 0), qty: BL.num('#qty', 1), ship: BL.num('#ship', 0), wrap: BL.num('#wrap', 0),
      taxPct: BL.num('#tax', 0), txPct: BL.num('#txPct', 0), listUsd: BL.num('#listUsd', 0),
      procPct: BL.num('#procPct', 0), procFixed: BL.num('#procFixed', 0), procFixedUsd: fixedIsUsd(),
      regPct: BL.num('#regPct', 0), offsitePct: +BL.radio('offsite') || 0, capUsd: BL.num('#capUsd', 0),
      conv: $('#conv').checked, convPct: BL.num('#convPct', 0), fx: cur === 'USD' ? 1 : BL.num('#fx', 1),
      cost: BL.num('#cost', 0), shipCost: BL.num('#shipCost', 0), pack: pod ? 0 : BL.num('#pack', 0), ads: BL.num('#ads', 0),
      digits: digitsFor(cur), cur: cur
    };
  }

  function validate(inp) {
    var bad = [];
    ['price', 'ship', 'wrap', 'taxPct', 'cost', 'shipCost', 'pack', 'ads'].forEach(function (k) { if (inp[k] < 0) bad.push(k); });
    if (bad.length) return 'Amounts can\'t be negative.';
    if (!(inp.qty >= 1)) return 'Quantity must be at least 1.';
    if (inp.cur !== 'USD' && !(inp.fx > 0)) return 'Enter an exchange rate above 0.';
    return '';
  }

  function n(x, d) { return BL.fmt(x, d); }
  function formulaText(l, inp, d) {
    var f = l.formula;
    if (f.t === 'list') return 'US$' + n(inp.listUsd, 2) + (f.fx !== 1 ? ' × ' + n(f.fx, 4).replace(/\.?0+$/, '') : '') + ' × ' + f.qty + (f.qty === 1 ? ' item' : ' items');
    if (f.t === 'pct') return n(f.pct, 2).replace(/\.?0+$/, '') + '% × ' + n(f.base, d);
    if (f.t === 'proc') return n(f.pct, 2).replace(/\.?0+$/, '') + '% × ' + n(f.base, d) + ' + ' + n(f.fixed, d);
    if (f.t === 'offsite') return n(f.pct, 0) + '% × ' + n(f.base, d) + (f.capped ? ', capped at ' + n(f.cap, d) : ' (cap ' + n(f.cap, d) + ')');
    return '';
  }
  var BASES = {
    listing: 'per item sold',
    transaction: 'on item + shipping + gift wrap',
    processing: 'on everything the buyer pays, incl. tax, plus fixed fee',
    regulatory: 'on item + shipping + gift wrap',
    offsite: 'on item + shipping + gift wrap',
    conversion: 'on item + shipping + gift wrap'
  };

  function stat(k, v, s, cls, vcls) {
    return '<div class="stat' + (cls ? ' ' + cls : '') + '"><div class="k">' + k + '</div><div class="v' + (vcls ? ' ' + vcls : '') + '">' + BL.esc(v) + '</div>' + (s ? '<div class="s">' + BL.esc(s) + '</div>' : '') + '</div>';
  }

  function render() {
    syncUi();
    var inp = readInput(), cur = inp.cur, d = inp.digits;
    var m = function (x) { return BL.money(x, cur); };
    var msg = $('#ef-msg');
    var err = validate(inp);
    if (err) { msg.innerHTML = '<div class="note err">' + BL.esc(err) + '</div>'; return; }
    var res = calc(inp);
    var be = solve(inp, { type: 'profit', value: 0 });
    var neg = res.profit < 0;
    $('#ef-stats').innerHTML =
      stat('Etsy fees', m(res.fees), isFinite(res.feePct) ? n(res.feePct, 1) + '% of the order' : '') +
      stat('Net profit', m(res.profit), res.qty > 1 ? m(res.profit / res.qty) + ' per item' : 'after fees and costs', 'hi', neg ? 'neg' : '') +
      stat('Margin', isFinite(res.margin) ? n(res.margin, 1) + '%' : '–', 'profit ÷ order total', '', neg ? 'neg' : '') +
      stat('Break-even price', be === null ? '–' : m(be), 'per item, for zero profit');

    var notes = [];
    if (neg) notes.push('<div class="note err">This order loses ' + BL.esc(m(-res.profit)) + '. Raise the price to at least ' + BL.esc(m(be)) + ' to break even.</div>');
    else if (res.margin < 15 && res.order > 0) notes.push('<div class="note warn">A thin margin: one Offsite Ads sale or a refund can wipe it out.</div>');
    if (cur !== 'USD' && !FX[cur] && inp.fx === 1) notes.push('<div class="note warn">Enter how many ' + BL.esc(cur) + ' one US dollar buys, so Etsy\'s US-dollar fees convert correctly.</div>');
    if (inp.qty !== Math.round(inp.qty)) notes.push('<div class="note">Quantity rounded to ' + res.qty + '.</div>');
    msg.innerHTML = notes.join('');

    var rows = '<thead><tr><th>Line</th><th>Amount</th></tr></thead><tbody>';
    rows += '<tr class="sec"><td colspan="2">What the buyer pays</td></tr>';
    rows += row('Items', res.qty > 1 ? res.qty + ' × ' + n(inp.price, d) : '', res.items);
    rows += row('Shipping', '', inp.ship);
    if (inp.wrap) rows += row('Gift wrap', '', inp.wrap);
    rows += row('Order total', 'what most fees are charged on', res.order, 'sum');
    if (res.tax) rows += row('Tax collected by Etsy', n(inp.taxPct, 2).replace(/\.?0+$/, '') + '% × ' + n(res.order, d) + ', paid to the tax office, not to you', res.tax);
    rows += '<tr class="sec"><td colspan="2">Etsy fees</td></tr>';
    res.lines.forEach(function (l) { rows += row(l.label, BASES[l.key] + ': ' + formulaText(l, inp, d), -l.amount); });
    rows += row('Total Etsy fees', isFinite(res.feePct) ? n(res.feePct, 1) + '% of the order total' : '', -res.fees, 'sum');
    rows += row('Paid out to you', 'order total − Etsy fees', res.payout);
    rows += '<tr class="sec"><td colspan="2">Your costs</td></tr>';
    var pod = BL.radio('mode') === 'pod';
    rows += row(pod ? 'POD base price' : 'Item cost', res.qty > 1 ? res.qty + ' × ' + n(inp.cost, d) : '', -res.goods);
    rows += row(pod ? 'POD shipping' : 'Shipping cost', '', -inp.shipCost);
    if (!pod && inp.pack) rows += row('Packaging', '', -inp.pack);
    if (inp.ads) rows += row('Etsy Ads spend', '', -inp.ads);
    rows += row('Net profit', 'order total − Etsy fees − costs', res.profit, 'sum', true);
    $('#ef-lines').innerHTML = rows + '</tbody>';

    reverse(inp, res);
  }
  function row(label, formula, amount, cls, color) {
    amount = amount || 0;   // no "-0.00"
    var a = BL.money(amount, currentCur);
    var c = color ? (amount < 0 ? 'neg' : 'pos') : '';
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + BL.esc(label) + (formula ? '<span class="f">' + BL.esc(formula) + '</span>' : '') + '</td><td class="' + c + '">' + BL.esc(a) + '</td></tr>';
  }
  var currentCur = 'USD';

  function reverse(inp) {
    var out = $('#ef-rev-out');
    var type = BL.radio('target') === 'margin' ? 'margin' : 'profit';
    var val = BL.num('#targetVal', NaN);
    var m = function (x) { return BL.money(x, inp.cur); };
    if (!isFinite(val)) { out.innerHTML = '<div class="note">Enter a target.</div>'; return; }
    if (type === 'margin' && val >= 100) { out.innerHTML = '<div class="note err">A margin has to be below 100%.</div>'; return; }
    var p = solve(inp, { type: type, value: val });
    if (p === null) {
      out.innerHTML = '<div class="note err">That margin can\'t be reached: Etsy\'s percentage fees take about ' + n(pctTake(inp), 1) + '% of every extra ' + BL.esc(inp.cur) + ' you charge, so the margin can never go above ' + n(100 - pctTake(inp), 1) + '%.</div>';
      return;
    }
    var chk = calc(Object.assign({}, inp, { price: p }));
    out.innerHTML = '<div class="result-grid">' +
      stat('Price each item at', m(p), res1(chk), 'hi') +
      stat('Check: profit', m(chk.profit), 'margin ' + n(chk.margin, 1) + '%') +
      stat('Etsy fees at that price', m(chk.fees), n(chk.feePct, 1) + '% of the order') +
      '</div>' + (p === 0 ? '<div class="note">Your shipping charge alone already reaches this target.</div>' : '');
    function res1(c) { return 'order total ' + m(c.order); }
  }

  // Events: prefill rates before BL.persist saves, so saved values match the visible ones.
  form.addEventListener('change', function (e) {
    var nm = e.target.name;
    if (nm === 'country') { applyRates(false); applyFx(); if (BL.radio('target') !== 'margin') $('#targetVal').value = Math.round(10 * (FX[currency()] || 1)); }
    else if (nm === 'dest') applyRates(false);
    else if (nm === 'customCur') applyFx();
  });
  var hadSaved = BL.store.get('form:' + KEY, null) !== null;
  BL.persist(form, KEY);
  if (!hadSaved) { applyRates(true); applyFx(); }
  $('#reset-rates').addEventListener('click', function () {
    applyRates(true);
    form.dispatchEvent(new Event('input', { bubbles: true }));
    BL.toast('Rates reset to Etsy\'s published fees for ' + country().name + '.');
  });
  function update() { currentCur = currency(); render(); }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  BL.$$('[form="ef-rev-form"]').forEach(function (el) { el.addEventListener('input', update); el.addEventListener('change', update); });
  var savedT = BL.store.get('etsy-target', null);
  if (savedT) {
    var r = document.querySelector('input[name="target"][value="' + savedT.type + '"]'); if (r) r.checked = true;
    if (isFinite(savedT.value)) $('#targetVal').value = savedT.value;
  }
  BL.$$('[form="ef-rev-form"]').forEach(function (el) { el.addEventListener('change', function () { BL.store.set('etsy-target', { type: BL.radio('target'), value: BL.num('#targetVal', NaN) }); }); });
  update();
})();
