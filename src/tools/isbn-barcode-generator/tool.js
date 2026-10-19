/* ISBN barcode generator: EAN-13 with optional EAN-5 add-on.
   One geometry (in modules) is drawn three ways: SVG, canvas PNG and vector PDF.
   Text is converted to outlines with fontkit so every output looks the same. */
(function () {
  var BL = window.BL, $ = BL.$;
  var X_MM = 0.33;              // module width at 100%
  var BAR_H = 69.24;            // normal bar height in modules (22.85 mm)
  var GUARD_EXTRA = 5;          // guard bars extend below the others
  var DIGIT_SIZE = 11;          // font size (em) for human-readable digits, in modules
  var LABEL_SIZE = 10;

  var L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  var R = L.map(function (c) { return c.replace(/./g, function (b) { return b === '1' ? '0' : '1'; }); });
  var G = R.map(function (c) { return c.split('').reverse().join(''); });
  var PARITY13 = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  var PARITY5 = ['GGLLL', 'GLGLL', 'GLLGL', 'GLLLG', 'LGGLL', 'LLGGL', 'LLLGG', 'LGLGL', 'LGLLG', 'LLGLG'];

  function check13(d12) {
    var s = 0;
    for (var i = 0; i < 12; i++) s += (+d12[i]) * (i % 2 ? 3 : 1);
    return String((10 - s % 10) % 10);
  }
  function check10(d9) {
    var s = 0;
    for (var i = 0; i < 9; i++) s += (+d9[i]) * (10 - i);
    var c = (11 - s % 11) % 11;
    return c === 10 ? 'X' : String(c);
  }

  // Returns {digits13, label, warning} or throws with a helpful message.
  function parseIsbn(raw) {
    var clean = String(raw).toUpperCase().replace(/[^0-9X]/g, '');
    var display = String(raw).trim().replace(/^ISBN(-1[03])?:?\s*/i, '');
    if (clean.length === 10) {
      if (!/^\d{9}[\dX]$/.test(clean)) throw new Error('An ISBN-10 has 9 digits followed by a digit or X.');
      if (check10(clean.slice(0, 9)) !== clean[9]) throw new Error('This ISBN-10 has the wrong check digit. The last character should be ' + check10(clean.slice(0, 9)) + '.');
      var d12 = '978' + clean.slice(0, 9);
      var d13 = d12 + check13(d12);
      return { digits: d13, label: 'ISBN ' + d13.replace(/^(\d{3})(\d+)$/, '$1-$2'), note: 'Converted from ISBN-10 ' + display + '.' };
    }
    if (clean.length !== 13 || /X/.test(clean)) throw new Error('Enter a 13-digit ISBN (or a 10-digit one). You entered ' + clean.length + ' digits.');
    if (!/^97[89]/.test(clean)) throw new Error('Book ISBNs start with 978 or 979.');
    var c = check13(clean.slice(0, 12));
    if (c !== clean[12]) throw new Error('This ISBN has the wrong check digit. The last digit should be ' + c + '. Check for a typo.');
    var hasHyphens = /[-\s]/.test(display);
    return { digits: clean, label: 'ISBN ' + (hasHyphens ? display.replace(/\s+/g, '-') : clean) };
  }

  function addonDigits() {
    var mode = BL.radio('addon');
    if (mode === 'none') return '';
    if (mode === '90000') return '90000';
    if (mode === 'custom') {
      var v = $('#custom').value.replace(/\D/g, '');
      if (v.length !== 5) throw new Error('The add-on needs exactly 5 digits.');
      return v;
    }
    var price = BL.num('#price');
    if (!isFinite(price) || price < 0.01 || price > 99.98) throw new Error('Enter a price between 0.01 and 99.98. For higher prices use the custom add-on 59999.');
    var cents = Math.round(price * 100);
    return $('#currency').value + String(cents).padStart(4, '0');
  }

  function bars(pattern, x0, y, h, out) {
    var i = 0;
    while (i < pattern.length) {
      if (pattern[i] === '1') {
        var j = i;
        while (j < pattern.length && pattern[j] === '1') j++;
        out.push({ x: x0 + i, y: y, w: j - i, h: h });
        i = j;
      } else i++;
    }
  }

  function geometry(isbn, addon, withLabel) {
    var d = isbn.digits;
    var top = withLabel ? LABEL_SIZE * 1.25 : 2;
    var qL = 11, rects = [], texts = [];
    var left = '', right = '';
    var par = PARITY13[+d[0]];
    for (var i = 1; i <= 6; i++) left += (par[i - 1] === 'L' ? L : G)[+d[i]];
    for (i = 7; i <= 12; i++) right += R[+d[i]];
    var guardH = BAR_H + GUARD_EXTRA;
    bars('101', qL, top, guardH, rects);
    bars(left, qL + 3, top, BAR_H, rects);
    bars('01010', qL + 45, top, guardH, rects);
    bars(right, qL + 50, top, BAR_H, rects);
    bars('101', qL + 92, top, guardH, rects);
    var base = top + BAR_H + DIGIT_SIZE * 0.78;
    texts.push({ x: qL - 1, y: base, s: d[0], size: DIGIT_SIZE, anchor: 'end' });
    for (i = 0; i < 6; i++) {
      texts.push({ x: qL + 3 + 7 * i + 3.5, y: base, s: d[i + 1], size: DIGIT_SIZE, anchor: 'middle' });
      texts.push({ x: qL + 50 + 7 * i + 3.5, y: base, s: d[i + 7], size: DIGIT_SIZE, anchor: 'middle' });
    }
    var width = qL + 95 + 7;
    if (addon) {
      var ax = qL + 95 + 9;
      var cs = (3 * (+addon[0] + +addon[2] + +addon[4]) + 9 * (+addon[1] + +addon[3])) % 10;
      var p5 = PARITY5[cs], pat = '1011';
      for (i = 0; i < 5; i++) {
        pat += (p5[i] === 'L' ? L : G)[+addon[i]];
        if (i < 4) pat += '01';
      }
      var aTop = top + DIGIT_SIZE * 1.05;
      bars(pat, ax, aTop, top + guardH - aTop, rects);
      for (i = 0; i < 5; i++) texts.push({ x: ax + 4 + 9 * i + 3.5, y: aTop - DIGIT_SIZE * 0.2, s: addon[i], size: DIGIT_SIZE, anchor: 'middle' });
      width = ax + 47 + 5;
    }
    if (withLabel) texts.push({ x: width / 2, y: LABEL_SIZE * 0.95, s: isbn.label, size: LABEL_SIZE, anchor: 'middle', spread: [qL, (addon ? width - 5 : qL + 95)] });
    var height = top + guardH + DIGIT_SIZE * 0.95;
    return { rects: rects, texts: texts, width: width, height: height };
  }

  // Text to outline paths, in the same module units as the bars (y down).
  var fontP = null;
  function font() {
    if (!fontP) fontP = Promise.all([BL.loadScript('assets/vendor/fontkit.umd.min.js'), BL.fontBytes('AtkinsonHyperlegible-Regular.ttf')])
      .then(function (r) { return window.fontkit.create(new Uint8Array(r[1])); });
    return fontP;
  }
  function textPaths(f, texts) {
    return texts.map(function (t) {
      var run = f.layout(t.s);
      var scale = t.size / f.unitsPerEm;
      var adv = run.positions.reduce(function (a, p) { return a + p.xAdvance; }, 0) * scale;
      var x = t.anchor === 'middle' ? t.x - adv / 2 : t.anchor === 'end' ? t.x - adv : t.x;
      // Fit the label across the symbol width if it would overflow.
      var squeeze = 1;
      if (t.spread && adv > t.spread[1] - t.spread[0]) { squeeze = (t.spread[1] - t.spread[0]) / adv; x = t.spread[0]; }
      var d = '';
      run.glyphs.forEach(function (g, i) {
        d += g.path.scale(scale * squeeze, -scale).translate(x, t.y).toSVG();
        x += run.positions[i].xAdvance * scale * squeeze;
      });
      return d;
    }).join('');
  }

  var current = null;
  function render() {
    var msg = $('#bc-msg'), box = $('#bc-preview'), stats = $('#bc-stats');
    var isbn, addon;
    try { isbn = parseIsbn($('#isbn').value); addon = addonDigits(); }
    catch (e) { msg.innerHTML = '<div class="note err">' + BL.esc(e.message) + '</div>'; current = null; toggleButtons(false); return; }
    var scale = BL.num('#scale', 100) / 100;
    $('#scale-out').textContent = Math.round(scale * 100) + '%';
    var g = geometry(isbn, addon, $('#show-label').checked);
    font().then(function (f) {
      g.textD = textPaths(f, g.texts);
      g.scale = scale; g.isbn = isbn; g.addon = addon; g.bg = $('#white-bg').checked;
      current = g;
      box.innerHTML = svgString(g, true);
      var mmW = g.width * X_MM * scale, mmH = g.height * X_MM * scale;
      stats.innerHTML =
        stat('Barcode digits', isbn.digits + (addon ? ' ' + addon : '')) +
        stat('Printed size', BL.fmt(mmW, 1) + ' × ' + BL.fmt(mmH, 1) + ' mm', BL.fmt(mmW / 25.4, 2) + ' × ' + BL.fmt(mmH / 25.4, 2) + ' in') +
        stat('Add-on', addon ? describeAddon(addon) : 'None');
      var notes = [];
      if (isbn.note) notes.push('<div class="note">' + BL.esc(isbn.note) + '</div>');
      if (scale > 1.2) notes.push('<div class="note">Larger than standard. That scans fine, but check it fits the space on your back cover.</div>');
      if (addon && addon[0] === '5' && addon !== '59999') notes.push('<div class="note">KDP asks that the price in the add-on matches your list price. Use 90000 if your price may change.</div>');
      msg.innerHTML = notes.join('');
      toggleButtons(true);
    }).catch(function (e) { BL.fail(e, msg); });
  }
  function describeAddon(a) {
    if (a === '90000') return '90000 (no price)';
    if (a === '59999') return '59999 (USD price over 99.98)';
    return a[0] === '5' ? a + ' (USD ' + (+a.slice(1) / 100).toFixed(2) + ')' : a;
  }
  function stat(k, v, s) { return '<div class="stat"><div class="k">' + k + '</div><div class="v" style="font-size:1rem">' + BL.esc(v) + '</div>' + (s ? '<div class="s">' + BL.esc(s) + '</div>' : '') + '</div>'; }
  function toggleButtons(on) { ['#dl-svg', '#dl-pdf', '#dl-png', '#dl-png300'].forEach(function (id) { $(id).disabled = !on; }); }

  function svgString(g, forScreen) {
    var w = g.width * X_MM * g.scale, h = g.height * X_MM * g.scale;
    var bars = g.rects.map(function (r) { return 'M' + r.x + ' ' + r.y + 'h' + r.w + 'v' + r.h + 'h-' + r.w + 'z'; }).join('');
    var size = forScreen ? 'width="100%" style="max-width:' + Math.round(w * 9) + 'px;background:#fff"' : 'width="' + w.toFixed(3) + 'mm" height="' + h.toFixed(3) + 'mm"';
    return '<svg xmlns="http://www.w3.org/2000/svg" ' + size + ' viewBox="0 0 ' + g.width + ' ' + g.height.toFixed(3) + '" role="img" aria-label="Barcode for ' + BL.esc(g.isbn.label) + '">' +
      (g.bg || forScreen ? '<rect width="100%" height="100%" fill="#fff"/>' : '') +
      '<path fill="#000" d="' + bars + '"/><path fill="#000" d="' + g.textD + '"/></svg>';
  }

  function fileBase() { return 'isbn-' + current.isbn.digits + (current.addon ? '-' + current.addon : ''); }

  function downloadPng(dpi) {
    if (!current) return;
    var g = current;
    var pxPerModule = X_MM * g.scale / 25.4 * dpi;
    var c = document.createElement('canvas');
    c.width = Math.round(g.width * pxPerModule); c.height = Math.round(g.height * pxPerModule);
    var ctx = c.getContext('2d');
    if (g.bg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.scale(pxPerModule, pxPerModule);
    ctx.fillStyle = '#000';
    g.rects.forEach(function (r) { ctx.fillRect(r.x, r.y, r.w, r.h); });
    ctx.fill(new Path2D(g.textD));
    BL.canvasBlob(c).then(function (blob) { return BL.blobBytes(blob); }).then(function (bytes) {
      BL.download(new Blob([setPngDpi(bytes, dpi)], { type: 'image/png' }), fileBase() + '-' + dpi + 'dpi.png');
    }).catch(function (e) { BL.fail(e); });
  }

  // Insert a pHYs chunk so design apps open the PNG at the right physical size.
  function setPngDpi(bytes, dpi) {
    var ppm = Math.round(dpi / 0.0254);
    var data = new Uint8Array(9);
    var dv = new DataView(data.buffer);
    dv.setUint32(0, ppm); dv.setUint32(4, ppm); data[8] = 1;
    var chunk = pngChunk('pHYs', data);
    var out = new Uint8Array(bytes.length + chunk.length);
    var ihdrEnd = 8 + 25; // signature + IHDR chunk
    out.set(bytes.subarray(0, ihdrEnd), 0);
    out.set(chunk, ihdrEnd);
    out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
    return out;
  }
  var crcTable = null;
  function crc32(buf) {
    if (!crcTable) { crcTable = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
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

  function downloadPdf() {
    if (!current) return;
    var g = current;
    BL.pdfLib(false).then(function (PDFLib) {
      var ptPerModule = X_MM * g.scale / 25.4 * 72;
      return PDFLib.PDFDocument.create().then(function (doc) {
        doc.setTitle('Barcode ' + g.isbn.label); doc.setProducer('Bleedline'); doc.setCreator('Bleedline ISBN barcode generator');
        var page = doc.addPage([g.width * ptPerModule, g.height * ptPerModule]);
        if (g.bg) page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: PDFLib.rgb(1, 1, 1) });
        var black = PDFLib.cmyk(0, 0, 0, 1);
        // drawSvgPath uses y-down coordinates from the given origin, which matches the geometry.
        var bars = g.rects.map(function (r) { return 'M' + r.x + ' ' + r.y + 'h' + r.w + 'v' + r.h + 'h-' + r.w + 'z'; }).join('');
        var opts = { x: 0, y: page.getHeight(), scale: ptPerModule, color: black, borderWidth: 0 };
        page.drawSvgPath(bars, opts);
        page.drawSvgPath(g.textD, opts);
        return doc.save();
      });
    }).then(function (bytes) {
      BL.download(new Blob([bytes], { type: 'application/pdf' }), fileBase() + '.pdf');
    }).catch(function (e) { BL.fail(e); });
  }

  function syncAddonRows() {
    var mode = BL.radio('addon');
    $('#price-row').hidden = mode !== 'price';
    $('#custom-row').hidden = mode !== 'custom';
  }

  var form = $('#bc-form');
  BL.persist(form, 'isbn-barcode');
  syncAddonRows();
  form.addEventListener('input', function () { syncAddonRows(); render(); });
  form.addEventListener('change', function () { syncAddonRows(); render(); });
  $('#dl-svg').addEventListener('click', function () {
    if (!current) return;
    BL.download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svgString(current, false)], { type: 'image/svg+xml' }), fileBase() + '.svg');
  });
  $('#dl-pdf').addEventListener('click', downloadPdf);
  $('#dl-png').addEventListener('click', function () { downloadPng(600); });
  $('#dl-png300').addEventListener('click', function () { downloadPng(300); });
  render();
})();
