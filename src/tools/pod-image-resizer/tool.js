/* Print-on-demand image resizer. Exact pixel sizes per preset, fit (pad) or fill (crop), never stretch.
   Resampling and PNG encoding are done in strips by BL.img (assets/image.js), so outputs are not limited by canvas size. */
(function () {
  var BL = window.BL, I = BL.img, $ = BL.$;

  // Only values verified on the platforms' own pages (research/specs.md, checked 2026-10-19).
  // kind sets the recommended defaults: apparel = fit/top/PNG, item = fit/center/PNG, art = fill/center/PNG, photo = fill/center/JPEG on white.
  var GROUPS = [
    { name: 'T-shirts and apparel', items: [
      { id: 'redbubble-mens-tshirt', name: 'Redbubble men\'s graphic T-shirt (min.)', w: 3873, h: 4814, kind: 'apparel', maxMB: 300 },
      { id: 'redbubble-premium-tshirt', name: 'Redbubble premium T-shirt (min.)', w: 2875, h: 3900, kind: 'apparel', maxMB: 300 },
      { id: 'redbubble-other-apparel', name: 'Redbubble other apparel (min.)', w: 2400, h: 3200, kind: 'apparel', maxMB: 300 },
      { id: 'teepublic', name: 'TeePublic, all products', w: 5000, h: 5500, kind: 'apparel' },
      { id: 'spring-apparel', name: 'Spring standard apparel', w: 3720, h: 4950, kind: 'apparel', maxMB: 50 },
      { id: 'dtg-12x16-300dpi', name: 'DTG front 12 × 16 in at 300 DPI (Printful standard)', w: 3600, h: 4800, kind: 'apparel', inches: [12, 16] },
      { id: 'dtg-15x18-300dpi', name: 'DTG 15 × 18 in at 300 DPI (Printful large)', w: 4500, h: 5400, kind: 'apparel', inches: [15, 18] },
      { id: 'spreadshop-4000', name: 'Spreadshop, 4000 px longest side', long: 4000, kind: 'apparel', maxMB: 10 }
    ] },
    { name: 'Stickers and products (Redbubble)', items: [
      { id: 'redbubble-sticker', name: 'Sticker (recommended)', w: 2800, h: 2800, kind: 'item', maxMB: 300 },
      { id: 'redbubble-mug', name: 'Mug (min.)', w: 2700, h: 1120, kind: 'item', maxMB: 300 },
      { id: 'redbubble-phone-case', name: 'Phone case (min.)', w: 1187, h: 1852, kind: 'art', maxMB: 300 },
      { id: 'redbubble-throw-pillow', name: 'Throw pillow (min.)', w: 3225, h: 3225, kind: 'art', maxMB: 300 },
      { id: 'redbubble-tote', name: 'Cotton tote (min.)', w: 2400, h: 3200, kind: 'item', maxMB: 300 },
      { id: 'redbubble-hat', name: 'Hat (min.)', w: 2400, h: 1140, kind: 'item', maxMB: 300 }
    ] },
    { name: 'Wall art and cards (Redbubble)', items: [
      { id: 'redbubble-art-print', name: 'Art print (recommended)', w: 3840, h: 3840, kind: 'art', maxMB: 300 },
      { id: 'redbubble-poster-xs', name: 'Poster XS (min.)', w: 2870, h: 4100, kind: 'art', maxMB: 300 },
      { id: 'redbubble-poster-s', name: 'Poster S (min.)', w: 4100, h: 5840, kind: 'art', maxMB: 300 },
      { id: 'redbubble-poster-m', name: 'Poster M (min.)', w: 5840, h: 8310, kind: 'art', maxMB: 300 },
      { id: 'redbubble-poster-l', name: 'Poster L (min.)', w: 8310, h: 11790, kind: 'art', maxMB: 300 },
      { id: 'redbubble-canvas-s', name: 'Canvas S (min.)', w: 2400, h: 1600, kind: 'art', maxMB: 300 },
      { id: 'redbubble-canvas-m', name: 'Canvas M (min.)', w: 3240, h: 2160, kind: 'art', maxMB: 300 },
      { id: 'redbubble-canvas-l', name: 'Canvas L (min.)', w: 3840, h: 2560, kind: 'art', maxMB: 300 },
      { id: 'redbubble-canvas-xl', name: 'Canvas XL (min.)', w: 4800, h: 4800, kind: 'art', maxMB: 300 },
      { id: 'redbubble-card', name: 'Greeting card (min.)', w: 2400, h: 1600, kind: 'art', maxMB: 300 }
    ] },
    { name: 'Etsy shop images', items: [
      { id: 'etsy-listing-2000', name: 'Etsy listing photo, square', w: 2000, h: 2000, kind: 'photo', softMB: 1 },
      { id: 'etsy-shop-logo', name: 'Etsy shop logo', w: 500, h: 500, kind: 'photo' },
      { id: 'etsy-big-banner', name: 'Etsy big banner', w: 1600, h: 400, kind: 'photo' }
    ] },
    { name: 'Your own size', items: [{ id: 'custom', name: 'Custom size', custom: true, kind: 'apparel' }] }
  ];
  var PRESETS = {}; GROUPS.forEach(function (g) { g.items.forEach(function (p) { PRESETS[p.id] = p; }); });
  var KIND = {
    apparel: { mode: 'fit', fy: 0, fx: 0.5, fmt: 'png', bg: 'transparent' },
    item: { mode: 'fit', fy: 0.5, fx: 0.5, fmt: 'png', bg: 'transparent' },
    art: { mode: 'fill', fy: 0.5, fx: 0.5, fmt: 'png', bg: 'transparent' },
    photo: { mode: 'fill', fy: 0.5, fx: 0.5, fmt: 'jpeg', bg: 'white' }
  };
  var MAX_SIDE = 32767;

  var src = null;          // current source {name, w, h, img, url, data, keep, trim, hasAlpha}
  var files = [];          // all dropped files (Pro batch)
  var pos = { fx: 0.5, fy: 0 };
  var busy = false;

  /* ---------- presets UI ---------- */
  $('#presets').innerHTML = GROUPS.map(function (g) {
    return '<fieldset><legend>' + BL.esc(g.name) + '</legend>' + g.items.map(function (p) {
      var dim = p.custom ? '' : p.long ? p.long + ' px' : p.w + ' × ' + p.h;
      return '<label><input type="checkbox" value="' + p.id + '" data-nopersist><span>' + BL.esc(p.name) + '</span><span class="dim">' + dim + '</span></label>';
    }).join('') + '</fieldset>';
  }).join('');
  var boxes = BL.$$('#presets input');
  function chosen() { return boxes.filter(function (b) { return b.checked; }).map(function (b) { return PRESETS[b.value]; }); }
  function setChosen(ids) { boxes.forEach(function (b) { b.checked = ids.indexOf(b.value) >= 0; }); }
  (function initPresets() {
    var saved = BL.store.get('resizer-presets', ['redbubble-mens-tshirt']);
    saved = saved.filter(function (id) { return PRESETS[id]; });
    if (!saved.length) saved = ['redbubble-mens-tshirt'];
    if (!BL.pro.active()) saved = saved.slice(0, 1);
    setChosen(saved);
  })();
  $('#presets').addEventListener('change', function (e) {
    var b = e.target;
    if (!BL.pro.active() && b.checked) boxes.forEach(function (o) { if (o !== b) o.checked = false; }); // free: behaves like a single choice
    if (!chosen().length) b.checked = true;
    BL.store.set('resizer-presets', chosen().map(function (p) { return p.id; }));
    if (chosen().length === 1) applyKind(chosen()[0]);
    syncUi(); update();
  });

  function applyKind(p) {
    var k = KIND[p.kind];
    setRadio('mode', k.mode); setRadio('valign', String(k.fy)); setRadio('halign', String(k.fx)); setRadio('fmt', k.fmt); setRadio('bg', k.bg);
    pos.fx = k.fx; pos.fy = k.fy;
  }
  function setRadio(name, v) { var el = document.querySelector('input[name="' + name + '"][value="' + v + '"]'); if (el) el.checked = true; }

  /* ---------- settings ---------- */
  function settings(p, useRec) {
    var k = KIND[p.kind], s;
    if (useRec) s = { mode: k.mode, fx: k.fx, fy: k.fy, fmt: k.fmt, bg: k.bg };
    else s = { mode: BL.radio('mode'), fx: pos.fx, fy: pos.fy, fmt: BL.radio('fmt'), bg: BL.radio('bg') };
    s.color = hex($('#bgcolor').value);
    s.quality = BL.num('#quality', 90) / 100;
    s.dpi = Math.round(BL.num('#dpi', 300));
    if (!(s.dpi >= 1 && s.dpi <= 65535)) s.dpi = 300;
    s.trim = $('#trim').checked;
    if (s.fmt === 'jpeg' && s.bg === 'transparent') s.bg = 'white';
    s.bgRGBA = s.bg === 'white' ? [255, 255, 255, 255] : s.bg === 'custom' ? s.color.concat(255) : [0, 0, 0, 0];
    return s;
  }
  function hex(v) { var m = /^#?([0-9a-f]{6})$/i.exec(v || ''); var n = m ? parseInt(m[1], 16) : 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function presetSize(p) {
    if (p.custom) {
      var w = Math.round(BL.num('#cw')), h = Math.round(BL.num('#ch'));
      if (!(w >= 1 && h >= 1)) throw new Error('Enter a width and height of at least 1 pixel.');
      if (w > MAX_SIDE || h > MAX_SIDE) throw new Error('The largest size this tool makes is 32,767 px on a side.');
      return { w: w, h: h };
    }
    return { w: p.w, h: p.h };
  }

  /* ---------- layout ---------- */
  // Where the source region goes in the output frame. Never stretches: one scale for both axes.
  function layout(source, p, s) {
    var box = s.trim && source.trim ? source.trim : { x: 0, y: 0, w: source.w, h: source.h };
    var L = { bx: box.x, by: box.y, bw: box.w, bh: box.h };
    if (p.long) {
      var k = p.long / Math.max(box.w, box.h);
      L.FW = Math.max(1, Math.round(box.w * k)); L.FH = Math.max(1, Math.round(box.h * k));
      L.sx = box.x; L.sy = box.y; L.sw = box.w; L.sh = box.h; L.dw = L.FW; L.dh = L.FH; L.ox = 0; L.oy = 0; L.scale = k; L.mode = 'long';
      return L;
    }
    var sz = presetSize(p); L.FW = sz.w; L.FH = sz.h; L.mode = s.mode;
    if (s.mode === 'fill') {
      var sc = Math.max(L.FW / box.w, L.FH / box.h);
      var cw = Math.min(box.w, Math.max(1, Math.round(L.FW / sc))), ch = Math.min(box.h, Math.max(1, Math.round(L.FH / sc)));
      L.sw = cw; L.sh = ch; L.sx = box.x + Math.round((box.w - cw) * s.fx); L.sy = box.y + Math.round((box.h - ch) * s.fy);
      L.dw = L.FW; L.dh = L.FH; L.ox = 0; L.oy = 0; L.scale = sc;
    } else {
      var sf = Math.min(L.FW / box.w, L.FH / box.h);
      L.dw = Math.min(L.FW, Math.max(1, Math.round(box.w * sf))); L.dh = Math.min(L.FH, Math.max(1, Math.round(box.h * sf)));
      L.sx = box.x; L.sy = box.y; L.sw = box.w; L.sh = box.h;
      L.ox = Math.round((L.FW - L.dw) * s.fx); L.oy = Math.round((L.FH - L.dh) * s.fy); L.scale = sf;
    }
    return L;
  }

  /* ---------- loading ---------- */
  function loadSource(file) {
    var out = { name: file.name || 'pasted-image.png', file: file };
    return file.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf), fmt = I.sniff(bytes);
      if (['png', 'jpeg', 'webp'].indexOf(fmt) < 0) {
        I.readInfo(bytes); // throws a helpful message for HEIC, GIF, ...
        throw new Error(out.name + ' is not a PNG, JPEG or WebP image.');
      }
      out.format = fmt;
      return BL.loadImage(file).then(function (im) {
        out.img = im.img; out.url = im.url; out.w = im.width; out.h = im.height;
        if (fmt === 'png' && out.w * out.h <= 80e6) {
          // Decode PNGs ourselves: exact alpha edges, 16-bit sources, color profile kept.
          return I.fflate().then(function () {
            var d = I.decodePng(bytes);
            if (d.width === out.w && d.height === out.h) { out.data = d.data; out.keep = d.keep; }
          }).catch(function () { /* fall back to the canvas reader */ });
        }
      }).then(function () { return scan(out); }).then(function () { return out; });
    });
  }
  // Find the bounding box of visible pixels (alpha > 10) and whether there is any transparency.
  function scan(s) {
    var read = s.data ? I.bufferRowReader(s.data, s.w, 0, 0, s.w) : I.imageRowReader(s.img, 0, 0, s.w, s.h);
    var strip = Math.max(1, Math.min(512, Math.floor(16e6 / (s.w * 4)))), y = 0;
    var minX = s.w, minY = s.h, maxX = -1, maxY = -1, alpha = false;
    return new Promise(function (resolve, reject) {
      (function step() {
        try {
          var n = Math.min(strip, s.h - y), d = read(y, n), w = s.w;
          for (var r = 0; r < n; r++) {
            var base = r * w * 4, rowMin = -1, rowMax = -1;
            for (var x = 0, i = base + 3; x < w; x++, i += 4) {
              var a = d[i];
              if (a !== 255) alpha = true;
              if (a > 10) { if (rowMin < 0) rowMin = x; rowMax = x; }
            }
            if (rowMin >= 0) { if (rowMin < minX) minX = rowMin; if (rowMax > maxX) maxX = rowMax; if (y + r < minY) minY = y + r; maxY = y + r; }
          }
          y += n;
          if (y < s.h) setTimeout(step, 0);
          else {
            s.hasAlpha = alpha;
            s.trim = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
            if (s.trim && s.trim.w === s.w && s.trim.h === s.h) s.trim = null;
            s.empty = maxX < 0;
            resolve();
          }
        } catch (e) { reject(e); }
      })();
    });
  }

  function handleFiles(list) {
    list = list.filter(Boolean);
    if (!list.length || busy) return;
    var pro = BL.pro.active();
    $('#pro-hint').hidden = !(list.length > 1 && !pro);
    $('#pro-count').textContent = list.length;
    files = pro ? list : list.slice(0, 1);
    renderQueue();
    $('#msg').innerHTML = '<p class="small muted"><span class="spinner"></span> Reading ' + BL.esc(files[0].name || 'image') + '…</p>';
    if (src && src.url) URL.revokeObjectURL(src.url);
    src = null; update();
    loadSource(files[0]).then(function (s) {
      src = s; $('#msg').innerHTML = '';
      if (s.empty) $('#msg').innerHTML = '<div class="note warn">This image is completely transparent, so there is nothing to resize.</div>';
      update();
      BL.track('resize-load', s.format);
    }).catch(function (e) { BL.fail(e, $('#msg')); });
  }

  /* ---------- preview ---------- */
  var cv = $('#rs-canvas'), lastL = null, pvScale = 1;
  function previewPreset() {
    var list = chosen(), sel = $('#pv-pick');
    if (list.length < 2) return list[0];
    return PRESETS[sel.value] || list[0];
  }
  function syncUi() {
    var list = chosen(), sel = $('#pv-pick');
    $('#custom-row').hidden = !list.some(function (p) { return p.custom; });
    $('#pv-pick-row').hidden = list.length < 2;
    var cur = sel.value;
    sel.innerHTML = list.map(function (p) { return '<option value="' + p.id + '">' + BL.esc(p.name) + '</option>'; }).join('');
    if (PRESETS[cur] && list.indexOf(PRESETS[cur]) >= 0) sel.value = cur;
    var fmt = BL.radio('fmt');
    $('#q-field').hidden = fmt !== 'jpeg';
    $('#q-out').textContent = $('#quality').value;
    $('#bg-transparent-label').style.opacity = fmt === 'jpeg' ? '.5' : '';
    $('#bg-hint').textContent = fmt === 'jpeg' ? 'JPEG can\'t be transparent, so empty areas get the background color (white unless you pick one).' : BL.radio('bg') === 'transparent' ? 'Empty areas stay transparent, so nothing prints there.' : '';
    $('#mode-hint').textContent = BL.radio('mode') === 'fill' ? 'The image covers the whole frame; whatever sticks out is cropped. Drag the preview to move the crop.' : 'The whole design fits, with empty space around it.';
    var n = list.length * Math.max(1, files.length);
    $('#go').textContent = list.length > 1 || files.length > 1 ? 'Download ' + n + ' files (zip)' : 'Download ' + (fmt === 'jpeg' ? 'JPEG' : 'PNG');
    renderQueue();
  }
  function update() {
    syncUi();
    var p = previewPreset(), stats = $('#stats'), warn = $('#warn');
    if (!src || src.empty) { cv.hidden = true; $('#pv-empty').hidden = false; $('#drag-hint').hidden = true; stats.innerHTML = ''; warn.innerHTML = ''; $('#go').disabled = true; return; }
    var useRec = chosen().length > 1 && $('#rec').checked && BL.pro.active();
    var s = settings(p, useRec), L;
    try { L = layout(src, p, s); }
    catch (e) { warn.innerHTML = '<div class="note err">' + BL.esc(e.message) + '</div>'; $('#go').disabled = true; return; }
    lastL = L; lastL.s = s; lastL.p = p;
    drawPreview(L, s);
    // stats
    var dpi = s.dpi, artW = L.mode === 'fill' ? L.FW : L.dw, artH = L.mode === 'fill' ? L.FH : L.dh;
    var html = st('Output', px(L.FW) + ' × ' + px(L.FH) + ' px', BL.fmt(L.FW / dpi, 2) + ' × ' + BL.fmt(L.FH / dpi, 2) + ' in at ' + dpi + ' DPI', true) +
      st('Scale', (L.scale >= 1 ? 'Up ' : 'Down ') + BL.fmt(L.scale >= 1 ? L.scale : 1 / L.scale, 2) + '×', 'from ' + px(L.sw) + ' × ' + px(L.sh) + ' source px') +
      st(L.mode === 'fill' ? 'Crop kept' : 'Artwork area', L.mode === 'fill' ? Math.round(100 * L.sw * L.sh / (L.bw * L.bh)) + '% of the image' : px(artW) + ' × ' + px(artH) + ' px', L.mode === 'fill' ? 'the rest is cut off' : Math.round(100 * artW * artH / (L.FW * L.FH)) + '% of the frame');
    stats.innerHTML = html;
    var notes = [];
    if (L.scale > 1.5) notes.push('<div class="note warn"><strong>Upscaling ' + BL.fmt(L.scale, 2) + '×.</strong> The file will have the right pixel count, but upscaling can\'t add detail, so it will print noticeably soft. For a sharp result at this size, export the artwork at about ' + px(Math.ceil(L.sw * L.scale)) + ' × ' + px(Math.ceil(L.sh * L.scale)) + ' px or more from your design app.</div>');
    else if (L.scale > 1.02) notes.push('<div class="note">Upscaling ' + BL.fmt(L.scale, 2) + '×. That is mild and usually prints fine.</div>');
    if (p.inches && L.scale > 1.02) notes.push('<div class="note">At ' + p.inches[0] + ' × ' + p.inches[1] + ' in, your source artwork works out to about ' + Math.round(300 / L.scale) + ' real pixels per inch.</div>');
    if (s.trim && src.trim && L.mode !== 'long') notes.push('<div class="note">Trimmed ' + px(src.w - src.trim.w) + ' px of empty width and ' + px(src.h - src.trim.h) + ' px of empty height from the source before fitting.</div>');
    if (p.custom && (L.FW > 13500 || L.FH > 13500)) notes.push('<div class="note warn">Over 13,500 px on a side. Redbubble, for one, rejects files that big.</div>');
    if (s.fmt === 'png' && p.kind === 'photo') notes.push('<div class="note">Etsy doesn\'t accept transparent PNGs for listing photos. JPEG is the safer choice here.</div>');
    if (L.FW * L.FH > 150e6) notes.push('<div class="note">This is a very large file (' + BL.fmt(L.FW * L.FH / 1e6, 0) + ' megapixels). It may take a minute and needs plenty of free memory.</div>');
    warn.innerHTML = notes.join('');
    $('#go').disabled = busy;
  }
  function st(k, v, s, hi) { return '<div class="stat' + (hi ? ' hi' : '') + '"><div class="k">' + k + '</div><div class="v" style="font-size:1.02rem">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>'; }
  function px(n) { return Number(n).toLocaleString(); }

  function drawPreview(L, s) {
    var box = $('#pv-box'), maxW = Math.max(200, box.clientWidth - 24), maxH = Math.min(520, Math.max(260, window.innerHeight * 0.55));
    var k = Math.min(maxW / L.FW, maxH / L.FH, 1);
    var W = Math.max(1, Math.round(L.FW * k)), H = Math.max(1, Math.round(L.FH * k)), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pvScale = k;
    if (s.bgRGBA[3]) { ctx.fillStyle = 'rgb(' + s.bgRGBA.slice(0, 3).join(',') + ')'; ctx.fillRect(0, 0, W, H); }
    else { // checkerboard so transparency is visible
      var c = 8; for (var y = 0; y < H; y += c) for (var x = 0; x < W; x += c) { ctx.fillStyle = ((x / c + y / c) & 1) ? '#d9d9d9' : '#f4f4f4'; ctx.fillRect(x, y, c, c); }
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.img, L.sx, L.sy, L.sw, L.sh, L.ox * k, L.oy * k, L.dw * k, L.dh * k);
    if (L.mode === 'fit' && (L.dw < L.FW || L.dh < L.FH)) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(15,118,110,.8)'; ctx.lineWidth = 1;
      ctx.strokeRect(L.ox * k + .5, L.oy * k + .5, L.dw * k - 1, L.dh * k - 1); ctx.setLineDash([]);
    }
    cv.hidden = false; $('#pv-empty').hidden = true;
    var movable = L.mode === 'fill' ? (L.sw < L.bw || L.sh < L.bh) : L.mode === 'fit' && (L.dw < L.FW || L.dh < L.FH);
    cv.classList.toggle('draggable', movable);
    $('#drag-hint').hidden = !(movable && L.mode === 'fill');
  }

  // Drag to move the crop (fill) or the artwork (fit). Arrow keys too.
  var drag = null;
  function nudge(dxPx, dyPx) { // dx/dy in preview pixels, image moving right/down
    var L = lastL; if (!L || L.mode === 'long') return;
    if (L.mode === 'fill') {
      var srcPerPv = 1 / (pvScale * L.scale);
      if (L.bw > L.sw) pos.fx = clamp01(pos.fx - dxPx * srcPerPv / (L.bw - L.sw));
      if (L.bh > L.sh) pos.fy = clamp01(pos.fy - dyPx * srcPerPv / (L.bh - L.sh));
    } else {
      if (L.FW > L.dw) pos.fx = clamp01(pos.fx + dxPx / pvScale / (L.FW - L.dw));
      if (L.FH > L.dh) pos.fy = clamp01(pos.fy + dyPx / pvScale / (L.FH - L.dh));
    }
    BL.$$('input[name=valign], input[name=halign]').forEach(function (r) { r.checked = false; });
    BL.$$('input[name=halign]').forEach(function (r) { if (Math.abs(+r.value - pos.fx) < 0.001) r.checked = true; });
    BL.$$('input[name=valign]').forEach(function (r) { if (Math.abs(+r.value - pos.fy) < 0.001) r.checked = true; });
    update();
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  cv.addEventListener('pointerdown', function (e) { if (!cv.classList.contains('draggable')) return; drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); cv.classList.add('dragging'); });
  cv.addEventListener('pointermove', function (e) { if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; nudge(dx, dy); });
  function endDrag() { drag = null; cv.classList.remove('dragging'); }
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('keydown', function (e) {
    var d = e.shiftKey ? 20 : 4, m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (m) { e.preventDefault(); nudge(m[0], m[1]); }
  });

  /* ---------- rendering ---------- */
  function presetSlug(p) { if (p.custom) { var z = presetSize(p); return z.w + 'x' + z.h; } return p.id; }
  // Produce one output. Returns Promise<{blob, name, w, h}>
  function render(source, p, s, onProgress) {
    var L = layout(source, p, s);
    var read = source.data ? I.bufferRowReader(source.data, source.w, L.sx, L.sy, L.sw) : I.imageRowReader(source.img, L.sx, L.sy, L.sw, L.sh);
    var name = I.baseName(source.name) + '-' + presetSlug(p) + (s.fmt === 'jpeg' ? '.jpg' : '.png');
    var opts = { srcW: L.sw, srcH: L.sh, getRows: read, dstW: L.dw, dstH: L.dh, frameW: L.FW, frameH: L.FH, offX: L.ox, offY: L.oy, bg: s.bgRGBA, onProgress: onProgress };
    if (s.fmt === 'jpeg') {
      if (!I.canvasOk(L.FW, L.FH)) return Promise.reject(new Error(I.canvasLimitText(L.FW, L.FH) + ' PNG output is written without a canvas, so choose PNG to go bigger.'));
      var c = document.createElement('canvas'); c.width = L.FW; c.height = L.FH;
      var ctx = c.getContext('2d'), y = 0;
      opts.bg = s.bgRGBA[3] ? s.bgRGBA : [255, 255, 255, 255];
      opts.onRows = function (buf, n) { ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length), L.FW, n), 0, y); y += n; };
      return I.resample(opts).then(function () { return BL.canvasBlob(c, 'image/jpeg', s.quality); })
        .then(function (b) { c.width = c.height = 1; return BL.blobBytes(b); })
        .then(function (bytes) { return { blob: new Blob([I.jpegWithDpi(bytes, s.dpi)], { type: 'image/jpeg' }), name: name, w: L.FW, h: L.FH, L: L }; });
    }
    return I.fflate().then(function () {
      var padded = L.mode === 'fit' && (L.dw < L.FW || L.dh < L.FH);
      var alpha = s.bgRGBA[3] === 0 && (source.hasAlpha || padded);
      var enc = new I.PngEncoder({ width: L.FW, height: L.FH, alpha: alpha, dpi: s.dpi, keep: source.keep });
      opts.onRows = function (buf, n) { enc.addRows(buf, n); };
      return I.resample(opts).then(function () { return enc.finish(); }).then(function (blob) { return { blob: blob, name: name, w: L.FW, h: L.FH, L: L }; });
    });
  }
  function sizeNote(p, blob) {
    var mb = blob.size / 1048576;
    if (p.maxMB && mb > p.maxMB) return ' <strong>Over the ' + p.maxMB + ' MB limit for this preset.</strong> Try JPEG, or trim the design.';
    if (p.softMB && mb > p.softMB) return ' Etsy notes files over 1 MB can fail to upload on slow connections; a lower JPEG quality makes it smaller.';
    return '';
  }

  function go() {
    if (!src || busy) return;
    var list = chosen();
    if (list.length > 1 || files.length > 1) {
      if (!BL.pro.gate(true, 'Exporting many presets or many images in one zip is part of Bleedline Pro.')) return;
      return batch();
    }
    var p = list[0], s = settings(p, false), msg = $('#msg'), prog = $('#prog'), bar = prog.firstElementChild;
    busy = true; $('#go').disabled = true; prog.hidden = false; bar.style.width = '0';
    msg.innerHTML = '<p class="small muted"><span class="spinner"></span> Resizing…</p>';
    var t0 = Date.now();
    render(src, p, s, function (f) { bar.style.width = (f * 100).toFixed(1) + '%'; }).then(function (r) {
      BL.download(r.blob, r.name);
      msg.innerHTML = '<div class="note ok">Saved <strong>' + BL.esc(r.name) + '</strong>: ' + px(r.w) + ' × ' + px(r.h) + ' px, ' + s.dpi + ' DPI, ' + I.fmtBytes(r.blob.size) + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s).' + sizeNote(p, r.blob) + '</div>';
      BL.track('resize', p.id);
    }).catch(function (e) { BL.fail(e, msg); }).then(function () { busy = false; prog.hidden = true; update(); });
  }

  /* ---------- batch (Pro) ---------- */
  function renderQueue() {
    var panel = $('#batch-panel'), list = chosen();
    var show = BL.pro.active() && (files.length > 1 || list.length > 1);
    panel.hidden = !show;
    if (!show) return;
    $('#batch-sum').textContent = files.length + ' image' + (files.length === 1 ? '' : 's') + ' × ' + list.length + ' preset' + (list.length === 1 ? '' : 's') + ' = ' + files.length * list.length + ' files in one zip.' + (list.length > 1 && $('#rec').checked ? ' Each preset uses its recommended fit, position and format.' : '');
    $('#queue').innerHTML = files.map(function (f, i) { return '<li data-i="' + i + '"><span>' + BL.esc(f.name || 'image') + '</span><span>' + I.fmtBytes(f.size) + '</span></li>'; }).join('');
  }
  function batch() {
    var list = chosen(), useRec = list.length > 1 && $('#rec').checked;
    var out = [], used = {}, errors = [], total = files.length * list.length, done = 0;
    var bar = $('#bprog').firstElementChild, bmsg = $('#bmsg');
    busy = true; $('#go').disabled = true; $('#batch-go').disabled = true; $('#bprog').hidden = false; bar.style.width = '0';
    bmsg.innerHTML = '<p class="small muted"><span class="spinner"></span> Working…</p>';
    var t0 = Date.now(), fi = 0;
    function nextFile() {
      if (fi >= files.length) return Promise.resolve();
      var f = files[fi++], li = BL.$('#queue li[data-i="' + (fi - 1) + '"] span:last-child');
      if (li) li.textContent = 'reading…';
      var srcP = (fi === 1 && src && src.file === f) ? Promise.resolve(src) : loadSource(f);
      return srcP.then(function (source) {
        if (source.empty) throw new Error('fully transparent');
        var pi = 0;
        function nextPreset() {
          if (pi >= list.length) return Promise.resolve();
          var p = list[pi++], s = settings(p, useRec);
          if (li) li.textContent = p.custom ? 'custom size' : (p.long ? p.long + ' px' : p.w + ' × ' + p.h);
          return render(source, p, s, function (fr) { bar.style.width = (100 * (done + fr) / total).toFixed(1) + '%'; })
            .then(function (r) { return BL.blobBytes(r.blob).then(function (bytes) {
              var name = r.name, k = 2;
              while (used[name.toLowerCase()]) name = r.name.replace(/(\.\w+)$/, '-' + (k++) + '$1');
              used[name.toLowerCase()] = 1; out.push({ name: name, data: bytes });
            }); }, function (e) { errors.push((f.name || 'image') + ' → ' + p.name + ': ' + e.message); })
            .then(function () { done++; bar.style.width = (100 * done / total).toFixed(1) + '%'; return I.sleep(); })
            .then(nextPreset);
        }
        return nextPreset().then(function () { if (li) li.textContent = 'done'; if (source !== src && source.url) URL.revokeObjectURL(source.url); });
      }, function (e) { errors.push((f.name || 'image') + ': ' + e.message); done += list.length; if (li) li.textContent = 'failed'; }).then(nextFile);
    }
    nextFile().then(function () {
      if (!out.length) throw new Error('Nothing was made. ' + errors.join(' '));
      bmsg.innerHTML = '<p class="small muted"><span class="spinner"></span> Zipping ' + out.length + ' files…</p>';
      return BL.zip(out).then(function (blob) {
        BL.download(blob, 'resized-' + out.length + '-files.zip');
        bmsg.innerHTML = '<div class="note ok">Zipped ' + out.length + ' file' + (out.length === 1 ? '' : 's') + ' (' + I.fmtBytes(blob.size) + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s).</div>' +
          (errors.length ? '<div class="note err">Skipped: ' + errors.map(BL.esc).join('<br>') + '</div>' : '');
        BL.track('resize-batch', String(out.length));
      });
    }).catch(function (e) { BL.fail(e, bmsg); }).then(function () {
      busy = false; $('#batch-go').disabled = false; $('#bprog').hidden = true; update();
    });
  }

  /* ---------- wiring ---------- */
  var form = $('#rs-form');
  BL.persist(form, 'pod-image-resizer');
  if (BL.radio('valign') !== null) pos.fy = +BL.radio('valign');
  if (BL.radio('halign') !== null) pos.fx = +BL.radio('halign');
  form.addEventListener('change', function (e) {
    if (e.target.name === 'valign') pos.fy = +e.target.value;
    if (e.target.name === 'halign') pos.fx = +e.target.value;
    if (e.target.name === 'fmt' && e.target.value === 'jpeg' && BL.radio('bg') === 'transparent') setRadio('bg', 'white');
    if (e.target.id === 'bgcolor') setRadio('bg', 'custom');
    update();
  });
  var t = null;
  form.addEventListener('input', function (e) { if (e.target.type === 'number' || e.target.type === 'range' || e.target.type === 'color') { clearTimeout(t); t = setTimeout(update, 120); } });
  $('#pv-pick').addEventListener('change', update);
  BL.dropzone($('#drop'), handleFiles);
  $('#go').addEventListener('click', go);
  $('#batch-go').addEventListener('click', go);
  $('#batch-clear').addEventListener('click', function () { files = src ? [src.file] : []; renderQueue(); syncUi(); });
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(update, 150); });
  BL.pro.onChange(function () { syncUi(); update(); });
  update();
})();
