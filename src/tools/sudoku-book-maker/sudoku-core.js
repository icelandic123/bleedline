/* Sudoku generator and grader. Plain JS, no DOM: runs in the page, in a Web Worker
   (importScripts) and in Node (require) for tests.
   Grids are arrays of 81 numbers, 0 = empty, row by row. */
(function (root) {
  'use strict';

  // ---------- seeded random numbers ----------
  function hashSeed(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
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
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---------- geometry ----------
  var ROW = [], COL = [], BOX = [], UNITS = [], CELL_UNITS = [], PEERS = [], SEES = [];
  (function () {
    var i, r, c, b;
    for (i = 0; i < 81; i++) { ROW[i] = Math.floor(i / 9); COL[i] = i % 9; BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3); }
    for (r = 0; r < 9; r++) { var u = []; for (c = 0; c < 9; c++) u.push(r * 9 + c); UNITS.push(u); }
    for (c = 0; c < 9; c++) { u = []; for (r = 0; r < 9; r++) u.push(r * 9 + c); UNITS.push(u); }
    for (b = 0; b < 9; b++) {
      u = [];
      var r0 = Math.floor(b / 3) * 3, c0 = (b % 3) * 3;
      for (r = 0; r < 3; r++) for (c = 0; c < 3; c++) u.push((r0 + r) * 9 + c0 + c);
      UNITS.push(u);
    }
    for (i = 0; i < 81; i++) {
      CELL_UNITS[i] = [ROW[i], 9 + COL[i], 18 + BOX[i]];
      var seen = new Uint8Array(81), p = [];
      CELL_UNITS[i].forEach(function (k) { UNITS[k].forEach(function (j) { if (j !== i && !seen[j]) { seen[j] = 1; p.push(j); } }); });
      PEERS[i] = p; SEES[i] = seen;
    }
  })();

  var POP = new Uint8Array(512), LOW = new Int8Array(512);
  for (var m = 0; m < 512; m++) {
    var n = 0; for (var k = 0; k < 9; k++) if (m & (1 << k)) n++;
    POP[m] = n;
    LOW[m] = -1; for (k = 0; k < 9; k++) if (m & (1 << k)) { LOW[m] = k; break; }
  }
  function bitsOf(mask) { var out = []; for (var k = 0; k < 9; k++) if (mask & (1 << k)) out.push(k); return out; }

  // ---------- exact solver: counts solutions up to `limit` ----------
  // Bitmask backtracking, always branching on the cell with the fewest candidates.
  function countSolutions(grid, limit, firstOut, rand) {
    limit = limit || 2;
    var rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
    var g = new Int8Array(81), empties = [], i;
    for (i = 0; i < 81; i++) {
      var v = grid[i];
      g[i] = v;
      if (v) {
        var bit = 1 << (v - 1);
        if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return 0; // givens clash
        rows[ROW[i]] |= bit; cols[COL[i]] |= bit; boxes[BOX[i]] |= bit;
      } else empties.push(i);
    }
    var count = 0, ne = empties.length;
    function rec(depth) {
      if (depth === ne) {
        count++;
        if (firstOut && count === 1) for (var q = 0; q < 81; q++) firstOut[q] = g[q];
        return count >= limit;
      }
      // pick the most constrained remaining cell
      var best = -1, bestMask = 0, bestN = 10;
      for (var e = depth; e < ne; e++) {
        var cell = empties[e];
        var mk = 0x1FF & ~(rows[ROW[cell]] | cols[COL[cell]] | boxes[BOX[cell]]);
        var pc = POP[mk];
        if (pc < bestN) { bestN = pc; best = e; bestMask = mk; if (pc <= 1) break; }
      }
      if (bestN === 0) return false;
      var tmp = empties[depth]; empties[depth] = empties[best]; empties[best] = tmp;
      var c = empties[depth], r = ROW[c], cl = COL[c], b = BOX[c];
      var digits = bitsOf(bestMask);
      if (rand) shuffle(digits, rand);
      for (var d = 0; d < digits.length; d++) {
        var bt = 1 << digits[d];
        rows[r] |= bt; cols[cl] |= bt; boxes[b] |= bt; g[c] = digits[d] + 1;
        var stop = rec(depth + 1);
        rows[r] &= ~bt; cols[cl] &= ~bt; boxes[b] &= ~bt; g[c] = 0;
        if (stop) { empties[best] = empties[depth]; empties[depth] = tmp; return true; }
      }
      empties[best] = empties[depth]; empties[depth] = tmp;
      return false;
    }
    rec(0);
    return count;
  }

  function solve(grid) {
    var out = new Array(81);
    return countSolutions(grid, 1, out) === 1 ? out : null;
  }

  function fullGrid(rand) {
    var out = new Array(81), empty = new Array(81);
    for (var i = 0; i < 81; i++) empty[i] = 0;
    // Seed the first row with a random permutation to spread grids evenly, then solve randomly.
    var first = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
    for (i = 0; i < 9; i++) empty[i] = first[i];
    countSolutions(empty, 1, out, rand);
    return out;
  }

  // ---------- human-style grader ----------
  // Each technique has a level: 1 easy, 2 medium, 3 hard, 4 expert.
  var TECH = {
    nakedSingle: { name: 'Naked single', level: 1 },
    hiddenSingle: { name: 'Hidden single', level: 1 },
    pointing: { name: 'Pointing pair/triple', level: 2 },
    claiming: { name: 'Box/line reduction', level: 2 },
    nakedPair: { name: 'Naked pair', level: 2 },
    hiddenPair: { name: 'Hidden pair', level: 2 },
    nakedTriple: { name: 'Naked triple', level: 3 },
    hiddenTriple: { name: 'Hidden triple', level: 3 },
    xWing: { name: 'X-Wing', level: 3 },
    xyWing: { name: 'XY-Wing', level: 3 },
    nakedQuad: { name: 'Naked quad', level: 4 },
    hiddenQuad: { name: 'Hidden quad', level: 4 },
    swordfish: { name: 'Swordfish', level: 4 },
    xyzWing: { name: 'XYZ-Wing', level: 4 },
    jellyfish: { name: 'Jellyfish', level: 4 },
    colouring: { name: 'Simple colouring', level: 4 },
    xyChain: { name: 'XY-Chain', level: 4 }
  };

  function combos(arr, k, cb) {
    var idx = [], n = arr.length;
    function rec(start, depth) {
      if (depth === k) return cb(idx.map(function (i) { return arr[i]; }));
      for (var i = start; i <= n - (k - depth); i++) {
        idx[depth] = i;
        if (rec(i + 1, depth + 1)) return true;
      }
      return false;
    }
    return rec(0, 0);
  }

  function grade(grid, maxLevel) {
    maxLevel = maxLevel || 4;
    var val = new Int8Array(81), cand = new Uint16Array(81), left = 0, i, j;
    for (i = 0; i < 81; i++) { val[i] = grid[i]; if (!grid[i]) { cand[i] = 0x1FF; left++; } }
    for (i = 0; i < 81; i++) if (val[i]) { var bit = 1 << (val[i] - 1); for (j = 0; j < 20; j++) cand[PEERS[i][j]] &= ~bit; }
    var used = {}, level = 0, broken = false;

    function place(cell, d) {
      val[cell] = d + 1; cand[cell] = 0; left--;
      var bt = ~(1 << d), p = PEERS[cell];
      for (var q = 0; q < 20; q++) {
        var pc = p[q];
        if (!val[pc]) { cand[pc] &= bt; if (!cand[pc]) broken = true; }
      }
    }
    function note(t) { used[t] = (used[t] || 0) + 1; if (TECH[t].level > level) level = TECH[t].level; }
    function elim(cell, mask) {
      if (!val[cell] && (cand[cell] & mask)) { cand[cell] &= ~mask; if (!cand[cell]) broken = true; return true; }
      return false;
    }

    function nakedSingle() {
      var any = false;
      for (var c = 0; c < 81; c++) if (!val[c] && POP[cand[c]] === 1) { place(c, LOW[cand[c]]); note('nakedSingle'); any = true; }
      return any;
    }
    function hiddenSingle() {
      for (var u = 0; u < 27; u++) {
        var unit = UNITS[u], once = 0, twice = 0, k, c;
        for (k = 0; k < 9; k++) { c = unit[k]; if (!val[c]) { twice |= once & cand[c]; once |= cand[c]; } }
        var only = once & ~twice;
        if (only) {
          var d = LOW[only];
          for (k = 0; k < 9; k++) { c = unit[k]; if (!val[c] && (cand[c] & (1 << d))) { place(c, d); note('hiddenSingle'); return true; } }
        }
      }
      return false;
    }
    function lockedCandidates() {
      var b, d, k, c, bit, any;
      // pointing: in a box, a digit confined to one row or column
      for (b = 0; b < 9; b++) {
        var box = UNITS[18 + b];
        for (d = 0; d < 9; d++) {
          bit = 1 << d; var rs = 0, cs = 0, cnt = 0;
          for (k = 0; k < 9; k++) { c = box[k]; if (!val[c] && (cand[c] & bit)) { rs |= 1 << ROW[c]; cs |= 1 << COL[c]; cnt++; } }
          if (cnt < 2) continue;
          any = false;
          if (POP[rs] === 1) { var r = LOW[rs]; for (k = 0; k < 9; k++) { c = r * 9 + k; if (BOX[c] !== b && elim(c, bit)) any = true; } }
          else if (POP[cs] === 1) { var col = LOW[cs]; for (k = 0; k < 9; k++) { c = k * 9 + col; if (BOX[c] !== b && elim(c, bit)) any = true; } }
          if (any) { note('pointing'); return true; }
        }
      }
      // claiming: in a row or column, a digit confined to one box
      for (var u = 0; u < 18; u++) {
        var unit = UNITS[u];
        for (d = 0; d < 9; d++) {
          bit = 1 << d; var bs = 0, n2 = 0;
          for (k = 0; k < 9; k++) { c = unit[k]; if (!val[c] && (cand[c] & bit)) { bs |= 1 << BOX[c]; n2++; } }
          if (n2 < 2 || POP[bs] !== 1) continue;
          var bx = UNITS[18 + LOW[bs]]; any = false;
          for (k = 0; k < 9; k++) { c = bx[k]; if ((u < 9 ? ROW[c] !== u : COL[c] !== u - 9) && elim(c, bit)) any = true; }
          if (any) { note('claiming'); return true; }
        }
      }
      return false;
    }
    function nakedSubset(size, tech) {
      for (var u = 0; u < 27; u++) {
        var unit = UNITS[u], cells = [];
        for (var k = 0; k < 9; k++) { var c = unit[k]; if (!val[c] && POP[cand[c]] >= 2 && POP[cand[c]] <= size) cells.push(c); }
        if (cells.length < size) continue;
        var hit = combos(cells, size, function (set) {
          var mask = 0; for (var q = 0; q < size; q++) mask |= cand[set[q]];
          if (POP[mask] !== size) return false;
          var any = false;
          for (var k2 = 0; k2 < 9; k2++) { var c2 = unit[k2]; if (set.indexOf(c2) < 0 && elim(c2, mask)) any = true; }
          return any;
        });
        if (hit) { note(tech); return true; }
      }
      return false;
    }
    function hiddenSubset(size, tech) {
      for (var u = 0; u < 27; u++) {
        var unit = UNITS[u], where = [], digits = [];
        for (var d = 0; d < 9; d++) {
          var pos = 0;
          for (var k = 0; k < 9; k++) { var c = unit[k]; if (!val[c] && (cand[c] & (1 << d))) pos |= 1 << k; }
          where[d] = pos;
          if (POP[pos] >= 2 && POP[pos] <= size) digits.push(d);
        }
        if (digits.length < size) continue;
        var hit = combos(digits, size, function (ds) {
          var pos = 0, dm = 0;
          for (var q = 0; q < size; q++) { pos |= where[ds[q]]; dm |= 1 << ds[q]; }
          if (POP[pos] !== size) return false;
          var any = false;
          for (var k2 = 0; k2 < 9; k2++) if (pos & (1 << k2)) { if (elim(unit[k2], 0x1FF & ~dm)) any = true; }
          return any;
        });
        if (hit) { note(tech); return true; }
      }
      return false;
    }
    function fish(size, tech) {
      for (var d = 0; d < 9; d++) {
        var bit = 1 << d;
        for (var orient = 0; orient < 2; orient++) {
          var lines = [], spots = [];
          for (var a = 0; a < 9; a++) {
            var m2 = 0;
            for (var b2 = 0; b2 < 9; b2++) {
              var c = orient ? b2 * 9 + a : a * 9 + b2;
              if (!val[c] && (cand[c] & bit)) m2 |= 1 << b2;
            }
            spots[a] = m2;
            if (POP[m2] >= 2 && POP[m2] <= size) lines.push(a);
          }
          if (lines.length < size) continue;
          var hit = combos(lines, size, function (set) {
            var cover = 0; for (var q = 0; q < size; q++) cover |= spots[set[q]];
            if (POP[cover] !== size) return false;
            var any = false;
            for (var a2 = 0; a2 < 9; a2++) {
              if (set.indexOf(a2) >= 0) continue;
              for (var b3 = 0; b3 < 9; b3++) if (cover & (1 << b3)) {
                var c3 = orient ? b3 * 9 + a2 : a2 * 9 + b3;
                if (elim(c3, bit)) any = true;
              }
            }
            return any;
          });
          if (hit) { note(tech); return true; }
        }
      }
      return false;
    }
    function xyWing() {
      for (var p = 0; p < 81; p++) {
        if (val[p] || POP[cand[p]] !== 2) continue;
        var pm = cand[p], peers = PEERS[p], wings = [];
        for (var q = 0; q < 20; q++) {
          var w = peers[q];
          if (!val[w] && POP[cand[w]] === 2 && POP[cand[w] & pm] === 1) wings.push(w);
        }
        for (var i1 = 0; i1 < wings.length; i1++) for (var i2 = i1 + 1; i2 < wings.length; i2++) {
          var a = wings[i1], b = wings[i2];
          var za = cand[a] & ~pm, zb = cand[b] & ~pm;
          if (za !== zb || (cand[a] & pm) === (cand[b] & pm)) continue;
          var any = false;
          for (var c = 0; c < 81; c++) if (c !== p && c !== a && c !== b && SEES[a][c] && SEES[b][c] && elim(c, za)) any = true;
          if (any) { note('xyWing'); return true; }
        }
      }
      return false;
    }
    function xyzWing() {
      for (var p = 0; p < 81; p++) {
        if (val[p] || POP[cand[p]] !== 3) continue;
        var pm = cand[p], peers = PEERS[p], wings = [];
        for (var q = 0; q < 20; q++) {
          var w = peers[q];
          if (!val[w] && POP[cand[w]] === 2 && (cand[w] & pm) === cand[w]) wings.push(w);
        }
        for (var i1 = 0; i1 < wings.length; i1++) for (var i2 = i1 + 1; i2 < wings.length; i2++) {
          var a = wings[i1], b = wings[i2];
          if (cand[a] === cand[b] || (cand[a] | cand[b]) !== pm) continue;
          var z = cand[a] & cand[b];
          var any = false;
          for (var c = 0; c < 81; c++) if (c !== p && c !== a && c !== b && SEES[p][c] && SEES[a][c] && SEES[b][c] && elim(c, z)) any = true;
          if (any) { note('xyzWing'); return true; }
        }
      }
      return false;
    }

    // Simple colouring on one digit: follow conjugate pairs (a digit with exactly two places in a unit).
    function colouring() {
      for (var d = 0; d < 9; d++) {
        var bit = 1 << d, adj = {}, has = false, u, k, c;
        for (u = 0; u < 27; u++) {
          var spots = [];
          for (k = 0; k < 9; k++) { c = UNITS[u][k]; if (!val[c] && (cand[c] & bit)) spots.push(c); }
          if (spots.length === 2) {
            (adj[spots[0]] = adj[spots[0]] || []).push(spots[1]);
            (adj[spots[1]] = adj[spots[1]] || []).push(spots[0]);
            has = true;
          }
        }
        if (!has) continue;
        var colour = {};
        for (var start in adj) {
          if (colour[start] !== undefined) continue;
          var comp = [[], []], stack = [+start];
          colour[start] = 0;
          while (stack.length) {
            var x = stack.pop(); comp[colour[x]].push(x);
            adj[x].forEach(function (y) { if (colour[y] === undefined) { colour[y] = 1 - colour[x]; stack.push(y); } });
          }
          if (comp[0].length + comp[1].length < 4) continue;
          // wrap: two cells of one colour see each other, so that colour is false
          for (var col = 0; col < 2; col++) {
            var bad = false;
            for (var i1 = 0; i1 < comp[col].length && !bad; i1++) for (var i2 = i1 + 1; i2 < comp[col].length; i2++) if (SEES[comp[col][i1]][comp[col][i2]]) { bad = true; break; }
            if (bad) {
              comp[col].forEach(function (cc) { elim(cc, bit); });
              note('colouring'); return true;
            }
          }
          // trap: an uncoloured cell that sees both colours
          var any = false;
          for (c = 0; c < 81; c++) {
            if (val[c] || !(cand[c] & bit) || colour[c] !== undefined && comp[0].concat(comp[1]).indexOf(c) >= 0) continue;
            var s0 = comp[0].some(function (z) { return SEES[c][z]; }), s1 = comp[1].some(function (z) { return SEES[c][z]; });
            if (s0 && s1 && elim(c, bit)) any = true;
          }
          if (any) { note('colouring'); return true; }
        }
      }
      return false;
    }
    // XY-Chain: a chain of two-candidate cells; if both ends could be z, any cell seeing both ends is not z.
    function xyChain() {
      var bivalue = [];
      for (var c = 0; c < 81; c++) if (!val[c] && POP[cand[c]] === 2) bivalue.push(c);
      if (bivalue.length < 4) return false;
      for (var si = 0; si < bivalue.length; si++) {
        var s = bivalue[si];
        var ds = bitsOf(cand[s]);
        for (var zi = 0; zi < 2; zi++) {
          var z = ds[zi], first = ds[1 - zi];
          // state: cell is forced to `on` (assuming s is not z); we look for a cell forced to z.
          var seen = {}, queue = [[s, first, 1]];
          seen[s + ':' + first] = true;
          while (queue.length) {
            var st = queue.shift(), cell = st[0], on = st[1], len = st[2];
            if (len > 12) continue;
            for (var bi = 0; bi < bivalue.length; bi++) {
              var nx = bivalue[bi];
              if (nx === cell || nx === s || !SEES[cell][nx] || !(cand[nx] & (1 << on))) continue;
              var other = LOW[cand[nx] & ~(1 << on)];
              if (other === z && len + 1 >= 3) {
                var any = false;
                for (var t = 0; t < 81; t++) if (t !== s && t !== nx && SEES[s][t] && SEES[nx][t] && elim(t, 1 << z)) any = true;
                if (any) { note('xyChain'); return true; }
              }
              var key = nx + ':' + other;
              if (!seen[key]) { seen[key] = true; queue.push([nx, other, len + 1]); }
            }
          }
        }
      }
      return false;
    }

    var steps = [
      [1, nakedSingle], [1, hiddenSingle],
      [2, lockedCandidates], [2, function () { return nakedSubset(2, 'nakedPair'); }], [2, function () { return hiddenSubset(2, 'hiddenPair'); }],
      [3, function () { return nakedSubset(3, 'nakedTriple'); }], [3, function () { return hiddenSubset(3, 'hiddenTriple'); }],
      [3, function () { return fish(2, 'xWing'); }], [3, xyWing],
      [4, function () { return fish(3, 'swordfish'); }], [4, xyzWing],
      [4, function () { return nakedSubset(4, 'nakedQuad'); }], [4, function () { return hiddenSubset(4, 'hiddenQuad'); }],
      [4, function () { return fish(4, 'jellyfish'); }], [4, colouring], [4, xyChain]
    ];
    while (left > 0 && !broken) {
      var progressed = false;
      for (var s = 0; s < steps.length; s++) {
        if (steps[s][0] > maxLevel) break;
        if (steps[s][1]()) { progressed = true; break; }
      }
      if (!progressed) break;
    }
    var solved = left === 0 && !broken;
    return { solved: solved, level: solved ? Math.max(level, 1) : 5, used: used, grid: Array.prototype.slice.call(val) };
  }

  // ---------- generator ----------
  var LEVELS = {
    easy: { n: 1, name: 'Easy', minClues: 36, maxClues: 40 },
    medium: { n: 2, name: 'Medium', minClues: 28, maxClues: 35 },
    hard: { n: 3, name: 'Hard', minClues: 24, maxClues: 31 },
    expert: { n: 4, name: 'Expert', minClues: 22, maxClues: 28 }
  };

  function clueCount(g) { var n = 0; for (var i = 0; i < 81; i++) if (g[i]) n++; return n; }

  // One attempt: dig holes in a random symmetric order, never letting the puzzle lose its
  // unique solution or become harder than the target level.
  function attempt(rand, spec) {
    var sol = fullGrid(rand);
    var puz = sol.slice();
    var pairs = [];
    for (var i = 0; i <= 40; i++) pairs.push(i);
    shuffle(pairs, rand);
    var floor = spec.minClues;
    if (spec.n === 1) floor = spec.minClues + Math.floor(rand() * (spec.maxClues - spec.minClues + 1));
    var clues = 81;
    for (var p = 0; p < pairs.length && clues > floor; p++) {
      var a = pairs[p], b = 80 - a;
      var drop = a === b ? 1 : 2;
      if (clues - drop < spec.minClues && spec.n !== 1) continue;
      var va = puz[a], vb = puz[b];
      puz[a] = 0; puz[b] = 0;
      if (countSolutions(puz, 2) !== 1) { puz[a] = va; puz[b] = vb; continue; }
      if (clues - drop <= spec.maxClues + 2) {
        var g = grade(puz, spec.n);
        if (!g.solved) { puz[a] = va; puz[b] = vb; continue; }
      }
      clues -= drop;
    }
    var fin = grade(puz, 4);
    return { puzzle: puz, solution: sol, clues: clues, grade: fin };
  }

  // Returns {puzzle, solution, level, clues, techniques, attempts}. Deterministic for a given seed.
  function generate(levelId, seed, maxAttempts) {
    var spec = LEVELS[levelId];
    if (!spec) throw new Error('Unknown difficulty ' + levelId);
    var rand = rng(seed);
    maxAttempts = maxAttempts || 400;
    var best = null;
    for (var n = 1; n <= maxAttempts; n++) {
      var r = attempt(rand, spec);
      var ok = r.grade.solved && r.grade.level === spec.n && r.clues >= spec.minClues && r.clues <= spec.maxClues;
      if (ok) return pack(r, spec, n);
      // keep the closest miss in case we run out of attempts
      if (r.grade.solved && r.grade.level <= spec.n && (!best || r.grade.level > best.grade.level)) best = r;
    }
    if (best) return pack(best, spec, maxAttempts, true);
    throw new Error('Could not generate a ' + spec.name + ' puzzle.');
  }
  function pack(r, spec, attempts, fallback) {
    var techniques = {};
    Object.keys(r.grade.used).forEach(function (t) { techniques[t] = r.grade.used[t]; });
    return {
      puzzle: r.puzzle.join(''), solution: r.solution.join(''), level: levelIdOf(r.grade.level), target: levelIdOf(spec.n),
      clues: r.clues, techniques: techniques, attempts: attempts, fallback: !!fallback
    };
  }
  function levelIdOf(n) { return ['easy', 'easy', 'medium', 'hard', 'expert', 'expert'][n]; }

  function parse(str) { var g = []; for (var i = 0; i < 81; i++) g.push(+str[i] || 0); return g; }

  var api = {
    rng: rng, hashSeed: hashSeed, shuffle: shuffle,
    countSolutions: countSolutions, solve: solve, fullGrid: fullGrid, grade: grade, generate: generate,
    clueCount: clueCount, parse: parse, LEVELS: LEVELS, TECH: TECH, UNITS: UNITS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sudoku = api;
})(typeof self !== 'undefined' ? self : this);
