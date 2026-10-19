/* KDP margin calculator: gutter and outside margins, PDF page size with and without bleed,
   safe live area, word-processor setup values and a to-scale SVG of a two-page spread.
   All margin values come from BL.kdp (assets/kdp.js). */
(function () {
  var BL = window.BL, $ = BL.$, K = BL.kdp;
  var IN = 72;
  // KDP page limits from the trim-size table (research/specs.md 1.1 and 1.2): [min, max] per ink/paper.
  // Columns: white, cream, groundwood, standard colour, premium colour. null = not offered.
  var LIMITS = {
    regular: [[24, 828], [24, 776], [24, 812], [72, 600], [24, 828]],
    w825: [[24, 800], [24, 750], [24, 784], [72, 600], [24, 800]],
    w85: [[24, 590], [24, 550], [24, 578], [72, 600], [24, 590]],
    a4: [[24, 780], [24, 730], [24, 764], null, [24, 590]]
  };
  var GROUP = { '8.25x6': 'w825', '8.25x8.25': 'w825', '8.5x8.5': 'w85', '8.5x11': 'w85', '8.27x11.69': 'a4' };
  var INKS = ['white', 'cream', 'groundwood', 'std', 'premium'];
  var INK_NAME = { white: 'black and white on white paper', cream: 'black and white on cream paper', groundwood: 'groundwood paper', std: 'standard colour', premium: 'premium colour' };
  var SPINE = { white: 0.002252, cream: 0.0025, groundwood: 0.00235, std: 0.002252, premium: 0.002347 };

  function f3(n) { return (Math.round(n * 1000) / 1000).toString(); }
  function mm(inches, up) { var v = inches * 25.4; return (up ? Math.ceil(v * 10 - 1e-9) / 10 : Math.round(v * 100) / 100).toString(); }
  function pt(inches) { return (Math.round(inches * IN * 100) / 100).toString(); }
  function stat(k, v, s, hi) { return '<div class="stat' + (hi ? ' hi' : '') + '"><div class="k">' + k + '</div><div class="v" style="font-size:1.1rem">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>'; }

  function trimList() {
    var hc = BL.radio('format') === 'hardcover', sel = $('#trim'), cur = sel.value || '6x9';
    var list = K.trims.filter(function (t) { return !hc || t.hardcover; });
    sel.innerHTML = list.map(function (t) {
      var note = !hc && t.id === '8.25x11' ? ' (hardcover trim)' : '';
      return '<option value="' + t.id + '">' + BL.esc(t.label + note) + '</option>';
    }).join('');
    sel.value = list.some(function (t) { return t.id === cur; }) ? cur : '6x9';
  }
  function limits(trim, ink, hc) {
    if (hc) return (ink === 'groundwood' || ink === 'std') ? null : [75, 550];
    if (trim.id === '8.25x11') return undefined;
    var row = LIMITS[GROUP[trim.id] || 'regular'];
    return row[INKS.indexOf(ink)];
  }

  function calc() {
    var msg = [], hc = BL.radio('format') === 'hardcover';
    var trim = K.trim($('#trim').value), bleed = BL.radio('bleed') === 'yes', ink = $('#ink').value;
    var unit = BL.radio('unit');
    var raw = Math.round(BL.num('#pages', NaN));
    if (!isFinite(raw) || raw < 1) { $('#mc-msg').innerHTML = '<div class="note err">Enter the number of pages in your book.</div>'; return; }
    var pages = raw + (raw % 2);
    if (raw % 2) msg.push(['', 'Printed books have an even number of pages, so ' + raw + ' becomes ' + pages + '. KDP adds a blank page at the end of an odd-numbered file.']);
    var lim = limits(trim, ink, hc);
    if (lim === undefined) msg.push(['warn', 'KDP lists 8.25 × 11 in only as a hardcover trim; it is not in the paperback trim table.']);
    else if (lim === null) msg.push(['err', (hc ? 'Hardcovers' : 'This trim size') + ' can\'t be printed in ' + INK_NAME[ink] + ' on KDP.']);
    else if (pages < lim[0] || pages > lim[1]) msg.push(['warn', 'For ' + (hc ? 'a hardcover' : 'this trim') + ' in ' + INK_NAME[ink] + ', KDP accepts ' + lim[0] + ' to ' + lim[1] + ' pages. You entered ' + pages + '.']);
    if (pages > 828) pages = 828;
    if (pages < 24) pages = 24;
    var extra = Math.min(1.5, Math.max(0, BL.num('#extra', 0)));

    var inside = K.insideMargin(pages), outside = K.outsideMargin(bleed);
    var noB = K.pageSize(trim, false), withB = K.pageSize(trim, true), size = bleed ? withB : noB;
    var la = K.liveArea(trim, pages, 1, bleed, extra); // page 1: right-hand page
    // Distances from the PDF page edges (what goes into a word processor).
    var m = {
      inside: la.x / IN, outside: (la.pageW - la.x - la.w) / IN,
      bottom: la.y / IN, top: (la.pageH - la.y - la.h) / IN,
      liveW: la.w / IN, liveH: la.h / IN
    };

    var sizeTxt = function (s) { return f3(s.w) + ' × ' + f3(s.h) + ' in'; };
    var html = stat('Inside margin (gutter)', f3(inside) + ' in', mm(inside, true) + ' mm minimum for ' + pages + ' pages', true);
    html += stat('Outside, top, bottom', f3(outside) + ' in', mm(outside, true) + ' mm minimum' + (bleed ? ', with bleed' : ''), true);
    html += stat('PDF page size', sizeTxt(size), mm(size.w) + ' × ' + mm(size.h) + ' mm · ' + pt(size.w) + ' × ' + pt(size.h) + ' pt' + (bleed ? ' (with bleed)' : ''));
    html += stat('Safe live area', f3(m.liveW) + ' × ' + f3(m.liveH) + ' in', mm(m.liveW) + ' × ' + mm(m.liveH) + ' mm' + (extra ? ', incl. ' + f3(extra) + ' in extra' : ''));
    if (!hc) {
      var sp = pages * SPINE[ink];
      html += stat('Spine width', f3(sp) + ' in', mm(sp) + ' mm on ' + INK_NAME[ink].replace('black and white on ', '') + (pages <= 79 ? ' · too thin for spine text' : ''));
    }
    $('#mc-stats').innerHTML = html;
    $('#mc-msg').innerHTML = msg.map(function (x) { return '<div class="note ' + x[0] + '">' + BL.esc(x[1]) + '</div>'; }).join('');

    $('#mc-table').innerHTML = '<thead><tr><th></th><th>Inches</th><th>Millimetres</th><th>Points</th></tr></thead><tbody>' +
      row('Trim size (PDF without bleed)', noB) + row('PDF page with bleed', withB) +
      row('Safe live area', { w: m.liveW, h: m.liveH }) +
      mrow('Inside margin from the PDF edge', m.inside) + mrow('Outside margin from the PDF edge', m.outside) +
      mrow('Top margin from the PDF edge', m.top) + mrow('Bottom margin from the PDF edge', m.bottom) + '</tbody>';
    function row(k, s) { return '<tr><td>' + k + '</td><td>' + f3(s.w) + ' × ' + f3(s.h) + '</td><td>' + mm(s.w) + ' × ' + mm(s.h) + '</td><td>' + pt(s.w) + ' × ' + pt(s.h) + '</td></tr>'; }
    function mrow(k, v) { return '<tr><td>' + k + '</td><td>' + f3(v) + '</td><td>' + mm(v, true) + '</td><td>' + pt(v) + '</td></tr>'; }

    setups(size, m, unit, bleed);
    $('#mc-diagram').innerHTML = diagram(trim, pages, bleed, extra, inside, m);
    $('#mc-lg-margin').textContent = 'Outside, top and bottom margin (' + f3(m.outside) + ' in from the page edge)';
    $('#mc-lg-gutter').textContent = 'Gutter (' + f3(m.inside) + ' in from the spine)';
  }

  function setups(size, m, unit, bleed) {
    // Page sizes are exact; margins round up so they never fall below KDP's minimum.
    var u = unit === 'mm'
      ? { s: function (v) { return mm(v) + ' mm'; }, m: function (v) { return mm(v, true) + ' mm'; } }
      : { s: function (v) { return f3(v) + '"'; }, m: function (v) { return f3(v) + '"'; } };
    var docsSide = Math.max(m.inside, m.outside);
    var blocks = [
      ['Microsoft Word', [
        'Layout › Size › More Paper Sizes',
        '  Width: ' + u.s(size.w) + '   Height: ' + u.s(size.h),
        '  Apply to: Whole document',
        'Layout › Margins › Custom Margins',
        '  Multiple pages: Mirror margins',
        '  Top: ' + u.m(m.top) + '   Bottom: ' + u.m(m.bottom),
        '  Inside: ' + u.m(m.inside) + '   Outside: ' + u.m(m.outside),
        '  Gutter: 0' + (unit === 'mm' ? ' mm' : '"'),
        '  Apply to: Whole document',
        'File › Save As › PDF (Options: tick "ISO 19005-1 compliant (PDF/A)" to embed fonts)'
      ]],
      ['Google Docs', [
        'File › Page setup › Pages',
        '  Paper size: Custom, ' + u.s(size.w) + ' × ' + u.s(size.h) + ' (if your Docs offers custom sizes)',
        '  Top: ' + u.m(m.top) + '   Bottom: ' + u.m(m.bottom),
        '  Left: ' + u.m(docsSide) + '   Right: ' + u.m(docsSide),
        '  (Docs has no mirror margins, so the larger inside margin goes on both sides.)',
        'File › Download › PDF document'
      ]],
      ['LibreOffice Writer', [
        'Format › Page Style › Page',
        '  Width: ' + u.s(size.w) + '   Height: ' + u.s(size.h),
        '  Page layout: Mirrored',
        '  Inner: ' + u.m(m.inside) + '   Outer: ' + u.m(m.outside),
        '  Top: ' + u.m(m.top) + '   Bottom: ' + u.m(m.bottom),
        '  Gutter: 0',
        'File › Export As › Export as PDF'
      ]]
    ];
    $('#mc-setups').innerHTML = blocks.map(function (b, i) {
      return '<div class="mc-setup"><h3>' + b[0] + (bleed ? ' (with bleed)' : '') + '</h3><button type="button" class="btn ghost" data-copy="' + i + '">Copy</button><pre id="mc-pre-' + i + '">' + BL.esc(b[1].join('\n')) + '</pre></div>';
    }).join('') + (unit === 'mm' ? '<p class="small muted">Page sizes in millimetres are rounded to 0.01 mm. Inches are exact, so prefer them for the page size if your software accepts both.</p>' : '');
  }

  function diagram(trim, pages, bleed, extra, inside, m) {
    var b = bleed ? K.bleed : 0;
    var W = trim.w + b, H = trim.h + 2 * b;          // one PDF page, inches
    var S = 72, spreadW = 2 * W * S, pageH = H * S;
    var boxW = ($('#mc-diagram').clientWidth || 600);
    // About 12 px text whatever the screen width.
    var fs = Math.max(spreadW / 50, 12 * (spreadW + 40) / boxW), top = fs * 3.2, bottomPad = fs * 2.6, side = fs * 0.6;
    var vbW = spreadW + 2 * side, vbH = pageH + top + bottomPad;
    var out = [];
    function r(x, y, w, h, cls) { out.push('<rect class="' + cls + '" x="' + (side + x * S).toFixed(2) + '" y="' + (top + y * S).toFixed(2) + '" width="' + (w * S).toFixed(2) + '" height="' + (h * S).toFixed(2) + '"/>'); }
    function t(x, y, s, cls, anchor) { out.push('<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + fs.toFixed(1) + '" text-anchor="' + (anchor || 'middle') + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + BL.esc(s) + '</text>'); }
    // Left page (even): page x 0..W, bleed on its left. Right page (odd): W..2W, bleed on its right.
    [0, 1].forEach(function (i) {
      var x0 = i * W, right = i === 1;
      r(x0, 0, W, H, bleed ? 'bleed' : 'pg');
      var tx = right ? x0 : x0 + b;
      r(tx, b, trim.w, trim.h, 'pg');
      var la = K.liveArea(trim, pages, right ? 1 : 2, bleed, extra);
      var gx = right ? tx : x0 + la.x / S + la.w / S;
      var gw = right ? la.x / S - (tx - x0) : tx + trim.w - gx;
      r(gx, b, gw, trim.h, 'gut');
      r(x0 + la.x / S, H - (la.y + la.h) / S, la.w / S, la.h / S, 'live');
      if (bleed) r(tx, b, trim.w, trim.h, 'trim');
      var cx = side + (x0 + la.x / S + la.w / S / 2) * S, cy = top + pageH / 2;
      t(cx, cy - fs * 0.4, 'Safe area', 'acc');
      t(cx, cy + fs * 0.9, f3(la.w / S) + ' × ' + f3(la.h / S) + ' in', 'mut');
      t(side + (x0 + W / 2) * S, top + pageH + fs * 1.6, right ? 'Odd page (right-hand)' : 'Even page (left-hand)', 'mut');
    });
    // Spine line and gutter callout.
    var sx = side + W * S;
    out.push('<line class="spine" x1="' + sx + '" y1="' + (top - fs * 0.4) + '" x2="' + sx + '" y2="' + (top + pageH) + '"/>');
    var gL = sx - m.inside * S, gR = sx + m.inside * S, yb = top - fs * 0.9;
    out.push('<path class="dim" d="M' + gL.toFixed(1) + ' ' + (yb + fs * 0.5).toFixed(1) + 'V' + yb.toFixed(1) + 'H' + gR.toFixed(1) + 'V' + (yb + fs * 0.5).toFixed(1) + '"/>');
    t(sx, yb - fs * 0.5, 'Gutter ' + f3(m.inside) + ' in', '');
    return '<svg class="mc-svg" viewBox="0 0 ' + vbW.toFixed(1) + ' ' + vbH.toFixed(1) + '" role="img" aria-label="Two-page spread drawn to scale: the gutter is ' + f3(m.inside) + ' in from the spine and the outside margin ' + f3(m.outside) + ' in from the page edge">' + out.join('') + '</svg>';
  }

  $('#mc-setups').addEventListener('click', function (e) {
    var bt = e.target.closest('[data-copy]');
    if (!bt) return;
    var text = $('#mc-pre-' + bt.getAttribute('data-copy')).textContent;
    var done = function () { BL.toast('Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      var sel = window.getSelection(), range = document.createRange();
      range.selectNodeContents($('#mc-pre-' + bt.getAttribute('data-copy')));
      sel.removeAllRanges(); sel.addRange(range);
      BL.toast('Selected. Press Ctrl+C (or ⌘C) to copy.');
    }
  });

  var form = $('#mc-form');
  trimList();
  BL.persist(form, 'kdp-margins');
  trimList();
  var saved = BL.store.get('form:kdp-margins', null);
  if (saved && saved.trim) $('#trim').value = saved.trim;
  if (!$('#trim').value) $('#trim').value = '6x9';
  form.addEventListener('change', function (e) { if (e.target.name === 'format') trimList(); calc(); });
  form.addEventListener('input', calc);
  calc();
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(calc, 120); });
})();
