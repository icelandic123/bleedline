/* Word search generator. Plain JS, no DOM, so it also runs in Node for tests.
   Grids are arrays of size*size uppercase letters A-Z, row by row. */
(function (root) {
  'use strict';

  function hashSeed(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rng(seed) {
    var a = typeof seed === 'number' ? seed >>> 0 : hashSeed(String(seed));
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  // name: [dRow, dCol]
  var DIRS = { E: [0, 1], S: [1, 0], SE: [1, 1], NE: [-1, 1], W: [0, -1], N: [-1, 0], NW: [-1, -1], SW: [1, -1] };
  var ALL8 = ['E', 'S', 'SE', 'NE', 'W', 'N', 'NW', 'SW'];
  function dirSet(o) {
    var out = [];
    if (o.horizontal) out.push('E');
    if (o.vertical) out.push('S');
    if (o.diagonal) out.push('SE', 'NE');
    if (o.backwards) {
      if (o.horizontal) out.push('W');
      if (o.vertical) out.push('N');
      if (o.diagonal) out.push('NW', 'SW');
    }
    return out;
  }

  // "Ice cream" -> {display: "Ice cream", letters: "ICECREAM"}. Accents are dropped in the grid.
  function normalize(raw) {
    var display = String(raw).replace(/\s+/g, ' ').trim();
    var letters = display.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[\s\-'’.·_]/g, '');
    var bad = letters.replace(/[A-Z]/g, '');
    return { display: display, letters: letters.replace(/[^A-Z]/g, ''), bad: bad };
  }

  // A word list: one per line or comma/semicolon separated. Duplicates are dropped.
  function parseList(text) {
    var seen = {}, words = [], skipped = [];
    String(text || '').split(/[\n\r,;\t]+/).forEach(function (part) {
      var w = normalize(part);
      if (!w.display) return;
      if (w.bad) { skipped.push({ word: w.display, why: 'has characters other than A–Z (' + Array.from(new Set(w.bad)).join(' ') + ')' }); return; }
      if (w.letters.length < 2) { skipped.push({ word: w.display, why: 'is shorter than 2 letters' }); return; }
      if (seen[w.letters]) return;
      seen[w.letters] = true;
      words.push(w);
    });
    return { words: words, skipped: skipped };
  }

  // Blank-line-separated blocks; the first line of each block is the title.
  function parseBulk(text) {
    return String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(function (block) {
      var lines = block.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) return null;
      return { title: lines[0].replace(/:$/, ''), words: lines.slice(1).join('\n') };
    }).filter(function (p) { return p && p.words.trim(); });
  }

  // Placement with backtracking. Longest words first; candidate spots are scored by a
  // random value, a mild bonus for crossing another word and a penalty for overused directions.
  function placeAll(words, size, dirs, rand, budget) {
    var N = size * size, grid = new Array(N), i;
    for (i = 0; i < N; i++) grid[i] = '';
    var order = words.map(function (w, idx) { return { w: w, idx: idx, k: w.length + rand() * 0.5 }; })
      .sort(function (a, b) { return b.k - a.k; });
    var placed = new Array(words.length), dirCount = {}, steps = 0;
    dirs.forEach(function (d) { dirCount[d] = 0; });

    function candidates(word) {
      var out = [], L = word.length;
      for (var di = 0; di < dirs.length; di++) {
        var d = dirs[di], dr = DIRS[d][0], dc = DIRS[d][1];
        var r0 = dr < 0 ? L - 1 : 0, r1 = dr > 0 ? size - L : size - 1;
        var c0 = dc < 0 ? L - 1 : 0, c1 = dc > 0 ? size - L : size - 1;
        for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
          var cross = 0, okay = true;
          for (var k = 0; k < L; k++) {
            var ch = grid[(r + dr * k) * size + c + dc * k];
            if (ch) { if (ch !== word[k]) { okay = false; break; } cross++; }
          }
          // Never lay a word entirely over letters that are already there.
          if (okay && cross < L) out.push({ r: r, c: c, d: d, cross: cross, s: rand() + cross * 0.35 - dirCount[d] * 0.12 });
        }
      }
      out.sort(function (a, b) { return b.s - a.s; });
      return out;
    }
    function apply(word, p) {
      var dr = DIRS[p.d][0], dc = DIRS[p.d][1], setCells = [];
      for (var k = 0; k < word.length; k++) {
        var cell = (p.r + dr * k) * size + p.c + dc * k;
        if (!grid[cell]) { grid[cell] = word[k]; setCells.push(cell); }
      }
      dirCount[p.d]++;
      return setCells;
    }
    function undo(p, setCells) { setCells.forEach(function (c) { grid[c] = ''; }); dirCount[p.d]--; }

    function rec(i) {
      if (i === order.length) return true;
      if (++steps > budget) return false;
      var word = order[i].w, cands = candidates(word);
      var limit = Math.min(cands.length, i < 3 ? 40 : 12);
      for (var k = 0; k < limit; k++) {
        var cells = apply(word, cands[k]);
        placed[order[i].idx] = cands[k];
        if (rec(i + 1)) return true;
        undo(cands[k], cells);
        placed[order[i].idx] = null;
        if (steps > budget) return false;
      }
      return false;
    }
    if (rec(0)) return { grid: grid, placed: placed, complete: true };

    // Best effort: place what fits, longest first, and report the rest.
    for (i = 0; i < N; i++) grid[i] = '';
    dirs.forEach(function (d) { dirCount[d] = 0; });
    placed = new Array(words.length);
    order.forEach(function (o) {
      var c = candidates(o.w);
      if (c.length) { apply(o.w, c[0]); placed[o.idx] = c[0]; }
    });
    return { grid: grid, placed: placed, complete: false };
  }

  function wordCells(p, len, size) {
    var dr = DIRS[p.d][0], dc = DIRS[p.d][1], out = [];
    for (var k = 0; k < len; k++) out.push((p.r + dr * k) * size + p.c + dc * k);
    return out;
  }

  // Every place a word can be read, in all eight directions (palindromes counted once).
  function findAll(grid, size, word) {
    var found = [], keys = {}, L = word.length;
    for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) {
      if (grid[r * size + c] !== word[0]) continue;
      for (var di = 0; di < 8; di++) {
        var d = DIRS[ALL8[di]], er = r + d[0] * (L - 1), ec = c + d[1] * (L - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        var k = 1;
        while (k < L && grid[(r + d[0] * k) * size + c + d[1] * k] === word[k]) k++;
        if (k < L) continue;
        var cells = [];
        for (k = 0; k < L; k++) cells.push((r + d[0] * k) * size + c + d[1] * k);
        var key = cells.slice().sort(function (a, b) { return a - b; }).join(',');
        if (!keys[key]) { keys[key] = true; found.push(cells); }
      }
    }
    return found;
  }

  // Letter strings that must not appear by accident in the filler (stored in ROT13).
  var AVOID = ['SHPX', 'FUVG', 'PHAG', 'QVPX', 'PBPX', 'GJNG', 'CVFF', 'FYHG', 'JUBER', 'ANMV', 'ENCR', 'XVYY', 'ONFGNEQ', 'OVGPU', 'AVTTRE', 'SNT', 'NFF', 'GVG', 'CBEA', 'FRK']
    .map(function (w) { return w.replace(/[A-Z]/g, function (c) { return String.fromCharCode((c.charCodeAt(0) - 52) % 26 + 65); }); });

  /* opts: {words: [{display, letters}], size, dirs: ['E', ...], seed, filler: 'all'|'words'}
     Returns {grid, size, placed: [{word, display, r, c, d, cells}], unplaced: [display], duplicates: [display], expectedDuplicates: [..]} */
  function generate(opts) {
    var size = opts.size, words = opts.words, dirs = opts.dirs && opts.dirs.length ? opts.dirs : ['E', 'S'];
    var rand = rng(opts.seed + '|' + size + '|' + dirs.join('') + '|' + opts.filler + '|' + words.map(function (w) { return w.letters; }).join(','));
    // A duplicate made only of letters from crossing words can't be fixed by new filler,
    // so lay the words out again (a few times) and keep the cleanest result.
    var best = null;
    for (var t = 0; t < 6; t++) {
      var g = generateOnce(opts, size, words, dirs, rand);
      if (!best || g.placed.length > best.placed.length || (g.placed.length === best.placed.length && g.duplicates.length < best.duplicates.length)) best = g;
      if (best.complete && !best.duplicates.length) break;
    }
    return best;
  }
  function generateOnce(opts, size, words, dirs, rand) {
    var fits = words.filter(function (w) { return w.letters.length <= size; });
    var tooLong = words.filter(function (w) { return w.letters.length > size; });
    var res = null;
    for (var attempt = 0; attempt < 6 && !(res && res.complete); attempt++) {
      var r = placeAll(fits.map(function (w) { return w.letters; }), size, dirs, rand, 4000);
      if (!res || r.complete || countPlaced(r) > countPlaced(res)) res = r;
    }
    var grid = res.grid, N = size * size, used = new Uint8Array(N);
    var placed = [], unplaced = tooLong.map(function (w) { return w.display; });
    fits.forEach(function (w, i) {
      var p = res.placed[i];
      if (!p) { unplaced.push(w.display); return; }
      var cells = wordCells(p, w.letters.length, size);
      cells.forEach(function (c) { used[c] = 1; });
      placed.push({ word: w.letters, display: w.display, r: p.r, c: p.c, d: p.d, cells: cells });
    });

    // Filler letters.
    var pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (opts.filler === 'words') {
      var set = {};
      words.forEach(function (w) { for (var k = 0; k < w.letters.length; k++) set[w.letters[k]] = 1; });
      pool = Object.keys(set).sort().join('') || pool;
      if (pool.length < 4) pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }
    var filler = [];
    for (var i = 0; i < N; i++) if (!used[i]) { grid[i] = pool[Math.floor(rand() * pool.length)]; filler.push(i); }

    // A word inside another word (CAT in CATERPILLAR) is always found twice; that can't be fixed.
    var expected = {};
    placed.forEach(function (a) {
      placed.forEach(function (b) {
        if (a !== b && (b.word.indexOf(a.word) >= 0 || b.word.split('').reverse().join('').indexOf(a.word) >= 0)) expected[a.word] = b.display;
      });
    });
    // Re-roll filler letters that spell a list word a second time, or an unwanted word.
    var stubborn = {};
    for (var round = 0; round < 400; round++) {
      var bad = [];
      placed.forEach(function (p) {
        if (expected[p.word]) return;
        var occ = findAll(grid, size, p.word);
        if (occ.length < 2) return;
        var own = p.cells.slice().sort(function (a, b) { return a - b; }).join(',');
        occ.forEach(function (cells) {
          if (cells.slice().sort(function (a, b) { return a - b; }).join(',') === own) return;
          var free = cells.filter(function (c) { return !used[c]; });
          if (free.length) bad.push(free); else stubborn[p.display] = true;
        });
      });
      AVOID.forEach(function (w) {
        if (w.length > size) return;
        findAll(grid, size, w).forEach(function (cells) {
          var free = cells.filter(function (c) { return !used[c]; });
          if (free.length) bad.push(free);
        });
      });
      if (!bad.length) break;
      bad.forEach(function (free) { var c = free[Math.floor(rand() * free.length)]; grid[c] = pool[Math.floor(rand() * pool.length)]; });
    }
    var duplicates = [];
    placed.forEach(function (p) {
      if (!expected[p.word] && findAll(grid, size, p.word).length > 1) duplicates.push(p.display);
    });
    return {
      grid: grid, size: size, placed: placed, unplaced: unplaced, duplicates: duplicates,
      expectedDuplicates: Object.keys(expected).map(function (k) { return { word: k, inside: expected[k] }; }),
      complete: unplaced.length === 0
    };
  }
  function countPlaced(r) { return r.placed.filter(Boolean).length; }

  // Smallest grid (from `from` up to `max`) that fits every word, or 0.
  function fitSize(words, dirs, seed, from, max) {
    var longest = words.reduce(function (m, w) { return Math.max(m, w.letters.length); }, 0);
    var letters = words.reduce(function (m, w) { return m + w.letters.length; }, 0);
    // Crossings share letters, but rarely more than a third of them, so smaller grids can't work.
    var start = Math.max(from, longest, Math.ceil(Math.sqrt(letters * 0.65)));
    for (var s = start; s <= max; s++) {
      var rand = rng(seed + '|fit|' + s);
      for (var a = 0; a < 2; a++) if (placeAll(words.map(function (w) { return w.letters; }), s, dirs, rand, 2000).complete) return s;
    }
    return 0;
  }

  var api = { rng: rng, hashSeed: hashSeed, DIRS: DIRS, dirSet: dirSet, normalize: normalize, parseList: parseList, parseBulk: parseBulk, generate: generate, findAll: findAll, fitSize: fitSize, AVOID: AVOID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WordSearch = api;
})(typeof self !== 'undefined' ? self : this);
