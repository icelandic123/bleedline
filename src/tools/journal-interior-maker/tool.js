/* Journal interior maker: ruled, dot grid, graph and Pro page styles for low-content KDP books.
   Every page is described once as drawing calls in PDF points (origin bottom-left) and painted either
   to a canvas (preview) or to pdf-lib (export). Each style is drawn once per side (left/right) into a
   template page; every page of the book then reuses that template as a Form XObject, so an 828-page
   book stays small and fast to build. Per-page items (title page, page numbers) are drawn directly. */
(function () {
  var BL = window.BL, $ = BL.$, K = BL.kdp;
  var IN = 72, MM = 72 / 25.4;
  var COLLEGE = 9 / 32 * IN, WIDE = 11 / 32 * IN, NARROW = 0.25 * IN;
  var SPINE = { white: 0.002252, cream: 0.0025 };
  // Highest page count per trim from KDP's paperback trim table (research/specs.md 1.1): [white, cream].
  var MAX_PAGES = { '8.25x6': [800, 750], '8.25x8.25': [800, 750], '8.5x8.5': [590, 550], '8.5x11': [590, 550], '8.27x11.69': [780, 730] };
  var LABEL = { g: 0.2 }, SOFT = { g: 0.4 }, FILL = { g: 0.93 };
  var HEADER_H = 28, NUM_H = 16;

  var STYLES = [
    { id: 'college', name: 'College ruled (9/32 in, 7.1 mm)' },
    { id: 'wide', name: 'Wide ruled (11/32 in, 8.7 mm)' },
    { id: 'narrow', name: 'Narrow ruled (1/4 in, 6.4 mm)' },
    { id: 'custom', name: 'Ruled, custom spacing' },
    { id: 'dot', name: 'Dot grid' },
    { id: 'graph', name: 'Graph paper (square grid)' },
    { id: 'blank', name: 'Blank' },
    { id: 'handwriting', name: 'Handwriting practice', pro: true },
    { id: 'music', name: 'Music staff paper', pro: true },
    { id: 'daily', name: 'Daily planner', pro: true },
    { id: 'weekly', name: 'Weekly planner', pro: true },
    { id: 'habit', name: 'Monthly habit tracker', pro: true },
    { id: 'recipe', name: 'Recipe page', pro: true },
    { id: 'prompts', name: 'Gratitude / journal prompts', pro: true },
    { id: 'log', name: 'Log book table', pro: true }
  ];
  var S = {};
  STYLES.forEach(function (s) { S[s.id] = s; });
  // Styles that take the optional header line (the others have their own heading).
  var HEADER_OK = { college: 1, wide: 1, narrow: 1, custom: 1, dot: 1, graph: 1, blank: 1, handwriting: 1, music: 1, prompts: 1 };
  // Styles that draw text, so their templates need embedded fonts.
  var HAS_TEXT = { daily: 1, weekly: 1, habit: 1, recipe: 1, prompts: 1, log: 1 };
  var LOG_PRESETS = {
    reading: ['Reading log', 'Date, Title:3, Author:2, Pages, Rating'],
    workout: ['Workout log', 'Date, Exercise:2.5, Sets, Reps, Weight, Notes:1.6'],
    mileage: ['Mileage log', 'Date, Start:1.2, End:1.2, Miles, Purpose:2.4'],
    expense: ['Expense log', 'Date, Description:3, Category:1.6, Amount:1.2'],
    bp: ['Blood pressure log', 'Date, Time, Systolic, Diastolic, Pulse, Notes:2'],
    visitor: ['Visitor log', 'Date, Name:2.2, Time in, Time out, Purpose:2']
  };
  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function f2(n, d) { return BL.fmt(n, d === undefined ? 3 : d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); }
  function hexRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(h || '');
    var n = m ? parseInt(m[1], 16) : 0x8fb3d9;
    return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255 };
  }
  function maxPages(id) { return id === '8.25x11' ? null : (MAX_PAGES[id] || [828, 776]); }

  /* ---------- sections (kept outside the form so they can be added and removed) ---------- */
  var sections = BL.store.get('journal-sections', null);
  if (!Array.isArray(sections) || !sections.length) sections = [{ style: 'college', pages: 60 }];
  sections = sections.filter(function (s) { return s && S[s.style]; }).slice(0, 12);
  if (!sections.length) sections = [{ style: 'college', pages: 60 }];
  function saveSections() { BL.store.set('journal-sections', sections); }

  function styleOptions(sel) {
    var free = STYLES.filter(function (s) { return !s.pro; }), pro = STYLES.filter(function (s) { return s.pro; });
    function opts(list, suffix) { return list.map(function (s) { return '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + BL.esc(s.name) + suffix + '</option>'; }).join(''); }
    return '<optgroup label="Free">' + opts(free, '') + '</optgroup><optgroup label="Pro">' + opts(pro, ' (Pro)') + '</optgroup>';
  }
  function renderSections() {
    var box = $('#ji-sections');
    if (sections.length === 1) {
      box.innerHTML = '<div class="field" style="margin-bottom:6px"><label for="sec-style-0">Page style</label>' +
        '<select id="sec-style-0" data-i="0" data-k="style">' + styleOptions(sections[0].style) + '</select></div>';
      return;
    }
    box.innerHTML = '<span class="label" style="display:block;font-weight:600;font-size:.9rem;margin-bottom:6px">Sections, in book order</span>' +
      sections.map(function (s, i) {
        var last = i === sections.length - 1;
        return '<div class="ji-sec"><span class="num">' + (i + 1) + '.</span>' +
          '<select id="sec-style-' + i + '" data-i="' + i + '" data-k="style" aria-label="Style of section ' + (i + 1) + '">' + styleOptions(s.style) + '</select>' +
          (last ? '<span class="rest" id="sec-rest">rest of the book</span>'
            : '<input type="number" min="1" max="828" step="1" value="' + s.pages + '" data-i="' + i + '" data-k="pages" aria-label="Pages in section ' + (i + 1) + '" inputmode="numeric">') +
          '<button type="button" class="btn ghost del" data-del="' + i + '" aria-label="Remove section ' + (i + 1) + '">×</button></div>';
      }).join('');
  }
  $('#ji-sections').addEventListener('change', onSectionInput);
  $('#ji-sections').addEventListener('input', onSectionInput);
  function onSectionInput(e) {
    var t = e.target, i = +t.getAttribute('data-i'), k = t.getAttribute('data-k');
    if (!k || !sections[i]) return;
    if (k === 'style') sections[i].style = t.value;
    else sections[i].pages = Math.max(1, Math.round(BL.num(t, 1)));
    saveSections(); schedule();
  }
  $('#ji-sections').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]');
    if (!b) return;
    sections.splice(+b.getAttribute('data-del'), 1);
    saveSections(); renderSections(); schedule();
  });
  $('#ji-add').addEventListener('click', function () {
    var last = sections[sections.length - 1];
    var guess = Math.max(2, Math.round((BL.num('#pages', 120) || 120) / (sections.length + 1) / 2) * 2);
    last.pages = last.pages > 0 && sections.length > 1 ? last.pages : guess;
    sections.push({ style: last.style === 'dot' ? 'graph' : 'dot', pages: guess });
    saveSections(); renderSections(); schedule();
  });

  /* ---------- reading the form ---------- */
  function lenPt(id, unitId, def, o, what) {
    var v = BL.num('#' + id, NaN), u = $('#' + unitId).value;
    if (!(v > 0)) { o.errors.push('Enter a ' + what + '.'); return def; }
    var pt = u === 'mm' ? v * MM : v * IN;
    if (pt < 3 * MM) { o.errors.push('The ' + what + ' must be at least 3 mm (0.12 in).'); return def; }
    if (pt > 2 * IN) { o.errors.push('The ' + what + ' can be at most 2 in (50 mm).'); return def; }
    return pt;
  }
  function readOpts() {
    var o = { errors: [], warns: [], notes: [] };
    o.trim = K.trim($('#trim').value);
    o.bleed = BL.radio('bleed') === 'yes';
    var raw = Math.round(BL.num('#pages', NaN));
    if (!isFinite(raw)) { raw = 120; o.errors.push('Enter a page count between 24 and 828.'); }
    o.pages = clamp(raw + (Math.abs(raw) % 2), K.minPages, 828);
    if (raw < K.minPages) o.notes.push('KDP paperbacks need at least ' + K.minPages + ' pages, so this book has ' + K.minPages + '.');
    else if (raw > 828) o.notes.push('KDP prints at most 828 pages, so this book has 828.');
    else if (raw % 2) o.notes.push('Books always have an even number of pages (each sheet has two sides), so one page is added: ' + o.pages + ' pages.');
    var mp = maxPages(o.trim.id);
    if (!mp) o.warns.push('KDP lists 8.25 × 11 in as a hardcover trim, not in its paperback trim table. Check it is offered for your format before you publish.');
    else if (o.pages > mp[0]) o.warns.push('At ' + BL.esc(o.trim.w + ' × ' + o.trim.h) + ' in, KDP allows at most ' + mp[0] + ' pages on white paper and ' + mp[1] + ' on cream. Lower the page count.');
    else if (o.pages > mp[1]) o.warns.push('At this trim, cream paper allows at most ' + mp[1] + ' pages. Use white paper or fewer pages.');
    o.extra = clamp(BL.num('#extra', 0), 0, 1.5);

    o.lineMode = BL.radio('linemode');
    if (o.lineMode === 'color') {
      var c = hexRgb($('#lcolor').value);
      o.lineC = c; o.tint = 1 - (0.299 * c.r + 0.587 * c.g + 0.114 * c.b);
    } else {
      o.tint = clamp(BL.num('#tint', 30), 5, 100) / 100;
      o.lineC = { g: 1 - o.tint };
    }
    o.lineW = BL.num('#lweight', NaN);
    if (!(o.lineW > 0)) { o.errors.push('Enter a line weight in points, for example 0.6.'); o.lineW = 0.6; }
    o.lineW = clamp(o.lineW, 0.1, 4);
    o.fullBleedAsked = $('#fullbleed').checked;
    o.fullBleed = o.fullBleedAsked && o.bleed;

    o.header = { on: $('#hdr-on').checked, text: $('#hdr-text').value };
    o.title = { on: $('#title-on').checked, text: $('#title-text').value.trim() || 'This journal belongs to',
      lines: $('#title-lines').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6), back: $('#title-back').checked };
    o.nums = { on: $('#num-on').checked, pos: $('#num-pos').value };
    o.sections = sections.map(function (s) { return { style: s.style, pages: s.pages }; });

    var used = {};
    o.sections.forEach(function (s) { used[s.style] = 1; });
    o.used = used;
    o.ruleSp = used.custom ? lenPt('rule-sp', 'rule-u', COLLEGE, o, 'line spacing') : COLLEGE;
    o.dotSp = used.dot ? lenPt('dot-sp', 'dot-u', 5 * MM, o, 'dot spacing') : 5 * MM;
    o.dotSize = clamp(BL.num('#dot-size', 1.2), 0.3, 4);
    o.gridSp = used.graph ? lenPt('grid-sp', 'grid-u', 0.25 * IN, o, 'square size') : 0.25 * IN;
    o.gridMajor = +$('#grid-major').value || 0;
    o.hwRow = (+$('#hw-row').value || 0.5) * IN;
    o.staves = clamp(Math.round(BL.num('#staves', 10)), 3, 16);
    o.weekStart = $('#week-start').value;
    o.clock = $('#clock').value;
    o.dayFrom = +$('#day-from').value; o.dayTo = +$('#day-to').value;
    if (o.dayTo <= o.dayFrom) { o.dayTo = o.dayFrom + 1; if (used.daily) o.warns.push('The schedule ends before it starts, so it shows one hour.'); }
    o.logTitle = $('#log-title').value.trim();
    o.logCols = $('#log-cols').value.split(',').map(function (c) {
      var m = /^(.*?)(?::\s*([\d.]+))?$/.exec(c.trim());
      return { label: m[1].trim(), w: clamp(parseFloat(m[2]) || 1, 0.2, 10) };
    }).filter(function (c, i, a) { return c.label || a.length > 1; }).slice(0, 12);
    if (!o.logCols.length) o.logCols = [{ label: '', w: 1 }];
    o.logRow = (+$('#log-row').value || 0.3) * IN;
    o.prompts = $('#prompts').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 12);
    if (used.prompts && !o.prompts.length) o.prompts = ['Notes'];

    // Line legibility in print.
    if (o.tint < 0.15) o.warns.push('These lines are lighter than about 15% grey. Very light lines can fade or disappear in print. Try 25 to 35%.');
    if (o.lineW < 0.5) o.warns.push('Lines thinner than 0.5 pt can break up or vanish in print. Try 0.5 to 0.75 pt.');
    if (used.dot && o.dotSize < 0.8) o.warns.push('Dots smaller than about 0.8 pt may print faintly or not at all.');
    if (o.lineMode === 'color') o.notes.push('Coloured lines only print in colour with a colour interior, which costs more per page. In a black-and-white book they print as grey.');
    if (o.fullBleedAsked && !o.bleed) o.warns.push('Full-bleed lines need bleed. Switch bleed on, or the lines stay inside the margins.');
    return o;
  }

  /* ---------- book plan ---------- */
  function plan(o) {
    var seq = [], ranges = [];
    if (o.title.on) {
      seq.push('title'); ranges.push({ label: 'Title page', from: 1, to: 1 });
      if (o.title.back) { seq.push('void'); ranges.push({ label: 'Blank back', from: 2, to: 2 }); }
    }
    var left = o.pages - seq.length, secs = o.sections, fixed = 0;
    for (var i = 0; i < secs.length - 1; i++) fixed += secs[i].pages;
    if (secs.length > 1 && fixed >= left) o.errors.push('The sections before the last one add up to ' + fixed + ' pages, but the book only has ' + left + ' pages for them. Raise the page count or shorten a section.');
    secs.forEach(function (s, idx) {
      var room = o.pages - seq.length;
      var n = idx < secs.length - 1 ? Math.min(s.pages, room) : room;
      if (n <= 0) return;
      ranges.push({ label: S[s.style].name.replace(/ \(.*\)$/, ''), from: seq.length + 1, to: seq.length + n, style: s.style });
      for (var k = 0; k < n; k++) seq.push(s.style);
    });
    while (seq.length < o.pages) seq.push('void');
    return { seq: seq, ranges: ranges };
  }

  /* ---------- geometry ---------- */
  function geo(o, n) {
    var la = K.liveArea(o.trim, o.pages, n, o.bleed, o.extra);
    var b = o.bleed ? K.bleed * IN : 0, right = n % 2 === 1;
    return {
      n: n, right: right, W: la.pageW, H: la.pageH,
      live: { x: la.x, y: la.y, w: la.w, h: la.h },
      trim: { x: right ? 0 : b, y: b, w: o.trim.w * IN, h: o.trim.h * IN }
    };
  }
  function area(o, style, G) {
    var L = G.live, A = { x: L.x, y: L.y, w: L.w, h: L.h };
    // Strokes and dots are centred on their coordinates; inset so their ink stays inside the safe area too.
    var ink = Math.max(o.lineW, o.used.dot ? o.dotSize / 2 : 0);
    A.x += ink; A.y += ink; A.w -= 2 * ink; A.h -= 2 * ink;
    if (o.nums.on) { A.y += NUM_H; A.h -= NUM_H; }
    if (o.header.on && HEADER_OK[style]) A.h -= HEADER_H;
    return A;
  }
  function LS(o, mult, dash) { return { w: o.lineW * (mult || 1), c: o.lineC, dash: dash }; }

  /* ---------- painters ---------- */
  var FONT_FAMILY = 'BLAtkinson, system-ui, sans-serif';
  function fontCss(px, bold) { return (bold ? '700 ' : '400 ') + px + 'px ' + FONT_FAMILY; }
  function cssColor(c) {
    if (c.r !== undefined) return 'rgb(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ')';
    var v = Math.round(c.g * 255);
    return 'rgb(' + v + ',' + v + ',' + v + ')';
  }
  function canvasPainter(ctx, ox, oy, s, H) {
    function X(x) { return ox + x * s; }
    function Y(y) { return oy + (H - y) * s; }
    var p = {
      line: function (x1, y1, x2, y2, st) {
        ctx.beginPath(); ctx.strokeStyle = cssColor(st.c); ctx.lineWidth = Math.max(st.w * s, 0.35);
        ctx.setLineDash(st.dash ? st.dash.map(function (d) { return d * s; }) : []);
        ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke();
      },
      rect: function (x, y, w, h, st) {
        if (st.fill) { ctx.fillStyle = cssColor(st.fill); ctx.fillRect(X(x), Y(y + h), w * s, h * s); }
        if (st.c) { ctx.setLineDash([]); ctx.strokeStyle = cssColor(st.c); ctx.lineWidth = Math.max(st.w * s, 0.35); ctx.strokeRect(X(x), Y(y + h), w * s, h * s); }
      },
      dot: function (x, y, r, c) { ctx.fillStyle = cssColor(c); ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(r * s, 0.4), 0, 2 * Math.PI); ctx.fill(); },
      text: function (str, x, y, size, op) {
        op = op || {};
        var w = p.measure(str, size, op.bold);
        var xx = op.align === 'center' ? x - w / 2 : op.align === 'right' ? x - w : x;
        ctx.font = fontCss(size * s, op.bold); ctx.fillStyle = cssColor(op.c || LABEL); ctx.textBaseline = 'alphabetic';
        ctx.fillText(str, X(xx), Y(y));
      },
      measure: function (str, size, bold) { ctx.font = fontCss(100, bold); return ctx.measureText(str).width * size / 100; }
    };
    return p;
  }
  function pdfPainter(L, page, fonts) {
    function col(c) { return c.r !== undefined ? L.rgb(c.r, c.g, c.b) : L.grayscale(c.g); }
    function font(bold) {
      if (!fonts) throw new Error('Internal error: text drawn without an embedded font.');
      return bold ? fonts.bold : fonts.regular;
    }
    var p = {
      line: function (x1, y1, x2, y2, st) { page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: st.w, color: col(st.c), dashArray: st.dash }); },
      rect: function (x, y, w, h, st) {
        page.drawRectangle({ x: x, y: y, width: w, height: h, color: st.fill ? col(st.fill) : undefined, borderColor: st.c ? col(st.c) : undefined, borderWidth: st.c ? st.w : 0 });
      },
      dot: function (x, y, r, c) { page.drawCircle({ x: x, y: y, size: r, color: col(c) }); },
      // Many dots as one filled path: far fewer operators than one drawCircle per dot.
      dots: function (pts, r, c) {
        // Coordinates rounded to 1/100 pt keep the content stream short; that is far below any printer's resolution.
        function R(v) { return Math.round(v * 100) / 100; }
        var k = R(0.5523 * r), ops = [L.pushGraphicsState(), L.setFillingColor(col(c))];
        r = R(r);
        pts.forEach(function (q) {
          var x = R(q[0]), y = R(q[1]);
          ops.push(L.moveTo(x + r, y),
            L.appendBezierCurve(x + r, y + k, x + k, y + r, x, y + r),
            L.appendBezierCurve(x - k, y + r, x - r, y + k, x - r, y),
            L.appendBezierCurve(x - r, y - k, x - k, y - r, x, y - r),
            L.appendBezierCurve(x + k, y - r, x + r, y - k, x + r, y),
            L.closePath());
        });
        ops.push(L.fill(), L.popGraphicsState());
        page.pushOperators.apply(page, ops);
      },
      text: function (str, x, y, size, op) {
        op = op || {};
        var w = p.measure(str, size, op.bold);
        var xx = op.align === 'center' ? x - w / 2 : op.align === 'right' ? x - w : x;
        page.drawText(str, { x: xx, y: y, size: size, font: font(op.bold), color: col(op.c || LABEL) });
      },
      measure: function (str, size, bold) { return font(bold).widthOfTextAtSize(str, size); }
    };
    return p;
  }

  /* ---------- drawing helpers ---------- */
  // Parse "Date ____  Topic ________" into labels and blanks; blanks share the free width by underscore count.
  function parseFields(text) {
    var segs = [];
    String(text).split(/(_{2,})/).forEach(function (part) {
      if (/^_{2,}$/.test(part)) segs.push({ blank: part.length });
      else if (part) segs.push({ t: part });
    });
    if (!segs.some(function (s) { return s.blank; })) { if (segs.length) segs[segs.length - 1].t += ' '; segs.push({ blank: 1 }); }
    return segs;
  }
  function fieldRow(p, o, x, y, w, segs, size, bold) {
    var fixed = 0, weights = 0;
    segs.forEach(function (s) { if (s.t !== undefined) { s.tw = p.measure(s.t, size, bold); fixed += s.tw; } else weights += s.blank; });
    var free = Math.max(0, w - fixed), cx = x;
    segs.forEach(function (s) {
      if (s.t !== undefined) { p.text(s.t, cx, y, size, { bold: bold, c: LABEL }); cx += s.tw; }
      else { var bw = free * s.blank / weights; if (bw > 6) p.line(cx + 1, y - 1.5, cx + bw - 1, y - 1.5, LS(o)); cx += bw; }
    });
  }
  function wrap(p, text, w, size, bold) {
    var words = text.split(/\s+/), lines = [], cur = '';
    words.forEach(function (wd) {
      var t = cur ? cur + ' ' + wd : wd;
      if (cur && p.measure(t, size, bold) > w) { lines.push(cur); cur = wd; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function fitSize(p, text, w, size, min, bold) {
    while (size > min && p.measure(text, size, bold) > w) size -= 0.25;
    return size;
  }
  function checkbox(p, o, x, y, sz) { p.rect(x, y, sz, sz, { c: o.lineC, w: Math.max(o.lineW, 0.5) }); }
  // Horizontal writing lines from yTop down to yBottom, spacing s; returns the count.
  function linesDown(p, o, x1, x2, yTop, yBottom, s) {
    var n = 0;
    for (var y = yTop - s; y >= yBottom - 0.01; y -= s) { p.line(x1, y, x2, y, LS(o)); n++; }
    return n;
  }
  function star(p, o, cx, cy, r) {
    var pts = [];
    for (var k = 0; k < 10; k++) {
      var a = Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.42 : r;
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    for (k = 0; k < 10; k++) { var q = pts[(k + 1) % 10]; p.line(pts[k][0], pts[k][1], q[0], q[1], LS(o)); }
  }
  function sectionLabel(p, text, x, y) { p.text(text, x, y, 9.5, { bold: true, c: LABEL }); }

  /* ---------- page styles ---------- */
  function ruled(p, o, A, G, s) {
    var n = Math.floor(A.h / s + 1e-6), off = (A.h - n * s) / 2;
    var x1 = o.fullBleed ? 0 : A.x, x2 = o.fullBleed ? G.W : A.x + A.w;
    for (var k = 1; k <= n; k++) { var y = A.y + A.h - off - k * s; p.line(x1, y, x2, y, LS(o)); }
    return n;
  }
  function grid(A, G, o, s) {
    var R = o.fullBleed ? { x: 0, y: 0, w: G.W, h: G.H } : A;
    var nx = Math.floor(R.w / s + 1e-6), ny = Math.floor(R.h / s + 1e-6);
    return { R: R, nx: nx, ny: ny, x0: R.x + (R.w - nx * s) / 2, y0: R.y + (R.h - ny * s) / 2 };
  }
  function dots(p, o, A, G) {
    var s = o.dotSp, g = grid(A, G, o, s), r = o.dotSize / 2, pts = [];
    for (var i = 0; i <= g.nx; i++) for (var j = 0; j <= g.ny; j++) pts.push([g.x0 + i * s, g.y0 + j * s]);
    if (p.dots) p.dots(pts, r, o.lineC);
    else pts.forEach(function (q) { p.dot(q[0], q[1], r, o.lineC); });
  }
  function graph(p, o, A, G) {
    var s = o.gridSp, g = grid(A, G, o, s), M = o.gridMajor;
    var top = g.y0 + g.ny * s, right = g.x0 + g.nx * s;
    var yA = o.fullBleed ? 0 : g.y0, yB = o.fullBleed ? G.H : top, xA = o.fullBleed ? 0 : g.x0, xB = o.fullBleed ? G.W : right;
    var minor = LS(o), major = { w: o.lineW * 1.8, c: o.lineC };
    for (var i = 0; i <= g.nx; i++) p.line(g.x0 + i * s, yA, g.x0 + i * s, yB, M && i % M === 0 ? major : minor);
    // Count major rows from the top so the darker lines start at the top-left corner of the grid.
    for (var j = 0; j <= g.ny; j++) p.line(xA, top - j * s, xB, top - j * s, M && j % M === 0 ? major : minor);
  }
  function handwriting(p, o, A) {
    var h = o.hwRow, gap = h * 0.75;
    var base = { w: o.lineW * 1.6, c: o.lineC.r !== undefined ? o.lineC : { g: Math.max(0, 1 - Math.min(1, o.tint * 1.6)) } };
    var n = Math.max(1, Math.floor((A.h + gap) / (h + gap) + 1e-6));
    var off = (A.h - (n * h + (n - 1) * gap)) / 2;
    var dashLen = Math.max(2, h / 12);
    for (var i = 0; i < n; i++) {
      var top = A.y + A.h - off - i * (h + gap);
      p.line(A.x, top, A.x + A.w, top, LS(o));
      p.line(A.x, top - h / 2, A.x + A.w, top - h / 2, LS(o, 0.9, [dashLen, dashLen]));
      p.line(A.x, top - h, A.x + A.w, top - h, base);
    }
  }
  function music(p, o, A) {
    var n = o.staves;
    var staffH = Math.min(A.h / n * 0.5, 9 * MM), d = staffH / 4;
    var gap = (A.h - n * staffH) / n;
    for (var i = 0; i < n; i++) {
      var top = A.y + A.h - gap / 2 - i * (staffH + gap);
      for (var k = 0; k < 5; k++) p.line(A.x, top - k * d, A.x + A.w, top - k * d, LS(o));
    }
  }
  function hourLabel(o, h) {
    if (o.clock === '24') return (h < 10 ? '0' : '') + h + ':00';
    var hh = h % 12 || 12;
    return hh + (h < 12 || h === 24 ? ' am' : ' pm');
  }
  function daily(p, o, A) {
    var x = A.x, w = A.w, top = A.y + A.h, s = COLLEGE;
    var letters = o.weekStart === 'sun' ? 'SMTWTFS' : 'MTWTFSS', step = 12, lw = 7 * step;
    fieldRow(p, o, x, top - 12, w - lw - 10, [{ t: 'Date ' }, { blank: 1 }], 10, false);
    for (var k = 0; k < 7; k++) p.text(letters[k], x + w - lw + k * step + step / 2, top - 12, 8.5, { align: 'center', c: SOFT, bold: true });
    var y = top - 34;
    sectionLabel(p, 'Top priorities', x, y);
    y -= 4;
    for (k = 0; k < 3; k++) { y -= s; checkbox(p, o, x, y + 2, 7); p.line(x + 12, y, x + w, y, LS(o)); }
    y -= 20;
    var bottom = A.y, notesH = Math.max(3 * s + 18, (y - bottom) * 0.2);
    var colTop = y, colBottom = bottom + notesH + 8, gap = 14;
    var lwid = (w - gap) * 0.56, rx = x + lwid + gap, rw = w - lwid - gap;
    sectionLabel(p, 'Schedule', x, colTop); sectionLabel(p, 'To do', rx, colTop);
    var hours = o.dayTo - o.dayFrom + 1, avail = colTop - 4 - colBottom, rowH = avail / hours;
    var labW = p.measure(o.clock === '24' ? '00:00' : '12 pm', 7.5, false) + 6;
    for (var i = 0; i < hours; i++) {
      var yy = colTop - 4 - (i + 1) * rowH;
      p.text(hourLabel(o, o.dayFrom + i), x, yy + 2.5, 7.5, { c: SOFT });
      p.line(x + labW, yy, x + lwid, yy, LS(o));
    }
    var nTodo = Math.floor((avail) / s + 1e-6);
    for (i = 1; i <= nTodo; i++) { var ty = colTop - 4 - i * s; checkbox(p, o, rx, ty + 2, 7); p.line(rx + 12, ty, rx + rw, ty, LS(o)); }
    sectionLabel(p, 'Notes', x, bottom + notesH - 10);
    linesDown(p, o, x, x + w, bottom + notesH - 14, bottom, s);
  }
  function weekly(p, o, A) {
    var x = A.x, w = A.w, top = A.y + A.h, s = COLLEGE;
    fieldRow(p, o, x, top - 12, Math.min(w, 3.2 * IN), [{ t: 'Week of ' }, { blank: 1 }], 10, false);
    var days = o.weekStart === 'sun' ? ['Sunday'].concat(DAYS.slice(0, 6)) : DAYS.slice();
    days.push('Notes');
    var y = top - 26, gap = 8, bw = (w - gap) / 2, bh = (y - A.y - 3 * gap) / 4;
    days.forEach(function (d, idx) {
      var c = idx % 2, r = Math.floor(idx / 2);
      var bx = x + c * (bw + gap), by = y - (r + 1) * bh - r * gap;
      p.rect(bx, by, bw, bh, { c: o.lineC, w: o.lineW });
      p.text(d, bx + 6, by + bh - 12, 9, { bold: true, c: LABEL });
      linesDown(p, o, bx + 6, bx + bw - 6, by + bh - 16, by + 4, s);
    });
  }
  function habit(p, o, A) {
    var x = A.x, w = A.w, top = A.y + A.h;
    p.text('Habit tracker', x, top - 13, 12, { bold: true });
    fieldRow(p, o, x + w * 0.5, top - 13, w * 0.5, [{ t: 'Month ' }, { blank: 1 }], 10, false);
    var nameW = Math.min(w * 0.3, 1.4 * IN), cell = (w - nameW) / 31;
    var blocks = cell < 0.15 * IN ? [[1, 16], [17, 31]] : [[1, 31]];
    if (blocks.length > 1) cell = (w - nameW) / 16;
    var y = top - 28, bgap = 16;
    var blockH = (y - A.y - (blocks.length - 1) * bgap) / blocks.length;
    var hdr = 14, rowH = 0.3 * IN;
    var rows = Math.max(3, Math.floor((blockH - hdr) / rowH + 1e-6));
    rowH = Math.min(rowH * 1.25, (blockH - hdr) / rows);
    var st = { c: o.lineC, w: o.lineW };
    blocks.forEach(function (b, bi) {
      var bt = y - bi * (blockH + bgap), nd = b[1] - b[0] + 1, gw = nameW + nd * cell, gh = hdr + rows * rowH, gb = bt - gh;
      p.rect(x, bt - hdr, gw, hdr, { fill: FILL });
      p.text('Habit', x + 4, bt - hdr + 4.2, 8, { bold: true });
      for (var d = 0; d < nd; d++) p.text(String(b[0] + d), x + nameW + d * cell + cell / 2, bt - hdr + 4.2, 7, { align: 'center' });
      p.rect(x, gb, gw, gh, st);
      p.line(x + nameW, gb, x + nameW, bt, st);
      for (d = 1; d < nd; d++) p.line(x + nameW + d * cell, gb, x + nameW + d * cell, bt, st);
      for (var r = 0; r < rows; r++) p.line(x, bt - hdr - r * rowH, x + gw, bt - hdr - r * rowH, st);
    });
  }
  function recipe(p, o, A) {
    var x = A.x, w = A.w, top = A.y + A.h, s = COLLEGE;
    fieldRow(p, o, x, top - 15, w, [{ t: 'Recipe ' }, { blank: 1 }], 14, true);
    var y = top - 40;
    fieldRow(p, o, x, y, w, [{ t: 'Serves ' }, { blank: 1 }, { t: '   Prep ' }, { blank: 1 }, { t: '   Cook ' }, { blank: 1 }], 9, false);
    y -= 22;
    p.text('Rating', x, y, 9, { c: LABEL });
    var rx = x + p.measure('Rating', 9, false) + 10;
    for (var k = 0; k < 5; k++) star(p, o, rx + k * 16 + 6, y + 3, 6);
    y -= 22;
    var bottom = A.y, notesH = Math.max(3 * s + 18, (y - bottom) * 0.16), mid = bottom + notesH + 10;
    if (w >= 4.2 * IN) {
      var iw = (w - 16) * 0.4, dx = x + iw + 16;
      sectionLabel(p, 'Ingredients', x, y); sectionLabel(p, 'Directions', dx, y);
      linesDown(p, o, x, x + iw, y - 4, mid, s);
      linesDown(p, o, dx, x + w, y - 4, mid, s);
    } else {
      var ih = (y - mid) * 0.42;
      sectionLabel(p, 'Ingredients', x, y);
      linesDown(p, o, x, x + w, y - 4, y - ih, s);
      sectionLabel(p, 'Directions', x, y - ih - 14);
      linesDown(p, o, x, x + w, y - ih - 18, mid, s);
    }
    sectionLabel(p, 'Notes', x, bottom + notesH - 10);
    linesDown(p, o, x, x + w, bottom + notesH - 14, bottom, s);
  }
  function prompts(p, o, A) {
    var list = o.prompts, n = list.length, bh = A.h / n, s = COLLEGE, minLines = 99;
    list.forEach(function (t, i) {
      var by = A.y + A.h - i * bh;
      var ls = wrap(p, t, A.w, 9.5, true);
      ls.forEach(function (l, j) { p.text(l, A.x, by - 11 - j * 12, 9.5, { bold: true, c: LABEL }); });
      var n2 = linesDown(p, o, A.x, A.x + A.w, by - 11 - (ls.length - 1) * 12 - 4, by - bh + 6, s);
      minLines = Math.min(minLines, n2);
    });
    return minLines;
  }
  function logTable(p, o, A) {
    var x = A.x, w = A.w, y = A.y + A.h;
    if (o.logTitle) { p.text(o.logTitle, x, y - 13, 12, { bold: true }); y -= 24; }
    var cols = o.logCols, sum = cols.reduce(function (a, c) { return a + c.w; }, 0);
    var hdr = 18, rowH = o.logRow, rows = Math.max(1, Math.floor((y - A.y - hdr) / rowH + 1e-6));
    var th = hdr + rows * rowH, tb = y - th, st = { c: o.lineC, w: o.lineW };
    p.rect(x, y - hdr, w, hdr, { fill: FILL });
    var cx = x;
    cols.forEach(function (c, i) {
      var cw = w * c.w / sum;
      if (c.label) {
        var size = fitSize(p, c.label, cw - 6, 8, 5.5, true);
        p.text(c.label, cx + 3, y - hdr + 6, size, { bold: true });
      }
      if (i) p.line(cx, tb, cx, y, st);
      cx += cw;
    });
    p.rect(x, tb, w, th, st);
    p.line(x, y - hdr, x + w, y - hdr, { c: o.lineC, w: o.lineW * 1.5 });
    for (var r = 1; r < rows; r++) p.line(x, y - hdr - r * rowH, x + w, y - hdr - r * rowH, st);
  }

  // Everything that repeats on each page of a style (goes into the reusable template).
  function drawTemplate(p, o, style, G) {
    var A = area(o, style, G), info = {};
    if (o.header.on && HEADER_OK[style]) {
      var L = G.live;
      fieldRow(p, o, L.x, L.y + L.h - 13, L.w, parseFields(o.header.text), 10, false);
    }
    switch (style) {
      case 'college': info.lines = ruled(p, o, A, G, COLLEGE); break;
      case 'wide': info.lines = ruled(p, o, A, G, WIDE); break;
      case 'narrow': info.lines = ruled(p, o, A, G, NARROW); break;
      case 'custom': info.lines = ruled(p, o, A, G, o.ruleSp); break;
      case 'dot': dots(p, o, A, G); break;
      case 'graph': graph(p, o, A, G); break;
      case 'handwriting': handwriting(p, o, A); break;
      case 'music': music(p, o, A); break;
      case 'daily': daily(p, o, A); break;
      case 'weekly': weekly(p, o, A); break;
      case 'habit': habit(p, o, A); break;
      case 'recipe': recipe(p, o, A); break;
      case 'prompts': info.promptLines = prompts(p, o, A); break;
      case 'log': logTable(p, o, A); break;
    }
    return info;
  }
  function titlePage(p, o, G) {
    var L = G.live, cx = L.x + L.w / 2, lw = Math.min(L.w * 0.85, 4 * IN);
    var size = fitSize(p, o.title.text, L.w, 18, 10, true);
    var y = L.y + L.h * 0.6;
    wrap(p, o.title.text, L.w, size, true).forEach(function (l, i) { p.text(l, cx, y - i * size * 1.25, size, { bold: true, align: 'center', c: { g: 0.1 } }); });
    y -= size * 1.25 * (wrap(p, o.title.text, L.w, size, true).length - 1);
    p.line(cx - lw / 2, y - 44, cx + lw / 2, y - 44, LS(o));
    y -= 44;
    o.title.lines.forEach(function (t) {
      y -= 34;
      p.text(t, cx - lw / 2, y + 14, 9, { c: SOFT });
      p.line(cx - lw / 2, y - 4, cx + lw / 2, y - 4, LS(o));
    });
  }
  function pageNumber(p, o, G) {
    var L = G.live, s = String(G.n), y = L.y + 2;
    if (o.nums.pos === 'center') p.text(s, L.x + L.w / 2, y, 8.5, { align: 'center', c: SOFT });
    else if (G.right) p.text(s, L.x + L.w, y, 8.5, { align: 'right', c: SOFT });
    else p.text(s, L.x, y, 8.5, { c: SOFT });
  }
  function numbered(o, kind) { return o.nums.on && kind !== 'title' && kind !== 'void'; }

  /* ---------- preview ---------- */
  var canvas = $('#ji-canvas'), box = $('#ji-box');
  var fontReady = false;
  (function loadPreviewFont() {
    if (!window.FontFace || !document.fonts) return;
    Promise.all([BL.fontBytes('AtkinsonHyperlegible-Regular.ttf'), BL.fontBytes('AtkinsonHyperlegible-Bold.ttf')]).then(function (b) {
      var r = new FontFace('BLAtkinson', b[0], { weight: '400' }), bd = new FontFace('BLAtkinson', b[1], { weight: '700' });
      return Promise.all([r.load(), bd.load()]).then(function (f) { f.forEach(function (x) { document.fonts.add(x); }); });
    }).then(function () { fontReady = true; schedule(); }, function () { /* falls back to the system font in the preview only */ });
  })();

  var last = null;
  function slots(o, total) {
    var v = BL.radio('view'), sp = $('#ji-spread');
    if (v === 'page') {
      sp.min = 1; sp.max = total;
      var n = clamp(+sp.value || 1, 1, total); sp.value = n;
      $('#ji-where').textContent = 'Page ' + n + ' of ' + total;
      return [n];
    }
    sp.min = 0; sp.max = total / 2;
    var k = clamp(+sp.value, 0, total / 2); sp.value = k;
    var l = 2 * k, r = 2 * k + 1;
    var a = l >= 2 ? l : null, b = r <= total ? r : null;
    $('#ji-where').textContent = a && b ? 'Pages ' + a + '–' + b + ' of ' + total : a ? 'Page ' + a + ' of ' + total : 'Page ' + b + ' of ' + total;
    return [a, b];
  }
  function render() {
    pending = false;
    var o = readOpts(), pl = plan(o);
    last = { o: o, pl: pl };
    syncUi(o);
    var list = slots(o, o.pages);
    var G0 = geo(o, 1);
    var availW = Math.max(200, box.clientWidth - 22);
    var maxH = Math.max(260, Math.min(window.innerHeight * 0.68, 720));
    var s = Math.min(availW / (list.length * G0.W), maxH / G0.H);
    var cssW = list.length * G0.W * s, cssH = G0.H * s, dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    var info = {}, sides = [];
    list.forEach(function (n, i) {
      var ox = i * G0.W * s;
      if (!n) {
        ctx.fillStyle = 'rgba(128,128,128,.18)'; ctx.fillRect(ox, 0, G0.W * s, cssH);
        ctx.fillStyle = 'rgba(90,90,90,.9)'; ctx.font = fontCss(12, false); ctx.textAlign = 'center';
        ctx.fillText(i === 0 ? 'Inside front cover' : 'Inside back cover', ox + G0.W * s / 2, cssH / 2); ctx.textAlign = 'left';
        sides.push('');
        return;
      }
      var G = geo(o, n), kind = pl.seq[n - 1];
      ctx.fillStyle = '#fff'; ctx.fillRect(ox, 0, G.W * s, cssH);
      var p = canvasPainter(ctx, ox, 0, s, G.H);
      try {
        if (kind === 'title') titlePage(p, o, G);
        else if (kind !== 'void') { var inf = drawTemplate(p, o, kind, G); if (inf.lines) info.lines = inf.lines; if (inf.promptLines !== undefined) info.promptLines = inf.promptLines; }
        if (numbered(o, kind)) pageNumber(p, o, G);
      } catch (e) { BL.fail(e, $('#ji-msg')); }
      if ($('#ji-guides').checked) guides(ctx, ox, s, G, o);
      sides.push('Page ' + n + (G.right ? ' · right-hand, gutter on the left' : ' · left-hand, gutter on the right') + (kind === 'title' ? ' · title page' : kind === 'void' ? ' · left blank' : ''));
    });
    if (list.length === 2) {
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(G0.W * s, 0); ctx.lineTo(G0.W * s, cssH); ctx.stroke();
    }
    $('#ji-sides').innerHTML = sides.map(function (t) { return '<span>' + BL.esc(t) + '</span>'; }).join('');
    showStats(o, pl, info);
  }
  function guides(ctx, ox, s, G, o) {
    function X(x) { return ox + x * s; }
    function Y(y) { return (G.H - y) * s; }
    var T = G.trim, L = G.live;
    ctx.save();
    ctx.setLineDash([]);
    // Margin zone: between the trim and the safe area.
    ctx.fillStyle = 'rgba(234,179,8,.20)';
    ctx.beginPath(); ctx.rect(X(T.x), Y(T.y + T.h), T.w * s, T.h * s); ctx.rect(X(L.x), Y(L.y + L.h), L.w * s, L.h * s); ctx.fill('evenodd');
    // Gutter: the inside margin, next to the spine.
    ctx.fillStyle = 'rgba(124,58,237,.20)';
    if (G.right) ctx.fillRect(X(T.x), Y(T.y + T.h), (L.x - T.x) * s, T.h * s);
    else ctx.fillRect(X(L.x + L.w), Y(T.y + T.h), (T.x + T.w - L.x - L.w) * s, T.h * s);
    if (o.bleed) {
      ctx.fillStyle = 'rgba(220,38,38,.18)';
      ctx.beginPath(); ctx.rect(X(0), Y(G.H), G.W * s, G.H * s); ctx.rect(X(T.x), Y(T.y + T.h), T.w * s, T.h * s); ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(180,30,30,.8)'; ctx.lineWidth = 1;
      ctx.strokeRect(X(T.x), Y(T.y + T.h), T.w * s, T.h * s);
    }
    ctx.strokeStyle = '#0f766e'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
    ctx.strokeRect(X(L.x), Y(L.y + L.h), L.w * s, L.h * s);
    ctx.restore();
  }

  function stat(k, v, sub, hi) { return '<div class="stat' + (hi ? ' hi' : '') + '"><div class="k">' + k + '</div><div class="v" style="font-size:1.05rem">' + v + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>'; }
  function showStats(o, pl, info) {
    var G = geo(o, 1), gut = K.insideMargin(o.pages);
    var wIn = G.W / IN, hIn = G.H / IN;
    var sw = o.pages * SPINE.white, sc = o.pages * SPINE.cream;
    var html = stat('PDF page size', f2(wIn) + ' × ' + f2(hIn) + ' in', f2(G.W, 1) + ' × ' + f2(G.H, 1) + ' pt' + (o.bleed ? ' · with bleed' : ''));
    html += stat('Pages', String(o.pages), 'page 1 is a right-hand page');
    html += stat('Inside margin (gutter)', f2(gut) + ' in', 'KDP minimum for ' + o.pages + ' pages, + ' + f2(o.extra) + ' in extra');
    if (info.lines) html += stat('Writing lines', info.lines + ' per page');
    html += stat('Spine, white paper', f2(sw, 3) + ' in', BL.fmt(sw * 25.4, 2) + ' mm', true);
    html += stat('Spine, cream paper', f2(sc, 3) + ' in', BL.fmt(sc * 25.4, 2) + ' mm', true);
    $('#ji-stats').innerHTML = html;
    $('#ji-cover-link').innerHTML = 'Making the cover? Use these numbers in the <a href="' + BL.root + 'kdp-cover-calculator/">KDP cover calculator</a>.' + (o.pages <= 79 ? ' At ' + o.pages + ' pages the spine is too thin for spine text (KDP allows it above 79 pages).' : '');

    var msgs = [];
    o.errors.forEach(function (m) { msgs.push('<div class="note err">' + BL.esc(m) + '</div>'); });
    o.warns.forEach(function (m) { msgs.push('<div class="note warn">' + m + '</div>'); });
    if (info.promptLines !== undefined && info.promptLines < 2) msgs.push('<div class="note warn">There is room for only ' + info.promptLines + ' writing line under some prompts. Use fewer prompts or a larger trim size.</div>');
    o.notes.forEach(function (m) { msgs.push('<div class="note">' + BL.esc(m) + '</div>'); });
    $('#ji-msg').innerHTML = msgs.join('');

    if (sections.length > 1 || o.title.on) {
      $('#ji-summary').textContent = pl.ranges.map(function (r) { return (r.from === r.to ? 'p. ' + r.from : 'pp. ' + r.from + '–' + r.to) + ' ' + r.label.toLowerCase(); }).join(' · ');
    } else $('#ji-summary').textContent = '';
    var rest = $('#sec-rest');
    if (rest) { var lr = pl.ranges[pl.ranges.length - 1]; rest.textContent = lr && lr.style ? 'rest: ' + (lr.to - lr.from + 1) + ' pp.' : 'no pages left'; }

    var uses = proUses(o), pro = BL.pro.active(), pb = $('#ji-pro');
    if (uses.length && !pro) {
      pb.hidden = false;
      pb.innerHTML = '<p><strong>This book uses Pro features:</strong> ' + BL.esc(uses.join(', ')) + '.</p><p>Previewing is free. Exporting them needs Bleedline Pro, or switch to the free styles (ruled, dot grid, graph, blank) and turn off the title page and page numbers to download free.</p>' +
        '<button type="button" class="btn pro" data-pro-open="Unlock Pro page styles, title pages, page numbers and mixed books in the journal maker.">Unlock Pro</button>';
    } else pb.hidden = true;
    var dl = $('#ji-dl');
    if (!busy) { dl.disabled = !!o.errors.length; dl.textContent = (uses.length && !pro ? 'Download PDF (Pro)' : 'Download PDF') + ' · ' + o.pages + ' pages'; }
  }
  function proUses(o) {
    var u = [], seen = {};
    o.sections.forEach(function (s) { if (S[s.style].pro && !seen[s.style]) { seen[s.style] = 1; u.push(S[s.style].name.replace(/ \(.*\)$/, '').toLowerCase()); } });
    if (o.sections.length > 1) u.push('mixed sections');
    if (o.title.on) u.push('title page');
    if (o.nums.on) u.push('page numbers');
    return u;
  }
  function syncUi(o) {
    $('#tint-f').hidden = o.lineMode === 'color';
    $('#color-f').hidden = o.lineMode !== 'color';
    $('#tint-out').textContent = Math.round(o.tint * 100) + '%';
    $('#hdr-f').hidden = !o.header.on;
    $('#title-f').hidden = !o.title.on;
    $('#num-f').hidden = !o.nums.on;
    var fb = $('#fullbleed');
    fb.closest('label').style.opacity = o.bleed ? '' : '.6';
    BL.$$('[data-for]').forEach(function (el) {
      el.hidden = !el.getAttribute('data-for').split(' ').some(function (k) { return o.used[k]; });
    });
    $('#line-msg').innerHTML = '';
  }

  var pending = false;
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(render); } }

  /* ---------- export ---------- */
  var busy = false;
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function setProgress(frac, text) {
    var bar = $('#ji-progress .progress');
    bar.firstElementChild.style.width = Math.round(frac * 100) + '%';
    bar.setAttribute('aria-valuenow', Math.round(frac * 100));
    $('#ji-progress-text').textContent = text;
  }
  async function exportPdf() {
    if (busy) return;
    var o = readOpts(), pl = plan(o), out = $('#ji-done');
    out.innerHTML = '';
    if (o.errors.length) { BL.fail(new Error(o.errors[0]), out); return; }
    var uses = proUses(o);
    if (uses.length && !BL.pro.gate(true, 'This book uses Pro features: ' + uses.join(', ') + '. Unlock Pro to download it, or switch to the free page styles.')) return;
    busy = true;
    var btn = $('#ji-dl'); btn.disabled = true;
    $('#ji-progress').hidden = false; setProgress(0, 'Preparing…');
    var t0 = performance.now();
    try {
      var L = await BL.pdfLib(true);
      var doc = await L.PDFDocument.create();
      doc.setTitle('Journal interior ' + o.trim.w + 'x' + o.trim.h + ' in, ' + o.pages + ' pages');
      doc.setProducer('Bleedline'); doc.setCreator('Bleedline journal interior maker');

      // 1. Templates: one page per (style, side), drawn in a scratch document and embedded as Form XObjects.
      var styles = [], seen = {};
      pl.seq.forEach(function (k) { if (k !== 'title' && k !== 'void' && !seen[k]) { seen[k] = 1; styles.push(k); } });
      var needFont = styles.some(function (k) { return HAS_TEXT[k] || (o.header.on && HEADER_OK[k]); });
      var tmpl = {};
      if (styles.length) {
        var tdoc = await L.PDFDocument.create();
        var tfonts = needFont ? await BL.embedFonts(tdoc) : null;
        var keys = [];
        styles.forEach(function (k) {
          [1, 2].forEach(function (n) {
            var G = geo(o, n), pg = tdoc.addPage([G.W, G.H]);
            drawTemplate(pdfPainter(L, pg, tfonts), o, k, G);
            keys.push(k + (n === 1 ? 'R' : 'L'));
          });
        });
        var tbytes = await tdoc.save();
        var emb = await doc.embedPdf(tbytes, keys.map(function (_, i) { return i; }));
        keys.forEach(function (k, i) { tmpl[k] = emb[i]; });
      }
      // 2. Fonts for per-page text, only when there is any.
      var fonts = (o.title.on || o.nums.on) ? await BL.embedFonts(doc) : null;

      // 3. Pages, in chunks so the tab stays responsive.
      var CHUNK = 40;
      for (var i = 0; i < o.pages; i++) {
        var n = i + 1, G = geo(o, n), kind = pl.seq[i];
        var page = doc.addPage([G.W, G.H]);
        if (o.bleed) { page.setBleedBox(0, 0, G.W, G.H); page.setTrimBox(G.trim.x, G.trim.y, G.trim.w, G.trim.h); }
        if (kind === 'title') titlePage(pdfPainter(L, page, fonts), o, G);
        else if (kind !== 'void') page.drawPage(tmpl[kind + (G.right ? 'R' : 'L')], { x: 0, y: 0 });
        if (numbered(o, kind)) pageNumber(pdfPainter(L, page, fonts), o, G);
        if (i % CHUNK === CHUNK - 1) { setProgress(0.85 * (i + 1) / o.pages, 'Drawing page ' + (i + 1) + ' of ' + o.pages + '…'); await tick(); }
      }
      setProgress(0.88, 'Saving the PDF…'); await tick();
      var bytes = await doc.save({ objectsPerTick: 400 });
      setProgress(1, 'Done');
      var secs = (performance.now() - t0) / 1000;
      var name = 'journal-interior-' + o.trim.id + '-' + o.pages + 'p' + (o.bleed ? '-bleed' : '') + '.pdf';
      BL.download(new Blob([bytes], { type: 'application/pdf' }), name);
      BL.track('journal-pdf', (sections.length > 1 ? 'mixed' : sections[0].style));
      out.innerHTML = '<div class="note ok">Made ' + o.pages + ' pages in ' + BL.fmt(secs, 1) + ' s (' + BL.fmt(bytes.length / 1048576, 2) + ' MB). Upload <strong>' + BL.esc(name) + '</strong> as your manuscript, choose ' + BL.esc(o.trim.w + ' × ' + o.trim.h) + ' in and ' + (o.bleed ? '"Bleed (PDF only)"' : '"No bleed"') + ' in KDP.</div>';
    } catch (e) {
      BL.fail(e, out);
    } finally {
      busy = false; btn.disabled = false;
      setTimeout(function () { $('#ji-progress').hidden = true; }, 1200);
      schedule();
    }
  }

  /* ---------- wiring ---------- */
  $('#trim').innerHTML = K.trims.map(function (t) { return '<option value="' + t.id + '"' + (t.id === '6x9' ? ' selected' : '') + '>' + BL.esc(t.label) + '</option>'; }).join('');
  function hourOpts(sel, from, to, def) {
    var h = '';
    for (var i = from; i <= to; i++) h += '<option value="' + i + '"' + (i === def ? ' selected' : '') + '>' + hourLabel({ clock: '12' }, i) + '</option>';
    $(sel).innerHTML = h;
  }
  hourOpts('#day-from', 4, 11, 6); hourOpts('#day-to', 14, 23, 21);

  var form = $('#ji-form');
  BL.persist(form, 'journal-interior');
  renderSections();
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  $('#log-preset').addEventListener('change', function () {
    var p = LOG_PRESETS[this.value];
    if (p) { $('#log-title').value = p[0]; $('#log-cols').value = p[1]; form.dispatchEvent(new Event('change')); }
  });
  $('#log-cols').addEventListener('input', function () { $('#log-preset').value = 'custom'; });
  BL.$$('input[name=view]').forEach(function (r) {
    r.addEventListener('change', function () {
      var sp = $('#ji-spread'), cur = +sp.value;
      sp.max = 828;
      // Keep roughly the same place in the book when switching views.
      sp.value = this.value === 'page' ? Math.max(1, cur * 2) : Math.floor(cur / 2);
      schedule();
    });
  });
  $('#ji-spread').addEventListener('input', schedule);
  $('#ji-guides').addEventListener('change', schedule);
  $('#ji-prev').addEventListener('click', function () { var sp = $('#ji-spread'); sp.value = +sp.value - 1; schedule(); });
  $('#ji-next').addEventListener('click', function () { var sp = $('#ji-spread'); sp.value = +sp.value + 1; schedule(); });
  $('#ji-dl').addEventListener('click', exportPdf);
  window.addEventListener('resize', schedule);
  BL.pro.onChange(schedule);
  render();

})();
