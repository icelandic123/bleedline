/* Shared Amazon KDP print specs used by the book tools. All lengths in inches.
   Source: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6 (trims, page limits, bleed, margins), checked 2026-10-19.
   8.25 x 11 is a hardcover-only trim. Standard color needs 72+ pages and isn't offered on A4.
   Keep in step with research/specs.md. */
(function () {
  var BL = window.BL = window.BL || {};
  function t(w, h, opts) {
    opts = opts || {};
    return {
      id: w + 'x' + h, w: w, h: h,
      label: w + ' × ' + h + ' in (' + (w * 2.54).toFixed(2) + ' × ' + (h * 2.54).toFixed(2) + ' cm)' + (opts.name ? ' · ' + opts.name : ''),
      hardcover: !!opts.hc,
      paperback: opts.pb !== false,
      // Paperback page limits by paper: [white, cream, groundwood, standard color, premium color].
      maxPages: opts.max || [828, 776, 812, 600, 828],
      // KDP calls trims wider than 6.12 in or taller than 9 in "large", with lower page limits.
      large: w > 6.12 || h > 9
    };
  }
  var trims = [
    t(5, 8), t(5.06, 7.81), t(5.25, 8), t(5.5, 8.5, { hc: true }), t(6, 9, { hc: true, name: 'most popular' }),
    t(6.14, 9.21, { hc: true }), t(6.69, 9.61), t(7, 10, { hc: true }), t(7.44, 9.69), t(7.5, 9.25),
    t(8, 10), t(8.25, 6, { max: [800, 750, 784, 600, 800] }), t(8.25, 8.25, { max: [800, 750, 784, 600, 800] }),
    t(8.5, 8.5, { max: [590, 550, 578, 600, 590] }), t(8.5, 11, { name: 'US letter', max: [590, 550, 578, 600, 590] }),
    t(8.27, 11.69, { name: 'A4', max: [780, 730, 764, 0, 590] }), t(8.25, 11, { hc: true, pb: false })
  ];

  BL.kdp = {
    trims: trims,
    trim: function (id) { return trims.filter(function (x) { return x.id === id; })[0] || trims[4]; },
    bleed: 0.125,
    minPages: 24,
    hardcoverPages: [75, 550],
    papers: ['white', 'cream', 'groundwood', 'stdcolor', 'premcolor'],
    // Inside (gutter) margin grows with page count.
    insideMargin: function (pages) {
      if (pages <= 150) return 0.375;
      if (pages <= 300) return 0.5;
      if (pages <= 500) return 0.625;
      if (pages <= 700) return 0.75;
      return 0.875;
    },
    // Minimum top, bottom and outside margin.
    outsideMargin: function (bleed) { return bleed ? 0.375 : 0.25; },
    // PDF page size: with bleed, add 0.125 in to the width and 0.25 in to the height.
    pageSize: function (trim, bleed) {
      return bleed ? { w: trim.w + 0.125, h: trim.h + 0.25 } : { w: trim.w, h: trim.h };
    },
    // Safe live area of page n (1-based; odd pages are right-hand pages) in PDF points, origin bottom-left.
    // extra: optional extra margin in inches on every side, on top of KDP's minimums.
    liveArea: function (trim, pages, n, bleed, extra) {
      extra = extra || 0;
      var size = BL.kdp.pageSize(trim, bleed);
      var inside = BL.kdp.insideMargin(pages) + extra;
      var outside = BL.kdp.outsideMargin(bleed) + extra;
      var tb = BL.kdp.outsideMargin(bleed) + extra;
      // KDP's outside minimum is measured from the PDF page edge: 0.25 in without bleed,
      // 0.375 in with bleed (the 0.125 in bleed plus the same 0.25 in inside the trim).
      var right = n % 2 === 1;
      var left = right ? inside : outside;
      var rightM = right ? outside : inside;
      var bottom = tb;
      var top = tb;
      return {
        pageW: size.w * 72, pageH: size.h * 72,
        x: left * 72, y: bottom * 72,
        w: (size.w - left - rightM) * 72, h: (size.h - top - bottom) * 72
      };
    },
    // KDP needs an even page count for print; blank pages pad the end.
    evenPages: function (n) { return Math.max(BL.kdp.minPages, n + (n % 2)); }
  };
})();
