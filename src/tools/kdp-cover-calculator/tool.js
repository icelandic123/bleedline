/* KDP cover calculator: spine width, full cover size and a downloadable template.
   The math lives in calc.js (BL.cover). One display list (inches, y down) is drawn
   three ways: inline SVG for the preview, canvas for the 300 DPI PNG, pdf-lib for the PDF. */
(function () {
  var BL = window.BL, $ = BL.$, C = BL.cover, K = BL.kdp;
  var form = $('#cv-form');
  var current = null;   // last valid layout
  var art = null;       // {url, width, height, name}
  var activeZone = null;

  // Template colours [r, g, b, alpha]. The template is printed-paper artwork, so fixed colours are fine.
  var COL = {
    white: [255, 255, 255, 1], bleed: [225, 29, 72, 0.16], bleedInk: [190, 18, 60, 1],
    trim: [17, 24, 39, 1], fold: [37, 99, 235, 1], foldBand: [37, 99, 235, 0.1],
    safe: [22, 163, 74, 1], barcodeFill: [253, 230, 138, 0.55], barcode: [180, 83, 9, 1],
    title: [156, 163, 175, 1], text: [31, 41, 55, 1], sub: [75, 85, 99, 1]
  };
  function css(c) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + c[3] + ')'; }
  var LW = 0.01; // line width in inches (0.72 pt)

  /* ---------- units ---------- */
  function unit() { return BL.radio('units') || 'in'; }
  function strip(s) { return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
  function conv(inches, u) { return u === 'mm' ? inches * 25.4 : u === 'cm' ? inches * 2.54 : inches; }
  function num(inches, u) { u = u || unit(); return strip(conv(inches, u).toFixed(u === 'mm' ? 2 : u === 'cm' ? 3 : 4)); }
  function len(inches, u) { u = u || unit(); return num(inches, u) + ' ' + u; }
  function dims(w, h, u) { u = u || unit(); return num(w, u) + ' × ' + num(h, u) + ' ' + u; }
  function altUnit() { return unit() === 'in' ? 'mm' : 'in'; }
  function px(inches, dpi) { return C.pixels(inches, dpi || 300); }

  /* ---------- form setup ---------- */
  var trimSel = $('#trim'), paperSel = $('#paper'), pagesEl = $('#pages');
  function fillTrims(format) {
    var keep = trimSel.value;
    trimSel.innerHTML = K.trims.filter(function (t) { return !format || (format === 'hardcover' ? t.hardcover : t.paperback); })
      .map(function (t) { return '<option value="' + t.id + '">' + BL.esc(t.label) + '</option>'; }).join('');
    trimSel.value = keep;
    if (!keep || trimSel.value !== keep) trimSel.value = '6x9';
    if (!trimSel.value) trimSel.selectedIndex = 0;
  }
  function syncPapers() {
    var format = BL.radio('format'), trim = K.trim(trimSel.value);
    Array.prototype.forEach.call(paperSel.options, function (o) {
      var lim = C.limits(trim, o.value, format);
      o.disabled = !!lim.error;
      o.textContent = C.paperName[o.value] + (lim.error ? ' (not available)' : '');
    });
    if (paperSel.selectedOptions[0] && paperSel.selectedOptions[0].disabled) paperSel.value = 'white';
  }

  fillTrims(null);              // every trim, so a saved value can be restored
  BL.persist(form, 'kdp-cover');
  (function applyUrl() {
    var q = new URLSearchParams(location.search);
    if (q.get('format') === 'hardcover' || q.get('format') === 'paperback') form.querySelector('input[name=format][value=' + q.get('format') + ']').checked = true;
    if (q.get('trim') && K.trims.some(function (t) { return t.id === q.get('trim'); })) trimSel.value = q.get('trim');
    if (q.get('pages') && /^\d{1,4}$/.test(q.get('pages'))) pagesEl.value = q.get('pages');
    if (q.get('paper') && C.factor[q.get('paper')]) paperSel.value = q.get('paper');
    if (/^(in|mm|cm)$/.test(q.get('units') || '')) form.querySelector('input[name=units][value=' + q.get('units') + ']').checked = true;
  })();
  fillTrims(BL.radio('format'));
  syncPapers();

  /* ---------- display list ---------- */
  function rect(list, r, fill, zone) { list.push({ t: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, fill: fill, zone: zone }); }
  function line(list, x1, y1, x2, y2, stroke, dash) { list.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, stroke: stroke, sw: LW, dash: dash || null }); }
  function box(list, r, stroke, dash) {
    line(list, r.x, r.y, r.x + r.w, r.y, stroke, dash); line(list, r.x + r.w, r.y, r.x + r.w, r.y + r.h, stroke, dash);
    line(list, r.x + r.w, r.y + r.h, r.x, r.y + r.h, stroke, dash); line(list, r.x, r.y + r.h, r.x, r.y, stroke, dash);
  }
  function text(list, s, x, y, pt, o) {
    o = o || {};
    list.push({ t: 'text', s: s, x: x, y: y, size: pt / 72, bold: !!o.bold, anchor: o.anchor || 'start', rot: o.rot || 0, fill: o.fill || COL.text });
  }
  function bleedBands(L) {
    var b = C.bleed;
    return [{ x: 0, y: 0, w: L.width, h: b }, { x: 0, y: L.height - b, w: L.width, h: b },
      { x: 0, y: b, w: b, h: L.height - 2 * b }, { x: L.width - b, y: b, w: b, h: L.height - 2 * b }];
  }

  function buildList(L, o) {
    var list = [], b = C.bleed, tw = L.trim.w, th = L.trim.h, s = L.spine;
    if (o.white) rect(list, { x: 0, y: 0, w: L.width, h: L.height }, COL.white);
    if (o.image) list.push({ t: 'image' });
    if (o.guides === false) return list;
    bleedBands(L).forEach(function (r) { rect(list, r, COL.bleed); });
    L.folds.forEach(function (x) { rect(list, { x: x - C.foldVariance, y: b, w: 2 * C.foldVariance, h: th }, COL.foldBand); });
    rect(list, L.barcode, COL.barcodeFill);
    box(list, L.barcode, COL.barcode);
    var dash = [0.06, 0.04];
    box(list, L.backSafe, COL.safe, dash);
    box(list, L.frontSafe, COL.safe, dash);
    if (L.spineSafe) box(list, L.spineSafe, COL.safe, [0.02, 0.03]);
    L.folds.forEach(function (x) { line(list, x, 0, x, L.height, COL.fold, [0.1, 0.05]); });
    box(list, L.trimBox, COL.trim);
    if (!o.labels) return list;

    // Labels.
    var cxB = L.back.x + tw / 2, cxF = L.front.x + tw / 2;
    var titlePt = Math.min(22, tw * 4);
    var y = b + th * 0.2;
    text(list, 'BACK COVER', cxB, y, titlePt, { bold: true, anchor: 'middle', fill: COL.title });
    text(list, 'FRONT COVER', cxF, y, titlePt, { bold: true, anchor: 'middle', fill: COL.title });
    var pt = 8.5, lh = pt * 1.5 / 72, ly = y + titlePt / 72 * 0.9;
    [L.trim.w + ' × ' + L.trim.h + ' in trim · ' + L.pages + ' pages',
      C.paperName[L.paper],
      'Spine ' + len(s, 'in') + ' (' + len(s, 'mm') + ')',
      'Full cover ' + dims(L.width, L.height, 'in') + ' (' + dims(L.width, L.height, 'mm') + ')',
      px(L.width) + ' × ' + px(L.height) + ' px at 300 DPI'
    ].forEach(function (s2, i) { text(list, s2, cxB, ly + i * lh, pt, { anchor: 'middle', fill: i ? COL.sub : COL.text, bold: i === 0 }); });

    // Legend on the front cover.
    var lx = cxF - 1.45, lpt = 8, llh = lpt * 1.75 / 72;
    var rows = [
      ['trim', 'Trim line: the cover is cut here'],
      ['bleed', 'Bleed 0.125 in: run background to the file edge'],
      ['fold', 'Spine fold: may shift 0.0625 in either way'],
      ['safe', 'Safe area: keep text 0.125 in inside trim'],
      ['barcode', 'Barcode area 2 × 1.2 in: keep clear']
    ];
    rows.forEach(function (r, i) {
      var ry = ly + i * llh, sy = ry - lpt / 72 * 0.32;
      if (r[0] === 'trim') line(list, lx, sy, lx + 0.3, sy, COL.trim);
      if (r[0] === 'bleed') rect(list, { x: lx, y: sy - 0.04, w: 0.3, h: 0.08 }, [225, 29, 72, 0.35]);
      if (r[0] === 'fold') line(list, lx, sy, lx + 0.3, sy, COL.fold, [0.07, 0.035]);
      if (r[0] === 'safe') line(list, lx, sy, lx + 0.3, sy, COL.safe, [0.05, 0.03]);
      if (r[0] === 'barcode') { rect(list, { x: lx, y: sy - 0.04, w: 0.3, h: 0.08 }, COL.barcodeFill); box(list, { x: lx, y: sy - 0.04, w: 0.3, h: 0.08 }, COL.barcode); }
      text(list, r[1], lx + 0.4, ry, lpt, { fill: COL.text });
    });
    text(list, 'Hide or delete this template layer before you export.', cxF, ly + rows.length * llh + 0.08, lpt, { anchor: 'middle', bold: true, fill: COL.bleedInk });

    // Spine.
    var sc = L.folds[0] + s / 2;
    if (s >= 0.17) {
      var spt = Math.min(8, s * 72 * 0.45);
      var label = 'SPINE ' + len(s, 'in') + ' · ' + len(s, 'mm') + (L.spineText ? '' : ' · no spine text under 80 pages');
      text(list, label, sc - spt / 72 * 0.35, b + th / 2, spt, { anchor: 'middle', rot: 90, bold: true, fill: COL.fold });
    } else {
      text(list, 'Spine (left of this fold): ' + len(s, 'in') + ', too thin for text', L.front.x + C.safe + 0.06, b + C.safe + 0.2, 7, { fill: COL.fold, bold: true });
    }

    // Barcode box.
    var bc = L.barcode, bx = bc.x + bc.w / 2;
    text(list, 'BARCODE AREA', bx, bc.y + 0.48, 7.5, { anchor: 'middle', bold: true, fill: COL.barcode });
    text(list, '2 × 1.2 in · keep clear', bx, bc.y + 0.66, 6.5, { anchor: 'middle', fill: COL.barcode });
    text(list, 'KDP prints the barcode here', bx, bc.y + 0.82, 6.5, { anchor: 'middle', fill: COL.barcode });

    // Bleed note in the bottom bleed band (trimmed off).
    text(list, 'Bleed: trimmed off. Bleedline KDP cover template, not a print file.', b + 0.12, L.height - 0.04, 5, { fill: COL.bleedInk });
    return list;
  }

  // Where a text item starts, given its measured width (inches).
  function textStart(it, w) {
    var off = it.anchor === 'middle' ? w / 2 : it.anchor === 'end' ? w : 0;
    return it.rot === 90 ? { x: it.x, y: it.y - off } : { x: it.x - off, y: it.y };
  }

  /* ---------- SVG (preview) ---------- */
  var FONT = "BLAtkinson, 'Atkinson Hyperlegible', system-ui, sans-serif";
  function f4(n) { return Math.round(n * 10000) / 10000; }
  function svgItems(list) {
    return list.map(function (it) {
      if (it.t === 'rect') return '<rect x="' + f4(it.x) + '" y="' + f4(it.y) + '" width="' + f4(it.w) + '" height="' + f4(it.h) + '" fill="' + css(it.fill) + '"/>';
      if (it.t === 'line') return '<line x1="' + f4(it.x1) + '" y1="' + f4(it.y1) + '" x2="' + f4(it.x2) + '" y2="' + f4(it.y2) + '" stroke="' + css(it.stroke) + '" stroke-width="' + it.sw + '"' + (it.dash ? ' stroke-dasharray="' + it.dash.join(' ') + '"' : '') + '/>';
      if (it.t === 'image') return art ? artSvg() : '';
      var anchor = it.anchor === 'middle' ? 'middle' : it.anchor === 'end' ? 'end' : 'start';
      return '<text x="' + f4(it.x) + '" y="' + f4(it.y) + '" font-size="' + f4(it.size) + '" font-family="' + FONT + '"' + (it.bold ? ' font-weight="700"' : '') +
        ' fill="' + css(it.fill) + '" text-anchor="' + anchor + '"' + (it.rot ? ' transform="rotate(90 ' + f4(it.x) + ' ' + f4(it.y) + ')"' : '') + '>' + BL.esc(it.s) + '</text>';
    }).join('');
  }
  function artSvg() {
    var L = current, front = BL.radio('artmode') === 'front';
    var x = front ? L.folds[1] : 0, w = front ? L.panelWithBleed.w : L.width;
    return '<image href="' + art.url + '" x="' + f4(x) + '" y="0" width="' + f4(w) + '" height="' + f4(L.height) + '" preserveAspectRatio="xMidYMid slice"/>';
  }

  function zones(L) {
    var b = C.bleed, tw = L.trim.w, th = L.trim.h, s = L.spine, sc = L.folds[0] + s / 2, hitW = Math.max(s, 0.24);
    var z = [
      { id: 'back', name: 'Back cover', rects: [L.back], hit: true,
        info: 'Back cover: ' + dims(tw, th) + ' at the trim, ' + dims(tw + b, th + 2 * b) + ' with bleed. It runs from the left edge of the file to the spine fold at ' + len(L.folds[0]) + '.' },
      { id: 'front', name: 'Front cover', rects: [L.front], hit: true,
        info: 'Front cover: ' + dims(tw, th) + ' at the trim, ' + dims(tw + b, th + 2 * b) + ' with bleed (' + px(tw + b) + ' × ' + px(th + 2 * b) + ' px at 300 DPI). It starts at the right spine fold, ' + len(L.folds[1]) + ' from the left edge.' },
      { id: 'spine', name: 'Spine', rects: [{ x: sc - hitW / 2, y: b, w: hitW, h: th }], hit: true,
        info: 'Spine: ' + len(s) + ' wide (' + L.pages + ' pages × ' + C.factor[L.paper] + ' in). The folds are ' + len(L.folds[0]) + ' and ' + len(L.folds[1]) + ' from the left edge of the file. ' +
          (L.spineText ? 'Spine text is allowed; keep it ' + len(C.spineClear) + ' clear of each fold.' : 'No spine text: KDP needs more than 79 pages.') },
      { id: 'bleed', name: 'Bleed', rects: bleedBands(L), hit: true,
        info: 'Bleed: ' + len(b) + ' beyond the trim on all four sides. Extend background colour and images into it. It is cut off, so keep anything important out of it.' },
      { id: 'barcode', name: 'Barcode area', rects: [L.barcode], hit: true,
        info: 'Barcode area: ' + dims(2, 1.2) + ', ' + len(0.25) + ' from the spine fold and the bottom trim. Its top-left corner is ' + len(L.barcode.x) + ' from the left and ' + len(L.barcode.y) + ' from the top of the file. KDP prints the barcode here if you use a KDP or your own ISBN, so keep it clear.' },
      { id: 'trim', name: 'Trim line', rects: [L.trimBox],
        info: 'Trim line: where the printed cover is cut. The trimmed cover is ' + dims(L.trimBox.w, th) + ' (back, spine and front without bleed).' },
      { id: 'fold', name: 'Spine folds', rects: L.folds.map(function (x) { return { x: x - C.foldVariance, y: b, w: 2 * C.foldVariance, h: th }; }),
        info: 'Spine folds at ' + len(L.folds[0]) + ' and ' + len(L.folds[1]) + ' from the left edge. The fold can land up to ' + len(C.foldVariance) + ' either way, so avoid hard edges or text right on it.' },
      { id: 'safe', name: 'Safe area', rects: [L.backSafe, L.frontSafe],
        info: 'Safe area: ' + dims(L.backSafe.w, L.backSafe.h) + ' on the front and on the back, ' + len(C.safe) + ' inside the trim and the folds. Keep all text and logos inside it.' }
    ];
    if (L.spineSafe) z.push({ id: 'spinetext', name: 'Spine text area', rects: [L.spineSafe],
      info: 'Spine text area: ' + dims(L.spineSafe.w, L.spineSafe.h) + ', ' + len(C.spineClear) + ' clear of each fold. That fits lettering up to about ' + Math.floor(L.spineSafe.w * 72) + ' pt tall across the spine.' });
    return z;
  }

  function renderPreview(L) {
    var W = L.width, H = L.height, fs = Math.max(W, H) / ($('#cv-preview').clientWidth < 520 ? 36 : 60);
    var mT = fs * 4.6, mL = fs * 2.6, mB = fs * 3.4, mR = fs * 0.6;
    var withArt = !!art, showGuides = !withArt || $('#art-guides').checked;
    var list = buildList(L, { white: true, image: withArt, labels: !withArt, guides: showGuides });
    var dim = [];
    function hline(x1, x2, y, label, ly) {
      dim.push('<line x1="' + f4(x1) + '" x2="' + f4(x2) + '" y1="' + f4(y) + '" y2="' + f4(y) + '"/>' +
        '<line x1="' + f4(x1) + '" x2="' + f4(x1) + '" y1="' + f4(y - fs * 0.4) + '" y2="' + f4(y + fs * 0.4) + '"/>' +
        '<line x1="' + f4(x2) + '" x2="' + f4(x2) + '" y1="' + f4(y - fs * 0.4) + '" y2="' + f4(y + fs * 0.4) + '"/>' +
        '<text x="' + f4((x1 + x2) / 2) + '" y="' + f4(ly) + '" text-anchor="middle">' + BL.esc(label) + '</text>');
    }
    var b = C.bleed;
    hline(0, W, -fs * 3.2, 'Full width with bleed: ' + len(W), -fs * 3.6);
    hline(b, L.folds[0], -fs * 1.2, 'Back ' + len(L.trim.w), -fs * 1.6);
    hline(L.folds[1], W - b, -fs * 1.2, 'Front ' + len(L.trim.w), -fs * 1.6);
    hline(L.folds[0], L.folds[1], H + fs * 1.1, 'Spine ' + len(L.spine), H + fs * 2.6);
    dim.push('<line x1="' + f4(-fs * 1.3) + '" x2="' + f4(-fs * 1.3) + '" y1="0" y2="' + f4(H) + '"/>' +
      '<line x1="' + f4(-fs * 1.7) + '" x2="' + f4(-fs * 0.9) + '" y1="0" y2="0"/><line x1="' + f4(-fs * 1.7) + '" x2="' + f4(-fs * 0.9) + '" y1="' + f4(H) + '" y2="' + f4(H) + '"/>' +
      '<text x="' + f4(-fs * 1.7) + '" y="' + f4(H / 2) + '" text-anchor="middle" transform="rotate(-90 ' + f4(-fs * 1.7) + ' ' + f4(H / 2) + ')">Height with bleed: ' + BL.esc(len(H)) + '</text>');
    var hits = zones(L).filter(function (z) { return z.hit; }).map(function (z) {
      return z.rects.map(function (r) {
        return '<rect class="hit" data-zone="' + z.id + '" tabindex="0" role="button" aria-label="' + BL.esc(z.name) + '" x="' + f4(r.x) + '" y="' + f4(r.y) + '" width="' + f4(r.w) + '" height="' + f4(r.h) + '"/>';
      }).join('');
    }).join('');
    $('#cv-preview').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + f4(-mL) + ' ' + f4(-mT) + ' ' + f4(W + mL + mR) + ' ' + f4(H + mT + mB) + '" role="group" aria-label="Cover template preview, ' + BL.esc(dims(W, H)) + '">' +
      '<g class="cv-dim" stroke="currentColor" stroke-width="' + f4(fs * 0.06) + '" fill="currentColor" font-size="' + f4(fs) + '" font-family="system-ui, sans-serif">' + dim.join('').replace(/<text /g, '<text stroke="none" ') + '</g>' +
      '<g>' + svgItems(list) + '</g><g id="cv-hl"></g><g>' + hits + '</g></svg>';
    highlight(activeZone);
  }

  function highlight(id) {
    activeZone = id;
    var g = $('#cv-hl'); if (!g || !current) return;
    var z = id && zones(current).filter(function (x) { return x.id === id; })[0];
    g.innerHTML = z ? z.rects.map(function (r) { return '<rect class="cv-hl" x="' + f4(r.x) + '" y="' + f4(r.y) + '" width="' + f4(r.w) + '" height="' + f4(r.h) + '"/>'; }).join('') : '';
    $('#cv-zone').textContent = z ? z.info : 'Hover over or tap any part of the template to see its exact size and position.';
    BL.$$('#cv-legend button').forEach(function (bt) { bt.setAttribute('aria-pressed', bt.dataset.zone === id ? 'true' : 'false'); });
  }

  function renderLegend(L) {
    var sw = { trim: 'trim', bleed: 'bleed', fold: 'fold', safe: 'safe', spinetext: 'spinetext', barcode: 'barcode' };
    $('#cv-legend').innerHTML = zones(L).map(function (z) {
      return '<button type="button" data-zone="' + z.id + '" aria-pressed="' + (activeZone === z.id) + '">' + (sw[z.id] ? '<span class="cv-sw ' + sw[z.id] + '"></span>' : '') + BL.esc(z.name) + '</button>';
    }).join('');
  }

  /* ---------- results ---------- */
  function stat(k, v, s, cls) { return '<div class="stat ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + BL.esc(v) + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>'; }

  function renderStats(L) {
    var a = altUnit(), b = C.bleed, tw = L.trim.w, th = L.trim.h;
    $('#cv-stats').innerHTML =
      stat('Spine width', len(L.spine), BL.esc(len(L.spine, a)) + ' · ' + L.pages + ' × ' + C.factor[L.paper] + ' in', 'hi cv-big') +
      stat('Full cover with bleed', dims(L.width, L.height), BL.esc(dims(L.width, L.height, a)) + '<br>your PDF page size', 'hi cv-key') +
      stat('Pixels at 300 DPI', px(L.width) + ' × ' + px(L.height) + ' px', '600 DPI: ' + px(L.width, 600) + ' × ' + px(L.height, 600) + ' px', 'cv-key') +
      stat('Front and back cover', dims(tw, th), 'with bleed: ' + BL.esc(dims(tw + b, th + 2 * b)), 'cv-key') +
      stat('Spine text', L.spineText ? 'Allowed' : 'Not allowed',
        L.spineText ? (L.spineSafe ? 'lettering up to ' + BL.esc(len(L.spineTextRoom)) + ' (' + Math.floor(L.spineTextRoom * 72) + ' pt) tall' : 'spine too narrow for lettering') : 'needs more than 79 pages', 'cv-key') +
      stat('Safe zones', len(C.safe) + ' inside trim', 'spine text ' + BL.esc(len(C.spineClear)) + ' from each fold', 'cv-key') +
      stat('Barcode area', dims(2, 1.2), 'lower right of the back, ' + BL.esc(len(0.25)) + ' from spine and trim', 'cv-key');
  }

  function renderTables(L) {
    var b = C.bleed, tw = L.trim.w, th = L.trim.h, u = unit();
    function row(name, w, h) { return '<tr><td>' + name + '</td><td class="num">' + num(w) + ' × ' + num(h) + '</td><td class="num">' + px(w) + ' × ' + px(h) + '</td></tr>'; }
    $('#cv-panels').innerHTML = '<thead><tr><th>Part</th><th class="num">Size (' + u + ')</th><th class="num">Pixels at 300 DPI</th></tr></thead><tbody>' +
      row('<strong>Full cover with bleed</strong>', L.width, L.height) +
      row('Trimmed cover (no bleed)', L.trimBox.w, th) +
      row('Back cover', tw, th) + row('Back cover with bleed', tw + b, th + 2 * b) +
      row('Spine', L.spine, th) + row('Spine with bleed', L.spine, th + 2 * b) +
      row('Front cover', tw, th) + row('Front cover with bleed', tw + b, th + 2 * b) +
      row('Safe area (front or back)', L.backSafe.w, L.backSafe.h) +
      (L.spineSafe ? row('Spine text area', L.spineSafe.w, L.spineSafe.h) : '<tr><td>Spine text area</td><td class="num" colspan="2">none (' + (L.spineText ? 'spine too narrow' : '79 pages or fewer') + ')</td></tr>') +
      row('Barcode area', 2, 1.2) + '</tbody>';
    var g = C.guides(L);
    function rows(list) { return list.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="num">' + num(r[1]) + '</td></tr>'; }).join(''); }
    $('#cv-guides').innerHTML = '<thead><tr><th>Vertical guide</th><th class="num">From left (' + u + ')</th></tr></thead><tbody>' + rows(g.v) + '</tbody>' +
      '<thead><tr><th>Horizontal guide</th><th class="num">From top (' + u + ')</th></tr></thead><tbody>' + rows(g.h) + '</tbody>';
  }

  function renderHardcover(trim, pages, paper, lim) {
    var ok = !lim.error && isFinite(pages) && pages >= lim.min && pages <= lim.max;
    $('#hc-stats').innerHTML =
      stat('Trim size', trim.w + ' × ' + trim.h + ' in', 'hardcover trim') +
      stat('Page range', '75–550 pages', ok ? 'your ' + pages + ' pages: OK' : 'check your page count') +
      stat('Wrap', '0.51 in (15 mm)', 'artwork past the board edge') +
      stat('Hinge', '0.4 in (10 mm)', 'gap between spine and safe area, front and back') +
      stat('Safe area', '0.635 in (16 mm)', 'from the edge of the book') +
      stat('Barcode', '2 × 1.2 in', '0.76 in (19 mm) from the bottom, 0.25 in (6 mm) from the hinge') +
      stat('Spine width', 'Use KDP\'s template', 'KDP doesn\'t publish a per-page figure for hardcovers');
    return ok;
  }

  /* ---------- main render ---------- */
  function setHtml(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; } }

  function render() {
    var format = BL.radio('format');
    var trim = K.trim(trimSel.value), paper = paperSel.value;
    var raw = BL.num(pagesEl), pages = Math.round(raw);
    var lim = C.limits(trim, paper, format);
    var msg = $('#cv-msg'), notes = [];
    pagesEl.min = lim.min || 24; pagesEl.max = lim.max || 828;
    $('#pages-hint').textContent = lim.error ? '' : 'Your final interior PDF page count, blank pages included. ' + lim.min + '–' + lim.max + ' pages for this trim and paper.';
    var hard = format === 'hardcover';
    $('#pb-panel').hidden = hard; $('#cv-detail').hidden = hard; $('#cv-results').hidden = hard; $('#hc-panel').hidden = !hard;
    updateLinks(format, trim, pages, paper);
    var err = lim.error || (!isFinite(raw) ? 'Enter the page count of your interior file.' :
      pages < lim.min ? 'KDP needs at least ' + lim.min + ' pages for ' + (hard ? 'a hardcover' : C.paperShort[paper]) + '. A ' + pages + '-page book can\'t be printed.' :
      pages > lim.max ? 'The most pages KDP prints for ' + (hard ? 'a hardcover' : C.paperShort[paper] + ' at ' + trim.w + ' × ' + trim.h + ' in') + ' is ' + lim.max + '.' : null);
    if (err) notes.push('<div class="note err">' + BL.esc(err) + '</div>');
    if (!err && pages % 2) notes.push('<div class="note">Printed books always have an even page count, so a ' + pages + '-page interior is printed with a blank page at the end. <button type="button" class="btn ghost" id="use-even" style="min-height:30px;padding:3px 10px;margin-left:4px">Use ' + (pages + 1) + ' pages</button></div>');
    if (hard) {
      renderHardcover(trim, pages, paper, lim);
      setHtml(msg, notes.join(''));
      current = null;
      return;
    }
    if (err) {
      setHtml(msg, notes.join(''));
      current = null; toggleDownloads(false);
      $('#cv-stats').innerHTML = ''; $('#cv-preview').innerHTML = '<p class="muted">Fix the page count to see the template.</p>';
      return;
    }
    if (pages < C.spineTextMinPages) notes.push('<div class="note">With ' + pages + ' pages the spine is only ' + BL.esc(len(C.spine(pages, paper))) + ' wide, so KDP doesn\'t allow text on it. Leave the spine plain or use a solid colour.</div>');
    setHtml(msg, notes.join(''));
    current = C.layout(trim, pages, paper);
    renderStats(current);
    renderLegend(current);
    renderPreview(current);
    renderTables(current);
    if (art) artReport();
    toggleDownloads(true);
  }

  function updateLinks(format, trim, pages, paper) {
    var q = 'format=' + format + '&trim=' + encodeURIComponent(trim.id) + (isFinite(pages) ? '&pages=' + pages : '') + '&paper=' + paper;
    $('#to-royalty').href = BL.root + 'kdp-royalty-calculator/?' + q;
  }

  function toggleDownloads(on) { ['#dl-png', '#dl-pdf', '#dl-png-guides', '#dl-pdf-guides', '#dl-zip'].forEach(function (id) { $(id).disabled = !on; }); }

  /* ---------- canvas (PNG) ---------- */
  var fontFacesP = null;
  function canvasFonts() {
    if (!fontFacesP) {
      fontFacesP = Promise.all([BL.fontBytes('AtkinsonHyperlegible-Regular.ttf'), BL.fontBytes('AtkinsonHyperlegible-Bold.ttf')]).then(function (b) {
        var faces = [new FontFace('BLAtkinson', b[0].slice(0), { weight: '400' }), new FontFace('BLAtkinson', b[1].slice(0), { weight: '700' })];
        return Promise.all(faces.map(function (f) { return f.load(); })).then(function (loaded) { loaded.forEach(function (f) { document.fonts.add(f); }); });
      });
      fontFacesP.catch(function () { fontFacesP = null; });
    }
    return fontFacesP;
  }

  function drawCanvas(L, labels, dpi) {
    var c = document.createElement('canvas');
    c.width = px(L.width, dpi); c.height = px(L.height, dpi);
    var ctx = c.getContext('2d');
    if (!ctx) throw new Error('This browser could not make a ' + c.width + ' × ' + c.height + ' px image. Download the PDF template instead.');
    var k = dpi;
    buildList(L, { white: labels, labels: labels }).forEach(function (it) {
      if (it.t === 'rect') { ctx.fillStyle = css(it.fill); ctx.fillRect(it.x * k, it.y * k, it.w * k, it.h * k); }
      else if (it.t === 'line') {
        ctx.strokeStyle = css(it.stroke); ctx.lineWidth = Math.max(1, it.sw * k);
        ctx.setLineDash(it.dash ? it.dash.map(function (d) { return d * k; }) : []);
        ctx.beginPath(); ctx.moveTo(it.x1 * k, it.y1 * k); ctx.lineTo(it.x2 * k, it.y2 * k); ctx.stroke();
      } else if (it.t === 'text') {
        ctx.font = (it.bold ? '700 ' : '400 ') + (it.size * k) + 'px BLAtkinson, sans-serif';
        ctx.fillStyle = css(it.fill); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        var p = textStart(it, ctx.measureText(it.s).width / k);
        ctx.save(); ctx.translate(p.x * k, p.y * k); if (it.rot) ctx.rotate(Math.PI / 2); ctx.fillText(it.s, 0, 0); ctx.restore();
      }
    });
    return c;
  }

  function makePng(L, labels) {
    return canvasFonts().then(function () {
      var c = drawCanvas(L, labels, 300);
      return BL.canvasBlob(c).then(BL.blobBytes).then(function (bytes) { return setPngDpi(bytes, 300); });
    });
  }

  // pHYs chunk so design apps open the PNG at its physical size.
  function setPngDpi(bytes, dpi) {
    var ppm = Math.round(dpi / 0.0254), data = new Uint8Array(9), dv = new DataView(data.buffer);
    dv.setUint32(0, ppm); dv.setUint32(4, ppm); data[8] = 1;
    var chunk = pngChunk('pHYs', data), out = new Uint8Array(bytes.length + chunk.length), ihdrEnd = 8 + 25;
    out.set(bytes.subarray(0, ihdrEnd), 0); out.set(chunk, ihdrEnd); out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
    return out;
  }
  var crcTable = null;
  function crc32(buf) {
    if (!crcTable) { crcTable = []; for (var n = 0; n < 256; n++) { var c = n; for (var j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
    var crc = 0xffffffff;
    for (var i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function pngChunk(type, data) {
    var out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  /* ---------- PDF ---------- */
  function makePdf(L, labels) {
    return BL.pdfLib(true).then(function (P) {
      return P.PDFDocument.create().then(function (doc) {
        doc.setTitle('KDP cover template ' + L.trim.w + ' x ' + L.trim.h + ' in, ' + L.pages + ' pages');
        doc.setCreator('Bleedline KDP cover calculator'); doc.setProducer('Bleedline');
        var Hp = L.height * 72;
        var page = doc.addPage([L.width * 72, Hp]);
        return (labels ? BL.embedFonts(doc) : Promise.resolve(null)).then(function (fonts) {
          function col(c) { return P.rgb(c[0] / 255, c[1] / 255, c[2] / 255); }
          buildList(L, { white: labels, labels: labels }).forEach(function (it) {
            if (it.t === 'rect') page.drawRectangle({ x: it.x * 72, y: Hp - (it.y + it.h) * 72, width: it.w * 72, height: it.h * 72, color: col(it.fill), opacity: it.fill[3], borderWidth: 0 });
            else if (it.t === 'line') page.drawLine({ start: { x: it.x1 * 72, y: Hp - it.y1 * 72 }, end: { x: it.x2 * 72, y: Hp - it.y2 * 72 }, thickness: it.sw * 72, color: col(it.stroke), opacity: it.stroke[3], dashArray: it.dash ? it.dash.map(function (d) { return d * 72; }) : undefined });
            else if (it.t === 'text') {
              var f = it.bold ? fonts.bold : fonts.regular, size = it.size * 72;
              var p = textStart(it, f.widthOfTextAtSize(it.s, size) / 72);
              page.drawText(it.s, { x: p.x * 72, y: Hp - p.y * 72, size: size, font: f, color: col(it.fill), rotate: P.degrees(it.rot ? -90 : 0) });
            }
          });
          return doc.save();
        });
      });
    });
  }

  /* ---------- downloads ---------- */
  function base(L) { return 'kdp-cover-template-' + L.trim.id + '-' + L.pages + 'p-' + L.paper; }
  var busy = false;
  function job(label, fn) {
    if (!current || busy) return;
    busy = true; toggleDownloads(false);
    var st = $('#dl-status'), before = st.innerHTML;
    st.innerHTML = '<span class="spinner"></span> Making ' + label + '…';
    var L = current;
    setTimeout(function () {
      fn(L).then(function () { st.innerHTML = before; BL.track('cover-template', label); })
        .catch(function (e) { BL.fail(e, st); })
        .then(function () { busy = false; toggleDownloads(!!current); });
    }, 30);
  }
  $('#dl-png').addEventListener('click', function () { job('the PNG', function (L) { return makePng(L, true).then(function (b) { BL.download(new Blob([b], { type: 'image/png' }), base(L) + '.png'); }); }); });
  $('#dl-pdf').addEventListener('click', function () { job('the PDF', function (L) { return makePdf(L, true).then(function (b) { BL.download(new Blob([b], { type: 'application/pdf' }), base(L) + '.pdf'); }); }); });
  $('#dl-png-guides').addEventListener('click', function () { job('the guides PNG', function (L) { return makePng(L, false).then(function (b) { BL.download(new Blob([b], { type: 'image/png' }), base(L) + '-guides.png'); }); }); });
  $('#dl-pdf-guides').addEventListener('click', function () { job('the guides PDF', function (L) { return makePdf(L, false).then(function (b) { BL.download(new Blob([b], { type: 'application/pdf' }), base(L) + '-guides.pdf'); }); }); });
  $('#dl-zip').addEventListener('click', function () {
    job('the ZIP', function (L) {
      var n = base(L), files = [];
      return makePng(L, true).then(function (b) { files.push({ name: n + '.png', data: b }); return makePdf(L, true); })
        .then(function (b) { files.push({ name: n + '.pdf', data: b }); return makePng(L, false); })
        .then(function (b) { files.push({ name: n + '-guides.png', data: b }); return makePdf(L, false); })
        .then(function (b) { files.push({ name: n + '-guides.pdf', data: b }); return BL.zip(files); })
        .then(function (zip) { BL.download(zip, n + '.zip'); });
    });
  });

  /* ---------- artwork check ---------- */
  function artReport() {
    if (!art || !current) return;
    var L = current, front = BL.radio('artmode') === 'front', b = C.bleed;
    var tw = front ? L.panelWithBleed.w : L.width, th = L.height;
    var ratio = art.width / art.height, want = tw / th;
    var dpi = Math.min(art.width / tw, art.height / th);
    var out = ['<div class="note">' + BL.esc(art.name) + ': ' + art.width + ' × ' + art.height + ' px. ' + (front ? 'A front cover with bleed' : 'The full cover') + ' needs ' + px(tw) + ' × ' + px(th) + ' px at 300 DPI.</div>'];
    var dWant = Math.abs(ratio / want - 1), dTrim = Math.abs(ratio / (L.trim.w / L.trim.h) - 1);
    if (dWant > (front ? 0.003 : 0.0015)) {
      if (front && dTrim < dWant && dTrim <= 0.003) {
        out.push('<div class="note warn">This image matches the ' + L.trim.w + ' × ' + L.trim.h + ' in trim without bleed. Add ' + BL.esc(len(b)) + ' on the outside edge and on the top and bottom, or the edges will be cropped or show white after trimming.</div>');
      } else if (!front) {
        var impliedSpine = ratio * th - 2 * L.trim.w - 2 * b;
        out.push('<div class="note warn">The proportions don\'t match this cover (' + BL.esc(dims(L.width, L.height)) + '), so the preview crops it.' +
          (impliedSpine > 0 && impliedSpine < 3 ? ' They fit a spine of about ' + BL.esc(len(impliedSpine)) + ', but this book needs ' + BL.esc(len(L.spine)) + '. Check the page count and paper it was made for.' : ' Make sure it was made for this trim size.') + '</div>');
      } else {
        out.push('<div class="note warn">The proportions don\'t match a ' + L.trim.w + ' × ' + L.trim.h + ' in front cover with bleed, so the preview crops it. Check what will be cut off.</div>');
      }
    }
    if (dpi >= 300) out.push('<div class="note ok">Resolution: about ' + Math.floor(dpi) + ' DPI at print size. Good for print.' + (dpi > 650 ? ' KDP recommends no more than 600 DPI, which keeps the file smaller.' : '') + '</div>');
    else out.push('<div class="note warn">Resolution: about ' + Math.floor(dpi) + ' DPI at print size. KDP asks for at least 300 DPI, so use an image of at least ' + px(tw) + ' × ' + px(th) + ' px.</div>');
    $('#art-msg').innerHTML = out.join('');
  }

  BL.dropzone($('#art-drop'), function (files) {
    var f = files[0];
    if (!f || !/^image\//.test(f.type)) { BL.fail(new Error('Choose a JPG or PNG image.'), $('#art-msg')); $('#art-opts').hidden = false; return; }
    BL.loadImage(f).then(function (r) {
      if (art) URL.revokeObjectURL(art.url);
      art = { url: r.url, width: r.width, height: r.height, name: f.name };
      var mode = r.width / r.height > 1.2 ? 'full' : 'front';
      document.querySelector('input[name=artmode][value=' + mode + ']').checked = true;
      $('#art-opts').hidden = false;
      render();
    }).catch(function (e) { $('#art-opts').hidden = false; BL.fail(e, $('#art-msg')); });
  });
  BL.$$('input[name=artmode]').forEach(function (r) { r.addEventListener('change', render); });
  $('#art-guides').addEventListener('change', render);
  $('#art-clear').addEventListener('click', function () {
    if (art) URL.revokeObjectURL(art.url);
    art = null; $('#art-opts').hidden = true; $('#art-msg').innerHTML = ''; render();
  });

  /* ---------- events ---------- */
  var cvPreview = $('#cv-preview');
  cvPreview.addEventListener('mouseover', function (e) { var z = e.target.getAttribute && e.target.getAttribute('data-zone'); if (z) highlight(z); });
  cvPreview.addEventListener('focusin', function (e) { var z = e.target.getAttribute && e.target.getAttribute('data-zone'); if (z) highlight(z); });
  cvPreview.addEventListener('click', function (e) { var z = e.target.getAttribute && e.target.getAttribute('data-zone'); if (z) highlight(z); });
  $('#cv-legend').addEventListener('click', function (e) {
    var bt = e.target.closest('button'); if (!bt) return;
    highlight(activeZone === bt.dataset.zone ? null : bt.dataset.zone);
  });
  form.addEventListener('change', function (e) {
    if (e.target.name === 'format') { fillTrims(BL.radio('format')); }
    if (e.target.name === 'format' || e.target.name === 'trim') syncPapers();
    render();
  });
  form.addEventListener('input', function (e) { if (e.target === pagesEl) render(); });
  $('#cv-msg').addEventListener('click', function (e) {
    if (e.target.id === 'use-even') { pagesEl.value = Math.round(BL.num(pagesEl)) + 1; pagesEl.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  $('#copy-link').addEventListener('click', function () {
    var u = location.origin + location.pathname + '?format=' + BL.radio('format') + '&trim=' + encodeURIComponent(trimSel.value) + '&pages=' + Math.round(BL.num(pagesEl, 0)) + '&paper=' + paperSel.value + '&units=' + unit();
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { BL.toast('Link copied'); }, function () { window.prompt('Copy this link:', u); });
  });

  var rsz = null;
  window.addEventListener('resize', function () { clearTimeout(rsz); rsz = setTimeout(function () { if (current) renderPreview(current); }, 150); });
  render();
  // Re-draw the preview once the template font is loaded, so it matches the downloads.
  canvasFonts().then(function () { if (current) renderPreview(current); }).catch(function () {});
})();
