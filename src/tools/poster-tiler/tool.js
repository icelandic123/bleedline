/* Poster tiler: splits an image across printer pages with overlap, cut marks, labels and an
   assembly map. All geometry is in inches; PDF output in points (72 per inch).
   layout() is pure so it can be tested in Node. */
(function () {
  var PAPERS = {
    letter: { name: 'US Letter', w: 8.5, h: 11 },
    a4: { name: 'A4', w: 210 / 25.4, h: 297 / 25.4 },
    legal: { name: 'US Legal', w: 8.5, h: 14 },
    a3: { name: 'A3', w: 297 / 25.4, h: 420 / 25.4 },
    tabloid: { name: 'Tabloid', w: 11, h: 17 }
  };
  var FREE_MAX = 3, PRO_MAX = 15, MAX_TILE_DPI = 300;
  var EPS = 1e-9;

  // p: paper, orient ('portrait'|'landscape'), margin, overlap (in), imgW, imgH (px),
  //    sizeBy ('width'|'pages'), width (in), across, fit ('fit'|'fill')
  function layoutFor(p, orient) {
    var paper = PAPERS[p.paper] || PAPERS.letter;
    var landscape = orient === 'landscape';
    var paperW = landscape ? paper.h : paper.w, paperH = landscape ? paper.w : paper.h;
    var m = p.margin, o = p.overlap;
    var pw = paperW - 2 * m, ph = paperH - 2 * m;
    var stepW = pw - o, stepH = ph - o;
    if (stepW <= 0.1 || stepH <= 0.1) throw new Error('The margin and overlap leave no room for the image on this paper. Make them smaller.');
    var aspect = p.imgH / p.imgW;
    var cols, W;
    if (p.sizeBy === 'pages') { cols = Math.max(1, Math.round(p.across)); W = cols * stepW + o; }
    else { W = p.width; cols = Math.max(1, Math.ceil((W - o) / stepW - EPS)); }
    var H = W * aspect;
    var rows = Math.max(1, Math.ceil((H - o) / stepH - EPS));
    var gridW = cols * stepW + o, gridH = rows * stepH + o;
    var img, posterW, posterH;
    if (p.fit === 'fill') {
      var s = Math.max(gridW / W, gridH / H);
      img = { w: W * s, h: H * s };
      img.x = (gridW - img.w) / 2; img.y = (gridH - img.h) / 2;
      posterW = gridW; posterH = gridH;
    } else {
      img = { x: 0, y: 0, w: W, h: H };
      posterW = W; posterH = H;
    }
    return {
      paper: p.paper, paperName: paper.name, orient: landscape ? 'landscape' : 'portrait',
      paperW: paperW, paperH: paperH, margin: m, overlap: o, pw: pw, ph: ph, stepW: stepW, stepH: stepH,
      cols: cols, rows: rows, sheets: cols * rows, gridW: gridW, gridH: gridH, img: img,
      posterW: posterW, posterH: posterH, dpi: p.imgW / img.w, imgW: p.imgW, imgH: p.imgH
    };
  }
  function layout(p) {
    if (p.orient === 'portrait' || p.orient === 'landscape') return layoutFor(p, p.orient);
    if (p.sizeBy === 'pages') return layoutFor(p, p.imgW > p.imgH ? 'landscape' : 'portrait');
    var a = layoutFor(p, 'portrait'), b = layoutFor(p, 'landscape');
    if (b.sheets < a.sheets) return b;
    if (b.sheets === a.sheets && b.gridW * b.gridH < a.gridW * a.gridH - EPS) return b;
    return a;
  }

  // Tile (r, c): its printable area in poster inches, the part of the image on it, and the
  // matching source rectangle in image pixels.
  function tile(L, r, c) {
    var x = c * L.stepW, y = r * L.stepH;
    var ix0 = Math.max(x, L.img.x), ix1 = Math.min(x + L.pw, L.img.x + L.img.w);
    var iy0 = Math.max(y, L.img.y), iy1 = Math.min(y + L.ph, L.img.y + L.img.h);
    var t = { r: r, c: c, x: x, y: y, label: rowName(r) + (c + 1) };
    if (ix1 - ix0 <= EPS || iy1 - iy0 <= EPS) { t.empty = true; return t; }
    var k = L.imgW / L.img.w;
    t.ix0 = ix0; t.ix1 = ix1; t.iy0 = iy0; t.iy1 = iy1;
    t.sx = (ix0 - L.img.x) * k; t.sy = (iy0 - L.img.y) * k; t.sw = (ix1 - ix0) * k; t.sh = (iy1 - iy0) * k;
    var dpi = Math.min(L.dpi, MAX_TILE_DPI);
    t.pxW = Math.max(1, Math.round((ix1 - ix0) * dpi)); t.pxH = Math.max(1, Math.round((iy1 - iy0) * dpi));
    return t;
  }
  function rowName(r) { return String.fromCharCode(65 + r); }
  // Distance (inches) beyond which pixels at this DPI are below 1 arcminute.
  function sharpFrom(dpi) { return 3438 / dpi; }

  var api = { PAPERS: PAPERS, layout: layout, tile: tile, sharpFrom: sharpFrom, FREE_MAX: FREE_MAX, PRO_MAX: PRO_MAX };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  /* ---------------- UI ---------------- */
  var BL = window.BL, $ = BL.$;
  var form = $('#pt-form'), KEY = 'poster-tiler';
  var src = null;          // {img, width, height, name, alpha}
  var current = null;      // current layout
  var busy = false, cancelled = false;

  function units() { return BL.radio('units') === 'mm' ? 'mm' : 'in'; }
  function toIn(v, kind) { return units() === 'mm' ? v / (kind === 'big' ? 2.54 : 25.4) : v; }
  function fmtLen(inches, big) {
    if (units() === 'mm') return big ? BL.fmt(inches * 2.54, 1) + ' cm' : BL.fmt(inches * 25.4, 0) + ' mm';
    return BL.fmt(inches, big ? 1 : 2) + ' in';
  }
  function fmtSize(w, h) {
    var a = BL.fmt(w, 1) + ' × ' + BL.fmt(h, 1) + ' in', b = BL.fmt(w * 2.54, 1) + ' × ' + BL.fmt(h * 2.54, 1) + ' cm';
    return units() === 'mm' ? [b, a] : [a, b];
  }

  function params() {
    return {
      paper: $('#paper').value, orient: $('#orient').value,
      margin: toIn(BL.num('#margin', 0), 'small'), overlap: toIn(BL.num('#overlap', 0), 'small'),
      sizeBy: BL.radio('sizeBy') || 'width', width: toIn(BL.num('#width', NaN), 'big'), across: BL.num('#across', NaN),
      fit: BL.radio('fit') || 'fit', imgW: src ? src.width : 3000, imgH: src ? src.height : 2000
    };
  }
  function validate(p) {
    if (!(p.margin >= 0) || p.margin > 1.5) return 'Enter a printer margin between 0 and ' + fmtLen(1.5) + '.';
    if (!(p.overlap >= 0) || p.overlap > 1 + 1e-6) return 'Enter an overlap between 0 and ' + fmtLen(1) + '.';
    if (p.sizeBy === 'pages') { if (!(p.across >= 1) || p.across > PRO_MAX || Math.round(p.across) !== p.across) return 'Pages across must be a whole number from 1 to ' + PRO_MAX + '.'; }
    else if (!(p.width > 0)) return 'Enter the poster width.';
    return '';
  }

  function syncUi() {
    var u = units();
    BL.$$('.u-big').forEach(function (e) { e.textContent = u === 'mm' ? 'cm' : 'in'; });
    BL.$$('.u-small').forEach(function (e) { e.textContent = u === 'mm' ? 'mm' : 'in'; });
    $('#width').step = u === 'mm' ? '0.5' : '0.1';
    $('#margin').step = u === 'mm' ? '0.5' : '0.01';
    $('#overlap').step = u === 'mm' ? '0.5' : '0.01';
    $('#overlap').max = u === 'mm' ? '25.4' : '1';
    $('#overlap-hint').textContent = u === 'mm' ? 'Glue strip, 0 to 25 mm.' : 'Glue strip, 0 to 1 in.';
    var pp = PAPERS[$('#paper').value] || PAPERS.letter;
    $('#paper-hint').textContent = pp.name + ' is ' + (u === 'mm' ? Math.round(pp.w * 25.4) + ' × ' + Math.round(pp.h * 25.4) + ' mm' : BL.fmt(pp.w, 2).replace(/\.?0+$/, '') + ' × ' + BL.fmt(pp.h, 2).replace(/\.?0+$/, '') + ' in') + '. Auto picks the orientation that needs the fewest sheets.';
    $('#width-row').hidden = BL.radio('sizeBy') === 'pages';
    $('#pages-row').hidden = BL.radio('sizeBy') !== 'pages';
    $('#fit-hint').textContent = BL.radio('fit') === 'fill'
      ? 'The image is enlarged to cover every sheet, so the poster is exactly the page grid and a strip of the image edges is cropped.'
      : 'The whole image is printed at the size you chose. The last row or column may be part blank.';
  }

  function stat(k, v, s, cls) { return '<div class="stat' + (cls ? ' ' + cls : '') + '"><div class="k">' + k + '</div><div class="v" style="font-size:1.05rem">' + BL.esc(v) + '</div>' + (s ? '<div class="s">' + BL.esc(s) + '</div>' : '') + '</div>'; }

  function render() {
    syncUi();
    var msg = $('#pt-msg'), stats = $('#pt-stats'), btn = $('#pt-export');
    if (!src) { stats.innerHTML = ''; msg.innerHTML = ''; btn.disabled = true; btn.textContent = 'Download PDF'; return; }
    var p = params(), err = validate(p);
    if (err) { msg.innerHTML = '<div class="note err">' + BL.esc(err) + '</div>'; current = null; btn.disabled = true; return; }
    try { current = layout(p); } catch (e) { current = null; BL.fail(e, msg); btn.disabled = true; return; }
    var L = current, size = fmtSize(L.posterW, L.posterH);
    var dist = sharpFrom(L.dpi);
    var distTxt = units() === 'mm' ? BL.fmt(dist * 0.0254, dist * 0.0254 < 2 ? 1 : 0) + ' m' : (dist < 24 ? BL.fmt(dist, 0) + ' in' : BL.fmt(dist / 12, 1) + ' ft');
    stats.innerHTML =
      stat('Finished poster', size[0], size[1]) +
      stat('Sheets', L.cols + ' × ' + L.rows + ' = ' + L.sheets, L.paperName + ' ' + L.orient, 'hi') +
      stat('Effective DPI', BL.fmt(L.dpi, 0), src.width + ' × ' + src.height + ' px image') +
      stat('Looks sharp from', distTxt, 'and further away');
    var notes = [];
    if (L.dpi < 100) notes.push('<div class="note warn"><strong>Low resolution: ' + BL.fmt(L.dpi, 0) + ' DPI.</strong> From about ' + BL.esc(distTxt) + ' away it will look fine, but up close you may see soft edges or pixels. For a poster people look at from a metre (3 ft) or closer, aim for 100 DPI or more: make it smaller or use a larger image.</div>');
    if (L.cols > PRO_MAX || L.rows > PRO_MAX) notes.push('<div class="note err">That needs ' + L.cols + ' × ' + L.rows + ' sheets. The most this tool makes is ' + PRO_MAX + ' × ' + PRO_MAX + '. Use a smaller width, larger paper or less overlap.</div>');
    else if ((L.cols > FREE_MAX || L.rows > FREE_MAX) && !BL.pro.active()) notes.push('<div class="note pro">This poster needs ' + L.cols + ' × ' + L.rows + ' sheets. Free downloads go up to ' + FREE_MAX + ' × ' + FREE_MAX + ' sheets; <a href="#" data-pro-open="Posters bigger than 3 × 3 sheets (up to 15 × 15) are part of Bleedline Pro.">Pro</a> goes up to ' + PRO_MAX + ' × ' + PRO_MAX + '. Or make it a little smaller, or pick larger paper.</div>');
    if ($('#marks').checked && L.margin < 0.08) notes.push('<div class="note">With a margin this small there is no room for cut marks, so they are left out. Cut along the edge of the image instead.</div>');
    if (L.overlap === 0 && L.sheets > 1) notes.push('<div class="note">With no overlap, cut exactly on the cut marks and butt the sheets together, taping them from the back.</div>');
    msg.innerHTML = notes.join('');
    var pages = L.sheets + ($('#map').checked ? 1 : 0);
    btn.disabled = busy || L.cols > PRO_MAX || L.rows > PRO_MAX;
    btn.textContent = busy ? 'Working…' : 'Download PDF (' + pages + (pages === 1 ? ' page)' : ' pages)');
    drawPreview(L);
  }

  // Preview: the image on the page grid, overlap strips shaded, sheet borders and labels.
  function drawPreview(L) {
    var cv = $('#pt-canvas');
    var maxW = 1100, maxH = 1000;
    var s = Math.min(maxW / L.gridW, maxH / L.gridH);
    cv.width = Math.round(L.gridW * s); cv.height = Math.round(L.gridH * s);
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, cv.width, cv.height); ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.img, L.img.x * s, L.img.y * s, L.img.w * s, L.img.h * s);
    ctx.restore();
    // overlap strips
    ctx.fillStyle = 'rgba(15,118,110,0.28)';
    var c, r;
    for (c = 1; c < L.cols; c++) ctx.fillRect(c * L.stepW * s, 0, L.overlap * s, cv.height);
    for (r = 1; r < L.rows; r++) ctx.fillRect(0, r * L.stepH * s, cv.width, L.overlap * s);
    // sheet borders (where the visible edge of each sheet ends up)
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    gridLines(ctx, L, s); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#0f766e';
    gridLines(ctx, L, s); ctx.stroke();
    ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
    // labels
    var cellW = L.stepW * s, cellH = L.stepH * s;
    var fs = Math.max(12, Math.min(36, Math.min(cellW, cellH) / 5));
    ctx.font = '600 ' + fs + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (r = 0; r < L.rows; r++) for (c = 0; c < L.cols; c++) {
      var cx = (c * L.stepW + (c === L.cols - 1 ? (L.gridW - c * L.stepW) : L.stepW) / 2) * s;
      var cy = (r * L.stepH + (r === L.rows - 1 ? (L.gridH - r * L.stepH) : L.stepH) / 2) * s;
      var t = rowName(r) + (c + 1), tw = ctx.measureText(t).width;
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(cx - tw / 2 - 5, cy - fs * 0.65, tw + 10, fs * 1.3);
      ctx.fillStyle = '#0f766e'; ctx.fillText(t, cx, cy);
    }
    cv.hidden = false; $('#pt-empty').hidden = true;
  }
  function gridLines(ctx, L, s) {
    ctx.beginPath();
    for (var c = 1; c < L.cols; c++) { var x = c * L.stepW * s; ctx.moveTo(x, 0); ctx.lineTo(x, L.gridH * s); }
    for (var r = 1; r < L.rows; r++) { var y = r * L.stepH * s; ctx.moveTo(0, y); ctx.lineTo(L.gridW * s, y); }
  }

  /* ---------- image input ---------- */
  function hasAlpha(img, w, h, type) {
    if (/jpe?g/i.test(type || '')) return false;
    var k = Math.min(1, 1024 / Math.max(w, h));
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    var d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (var i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
    return false;
  }
  function useFile(file) {
    if (!/^image\//.test(file.type || '') && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name || '')) { BL.fail(new Error('Please choose an image file (JPG, PNG or WebP).'), $('#pt-msg')); return; }
    $('#pt-file-info').textContent = 'Opening ' + file.name + '…';
    BL.loadImage(file).then(function (r) {
      // Decode once, off the main thread, so drawing tiles from a big photo doesn't stall the page.
      var bmp = window.createImageBitmap ? createImageBitmap(r.img).catch(function () { return r.img; }) : Promise.resolve(r.img);
      return bmp.then(function (b) { r.draw = b; return r; });
    }).then(function (r) {
      if (src && src.url) URL.revokeObjectURL(src.url);
      if (src && src.img && src.img.close) src.img.close();
      src = { img: r.draw, url: r.url, width: r.width, height: r.height, name: file.name, alpha: hasAlpha(r.draw, r.width, r.height, file.type) };
      $('#pt-file-info').textContent = file.name + ': ' + r.width + ' × ' + r.height + ' px' + (src.alpha ? ', with transparency (kept as PNG)' : '');
      BL.track('poster-image');
      render();
    }).catch(function (e) { $('#pt-file-info').textContent = 'No image yet.'; BL.fail(e, $('#pt-msg')); });
  }
  function sampleImage() {
    var c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 3000, 2000);
    g.addColorStop(0, '#0f766e'); g.addColorStop(0.5, '#f59e0b'); g.addColorStop(1, '#7c3aed');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 3000, 2000);
    for (var i = 0; i < 14; i++) {
      ctx.beginPath(); ctx.arc(200 + i * 200, 1000 + Math.sin(i / 2) * 520, 90 + (i % 4) * 40, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.18 + (i % 3) * 0.12) + ')'; ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 4;
    for (var x = 0; x <= 3000; x += 250) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 2000); ctx.stroke(); }
    for (var y = 0; y <= 2000; y += 250) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(3000, y); ctx.stroke(); }
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 260px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SAMPLE POSTER', 1500, 1000);
    return BL.canvasBlob(c, 'image/jpeg', 0.9).then(function (b) { useFile(new File([b], 'sample-poster.jpg', { type: 'image/jpeg' })); });
  }

  /* ---------- PDF ---------- */
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function progress(done, total, text) {
    $('#pt-bar').style.width = Math.round(done / total * 100) + '%';
    $('#pt-progress-text').textContent = text;
  }

  function tileBytes(L, t) {
    var cv = document.createElement('canvas');
    cv.width = t.pxW; cv.height = t.pxH;
    var ctx = cv.getContext('2d');
    if (!src.alpha) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.img, t.sx, t.sy, t.sw, t.sh, 0, 0, cv.width, cv.height);
    var type = src.alpha ? 'image/png' : 'image/jpeg';
    return BL.canvasBlob(cv, type, 0.92).then(BL.blobBytes).then(function (b) { cv.width = cv.height = 0; return { bytes: b, png: src.alpha }; });
  }

  function drawMarks(PDFLib, page, L, t) {
    var P = 72, m = L.margin * P, W = L.paperW * P, H = L.paperH * P;
    var x0 = m, x1 = W - m, y0 = m, y1 = H - m;           // printable area, PDF coordinates (y up)
    var gap = 2, len = Math.min(m - gap - 2, 14);
    if (len < 4) return;
    var black = PDFLib.rgb(0, 0, 0), grey = PDFLib.rgb(0.45, 0.45, 0.45);
    function line(ax, ay, bx, by, opts) { page.drawLine(Object.assign({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: 0.5, color: black }, opts || {})); }
    // corner cut marks, outside the printable area
    [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]].forEach(function (k) {
      line(k[0] + k[2] * gap, k[1], k[0] + k[2] * (gap + len), k[1]);
      line(k[0], k[1] + k[3] * gap, k[0], k[1] + k[3] * (gap + len));
    });
    if (L.overlap > 0) {
      var o = L.overlap * P, dash = { color: grey, dashArray: [2, 1.5] };
      if (t.c < L.cols - 1) { var xo = x1 - o; line(xo, y1 + gap, xo, y1 + gap + len, dash); line(xo, y0 - gap, xo, y0 - gap - len, dash); }
      if (t.r < L.rows - 1) { var yo = y0 + o; line(x0 - gap, yo, x0 - gap - len, yo, dash); line(x1 + gap, yo, x1 + gap + len, yo, dash); }
    }
  }

  function drawLabel(PDFLib, page, L, t, fonts) {
    var P = 72, m = L.margin * P, W = L.paperW * P;
    var big = t.label, small = '  row ' + (t.r + 1) + ' of ' + L.rows + ' · column ' + (t.c + 1) + ' of ' + L.cols;
    var bs = 9, ss = 7;
    var wBig = fonts.bold.widthOfTextAtSize(big, bs), wSmall = fonts.regular.widthOfTextAtSize(small, ss);
    var color = PDFLib.rgb(0.25, 0.25, 0.25);
    if (m >= 11) {
      var y = Math.max(m / 2 - 3, 3), x = (W - wBig - wSmall) / 2;
      page.drawText(big, { x: x, y: y, size: bs, font: fonts.bold, color: color });
      page.drawText(small, { x: x + wBig, y: y, size: ss, font: fonts.regular, color: color });
    } else {
      // No room in the margin: a small tag inside the bottom-left corner of the image area.
      var bx = m + 3, by = m + 3;
      page.drawRectangle({ x: bx - 2, y: by - 2, width: wBig + 4, height: bs + 2, color: PDFLib.rgb(1, 1, 1), opacity: 0.85 });
      page.drawText(big, { x: bx, y: by, size: bs, font: fonts.bold, color: color });
    }
  }

  function mapPage(PDFLib, doc, L, fonts) {
    var P = 72, W = L.paperW * P, H = L.paperH * P;
    var m = Math.max(L.margin, 0.4) * P;
    var page = doc.addPage([W, H]);
    var ink = PDFLib.rgb(0.1, 0.1, 0.1), muted = PDFLib.rgb(0.35, 0.35, 0.35), teal = PDFLib.rgb(0.06, 0.46, 0.43);
    var y = H - m - 16;
    page.drawText('Poster assembly map', { x: m, y: y, size: 16, font: fonts.bold, color: ink });
    var size = fmtSize(L.posterW, L.posterH);
    y -= 18;
    page.drawText(size[0] + ' (' + size[1] + ')  ·  ' + L.cols + ' × ' + L.rows + ' = ' + L.sheets + ' sheets of ' + L.paperName + ' ' + L.orient, { x: m, y: y, size: 9.5, font: fonts.regular, color: muted });
    y -= 13;
    page.drawText('Printer margin ' + fmtLen(L.margin) + '  ·  overlap ' + fmtLen(L.overlap) + '  ·  ' + BL.fmt(L.dpi, 0) + ' DPI', { x: m, y: y, size: 9.5, font: fonts.regular, color: muted });
    var steps = [
      'Print every page at 100% ("Actual size"), never "Fit to page".',
      'Cut off the left margin of every sheet not in column 1, and the top margin of every sheet not in row A.',
      'Lay each sheet over its neighbour so the cut edge meets the dashed overlap marks, then glue the strip.',
      'Join each row first, then join the rows. Trim the outer margins last.'
    ];
    var instrH = steps.length * 13 + 24;
    var top = y - 16, bottom = m + instrH;
    var availW = W - 2 * m, availH = top - bottom;
    var s = Math.min(availW / L.gridW, availH / L.gridH);
    var gw = L.gridW * s, gh = L.gridH * s, gx = m + (availW - gw) / 2, gy = top - gh;
    // thumbnail: image on the grid, as one JPEG at about 150 DPI of map size
    var px = Math.min(2000, Math.max(1, Math.round(gw / P * 150)));
    var k = px / L.gridW;
    var cv = document.createElement('canvas');
    cv.width = px; cv.height = Math.max(1, Math.round(L.gridH * k));
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.img, L.img.x * k, L.img.y * k, L.img.w * k, L.img.h * k);
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);   // lighten so labels read
    return BL.canvasBlob(cv, 'image/jpeg', 0.85).then(BL.blobBytes).then(function (b) { return doc.embedJpg(b); }).then(function (img) {
      page.drawImage(img, { x: gx, y: gy, width: gw, height: gh });
      page.drawRectangle({ x: gx, y: gy, width: gw, height: gh, borderColor: ink, borderWidth: 0.8 });
      var c, r;
      for (c = 1; c < L.cols; c++) { var lx = gx + c * L.stepW * s; page.drawLine({ start: { x: lx, y: gy }, end: { x: lx, y: gy + gh }, thickness: 0.6, color: teal }); }
      for (r = 1; r < L.rows; r++) { var ly = gy + gh - r * L.stepH * s; page.drawLine({ start: { x: gx, y: ly }, end: { x: gx + gw, y: ly }, thickness: 0.6, color: teal }); }
      var fs = Math.max(5, Math.min(14, L.stepW * s / 3.2, L.stepH * s / 2.2));
      for (r = 0; r < L.rows; r++) for (c = 0; c < L.cols; c++) {
        var cw = (c === L.cols - 1 ? L.gridW - c * L.stepW : L.stepW) * s, ch = (r === L.rows - 1 ? L.gridH - r * L.stepH : L.stepH) * s;
        var t = rowName(r) + (c + 1), tw = fonts.bold.widthOfTextAtSize(t, fs);
        var cx = gx + c * L.stepW * s + cw / 2, cy = gy + gh - r * L.stepH * s - ch / 2;
        page.drawText(t, { x: cx - tw / 2, y: cy - fs * 0.35, size: fs, font: fonts.bold, color: teal });
      }
      var yy = m + instrH - 14;
      page.drawText('How to put it together', { x: m, y: yy, size: 10.5, font: fonts.bold, color: ink });
      steps.forEach(function (st, i) {
        yy -= 13;
        page.drawText((i + 1) + '. ' + st, { x: m, y: yy, size: 8.5, font: fonts.regular, color: ink });
      });
    });
  }

  function exportPdf() {
    if (!current || !src || busy) return;
    var L = current, labels = $('#labels').checked, map = $('#map').checked;
    if (L.cols > PRO_MAX || L.rows > PRO_MAX) return;
    var over = L.cols > FREE_MAX || L.rows > FREE_MAX;
    var reason = over ? 'This poster needs ' + L.cols + ' × ' + L.rows + ' sheets. Free downloads go up to 3 × 3; Pro goes up to 15 × 15 and adds an assembly map page.'
      : 'The assembly map page is part of Bleedline Pro. Untick it to download this poster free.';
    if (!BL.pro.gate(over || map, reason)) return;
    busy = true; cancelled = false;
    var btn = $('#pt-export'), msg = $('#pt-msg');
    btn.disabled = true; btn.textContent = 'Working…'; $('#pt-cancel').hidden = false; $('#pt-progress').hidden = false;
    var total = L.sheets + (map ? 1 : 0), done = 0, started = performance.now();
    var PDFLib, doc, fonts = null;
    BL.pdfLib(labels || map).then(function (lib) {
      PDFLib = lib;
      return PDFLib.PDFDocument.create();
    }).then(function (d) {
      doc = d;
      doc.setTitle('Poster ' + L.cols + ' x ' + L.rows + ' ' + L.paperName); doc.setProducer('Bleedline'); doc.setCreator('Bleedline poster tiler');
      return (labels || map) ? BL.embedFonts(doc).then(function (f) { fonts = f; }) : null;
    }).then(function () {
      progress(0, total, 'Preparing…');
      return map ? mapPage(PDFLib, doc, L, fonts).then(function () { done++; }) : null;
    }).then(function () {
      var r = 0, c = 0;
      function next() {
        if (cancelled) throw new Error('cancelled');
        if (r >= L.rows) return null;
        var t = tile(L, r, c);
        progress(done, total, 'Sheet ' + t.label + ' (' + (done + 1) + ' of ' + total + ')');
        var page = doc.addPage([L.paperW * 72, L.paperH * 72]);
        var work = t.empty ? Promise.resolve() : tileBytes(L, t).then(function (res) {
          return res.png ? doc.embedPng(res.bytes) : doc.embedJpg(res.bytes);
        }).then(function (img) {
          var P = 72;
          page.drawImage(img, {
            x: (L.margin + t.ix0 - t.x) * P,
            y: (L.paperH - L.margin - (t.iy1 - t.y)) * P,
            width: (t.ix1 - t.ix0) * P, height: (t.iy1 - t.iy0) * P
          });
        });
        return work.then(function () {
          if ($('#marks').checked) drawMarks(PDFLib, page, L, t);
          if (labels) drawLabel(PDFLib, page, L, t, fonts);
          done++;
          if (++c >= L.cols) { c = 0; r++; }
          return tick().then(next);
        });
      }
      return next();
    }).then(function () {
      progress(total, total, 'Saving the PDF…');
      return tick().then(function () { return doc.save(); });
    }).then(function (bytes) {
      var secs = (performance.now() - started) / 1000;
      var name = (src.name || 'poster').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40) + '-poster-' + L.cols + 'x' + L.rows + '-' + L.paper + '.pdf';
      BL.download(new Blob([bytes], { type: 'application/pdf' }), name);
      $('#pt-progress-text').textContent = 'Done: ' + total + ' pages, ' + BL.fmt(bytes.length / 1048576, 1) + ' MB in ' + BL.fmt(secs, 1) + ' s.';
      window.__ptLast = { pages: total, bytes: bytes.length, secs: secs };
    }).catch(function (e) {
      if (e && e.message === 'cancelled') { $('#pt-progress-text').textContent = 'Cancelled.'; return; }
      $('#pt-progress').hidden = true;
      BL.fail(e && e.message && /memory|allocation|Array buffer/i.test(e.message) ? new Error('Your browser ran out of memory making this PDF. Try fewer sheets or a smaller image.') : e, msg);
    }).then(function () {
      busy = false; $('#pt-cancel').hidden = true; render();
    });
  }

  /* ---------- wiring ---------- */
  var lastUnits = 'in';
  form.addEventListener('change', function (e) {
    if (e.target.name !== 'units') return;
    var u = units();
    if (u === lastUnits) return;
    var toMm = u === 'mm';
    var w = BL.num('#width', NaN), mg = BL.num('#margin', NaN), ov = BL.num('#overlap', NaN);
    if (isFinite(w)) $('#width').value = toMm ? +(w * 2.54).toFixed(1) : +(w / 2.54).toFixed(1);
    if (isFinite(mg)) $('#margin').value = toMm ? Math.round(mg * 25.4) : +(mg / 25.4).toFixed(2);
    if (isFinite(ov)) $('#overlap').value = toMm ? Math.round(ov * 25.4) : +(ov / 25.4).toFixed(2);
    lastUnits = u;
  });
  var hadSaved = BL.store.get('form:' + KEY, null) !== null;
  if (!hadSaved) {
    var lang = (navigator.language || 'en-US');
    if (!/^en-(US|CA)$|^es-(US|MX)$|^fr-CA$/i.test(lang) && !/^en$/i.test(lang)) {
      $('#paper').value = 'a4';
      document.querySelector('input[name="units"][value="mm"]').checked = true;
      $('#width').value = 56; $('#margin').value = 6; $('#overlap').value = 6;
    }
    if (BL.pro.active()) { $('#map').checked = true; }
  }
  BL.persist(form, KEY);
  lastUnits = units();
  BL.dropzone($('#pt-drop'), function (files) { useFile(files[0]); });
  $('#pt-sample').addEventListener('click', function () { sampleImage().catch(function (e) { BL.fail(e, $('#pt-msg')); }); });
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  $('#pt-export').addEventListener('click', exportPdf);
  $('#pt-cancel').addEventListener('click', function () { cancelled = true; });
  BL.pro.onChange(render);
  render();
})();
