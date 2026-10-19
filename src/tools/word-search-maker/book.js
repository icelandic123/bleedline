/* Puzzle book page layout for pdf-lib (shared by the puzzle tools; each tool keeps its own copy).
   Two kinds of output:
   - print: US Letter or A4, 0.5 in margins, no bleed, for printing at home or school.
   - kdp:   any KDP trim, optional bleed, mirrored margins from BL.kdp.liveArea, even page count >= 24.
   All coordinates are PDF points with the origin at the bottom left, as pdf-lib uses. */
(function () {
  var BL = window.BL;
  var PAPER = {
    letter: { w: 8.5, h: 11, label: 'US Letter' },
    a4: { w: 595.28 / 72, h: 841.89 / 72, label: 'A4' }
  };
  var PRINT_MARGIN = 0.5;      // inches, home printing
  var KDP_EXTRA = 0.125;       // inches added to KDP's minimum margins so nothing sits on the limit
  var NUMBER_BAND = 20;        // points kept free at the bottom of the live area for page numbers

  function pageSizeIn(spec) {
    if (spec.mode === 'kdp') return BL.kdp.pageSize(BL.kdp.trim(spec.trimId), spec.bleed);
    var p = PAPER[spec.paper] || PAPER.letter;
    return { w: p.w, h: p.h };
  }

  function totalPages(spec, contentPages) {
    return spec.mode === 'kdp' ? BL.kdp.evenPages(contentPages) : contentPages;
  }

  // Live area for page n (1-based) of a document with `total` pages.
  function frame(spec, total, n) {
    if (spec.mode === 'kdp') {
      var a = BL.kdp.liveArea(BL.kdp.trim(spec.trimId), total, n, spec.bleed, KDP_EXTRA);
      return { pageW: a.pageW, pageH: a.pageH, x: a.x, y: a.y, w: a.w, h: a.h };
    }
    var s = pageSizeIn(spec), m = PRINT_MARGIN * 72;
    return { pageW: s.w * 72, pageH: s.h * 72, x: m, y: m, w: s.w * 72 - 2 * m, h: s.h * 72 - 2 * m };
  }

  function describe(spec, contentPages) {
    var total = totalPages(spec, contentPages);
    var size = pageSizeIn(spec);
    var out = { total: total, pad: total - contentPages, pageIn: size };
    if (spec.mode === 'kdp') {
      out.inside = BL.kdp.insideMargin(total) + KDP_EXTRA;
      out.outside = BL.kdp.outsideMargin(spec.bleed) + KDP_EXTRA;
    } else out.inside = out.outside = PRINT_MARGIN;
    return out;
  }

  // ---- text helpers ----
  function width(font, s, size) { return font.widthOfTextAtSize(s, size); }
  function fit(font, s, size, maxW, minSize) {
    var w = width(font, s, size);
    if (w <= maxW) return size;
    return Math.max(minSize || 6, size * maxW / w);
  }
  // Shorten with an ellipsis until it fits at this size.
  function clip(font, s, size, maxW) {
    if (width(font, s, size) <= maxW) return s;
    while (s.length > 1 && width(font, s + '…', size) > maxW) s = s.slice(0, -1);
    return s.replace(/\s+$/, '') + '…';
  }
  function wrap(font, text, size, maxW) {
    var lines = [];
    String(text).split('\n').forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), line = '';
      words.forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (line && width(font, t, size) > maxW) { lines.push(line); line = w; } else line = t;
      });
      lines.push(line);
    });
    return lines;
  }

  function Ctx(PDFLib, doc, fonts, page, fr, n) {
    this.PDFLib = PDFLib; this.doc = doc; this.fonts = fonts; this.page = page; this.n = n;
    this.frame = fr;
    this.black = PDFLib.cmyk(0, 0, 0, 1);
  }
  Ctx.prototype.gray = function (k) { return this.PDFLib.cmyk(0, 0, 0, k); };
  Ctx.prototype.text = function (s, o) {
    var font = o.font || this.fonts.regular, size = o.size || 11, x = o.x;
    if (o.maxW) { size = fit(font, s, size, o.maxW, o.minSize); }
    var w = width(font, s, size);
    if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
    this.page.drawText(s, { x: x, y: o.y, size: size, font: font, color: o.color || this.black });
    return { w: w, size: size };
  };
  // Many single characters in one text object: far faster than one drawText per letter.
  // items: [{x: centre x, y: baseline, s: char}]
  Ctx.prototype.chars = function (items, font, size, color) {
    var P = this.PDFLib, page = this.page;
    if (!items.length) return;
    page.setFont(font);
    var key = page.fontKey;
    if (!key) { var self = this; items.forEach(function (it) { self.text(it.s, { x: it.x, y: it.y, size: size, font: font, align: 'center', color: color }); }); return; }
    var widths = {}, ops = [P.pushGraphicsState(), P.setFillingColor(color || this.black), P.beginText(), P.setFontAndSize(key, size)];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!(it.s in widths)) widths[it.s] = font.widthOfTextAtSize(it.s, size);
      ops.push(P.setTextMatrix(1, 0, 0, 1, it.x - widths[it.s] / 2, it.y), P.showText(font.encodeText(it.s)));
    }
    ops.push(P.endText(), P.popGraphicsState());
    page.pushOperators.apply(page, ops);
  };
  // SVG path in a y-down system whose origin is the top-left corner of the page.
  Ctx.prototype.path = function (d, o) {
    this.page.drawSvgPath(d, {
      x: 0, y: this.frame.pageH, color: o.fill, borderColor: o.stroke, borderWidth: o.stroke ? (o.width || 0.75) : 0,
      borderLineCap: this.PDFLib.LineCapStyle ? this.PDFLib.LineCapStyle.Round : undefined
    });
  };
  Ctx.prototype.rect = function (x, y, w, h, o) {
    this.page.drawRectangle({ x: x, y: y, width: w, height: h, color: o.fill, borderColor: o.stroke, borderWidth: o.stroke ? (o.width || 0.75) : 0 });
  };
  Ctx.prototype.line = function (x1, y1, x2, y2, w, color) {
    this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w, color: color || this.black });
  };

  /* Build the PDF.
     opts: {spec, meta: {title, subject}, pages: [{type: 'title'|'text'|'blank'|'content', ...}], pageNumbers, onProgress(done, total)}
     content pages: {type: 'content', draw(ctx)}; ctx.frame excludes the page-number band.
     title pages: {type: 'title', title, subtitle}; text pages: {type: 'text', heading, body: [paragraphs]} */
  function build(opts) {
    var spec = opts.spec, pages = opts.pages.slice();
    var total = totalPages(spec, pages.length);
    while (pages.length < total) pages.push({ type: 'blank', pad: true });
    return BL.pdfLib(true).then(function (PDFLib) {
      return PDFLib.PDFDocument.create().then(function (doc) {
        doc.setTitle(opts.meta.title || 'Puzzle book');
        if (opts.meta.subject) doc.setSubject(opts.meta.subject);
        doc.setProducer('Bleedline'); doc.setCreator(opts.meta.creator || 'Bleedline');
        return BL.embedFonts(doc).then(function (fonts) {
          var i = 0;
          function step() {
            var until = Math.min(pages.length, i + 4);
            for (; i < until; i++) drawPage(PDFLib, doc, fonts, pages[i], frame(spec, total, i + 1), i + 1, opts.pageNumbers);
            if (opts.onProgress) opts.onProgress(i, pages.length);
            if (i < pages.length) return new Promise(function (r) { setTimeout(r, 0); }).then(step);
            return doc.save({ objectsPerTick: 100 });
          }
          return step();
        });
      });
    }).then(function (bytes) { return { bytes: bytes, pages: total, padded: total - opts.pages.length }; });
  }

  function drawPage(PDFLib, doc, fonts, p, fr, n, numbers) {
    var page = doc.addPage([fr.pageW, fr.pageH]);
    var hasNumber = numbers && p.type === 'content';
    var inner = { pageW: fr.pageW, pageH: fr.pageH, x: fr.x, y: fr.y + (numbers ? NUMBER_BAND : 0), w: fr.w, h: fr.h - (numbers ? NUMBER_BAND : 0) };
    var ctx = new Ctx(PDFLib, doc, fonts, page, inner, n);
    if (p.type === 'title') {
      var cx = fr.x + fr.w / 2, y = fr.y + fr.h * 0.62;
      var tSize = 34, lines = wrap(fonts.bold, p.title || 'Puzzle Book', tSize, fr.w);
      while (lines.length > 3 && tSize > 16) { tSize -= 2; lines = wrap(fonts.bold, p.title, tSize, fr.w); }
      lines.forEach(function (l, k) { ctx.text(l, { x: cx, y: y - k * tSize * 1.2, size: tSize, font: fonts.bold, align: 'center', maxW: fr.w }); });
      y -= (lines.length - 1) * tSize * 1.2 + tSize * 1.4;
      if (p.subtitle) wrap(fonts.regular, p.subtitle, 15, fr.w).forEach(function (l, k) { ctx.text(l, { x: cx, y: y - k * 20, size: 15, align: 'center', maxW: fr.w, color: ctx.gray(0.75) }); });
      if (p.author) ctx.text(p.author, { x: cx, y: fr.y + fr.h * 0.14, size: 13, align: 'center', maxW: fr.w });
    } else if (p.type === 'text') {
      var top = fr.y + fr.h;
      ctx.text(p.heading, { x: fr.x, y: top - 22, size: 20, font: fonts.bold, maxW: fr.w });
      var yy = top - 54, size = p.size || 12;
      (p.body || []).forEach(function (para) {
        wrap(fonts.regular, para, size, fr.w).forEach(function (l) { ctx.text(l, { x: fr.x, y: yy, size: size }); yy -= size * 1.5; });
        yy -= size * 0.7;
      });
    } else if (p.type === 'content') {
      p.draw(ctx);
    }
    if (hasNumber) ctx.text(String(n), { x: fr.x + fr.w / 2, y: fr.y + 4, size: 10, align: 'center', color: ctx.gray(0.8) });
  }

  // Grid of equal slots inside a rectangle (for several puzzles on one page), top-left first.
  function slots(fr, cols, rows, gapX, gapY, topSkip) {
    var top = fr.y + fr.h - (topSkip || 0);
    var w = (fr.w - gapX * (cols - 1)) / cols, h = (top - fr.y - gapY * (rows - 1)) / rows, out = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) out.push({ x: fr.x + c * (w + gapX), y: top - (r + 1) * h - r * gapY, w: w, h: h });
    return out;
  }

  window.BLBook = {
    PAPER: PAPER, pageSizeIn: pageSizeIn, totalPages: totalPages, frame: frame, describe: describe,
    build: build, slots: slots, fit: fit, clip: clip, wrap: wrap, width: width, NUMBER_BAND: NUMBER_BAND
  };
})();
