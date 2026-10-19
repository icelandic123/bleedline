/* KDP paperback cover math. Pure functions, used by the page and by the Node tests.
   All lengths in inches. Every number comes from research/specs.md (checked 2026-10-19):
   spine factors 1.4, cover size 1.5, bleed 1.3, barcode 1.7, hardcover 1.6.
   Sources: https://kdp.amazon.com/en_US/help/topic/G201953020 and G201834560. */
(function (g) {
  var BL = g.BL = g.BL || {};
  var C = {
    bleed: 0.125,          // on every side of the cover
    safe: 0.125,           // keep text this far inside the trim (and the spine folds)
    spineClear: 0.0625,    // clearance each side of the spine for spine text
    foldVariance: 0.0625,  // the fold can move this far either way
    barcode: { w: 2, h: 1.2, gap: 0.25 },
    spineTextMinPages: 80, // KDP: spine text only on books with more than 79 pages
    minPages: 24,
    stdColorMin: 72,
    // Inches of spine per page.
    factor: { white: 0.002252, cream: 0.0025, groundwood: 0.00235, stdcolor: 0.002252, premcolor: 0.002347 },
    mmFactor: { white: 0.0572, cream: 0.0635, groundwood: 0.0596, stdcolor: 0.0572, premcolor: 0.0596 },
    paperIndex: { white: 0, cream: 1, groundwood: 2, stdcolor: 3, premcolor: 4 },
    paperName: {
      white: 'Black & white, white paper', cream: 'Black & white, cream paper', groundwood: 'Black & white, groundwood paper',
      stdcolor: 'Standard color, white paper', premcolor: 'Premium color, white paper'
    },
    paperShort: { white: 'B&W white', cream: 'B&W cream', groundwood: 'B&W groundwood', stdcolor: 'Standard color', premcolor: 'Premium color' },
    // Hardcover: only these numbers are published (GDTKFJPNQCBTMRV6). No spine factor or total size.
    hardcover: { wrap: 0.51, hinge: 0.4, safe: 0.635, barcodeBottom: 0.76, barcodeHinge: 0.25, pages: [75, 550], papers: ['white', 'cream', 'premcolor'] }
  };

  // Allowed page range for a trim and paper, or {error}.
  C.limits = function (trim, paper, format) {
    if (format === 'hardcover') {
      if (!trim.hardcover) return { error: trim.w + ' × ' + trim.h + ' in is not a hardcover trim size.' };
      if (C.hardcover.papers.indexOf(paper) < 0) return { error: C.paperName[paper] + ' is not offered for hardcovers. Choose B&W white, B&W cream or premium color.' };
      return { min: C.hardcover.pages[0], max: C.hardcover.pages[1] };
    }
    if (!trim.paperback) return { error: trim.w + ' × ' + trim.h + ' in is a hardcover-only trim size.' };
    var max = trim.maxPages[C.paperIndex[paper]];
    if (!max) return { error: C.paperName[paper] + ' is not offered at ' + trim.w + ' × ' + trim.h + ' in.' };
    return { min: paper === 'stdcolor' ? C.stdColorMin : C.minPages, max: max };
  };

  C.spine = function (pages, paper) { return pages * C.factor[paper]; };

  // Full layout of a paperback cover, origin at the top-left corner of the file (outer bleed edge), y down.
  C.layout = function (trim, pages, paper) {
    var b = C.bleed, tw = trim.w, th = trim.h, s = C.spine(pages, paper);
    var W = 2 * tw + s + 2 * b, H = th + 2 * b;
    var x0 = b + tw, x1 = x0 + s;
    var spineText = pages >= C.spineTextMinPages;
    var room = s - 2 * C.spineClear;
    return {
      trim: trim, pages: pages, paper: paper,
      spine: s, width: W, height: H, folds: [x0, x1],
      trimBox: { x: b, y: b, w: W - 2 * b, h: th },
      back: { x: b, y: b, w: tw, h: th },
      spineBox: { x: x0, y: b, w: s, h: th },
      front: { x: x1, y: b, w: tw, h: th },
      backSafe: { x: b + C.safe, y: b + C.safe, w: tw - 2 * C.safe, h: th - 2 * C.safe },
      frontSafe: { x: x1 + C.safe, y: b + C.safe, w: tw - 2 * C.safe, h: th - 2 * C.safe },
      spineSafe: spineText && room > 0 ? { x: x0 + C.spineClear, y: b + C.safe, w: room, h: th - 2 * C.safe } : null,
      spineText: spineText,
      spineTextRoom: Math.max(0, room),
      barcode: { x: x0 - C.barcode.gap - C.barcode.w, y: b + th - C.barcode.gap - C.barcode.h, w: C.barcode.w, h: C.barcode.h },
      panelWithBleed: { w: tw + b, h: th + 2 * b },
      spineWithBleed: { w: s, h: th + 2 * b }
    };
  };

  // Pixel size of the whole file at a resolution (nearest pixel).
  C.pixels = function (inches, dpi) { return Math.round(inches * dpi + 1e-9); };

  // Vertical and horizontal guide positions, measured from the file's top-left corner.
  C.guides = function (L) {
    var b = C.bleed, v = [], h = [];
    v.push(['Left edge of file', 0], ['Back cover trim (left)', b], ['Back cover safe area (left)', b + C.safe],
      ['Barcode area (left)', L.barcode.x], ['Barcode area (right)', L.barcode.x + L.barcode.w],
      ['Back cover safe area (right)', L.folds[0] - C.safe], ['Spine fold (left)', L.folds[0]]);
    if (L.spineSafe) v.push(['Spine text area (left)', L.spineSafe.x], ['Spine text area (right)', L.spineSafe.x + L.spineSafe.w]);
    v.push(['Spine fold (right)', L.folds[1]], ['Front cover safe area (left)', L.folds[1] + C.safe],
      ['Front cover safe area (right)', L.width - b - C.safe], ['Front cover trim (right)', L.width - b], ['Right edge of file', L.width]);
    h.push(['Top edge of file', 0], ['Top trim', b], ['Top of safe area', b + C.safe], ['Barcode area (top)', L.barcode.y],
      ['Barcode area (bottom)', L.barcode.y + L.barcode.h], ['Bottom of safe area', L.height - b - C.safe], ['Bottom trim', L.height - b], ['Bottom edge of file', L.height]);
    return { v: v, h: h };
  };

  BL.cover = C;
})(typeof window !== 'undefined' ? window : globalThis);
