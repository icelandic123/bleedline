/* Transparent PNG trimmer and checker. Works on exact decoded pixels (BL.img.decodePng), never through a full-size canvas,
   so even 25-megapixel shirt files are analysed and saved without canvas premultiplication changing edge colors. */
(function () {
  var BL = window.BL, I = BL.img, $ = BL.$;
  var img = null;      // {name, w, h, data, keep, dpi, file}
  var an = null;       // analysis of img
  var proc = null;     // {data, box} processed result
  var files = [];
  var focus = null;    // {x, y} close-up centre in image pixels
  var ZOOM_SRC = 72;   // source pixels shown across a close-up tile (300 px tile → about 4×)

  /* ---------- growable int arrays ---------- */
  function Grow(n) { this.a = new Int32Array(n || 1024); this.n = 0; }
  Grow.prototype.push = function (v) { if (this.n === this.a.length) { var b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; return this.n - 1; };

  /* ---------- analysis ---------- */
  // Labels connected pixels (alpha > 0, 8-connected) as runs per row with union-find, and checks edges for fringes.
  function analyze(im, opts, onProgress) {
    var w = im.w, h = im.h, d = im.data, T = opts.faintT;
    var rx0 = new Grow(), rx1 = new Grow(), ry = new Grow(), rmax = new Grow(), parent = new Grow();
    var transparent = 0, semi = 0, faint = 0, opaque = 0;
    var edge = 0, light = 0, dark = 0, best = null;
    var prevStart = 0, prevEnd = 0, y = 0;
    function find(i) { var p = parent.a; while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) { if (a < b) parent.a[b] = a; else parent.a[a] = b; } }
    var rows = Math.max(1, Math.floor(4e6 / w));
    return new Promise(function (resolve) {
      (function step() {
        var yEnd = Math.min(h, y + rows);
        for (; y < yEnd; y++) {
          var rowStart = rx0.n, o = y * w * 4, x = 0;
          while (x < w) {
            var a = d[o + x * 4 + 3];
            if (a === 0) { transparent++; x++; continue; }
            var x0 = x, mx = 0;
            while (x < w) {
              var aa = d[o + x * 4 + 3];
              if (aa === 0) break;
              if (aa > mx) mx = aa;
              if (aa === 255) opaque++;
              else {
                semi++; if (aa < T) faint++;
              }
              x++;
            }
            var id = rx0.push(x0); rx1.push(x - 1); ry.push(y); rmax.push(mx); parent.push(id);
            // connect to runs in the row above (8-connectivity: touching diagonally counts)
            for (var p = prevStart; p < prevEnd; p++) {
              if (rx1.a[p] < x0 - 1) continue;
              if (rx0.a[p] > x) break;
              union(id, p);
            }
          }
          prevStart = rowStart; prevEnd = rx0.n;
        }
        if (onProgress) onProgress(y / h);
        if (y < h) { setTimeout(step, 0); return; }
        resolve(finish());
      })();
    });
    function finish() {
      var nr = rx0.n, comp = new Int32Array(nr), nc = 0, map = new Map();
      var area = [], maxA = [], minX = [], minY = [], maxX = [], maxY = [];
      for (var r = 0; r < nr; r++) {
        var root = find(r), c = map.get(root);
        if (c === undefined) { c = nc++; map.set(root, c); area.push(0); maxA.push(0); minX.push(w); minY.push(h); maxX.push(-1); maxY.push(-1); }
        comp[r] = c;
        area[c] += rx1.a[r] - rx0.a[r] + 1;
        if (rmax.a[r] > maxA[c]) maxA[c] = rmax.a[r];
        if (rx0.a[r] < minX[c]) minX[c] = rx0.a[r];
        if (rx1.a[r] > maxX[c]) maxX[c] = rx1.a[r];
        if (ry.a[r] < minY[c]) minY[c] = ry.a[r];
        if (ry.a[r] > maxY[c]) maxY[c] = ry.a[r];
      }
      var comps = [];
      for (var i = 0; i < nc; i++) comps.push({ i: i, area: area[i], maxA: maxA[i], x0: minX[i], y0: minY[i], x1: maxX[i], y1: maxY[i] });
      var all = bboxOf(comps);
      var fr = fringes(d, w, h, distMap(d, w, h, 16));
      edge = fr.edge; light = fr.light; dark = fr.dark; best = fr.best;
      return {
        T: T, w: w, h: h, total: w * h, transparent: transparent, semi: semi, faint: faint, opaque: opaque,
        visible: w * h - transparent, edge: edge, light: light, dark: dark, fringeAt: best,
        runs: { x0: rx0.a, x1: rx1.a, y: ry.a, n: nr }, comp: comp, comps: comps, bbox: all,
        fakeChecker: transparent === 0 && semi === 0 && looksLikeChecker(d, w, h)
      };
    }
  }
  function bboxOf(list) {
    var b = null;
    list.forEach(function (c) {
      if (!b) b = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 };
      else { if (c.x0 < b.x0) b.x0 = c.x0; if (c.y0 < b.y0) b.y0 = c.y0; if (c.x1 > b.x1) b.x1 = c.x1; if (c.y1 > b.y1) b.y1 = c.y1; }
    });
    return b;
  }
  // Which components are stray specks with the current settings.
  function classify(a, speckMax, faintT) {
    var mains = a.comps.filter(function (c) { return c.area >= speckMax && c.maxA >= faintT; });
    mains.sort(function (p, q) { return q.area - p.area; });
    if (mains.length > 3000) mains = mains.slice(0, 3000);
    var gapMax = Math.max(8, Math.round(0.01 * Math.max(a.w, a.h)));
    var stray = new Uint8Array(a.comps.length), list = [], px = 0;
    if (mains.length) {
      a.comps.forEach(function (c) {
        if (c.area >= speckMax && c.maxA >= faintT) return;
        var far = true;
        if (c.maxA >= faintT) {
          for (var k = 0; k < mains.length; k++) {
            var m = mains[k];
            var dx = Math.max(0, m.x0 - c.x1, c.x0 - m.x1), dy = Math.max(0, m.y0 - c.y1, c.y0 - m.y1);
            if (Math.max(dx, dy) <= gapMax) { far = false; break; }
          }
        }
        if (far) { stray[c.i] = 1; list.push(c); px += c.area; }
      });
    }
    var kept = a.comps.filter(function (c) { return !stray[c.i]; });
    return { stray: stray, list: list, px: px, cleanBox: bboxOf(kept), gap: gapMax };
  }
  // A fake "transparent" background: two light neutral colors in blocks at the corners.
  function looksLikeChecker(d, w, h) {
    if (w < 64 || h < 64) return false;
    var corners = [[0, 0], [w - 32, 0], [0, h - 32], [w - 32, h - 32]], hits = 0;
    corners.forEach(function (c) {
      var counts = {};
      for (var y = c[1]; y < c[1] + 32; y++) for (var x = c[0]; x < c[0] + 32; x++) {
        var i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        if (Math.abs(r - g) > 8 || Math.abs(g - b) > 8 || r < 150) return;
        var k = r >> 3; counts[k] = (counts[k] || 0) + 1;
      }
      var top = Object.keys(counts).map(function (k) { return [+k, counts[k]]; }).sort(function (p, q) { return q[1] - p[1]; });
      if (top.length >= 2 && top[0][1] + top[1][1] > 900 && top[1][1] > 150 && Math.abs(top[0][0] - top[1][0]) >= 2) hits++;
    });
    return hits >= 3;
  }


  /* ---------- edges ---------- */
  // Chessboard distance (in px, capped) from each visible pixel to the nearest fully transparent one. Outside the canvas counts as far.
  var CAP = 12;
  function distMap(d, w, h, minA) {
    var m = new Uint8Array(w * h), x, y, i, v;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      if (d[i * 4 + 3] < minA) { m[i] = 0; continue; }
      v = CAP;
      if (x > 0) v = Math.min(v, m[i - 1] + 1);
      if (y > 0) { v = Math.min(v, m[i - w] + 1); if (x > 0) v = Math.min(v, m[i - w - 1] + 1); if (x < w - 1) v = Math.min(v, m[i - w + 1] + 1); }
      m[i] = v;
    }
    for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) {
      i = y * w + x; v = m[i];
      if (!v) continue;
      if (x < w - 1) v = Math.min(v, m[i + 1] + 1);
      if (y < h - 1) { v = Math.min(v, m[i + w] + 1); if (x < w - 1) v = Math.min(v, m[i + w + 1] + 1); if (x > 0) v = Math.min(v, m[i + w - 1] + 1); }
      m[i] = v;
    }
    return m;
  }
  function lumAt(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }
  // For a rim pixel, walk inward (away from transparency) to the first solid pixel, then 4 px further,
  // past a thin fringe but not through a deliberate thick outline. Returns that pixel's index or -1.
  function inward(m, d, w, h, x, y) {
    var i = y * w + x;
    var gx = (x < w - 1 ? m[i + 1] : CAP) - (x > 0 ? m[i - 1] : CAP), gy = (y < h - 1 ? m[i + w] : CAP) - (y > 0 ? m[i - w] : CAP);
    var len = Math.sqrt(gx * gx + gy * gy); if (!len) return -1;
    var ux = gx / len, uy = gy / len, t0 = -1;
    for (var t = 0; t <= 12; t++) {
      var tx = Math.round(x + ux * t), ty = Math.round(y + uy * t);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) return -1;
      if (d[(ty * w + tx) * 4 + 3] >= 250) { t0 = t; break; }
    }
    if (t0 < 0) return -1;
    var sx = Math.round(x + ux * (t0 + 4)), sy = Math.round(y + uy * (t0 + 4));
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return -1;
    var j = sy * w + sx;
    return d[j * 4 + 3] >= 250 ? j : -1;
  }
  // Rim much lighter than the art inside = light fringe (white halo); much darker = dark fringe.
  function fringeKind(d, i, j) {
    var diff = lumAt(d, i * 4) - lumAt(d, j * 4);
    return diff > 40 ? 1 : diff < -40 ? -1 : 0;
  }
  function fringes(d, w, h, m) {
    var edge = 0, light = 0, dark = 0, best = null, bestV = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = y * w + x, dv = m[i];
      if (dv < 1 || dv > 2) continue;
      var j = inward(m, d, w, h, x, y); if (j < 0) continue;
      var a = d[i * 4 + 3] / 255; edge += a;
      var k = fringeKind(d, i, j);
      if (k > 0) light += a; else if (k < 0) dark += a;
      if (k && a > bestV) { bestV = a; best = { x: x, y: y }; }
    }
    return { edge: edge, light: light, dark: dark, best: best };
  }

  /* ---------- processing ---------- */
  function opts() {
    return {
      stray: $('#stray').checked, speck: Math.max(1, Math.round(BL.num('#speck', 50))),
      faint: $('#faint').checked, faintT: Math.round(BL.num('#faintT', 10)),
      defringe: $('#defringe').checked, harden: $('#harden').checked, hardT: Math.round(BL.num('#hardT', 128)),
      trim: $('#trim').checked, pad: Math.max(0, Math.min(2000, Math.round(BL.num('#pad', 0))))
    };
  }
  function process(im, a, o) {
    var w = im.w, h = im.h, d = new Uint8Array(im.data), i, n = w * h * 4;
    var cls = classify(a, o.speck, o.faintT);
    if (o.stray && cls.list.length) {
      var R = a.runs;
      for (var r = 0; r < R.n; r++) if (cls.stray[a.comp[r]]) d.fill(0, (R.y[r] * w + R.x0[r]) * 4, (R.y[r] * w + R.x1[r] + 1) * 4);
    }
    if (o.faint) for (i = 3; i < n; i += 4) if (d[i] && d[i] < o.faintT) { d[i] = 0; d[i - 1] = d[i - 2] = d[i - 3] = 0; }
    if (o.defringe) defringe(d, w, h);
    if (o.harden) for (i = 3; i < n; i += 4) { var v = d[i]; if (v && v < 255) { if (v >= o.hardT) d[i] = 255; else { d[i] = 0; d[i - 1] = d[i - 2] = d[i - 3] = 0; } } }
    return { data: d, w: w, h: h, cls: cls, box: alphaBox(d, w, h) };
  }
  // Recolor the outer 6 px where it is much lighter or darker than the art inside it, keeping its opacity.
  function defringe(d, w, h) {
    var m = distMap(d, w, h, 1), fix = [];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = y * w + x, dv = m[i];
      if (dv < 1 || dv > 6) continue;
      var j = inward(m, d, w, h, x, y);
      if (j >= 0 && fringeKind(d, i, j)) fix.push(i, j);
    }
    for (var k = 0; k < fix.length; k += 2) { var a = fix[k] * 4, b = fix[k + 1] * 4; d[a] = d[b]; d[a + 1] = d[b + 1]; d[a + 2] = d[b + 2]; }
  }
  function alphaBox(d, w, h) {
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) {
      var o = y * w * 4, first = -1, last = -1;
      for (var x = 0; x < w; x++) if (d[o + x * 4 + 3]) { if (first < 0) first = x; last = x; }
      if (first >= 0) { if (first < x0) x0 = first; if (last > x1) x1 = last; if (y < y0) y0 = y; y1 = y; }
    }
    return x1 < 0 ? null : { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  // Crop/pad to the output size.
  function output(p, o) {
    if (!o.trim || !p.box) return { data: p.data, w: p.w, h: p.h };
    var b = p.box, pad = o.pad, W = b.x1 - b.x0 + 1 + 2 * pad, H = b.y1 - b.y0 + 1 + 2 * pad;
    var out = new Uint8Array(W * H * 4), rowLen = (b.x1 - b.x0 + 1) * 4;
    for (var y = b.y0; y <= b.y1; y++) out.set(p.data.subarray((y * p.w + b.x0) * 4, (y * p.w + b.x0) * 4 + rowLen), ((y - b.y0 + pad) * W + pad) * 4);
    return { data: out, w: W, h: H };
  }

  /* ---------- previews ---------- */
  var small = null; // {canvas, k}
  function downscale(d, w, h) { // premultiplied box average to at most 600 px
    var f = Math.max(1, Math.ceil(Math.max(w, h) / 600)), W = Math.ceil(w / f), H = Math.ceil(h / f);
    var acc = new Float64Array(W * 4), out = new Uint8ClampedArray(W * H * 4);
    for (var Y = 0; Y < H; Y++) {
      acc.fill(0);
      var ys = Y * f, ye = Math.min(h, ys + f), cnt = new Float64Array(W);
      for (var y = ys; y < ye; y++) {
        var o = y * w * 4;
        for (var x = 0; x < w; x++) {
          var i = o + x * 4, a = d[i + 3], X = (x / f) | 0, q = X * 4;
          cnt[X]++;
          if (!a) continue;
          acc[q] += d[i] * a; acc[q + 1] += d[i + 1] * a; acc[q + 2] += d[i + 2] * a; acc[q + 3] += a;
        }
      }
      for (var Xo = 0; Xo < W; Xo++) {
        var p = Xo * 4, A = acc[p + 3], t = (Y * W + Xo) * 4;
        if (A > 0) { out[t] = acc[p] / A; out[t + 1] = acc[p + 1] / A; out[t + 2] = acc[p + 2] / A; out[t + 3] = A / cnt[Xo]; }
      }
    }
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').putImageData(new ImageData(out, W, H), 0, 0);
    return { canvas: c, k: 1 / f, f: f };
  }
  function regionCanvas(d, w, h, cx, cy, R) {
    var x0 = Math.max(0, Math.min(w - R, Math.round(cx - R / 2))), y0 = Math.max(0, Math.min(h - R, Math.round(cy - R / 2)));
    var rw = Math.min(R, w), rh = Math.min(R, h), out = new Uint8ClampedArray(rw * rh * 4);
    for (var y = 0; y < rh; y++) out.set(d.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + rw) * 4), y * rw * 4);
    var c = document.createElement('canvas'); c.width = rw; c.height = rh;
    c.getContext('2d').putImageData(new ImageData(out, rw, rh), 0, 0);
    return { canvas: c, x0: x0, y0: y0, w: rw, h: rh };
  }
  function bgFor(cv) { var b = cv.getAttribute('data-bg'); return b === 'custom' ? $('#custom-bg').value : b; }
  var tiles = BL.$$('#tiles canvas');
  function drawTiles() {
    if (!img || !proc) return;
    var showOrig = $('#before').checked, zoom = BL.radio('view') === 'zoom';
    var data = showOrig ? img.data : proc.data, src, geo;
    if (zoom) {
      if (!focus) focus = defaultFocus();
      var reg = regionCanvas(data, img.w, img.h, focus.x, focus.y, ZOOM_SRC);
      src = reg.canvas; geo = { sx: reg.x0, sy: reg.y0, k: 300 / Math.max(reg.w, reg.h) };
    } else {
      if (!small || small.data !== data) { small = downscale(data, img.w, img.h); small.data = data; }
      src = small.canvas; geo = { sx: 0, sy: 0, k: 300 / Math.max(img.w, img.h) };
    }
    var dw = src.width * (zoom ? geo.k : 300 / Math.max(src.width, src.height)), dh = src.height * (zoom ? geo.k : 300 / Math.max(src.width, src.height));
    var ox = (300 - dw) / 2, oy = (300 - dh) / 2;
    tiles.forEach(function (cv) {
      var ctx = cv.getContext('2d'), bg = bgFor(cv);
      if (bg === 'checker') { for (var y = 0; y < 300; y += 10) for (var x = 0; x < 300; x += 10) { ctx.fillStyle = ((x + y) / 10 & 1) ? '#cfcfcf' : '#f2f2f2'; ctx.fillRect(x, y, 10, 10); } }
      else { ctx.fillStyle = bg; ctx.fillRect(0, 0, 300, 300); }
      ctx.imageSmoothingEnabled = !zoom; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, ox, oy, dw, dh);
      // trim box and speck marks
      var k = zoom ? geo.k : dw / img.w;
      function mx(x) { return ox + (x - geo.sx) * k; } function my(y) { return oy + (y - geo.sy) * k; }
      if (!showOrig && opts().trim && proc.box && !zoom) {
        var p = opts().pad;
        ctx.setLineDash([3, 3]); ctx.strokeStyle = bg === '#111111' || bg === '#1f2a44' ? 'rgba(94,234,212,.9)' : 'rgba(15,118,110,.9)'; ctx.lineWidth = 1;
        ctx.strokeRect(mx(proc.box.x0 - p), my(proc.box.y0 - p), (proc.box.x1 - proc.box.x0 + 1 + 2 * p) * k, (proc.box.y1 - proc.box.y0 + 1 + 2 * p) * k); ctx.setLineDash([]);
      }
      if ($('#marks').checked && proc.cls.list.length && (showOrig || !opts().stray)) {
        ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 2;
        proc.cls.list.slice(0, 400).forEach(function (c) {
          var cx = mx((c.x0 + c.x1 + 1) / 2), cy = my((c.y0 + c.y1 + 1) / 2), r = Math.max(6, (Math.max(c.x1 - c.x0, c.y1 - c.y0) + 1) * k / 2 + 4);
          if (cx < -r || cy < -r || cx > 300 + r || cy > 300 + r) return;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        });
      }
    });
    $('#view-hint').textContent = zoom ? 'Showing ' + ZOOM_SRC + ' × ' + ZOOM_SRC + ' px around (' + focus.x + ', ' + focus.y + ') at ' + BL.fmt(geo.k, 1) + '× zoom. Click to move; switch to Whole design to pick another spot.' : 'Click a spot on any preview to see it close up at about 4× zoom.' + (proc.cls.list.length && (!opts().stray || $('#before').checked) ? ' Red circles mark stray specks.' : '');
  }
  function defaultFocus() {
    if (an.fringeAt) return { x: an.fringeAt.x, y: an.fringeAt.y };
    if (proc && proc.cls.list.length) { var c = proc.cls.list[0]; return { x: (c.x0 + c.x1) >> 1, y: (c.y0 + c.y1) >> 1 }; }
    if (an.bbox) return { x: an.bbox.x0 + 20, y: (an.bbox.y0 + an.bbox.y1) >> 1 };
    return { x: img.w >> 1, y: img.h >> 1 };
  }
  tiles.forEach(function (cv) {
    cv.addEventListener('click', function (e) {
      if (!img) return;
      var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 300, y = (e.clientY - r.top) / r.height * 300;
      if (BL.radio('view') === 'zoom') {
        var k = 300 / ZOOM_SRC, reg = { x0: Math.max(0, Math.min(img.w - ZOOM_SRC, Math.round(focus.x - ZOOM_SRC / 2))), y0: Math.max(0, Math.min(img.h - ZOOM_SRC, Math.round(focus.y - ZOOM_SRC / 2))) };
        focus = { x: Math.round(reg.x0 + (x - (300 - Math.min(ZOOM_SRC, img.w) * k) / 2) / k), y: Math.round(reg.y0 + (y - (300 - Math.min(ZOOM_SRC, img.h) * k) / 2) / k) };
      } else {
        var s = 300 / Math.max(img.w, img.h), ox = (300 - img.w * s) / 2, oy = (300 - img.h * s) / 2;
        focus = { x: Math.round((x - ox) / s), y: Math.round((y - oy) / s) };
        document.querySelector('input[name=view][value=zoom]').checked = true;
      }
      focus.x = Math.max(0, Math.min(img.w - 1, focus.x)); focus.y = Math.max(0, Math.min(img.h - 1, focus.y));
      drawTiles();
    });
  });

  /* ---------- report ---------- */
  function pct(n, d) { return d ? (n / d * 100) : 0; }
  function fpct(v) { return v === 0 ? '0%' : v < 0.1 ? '<0.1%' : BL.fmt(v, v < 10 ? 1 : 0) + '%'; }
  function px(n) { return Number(n).toLocaleString(); }
  function li(cls, sym, title, detail) { return '<li><span class="ic ' + cls + '" aria-hidden="true">' + sym + '</span><div><strong>' + title + '</strong><span class="d">' + detail + '</span></div></li>'; }
  function report() {
    var a = an, o = opts(), cls = proc.cls, out = [];
    if (a.fakeChecker) out.push(li('bad', '!', 'Fake transparency', 'There are no transparent pixels, and the corners look like a gray-and-white checkerboard painted into the image. It will print as a checkerboard. Find a real transparent PNG or remove the background first.'));
    else if (!a.transparent && !a.semi) out.push(li('bad', '!', 'No transparency', 'Every pixel is solid, so the whole rectangle prints, background included. If the design should float on the shirt, remove the background first.'));
    else out.push(li('ok', '✓', 'Transparent background', fpct(pct(a.transparent, a.total)) + ' of the canvas is fully transparent.'));
    if (a.visible && a.semi) {
      var sp = pct(a.semi, a.visible);
      out.push(li(sp > 15 ? 'warn' : 'info', sp > 15 ? '!' : 'i', 'Semi-transparent pixels: ' + fpct(sp) + ' of the design', sp > 15 ? 'A lot of the design is partly see-through (shadows, glows, soft brushes). Printers render that with dots or thin ink, which can look grainy and let the white underbase show on dark shirts.' : px(a.semi) + ' px, mostly the smooth edges of the artwork. That is normal.'));
    }
    if (cls.list.length) out.push(li('warn', '!', px(cls.list.length) + ' stray speck' + (cls.list.length === 1 ? '' : 's') + ' (' + px(cls.px) + ' px)', 'Separate bits smaller than ' + o.speck + ' px that are nearly invisible or more than ' + cls.gap + ' px from the artwork. They can print as faint dots. ' + (o.stray ? 'Removed in the cleaned file.' : 'Tick "Remove stray specks" to delete them.')));
    else if (a.visible) out.push(li('ok', '✓', 'No stray specks', 'No small separate bits away from the artwork.'));
    if (a.faint) out.push(li(a.faint > 1000 ? 'warn' : 'info', a.faint > 1000 ? '!' : 'i', px(a.faint) + ' near-invisible pixels', 'Opacity under ' + o.faintT + ' of 255. Invisible on screen, but they can pick up ink. ' + (o.faint ? 'Removed in the cleaned file.' : '')));
    if (a.edge > 20) {
      var lp = pct(a.light, a.edge), dp = pct(a.dark, a.edge);
      if (lp > 8) out.push(li('warn', '!', 'Light fringe on ' + fpct(lp) + ' of edge pixels', 'The outer pixels are much lighter than the art just inside them, usually white left from the old background. It shows as a pale outline on dark shirts (see the black and navy previews). If it is a deliberate outline, ignore this. ' + (o.defringe || o.harden ? 'Being cleaned up.' : 'Tick "Clean up edge fringe".')));
      if (dp > 8) out.push(li('warn', '!', 'Dark fringe on ' + fpct(dp) + ' of edge pixels', 'The outer pixels are much darker than the art just inside them. It shows as a dark rim on white and light shirts. If it is a deliberate outline, ignore this. ' + (o.defringe || o.harden ? 'Being cleaned up.' : 'Tick "Clean up edge fringe".')));
      if (lp <= 8 && dp <= 8) out.push(li('ok', '✓', 'Clean edges', 'No light or dark halo around the artwork (' + fpct(lp) + ' light, ' + fpct(dp) + ' dark).'));
    }
    $('#report').innerHTML = out.join('');
    // sizes
    var o2 = opts(), b = proc.box, html = '<div class="stat"><div class="k">Original</div><div class="v" style="font-size:1rem">' + px(img.w) + ' × ' + px(img.h) + '</div><div class="s">' + (img.dpi ? Math.round(img.dpi) + ' DPI' : 'no DPI stored') + '</div></div>';
    if (b) {
      var W = o2.trim ? b.x1 - b.x0 + 1 + 2 * o2.pad : img.w, H = o2.trim ? b.y1 - b.y0 + 1 + 2 * o2.pad : img.h;
      html += '<div class="stat hi"><div class="k">Cleaned file</div><div class="v" style="font-size:1rem">' + px(W) + ' × ' + px(H) + '</div><div class="s">' + (o2.trim ? 'trimmed' + (o2.pad ? ', ' + o2.pad + ' px padding' : '') : 'not trimmed') + '</div></div>';
      html += '<div class="stat"><div class="k">Empty margins</div><div class="v" style="font-size:.95rem">' + px(b.y0) + ' / ' + px(img.w - 1 - b.x1) + ' / ' + px(img.h - 1 - b.y1) + ' / ' + px(b.x0) + '</div><div class="s">top / right / bottom / left, px</div></div>';
      if (a.bbox && cls.cleanBox && (a.bbox.x1 - a.bbox.x0 !== cls.cleanBox.x1 - cls.cleanBox.x0 || a.bbox.y1 - a.bbox.y0 !== cls.cleanBox.y1 - cls.cleanBox.y0)) {
        html += '<div class="stat"><div class="k">Specks stretch the box</div><div class="v" style="font-size:.95rem">' + px(a.bbox.x1 - a.bbox.x0 + 1) + ' × ' + px(a.bbox.y1 - a.bbox.y0 + 1) + '</div><div class="s">vs ' + px(cls.cleanBox.x1 - cls.cleanBox.x0 + 1) + ' × ' + px(cls.cleanBox.y1 - cls.cleanBox.y0 + 1) + ' for the artwork alone</div></div>';
      }
    } else html += '<div class="stat"><div class="k">Cleaned file</div><div class="v" style="font-size:1rem">Empty</div><div class="s">nothing visible is left</div></div>';
    $('#sizes').innerHTML = html;
    $('#save').disabled = !b;
  }

  /* ---------- load ---------- */
  function decode(file) {
    return Promise.all([file.arrayBuffer(), I.fflate()]).then(function (r) {
      var bytes = new Uint8Array(r[0]), fmt = I.sniff(bytes), name = file.name || 'pasted-image.png';
      if (fmt === 'png') {
        var d = I.decodePng(bytes);
        return { name: name, file: file, w: d.width, h: d.height, data: d.data, keep: d.keep, dpi: d.dpi, bitDepth: d.bitDepth };
      }
      if (fmt === 'jpeg') throw new Error('This is a JPEG. JPEG files can\'t have a transparent background, so there is nothing to check. Export your design as PNG.');
      if (fmt === 'webp') return BL.loadImage(file).then(function (im) {
        var read = I.imageRowReader(im.img, 0, 0, im.width, im.height), data = new Uint8Array(im.width * im.height * 4);
        data.set(read(0, im.height)); URL.revokeObjectURL(im.url);
        return { name: name, file: file, w: im.width, h: im.height, data: data, keep: [], dpi: null };
      });
      I.readInfo(bytes);
      throw new Error('Please use a PNG file.');
    });
  }
  function handleFiles(list) {
    list = list.filter(Boolean); if (!list.length) return;
    var pro = BL.pro.active();
    $('#pro-hint').hidden = !(list.length > 1 && !pro);
    $('#pro-count').textContent = list.length;
    files = pro ? list : list.slice(0, 1);
    openFile(files[0]);
    renderBatch();
  }
  function openFile(file) {
    var msg = $('#load-msg'), prog = $('#prog'), bar = prog.firstElementChild;
    msg.innerHTML = '<p class="small muted"><span class="spinner"></span> Reading ' + BL.esc(file.name || 'image') + '…</p>';
    $('#save').disabled = true; $('#save-msg').innerHTML = '';
    img = null; an = null; proc = null; small = null; focus = null;
    decode(file).then(function (im) {
      if (im.w * im.h > 120e6) throw new Error('This image is ' + px(im.w) + ' × ' + px(im.h) + ' pixels, too large to check in a browser tab.');
      img = im; prog.hidden = false; bar.style.width = '0';
      return analyze(im, { faintT: Math.round(BL.num('#faintT', 10)) }, function (f) { bar.style.width = (f * 100) + '%'; });
    }).then(function (a) {
      an = a; prog.hidden = true; msg.innerHTML = '';
      $('#fname').textContent = img.name; $('#report-panel').hidden = false;
      $('#dpi-field').hidden = !!img.dpi; $('#dpi-keep').hidden = !img.dpi;
      $('#dpi-keep').textContent = img.dpi ? 'Keeps the file\'s ' + Math.round(img.dpi) + ' DPI' + (img.keep.length ? ' and color profile.' : '.') : '';
      refresh();
      BL.track('png-check', a.light || a.dark ? 'fringe' : 'clean');
    }).catch(function (e) { prog.hidden = true; BL.fail(e, msg); });
  }
  var timer = null;
  function refresh() {
    if (!img || !an) return;
    var o = opts();
    if (o.faintT !== an.T) { // recount near-invisible pixels for the new threshold
      var n = 0, d = img.data;
      for (var i = 3; i < d.length; i += 4) if (d[i] && d[i] < o.faintT) n++;
      an.faint = n; an.T = o.faintT;
    }
    proc = process(img, an, o);
    small = null;
    report(); drawTiles();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 120); }

  /* ---------- save ---------- */
  function dpiChoice() {
    if (img && img.dpi) return img.dpi;
    var m = BL.radio('dpimode');
    if (m === 'none') return null;
    if (m === 'other') { var v = Math.round(BL.num('#dpi-other')); return v >= 1 && v <= 65535 ? v : 300; }
    return 300;
  }
  function encode(im, p, o, onProgress) {
    var out = output(p, o);
    return I.encodePng(out.data, out.w, out.h, { dpi: im.dpi ? null : dpiChoice(), keep: im.keep.concat(im.dpi ? [{ type: 'pHYs', data: physData(im.dpi) }] : []) }, onProgress)
      .then(function (blob) { return { blob: blob, w: out.w, h: out.h, name: I.baseName(im.name) + '-clean.png' }; });
  }
  function physData(dpi) { var c = I.physChunk(dpi); return c.subarray(8, 17); }
  function save() {
    if (!img || !proc) return;
    var msg = $('#save-msg'), o = opts();
    msg.innerHTML = '<p class="small muted"><span class="spinner"></span> Saving…</p>';
    encode(img, proc, o).then(function (r) {
      BL.download(r.blob, r.name);
      var d = img.dpi || dpiChoice();
      msg.innerHTML = '<div class="note ok">Saved <strong>' + BL.esc(r.name) + '</strong>: ' + px(r.w) + ' × ' + px(r.h) + ' px, ' + (d ? Math.round(d) + ' DPI' : 'no DPI') + ', ' + I.fmtBytes(r.blob.size) + '.' + (img.bitDepth === 16 ? ' Saved as 8-bit (the original was 16-bit).' : '') + '</div>';
    }).catch(function (e) { BL.fail(e, msg); });
  }

  /* ---------- batch (Pro) ---------- */
  function renderBatch() {
    var show = BL.pro.active() && files.length > 1;
    $('#batch-panel').hidden = !show;
    if (!show) return;
    $('#batch-sum').textContent = files.length + ' files. Each is checked and cleaned with the settings on the left, then zipped with a CSV report.';
    $('#batch-table tbody').innerHTML = files.map(function (f, i) { return '<tr data-i="' + i + '"><td>' + BL.esc(f.name || 'image') + '</td><td colspan="4" class="muted small">waiting</td></tr>'; }).join('');
  }
  function csvCell(v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function batch() {
    if (!BL.pro.gate(true, 'Cleaning many PNGs at once is part of Bleedline Pro.')) return;
    var o = opts(), out = [], used = {}, rows = [['file', 'width', 'height', 'transparent_pct', 'semi_transparent_pct', 'stray_specks', 'stray_px', 'near_invisible_px', 'light_fringe_pct', 'dark_fringe_pct', 'output_file', 'output_width', 'output_height', 'note']];
    var bar = $('#bprog').firstElementChild, msg = $('#bmsg'), btn = $('#batch-go'), i = 0;
    btn.disabled = true; $('#bprog').hidden = false; bar.style.width = '0'; msg.innerHTML = '';
    function next() {
      if (i >= files.length) return Promise.resolve();
      var f = files[i++], tr = BL.$('#batch-table tr[data-i="' + (i - 1) + '"]');
      return decode(f).then(function (im) {
        return analyze(im, o).then(function (a) {
          var p = process(im, a, o);
          return encode(im, p, o).then(function (r) { return BL.blobBytes(r.blob).then(function (bytes) {
            var name = r.name, k = 2;
            while (used[name.toLowerCase()]) name = r.name.replace(/\.png$/, '-' + (k++) + '.png');
            used[name.toLowerCase()] = 1; out.push({ name: name, data: bytes });
            var lp = pct(a.light, a.edge), dp = pct(a.dark, a.edge);
            rows.push([im.name, im.w, im.h, pct(a.transparent, a.total).toFixed(1), pct(a.semi, a.visible).toFixed(1), p.cls.list.length, p.cls.px, a.faint, lp.toFixed(1), dp.toFixed(1), name, r.w, r.h, a.fakeChecker ? 'fake checkerboard background' : (!a.transparent && !a.semi ? 'no transparency' : '')]);
            if (tr) tr.innerHTML = '<td>' + BL.esc(im.name) + '</td><td>' + fpct(pct(a.transparent, a.total)) + '</td><td>' + p.cls.list.length + '</td><td>' + (lp > 8 ? 'light ' : '') + (dp > 8 ? 'dark' : '') + (lp <= 8 && dp <= 8 ? 'clean' : '') + '</td><td>' + px(r.w) + ' × ' + px(r.h) + '</td>';
          }); });
        });
      }).catch(function (e) {
        rows.push([f.name, '', '', '', '', '', '', '', '', '', '', '', '', e.message]);
        if (tr) tr.innerHTML = '<td>' + BL.esc(f.name || 'image') + '</td><td colspan="4" class="small" style="color:var(--danger)">' + BL.esc(e.message) + '</td>';
      }).then(function () { bar.style.width = (100 * i / files.length) + '%'; return I.sleep(); }).then(next);
    }
    next().then(function () {
      out.push({ name: 'png-report.csv', data: new TextEncoder().encode('\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n')) });
      return BL.zip(out);
    }).then(function (blob) {
      BL.download(blob, 'cleaned-pngs.zip');
      msg.innerHTML = '<div class="note ok">Zipped ' + (out.length - 1) + ' cleaned PNG' + (out.length === 2 ? '' : 's') + ' and png-report.csv (' + I.fmtBytes(blob.size) + ').</div>';
    }).catch(function (e) { BL.fail(e, msg); }).then(function () { btn.disabled = false; $('#bprog').hidden = true; });
  }

  /* ---------- wiring ---------- */
  var form = $('#tp-form');
  BL.persist(form, 'transparent-png-trimmer');
  function syncLabels() {
    var t = Math.round(BL.num('#faintT', 10));
    $('#faintT-out').textContent = t; $('#faintT-pct').textContent = Math.round(t / 255 * 100) + '%';
    $('#hardT-out').textContent = $('#hardT').value;
    $('#harden-sub').hidden = !$('#harden').checked;
    $('#dpi-other').hidden = BL.radio('dpimode') !== 'other';
  }
  syncLabels();
  form.addEventListener('input', function () { syncLabels(); schedule(); });
  form.addEventListener('change', function () { syncLabels(); schedule(); });
  BL.$$('input[name=view], #before, #marks, #custom-bg').forEach(function (el) { el.addEventListener('input', drawTiles); el.addEventListener('change', drawTiles); });
  BL.dropzone($('#drop'), handleFiles);
  $('#save').addEventListener('click', save);
  $('#batch-go').addEventListener('click', batch);
  BL.pro.onChange(renderBatch);
})();
