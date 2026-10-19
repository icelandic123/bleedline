/* Image DPI checker: reads the resolution stored in PNG/JPEG/TIFF/WebP files, works out print sizes,
   and saves a copy with a new DPI by editing only the resolution bytes (BL.img.setDpi). */
(function () {
  var BL = window.BL, I = BL.img, $ = BL.$;
  var entries = [], current = null, lastDrop = [];
  var SIZES = {
    '4x6': [4, 6], '5x7': [5, 7], '8x10': [8, 10], '8.5x11': [8.5, 11], '11x14': [11, 14], '12x18': [12, 18],
    '16x20': [16, 20], '18x24': [18, 24], '24x36': [24, 36],
    A5: [148 / 25.4, 210 / 25.4], A4: [210 / 25.4, 297 / 25.4], A3: [297 / 25.4, 420 / 25.4], A2: [420 / 25.4, 594 / 25.4],
    shirt: [15, 18], shirt12: [12, 16]
  };
  var LEVELS = [
    { min: 300, g: 5, word: 'Excellent', text: 'Sharp even when looked at up close.' },
    { min: 240, g: 4, word: 'Very good', text: 'Very hard to tell apart from 300 DPI.' },
    { min: 200, g: 3, word: 'Good', text: 'Fine for prints and posters seen at arm\'s length.' },
    { min: 150, g: 2, word: 'Acceptable', text: 'OK for posters, canvases and most apparel (a common print-on-demand minimum). Slightly soft up close.' },
    { min: 100, g: 1, word: 'Soft', text: 'Looks soft or pixelated up close. Only for big prints seen from a distance.' },
    { min: 0, g: 0, word: 'Too small', text: 'Will look blurry or blocky at this size. Print smaller or start from a bigger original.' }
  ];
  function level(dpi) { for (var i = 0; i < LEVELS.length; i++) if (dpi >= LEVELS[i].min) return LEVELS[i]; return LEVELS[LEVELS.length - 1]; }
  function fin(n) { return BL.fmt(n, n >= 100 ? 1 : 2); }
  function fcm(n) { return BL.fmt(n * 2.54, 1); }
  function fdpi(d) { return Math.abs(d - Math.round(d)) < 0.05 ? String(Math.round(d)) : BL.fmt(d, 1); }
  function px(n) { return Number(n).toLocaleString(); }
  function stat(k, v, s, hi) { return '<div class="stat' + (hi ? ' hi' : '') + '"><div class="k">' + k + '</div><div class="v" style="font-size:1.05rem">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>'; }

  /* ---------- loading ---------- */
  function readEntry(file) {
    return file.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf), e = { file: file, name: file.name || 'pasted-image.png', bytes: bytes };
      try { e.info = I.readInfo(bytes); } catch (err) { e.error = err.message; }
      return e;
    });
  }
  function handleFiles(files) {
    files = files.filter(function (f) { return f && f.size !== undefined; });
    if (!files.length) return;
    lastDrop = files;
    var many = files.length > 1, pro = BL.pro.active();
    $('#pro-hint').hidden = !(many && !pro);
    $('#pro-count').textContent = files.length;
    if (!pro) files = files.slice(0, 1);
    $('#load-msg').innerHTML = '<p class="small muted"><span class="spinner"></span> Reading ' + (files.length > 1 ? files.length + ' files' : 'the image') + '…</p>';
    entries.forEach(function (e) { if (e.url) URL.revokeObjectURL(e.url); });
    entries = [];
    var i = 0;
    (function next() {
      if (i >= files.length) { $('#load-msg').innerHTML = ''; afterLoad(); return; }
      readEntry(files[i++]).then(function (e) { entries.push(e); setTimeout(next, 0); }, function (err) { BL.fail(err, $('#load-msg')); });
    })();
  }
  function afterLoad() {
    var first = entries.filter(function (e) { return !e.error; })[0] || entries[0];
    show(first);
    renderBatch();
    BL.track('dpi-check', entries.length > 1 ? 'batch' : (first && first.info ? first.info.format : 'error'));
  }

  /* ---------- single view ---------- */
  function show(e) {
    current = e;
    $('#empty').hidden = true; $('#result').hidden = false;
    $('#save-msg').innerHTML = '';
    BL.$$('#batch-table tbody tr').forEach(function (tr) { tr.classList.toggle('sel', +tr.getAttribute('data-i') === entries.indexOf(e)); });
    if (e.error) {
      $('#thumb').innerHTML = '<span class="muted">No preview</span>';
      $('#fname').textContent = e.name; $('#fmeta').textContent = '';
      $('#stats').innerHTML = ''; $('#sources').innerHTML = ''; $('#verdict').innerHTML = '';
      $('#sizes tbody').innerHTML = '';
      $('#notes').innerHTML = '<div class="note err">' + BL.esc(e.error) + '</div>';
      updateSaveButton();
      return;
    }
    var info = e.info;
    if (!e.url) e.url = URL.createObjectURL(e.file);
    var img = new Image();
    img.alt = 'Preview of ' + e.name;
    img.onerror = function () { $('#thumb').innerHTML = '<span class="muted small">This browser can\'t preview ' + info.format.toUpperCase() + ' files, but the numbers below are read from the file itself.</span>'; };
    img.src = e.url;
    $('#thumb').innerHTML = ''; $('#thumb').appendChild(img);
    $('#fname').textContent = e.name;
    $('#fmeta').textContent = info.format.toUpperCase() + ' · ' + I.fmtBytes(e.bytes.length) + ' · ' + info.mode + (info.bitDepth ? ', ' + info.bitDepth + '-bit' : '') + (info.icc ? ' · color profile' : '');
    renderStats(e);
    renderVerdict();
    updateSaveButton();
  }

  function renderStats(e) {
    var info = e.info, W = info.displayWidth, H = info.displayHeight;
    var d = info.dpi, mixed = info.notes.indexOf('mixed') >= 0;
    var at300 = fin(W / 300) + ' × ' + fin(H / 300) + ' in';
    var html = stat('Pixel size', px(W) + ' × ' + px(H), BL.fmt(W * H / 1e6, 1) + ' megapixels');
    if (d) {
      var dtxt = d.x === d.y ? fdpi(d.x) : fdpi(d.x) + ' × ' + fdpi(d.y);
      html += stat('DPI stored in the file', dtxt + (mixed ? ' <span class="small">(mixed)</span>' : ''), 'Opens at ' + fin(W / d.x) + ' × ' + fin(H / d.y) + ' in');
    } else {
      html += stat('DPI stored in the file', 'None', 'Apps will assume 72 or 96');
    }
    html += stat('Prints sharply up to', at300, fcm(W / 300) + ' × ' + fcm(H / 300) + ' cm at 300 DPI', true);
    $('#stats').innerHTML = html;

    var notes = [];
    if (!d) notes.push('<div class="note">No DPI is stored in this file. That is normal for screenshots, web images and many exports, and it has no effect on print quality. Design apps will open it as if it were 72 or 96 DPI, so it may look huge until you set a DPI.</div>');
    else if (d.x < 150) notes.push('<div class="note">The file says ' + fdpi(d.x) + ' DPI. That is only a label: what decides print quality is the pixel size. At 300 DPI these pixels cover ' + at300 + '.</div>');
    if (mixed) notes.push('<div class="note warn">This file stores different DPI values in different places (see below). Apps disagree about which one to read, so it may open at different sizes in different apps. The saved copy sets all of them to the same value.</div>');
    if (info.orientation >= 5) notes.push('<div class="note">This photo is turned by its EXIF orientation tag. Sizes are shown the way it displays (' + px(W) + ' × ' + px(H) + '); the stored pixels are ' + px(info.width) + ' × ' + px(info.height) + '.</div>');
    if (info.cmyk) notes.push('<div class="note warn">This image is CMYK. Print-on-demand marketplaces generally expect RGB (sRGB) files, and browsers may show CMYK colors differently from your design app.</div>');
    if (info.notes.indexOf('animated') >= 0) notes.push('<div class="note">This is an animated PNG. Printers use only the first frame.</div>');
    $('#notes').innerHTML = notes.join('');

    $('#sources').innerHTML = info.entries.map(function (s) {
      return '<li><span>' + BL.esc(s.where) + '</span><span>' + (s.dpi ? (s.dpi.x === s.dpi.y ? fdpi(s.dpi.x) : fdpi(s.dpi.x) + ' × ' + fdpi(s.dpi.y)) + ' DPI' : BL.esc(s.text || 'none')) + '</span></li>';
    }).join('');

    var rows = [[300, 'Photos, cards, books: anything seen up close'], [240, 'Fine art prints, still very sharp'], [200, 'Prints and posters seen at arm\'s length'], [150, 'Large posters, canvas, most apparel minimums']];
    $('#sizes tbody').innerHTML = rows.map(function (r) {
      var l = level(r[0]);
      return '<tr><td><span class="q-dot q' + l.g + '"></span>' + r[0] + ' DPI</td><td>' + fin(W / r[0]) + ' × ' + fin(H / r[0]) + '</td><td>' + fcm(W / r[0]) + ' × ' + fcm(H / r[0]) + '</td><td class="small">' + r[1] + '</td></tr>';
    }).join('');
  }

  /* ---------- target size ---------- */
  function targetSize() {
    var v = $('#target').value, w, h, label;
    if (v === 'custom') {
      var unit = BL.radio('unit') || 'in', f = unit === 'cm' ? 2.54 : unit === 'mm' ? 25.4 : 1;
      w = BL.num('#cw') / f; h = BL.num('#ch') / f;
      if (!(w > 0 && h > 0)) return null;
      label = BL.fmt(BL.num('#cw'), BL.num('#cw') % 1 ? 2 : 0) + ' × ' + BL.fmt(BL.num('#ch'), BL.num('#ch') % 1 ? 2 : 0) + ' ' + unit;
    } else {
      w = SIZES[v][0]; h = SIZES[v][1];
      label = $('#target').selectedOptions[0].textContent.replace(/\s*\(.*\)$/, '').replace(/^T-shirt print area /, '');
    }
    return { w: w, h: h, label: label };
  }
  function evaluate(info, t) {
    var W = info.displayWidth, H = info.displayHeight, tw = t.w, th = t.h, turned = false;
    if ($('#rotate').checked && ((W > H) !== (tw > th)) && W !== H && tw !== th) { var x = tw; tw = th; th = x; turned = true; }
    var fill = Math.min(W / tw, H / th), fit = Math.max(W / tw, H / th);
    return { tw: tw, th: th, turned: turned, fill: fill, fit: fit, crop: 1 - fill / fit, need: [Math.ceil(tw * 300), Math.ceil(th * 300)] };
  }
  function renderVerdict() {
    var box = $('#verdict');
    if (!current || !current.info) { box.innerHTML = ''; return; }
    var t = targetSize();
    if (!t) { box.innerHTML = '<div class="note err">Enter a width and height above zero.</div>'; return; }
    var r = evaluate(current.info, t), l = level(r.fill);
    var sizeTxt = fin(r.tw) + ' × ' + fin(r.th) + ' in';
    var html = '<div class="verdict g' + l.g + '" role="status"><div class="small">At ' + BL.esc(t.label) + (r.turned ? ' (turned to match)' : '') + '</div>' +
      '<div class="big">' + l.word + ': ' + Math.floor(r.fill) + ' DPI</div><p>' + l.text + '</p></div>';
    var more = [];
    if (r.crop > 0.02) more.push('The image and the paper have different shapes. Filling ' + sizeTxt + ' crops about ' + Math.round(r.crop * 100) + '% off the long side (that is the ' + Math.floor(r.fill) + ' DPI above). Fitting the whole image instead leaves blank borders and gives ' + Math.floor(r.fit) + ' DPI.');
    if (r.fill < 299.5) {
      var W = current.info.displayWidth, H = current.info.displayHeight;
      var factor = 300 / r.fill;
      more.push('For 300 DPI at ' + sizeTxt + ' you need about ' + px(r.need[0]) + ' × ' + px(r.need[1]) + ' pixels, ' + BL.fmt(factor, 1) + '× what you have. At 300 DPI this image fills ' + fin(W / 300) + ' × ' + fin(H / 300) + ' in.');
    }
    box.innerHTML = html + more.map(function (m) { return '<p class="small" style="margin:8px 0 0">' + m + '</p>'; }).join('');
    BL.$$('#batch-table tbody tr').forEach(function (tr) {
      var e = entries[+tr.getAttribute('data-i')];
      if (e && e.info) { var rr = evaluate(e.info, t), ll = level(rr.fill); tr.lastElementChild.innerHTML = '<span class="q-dot q' + ll.g + '"></span>' + Math.floor(rr.fill) + ' DPI'; }
    });
  }

  /* ---------- saving ---------- */
  function newDpi() { var d = Math.round(BL.num('#newdpi')); return d >= 1 && d <= 65535 ? d : null; }
  function updateSaveButton() {
    var d = newDpi(), b = $('#save');
    var ok = current && current.info && (current.info.canRewrite || current.info.format === 'webp');
    b.disabled = !ok || !d;
    b.textContent = current && current.info && current.info.format === 'webp' ? 'Save as PNG at ' + (d || '…') + ' DPI' : 'Save a copy at ' + (d || '…') + ' DPI';
    if (current && current.info && current.info.format === 'tiff' && !current.info.canRewrite) b.textContent = 'This TIFF has no resolution tags to change';
    $('#batch-zip').textContent = 'Download all at ' + (d || '…') + ' DPI (zip + CSV)';
  }
  function outName(e, dpi, ext) { return I.baseName(e.name) + '-' + dpi + 'dpi.' + ext; }
  // Returns Promise<{bytes, name, how, same}>
  function makeCopy(e, dpi) {
    var info = e.info;
    if (info.canRewrite) {
      var r = I.setDpi(e.bytes, dpi);
      var ext = info.format === 'jpeg' ? (/\.jpe?g$/i.test(e.name) ? e.name.split('.').pop().toLowerCase() : 'jpg') : info.format === 'tiff' ? 'tif' : 'png';
      return Promise.resolve({ bytes: r.bytes, name: outName(e, dpi, ext), how: r.changed, same: I.sameImageData(e.bytes, r.bytes), type: e.file.type || 'image/' + info.format });
    }
    if (info.format === 'webp') return webpToPng(e, dpi).then(function (blob) { return BL.blobBytes(blob); }).then(function (bytes) {
      return { bytes: bytes, name: outName(e, dpi, 'png'), how: ['converted to PNG'], same: null, type: 'image/png', converted: true };
    });
    return Promise.reject(new Error('This file\'s DPI can\'t be changed without re-saving it.'));
  }
  function webpToPng(e, dpi) {
    return Promise.all([BL.loadImage(e.file), I.fflate()]).then(function (r) {
      var im = r[0], w = im.width, h = im.height;
      var read = I.imageRowReader(im.img, 0, 0, w, h);
      var enc = new I.PngEncoder({ width: w, height: h, alpha: !!e.info.hasAlpha, dpi: dpi });
      var y = 0, strip = Math.max(1, Math.floor(4e6 / (w * 4)));
      return new Promise(function (resolve, reject) {
        (function step() {
          try {
            var n = Math.min(strip, h - y); enc.addRows(read(y, n), n); y += n;
            if (y >= h) { URL.revokeObjectURL(im.url); enc.finish().then(resolve, reject); } else setTimeout(step, 0);
          } catch (err) { reject(err); }
        })();
      });
    });
  }
  // Decode both files in the browser and compare every pixel (skipped for very big images and TIFF).
  function pixelCheck(a, b, info) {
    if (info.format === 'tiff' || info.width * info.height > 60e6 || typeof createImageBitmap !== 'function') return Promise.resolve(null);
    return Promise.all([createImageBitmap(a), createImageBitmap(b)]).then(function (bm) {
      var w = bm[0].width, h = bm[0].height;
      if (w !== bm[1].width || h !== bm[1].height) return false;
      var c = document.createElement('canvas'), rows = Math.max(1, Math.min(h, Math.floor(4e6 / (w * 4))));
      c.width = w; c.height = rows;
      var ctx = c.getContext('2d', { willReadFrequently: true }), y = 0;
      return new Promise(function (resolve) {
        (function step() {
          var n = Math.min(rows, h - y);
          ctx.clearRect(0, 0, w, n); ctx.drawImage(bm[0], 0, y, w, n, 0, 0, w, n);
          var d1 = ctx.getImageData(0, 0, w, n).data;
          ctx.clearRect(0, 0, w, n); ctx.drawImage(bm[1], 0, y, w, n, 0, 0, w, n);
          var d2 = ctx.getImageData(0, 0, w, n).data;
          for (var i = 0; i < d1.length; i++) if (d1[i] !== d2[i]) { resolve(false); return; }
          y += n;
          if (y >= h) { bm[0].close(); bm[1].close(); resolve(true); } else setTimeout(step, 0);
        })();
      });
    }).catch(function () { return null; });
  }
  function save() {
    var e = current, dpi = newDpi(), msg = $('#save-msg');
    if (!e || !e.info || !dpi) return;
    msg.innerHTML = '<p class="small muted"><span class="spinner"></span> Saving…</p>';
    makeCopy(e, dpi).then(function (out) {
      var blob = new Blob([out.bytes], { type: out.type });
      BL.download(blob, out.name);
      var W = e.info.displayWidth, H = e.info.displayHeight;
      var lines = [];
      if (out.converted) lines.push('Saved <strong>' + BL.esc(out.name) + '</strong>. WebP has no DPI field, so the image was converted to a lossless PNG with ' + dpi + ' DPI.');
      else {
        lines.push('Saved <strong>' + BL.esc(out.name) + '</strong> at ' + dpi + ' DPI (changed: ' + BL.esc(out.how.join(', ')) + ').');
        lines.push(out.same ? 'The compressed image data is byte-for-byte identical to the original, so the quality is exactly the same. File size: ' + I.fmtBytes(e.bytes.length) + ' → ' + I.fmtBytes(out.bytes.length) + '.' : 'Warning: the image data differs from the original. Please report this file.');
      }
      lines.push('It now opens at ' + fin(W / dpi) + ' × ' + fin(H / dpi) + ' in (' + fcm(W / dpi) + ' × ' + fcm(H / dpi) + ' cm) in design apps.');
      msg.innerHTML = '<div class="note ' + (out.same === false ? 'err' : 'ok') + '">' + lines.join(' ') + '<span id="pix-check"></span></div>';
      var pc = $('#pix-check');
      if (!out.converted && e.info.format !== 'tiff') {
        pc.innerHTML = ' <span class="small"><span class="spinner"></span> Comparing pixels…</span>';
        pixelCheck(e.file, blob, e.info).then(function (ok) {
          if (ok === true) pc.textContent = ' Decoded and compared: all ' + px(e.info.width * e.info.height) + ' pixels match.';
          else if (ok === false) { pc.textContent = ' Pixel comparison found a difference. Please report this file.'; pc.parentNode.className = 'note err'; }
          else pc.textContent = '';
        });
      }
    }).catch(function (err) { BL.fail(err, msg); });
  }

  /* ---------- batch (Pro) ---------- */
  function renderBatch() {
    var panel = $('#batch-panel');
    panel.hidden = entries.length < 2;
    if (panel.hidden) return;
    $('#batch-table tbody').innerHTML = entries.map(function (e, i) {
      if (e.error) return '<tr data-i="' + i + '"><td><button type="button" data-show="' + i + '">' + BL.esc(e.name) + '</button></td><td colspan="4" class="small" style="color:var(--danger);white-space:normal">' + BL.esc(e.error) + '</td></tr>';
      var info = e.info, d = info.dpi;
      return '<tr data-i="' + i + '"><td><button type="button" data-show="' + i + '">' + BL.esc(e.name) + '</button></td><td>' + px(info.displayWidth) + ' × ' + px(info.displayHeight) + '</td><td>' + (d ? fdpi(d.x) + (info.notes.indexOf('mixed') >= 0 ? ' (mixed)' : '') : 'none') + '</td><td>' + fin(info.displayWidth / 300) + ' × ' + fin(info.displayHeight / 300) + ' in</td><td></td></tr>';
    }).join('');
    $('#batch-msg').innerHTML = '';
    renderVerdict();
  }
  function csvCell(v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function batchZip() {
    if (!BL.pro.gate(true, 'Downloading many DPI-fixed images in one zip is part of Bleedline Pro.')) return;
    var dpi = newDpi(); if (!dpi) return;
    var t = targetSize(), files = [], used = {}, rows = [['file', 'format', 'width_px', 'height_px', 'stored_dpi', 'new_dpi', 'prints_at_300dpi_in', 'prints_at_300dpi_cm', 'target', 'dpi_at_target', 'verdict', 'output_file', 'image_data_unchanged', 'note']];
    var prog = $('#batch-progress'), bar = prog.firstElementChild, msg = $('#batch-msg'), btn = $('#batch-zip');
    prog.hidden = false; bar.style.width = '0'; btn.disabled = true; msg.innerHTML = '';
    var i = 0;
    (function next() {
      if (i >= entries.length) return finish();
      var e = entries[i++];
      bar.style.width = (100 * i / entries.length) + '%';
      if (e.error) { rows.push([e.name, '', '', '', '', '', '', '', '', '', '', '', '', e.error]); return setTimeout(next, 0); }
      var info = e.info, W = info.displayWidth, H = info.displayHeight, r = t ? evaluate(info, t) : null;
      makeCopy(e, dpi).then(function (out) {
        var name = out.name, k = 2;
        while (used[name.toLowerCase()]) name = out.name.replace(/(\.\w+)$/, '-' + (k++) + '$1');
        used[name.toLowerCase()] = 1;
        files.push({ name: name, data: out.bytes });
        rows.push([e.name, info.format, W, H, info.dpi ? fdpi(info.dpi.x) : 'none', dpi, fin(W / 300).replace(/,/g, '') + ' x ' + fin(H / 300).replace(/,/g, ''), fcm(W / 300).replace(/,/g, '') + ' x ' + fcm(H / 300).replace(/,/g, ''),
          t ? t.label : '', r ? Math.floor(r.fill) : '', r ? level(r.fill).word : '', name, out.same === null ? 'converted to PNG' : out.same ? 'yes' : 'NO', '']);
      }, function (err) {
        rows.push([e.name, info.format, W, H, info.dpi ? fdpi(info.dpi.x) : 'none', '', '', '', '', '', '', '', '', err.message]);
      }).then(function () { setTimeout(next, 0); });
    })();
    function finish() {
      var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
      files.push({ name: 'dpi-report.csv', data: new TextEncoder().encode('\ufeff' + csv) });
      BL.zip(files).then(function (blob) {
        BL.download(blob, 'images-' + dpi + 'dpi.zip');
        msg.innerHTML = '<div class="note ok">Zipped ' + (files.length - 1) + ' image' + (files.length === 2 ? '' : 's') + ' at ' + dpi + ' DPI plus dpi-report.csv (' + I.fmtBytes(blob.size) + ').</div>';
      }).catch(function (err) { BL.fail(err, msg); }).then(function () { btn.disabled = false; prog.hidden = true; });
    }
  }

  /* ---------- wiring ---------- */
  var form = $('#dpi-form');
  BL.persist(form, 'image-dpi-checker');
  function syncCustom() { $('#custom-row').hidden = $('#target').value !== 'custom'; }
  syncCustom();
  form.addEventListener('input', function (ev) { syncCustom(); if (ev.target.id === 'newdpi') updateSaveButton(); else renderVerdict(); });
  form.addEventListener('change', function () { syncCustom(); renderVerdict(); updateSaveButton(); });
  BL.dropzone($('#drop'), handleFiles);
  $('#save').addEventListener('click', save);
  BL.$$('.dpi-quick [data-dpi]').forEach(function (b) {
    b.addEventListener('click', function () { $('#newdpi').value = b.getAttribute('data-dpi'); $('#newdpi').dispatchEvent(new Event('input', { bubbles: true })); });
  });
  $('#fit-dpi').addEventListener('click', function () {
    var t = targetSize();
    if (!current || !current.info || !t) { BL.toast('Load an image and pick a print size first.'); return; }
    var r = evaluate(current.info, t);
    $('#newdpi').value = Math.max(1, Math.floor(r.fill));
    $('#newdpi').dispatchEvent(new Event('input', { bubbles: true }));
    BL.toast('At ' + Math.floor(r.fill) + ' DPI the image opens at least ' + fin(r.tw) + ' × ' + fin(r.th) + ' in.');
  });
  $('#batch-table').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-show]');
    if (b) show(entries[+b.getAttribute('data-show')]);
  });
  $('#batch-zip').addEventListener('click', batchZip);
  $('#batch-clear').addEventListener('click', function () {
    entries = []; current = null; lastDrop = [];
    $('#batch-panel').hidden = true; $('#result').hidden = true; $('#empty').hidden = false; $('#save-msg').innerHTML = '';
    updateSaveButton();
  });
  BL.pro.onChange(function (on) { if (on && lastDrop.length > 1 && entries.length < lastDrop.length) handleFiles(lastDrop); });
  updateSaveButton();
})();
