/* Word search maker: edit puzzles, preview with solutions, export printable or KDP book PDFs. */
(function () {
  var BL = window.BL, $ = BL.$, WS = window.WordSearch, THEMES = window.WS_THEMES, Book = window.BLBook;
  var FREE_MAX = 5, PRO_MAX = 300, MIN_SIZE = 8, MAX_SIZE = 25;
  var STORE = 'wsm:puzzles';
  var form = $('#ws-form');

  // ---------- puzzles ----------
  function themePuzzle(t) { return { title: t.title, words: t.words.join('\n') }; }
  var puzzles = BL.store.get(STORE, null);
  if (!Array.isArray(puzzles) || !puzzles.length) puzzles = [THEMES[0], THEMES[4], THEMES[3]].map(themePuzzle);
  puzzles = puzzles.filter(function (p) { return p && typeof p.words === 'string'; }).slice(0, PRO_MAX);
  if (!puzzles.length) puzzles = [{ title: 'My puzzle', words: '' }];
  var cur = Math.min(Math.max(0, BL.store.get('wsm:cur', 0) | 0), puzzles.length - 1);
  function save() { BL.store.set(STORE, puzzles); BL.store.set('wsm:cur', cur); }

  // ---------- fill selects ----------
  (function () {
    var sz = $('#ws-size'), html = '';
    for (var s = MIN_SIZE; s <= MAX_SIZE; s++) html += '<option value="' + s + '"' + (s === 15 ? ' selected' : '') + '>' + s + ' × ' + s + '</option>';
    sz.innerHTML = html;
    $('#ws-trim').innerHTML = BL.kdp.trims.filter(function (t) { return t.id !== '8.25x11'; }).map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === '8.5x11' ? ' selected' : '') + '>' + BL.esc(t.label) + '</option>';
    }).join('');
    $('#ws-theme').innerHTML = THEMES.map(function (t, i) { return '<option value="' + i + '">' + BL.esc(t.title) + ' (' + t.words.length + ' words)</option>'; }).join('');
    $('#ws-theme-n').textContent = THEMES.length;
  })();
  BL.persist(form, 'word-search');

  // ---------- settings ----------
  function settings() {
    var dirsOn = { horizontal: form.horizontal.checked, vertical: form.vertical.checked, diagonal: form.diagonal.checked, backwards: form.backwards.checked };
    if (!dirsOn.horizontal && !dirsOn.vertical && !dirsOn.diagonal) dirsOn.horizontal = true;
    var size = parseInt($('#ws-size').value, 10);
    if (!(size >= MIN_SIZE && size <= MAX_SIZE)) size = 15;
    return {
      size: size, dirsOn: dirsOn, dirs: WS.dirSet(dirsOn), lower: BL.radio('case') === 'lower', filler: BL.radio('filler') || 'all',
      seed: ($('#ws-seed').value || '').trim() || '1', large: $('#ws-large').checked
    };
  }
  function bookSpec() {
    return { mode: BL.radio('mode') || 'print', paper: BL.radio('paper') || 'letter', trimId: $('#ws-trim').value, bleed: BL.radio('mode') === 'kdp' && $('#ws-bleed').checked };
  }
  function caseOf(s, st) { return st.lower ? s.toLowerCase() : s.toUpperCase(); }

  // ---------- generation with a small cache ----------
  var cache = {}, cacheKeys = [];
  function gen(p, st) {
    var parsed = WS.parseList(p.words);
    var key = [st.size, st.dirs.join(''), st.filler, st.seed, parsed.words.map(function (w) { return w.letters + '=' + w.display; }).join(',')].join('|');
    if (!cache[key]) {
      cache[key] = parsed.words.length ? WS.generate({ words: parsed.words, size: st.size, dirs: st.dirs, seed: st.seed, filler: st.filler }) : null;
      cacheKeys.push(key);
      if (cacheKeys.length > 700) delete cache[cacheKeys.shift()];
    }
    return { parsed: parsed, res: cache[key] };
  }

  // ---------- page layout (shared by preview stats and the PDF) ----------
  // measure(text, size) returns a width in points.
  function layoutPuzzle(fr, words, st, measure) {
    var titleSize = st.large ? 24 : 20, headerH = 12 + 6 + titleSize + 14;
    var listSize = st.large ? 15 : 11, lineH = listSize * 1.55, box = listSize * 0.72, gapX = 18;
    var maxW = words.reduce(function (m, w) { return Math.max(m, measure(w, listSize)); }, 0) + box + 6;
    var cols = Math.max(1, Math.min(st.large ? 3 : 4, words.length || 1, Math.floor((fr.w + gapX) / (maxW + gapX))));
    var colW = Math.min((fr.w + gapX) / cols, maxW + gapX + 30);
    var rows = Math.ceil(words.length / cols);
    var listH = rows * lineH;
    var gap = 20;
    var avail = fr.h - headerH - listH - gap;
    var cell = Math.min(fr.w / st.size, avail / st.size, 40);
    // If the list is very long, shrink it before the grid gets too small.
    if (cell < 14 && rows > 6) {
      listSize = Math.max(8, listSize * 0.8); lineH = listSize * 1.45; box = listSize * 0.72;
      listH = rows * lineH; avail = fr.h - headerH - listH - gap;
      cell = Math.min(fr.w / st.size, avail / st.size, 40);
    }
    return {
      titleSize: titleSize, headerH: headerH, listSize: listSize, lineH: lineH, box: box, cols: cols, colW: colW, rows: rows, listH: listH,
      cell: cell, letterSize: cell * (st.large ? 0.66 : 0.58), gap: gap
    };
  }
  function approxMeasure(s, size) { return s.length * size * 0.56; }

  // Rounded capsule around a word, as an SVG path. a, b: centres of the first and last letter.
  function capsule(ax, ay, bx, by, r) {
    var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
    var ux = len ? dx / len : 1, uy = len ? dy / len : 0, nx = -uy, ny = ux, k = 0.5523 * r;
    function p(x, y) { return x.toFixed(2) + ' ' + y.toFixed(2); }
    return 'M' + p(ax + nx * r, ay + ny * r) +
      'L' + p(bx + nx * r, by + ny * r) +
      'C' + p(bx + nx * r + ux * k, by + ny * r + uy * k) + ' ' + p(bx + ux * r + nx * k, by + uy * r + ny * k) + ' ' + p(bx + ux * r, by + uy * r) +
      'C' + p(bx + ux * r - nx * k, by + uy * r - ny * k) + ' ' + p(bx - nx * r + ux * k, by - ny * r + uy * k) + ' ' + p(bx - nx * r, by - ny * r) +
      'L' + p(ax - nx * r, ay - ny * r) +
      'C' + p(ax - nx * r - ux * k, ay - ny * r - uy * k) + ' ' + p(ax - ux * r - nx * k, ay - uy * r - ny * k) + ' ' + p(ax - ux * r, ay - uy * r) +
      'C' + p(ax - ux * r + nx * k, ay - uy * r + ny * k) + ' ' + p(ax + nx * r - ux * k, ay + ny * r - uy * k) + ' ' + p(ax + nx * r, ay + ny * r) + 'Z';
  }
  function capsulesPath(res, gx, gyTop, cell) {
    // y-down coordinates; gyTop is the top edge of the grid
    var n = res.size;
    return res.placed.map(function (p) {
      var a = p.cells[0], b = p.cells[p.cells.length - 1];
      return capsule(gx + (a % n + 0.5) * cell, gyTop + (Math.floor(a / n) + 0.5) * cell, gx + (b % n + 0.5) * cell, gyTop + (Math.floor(b / n) + 0.5) * cell, cell * 0.42);
    }).join('');
  }
  function listWords(res, st) {
    return res.placed.map(function (p) { return caseOf(p.display, st); }).sort(function (a, b) { return a.localeCompare(b); });
  }

  // ---------- preview ----------
  function previewSvg(p, res, st, showSol) {
    var n = res.size, W = 600, pad = 24, cell = (W - 2 * pad) / n;
    var words = listWords(res, st);
    var fs = st.large ? 19 : 15, lineH = fs * 1.6;
    var cols = Math.max(1, Math.min(st.large ? 3 : 4, Math.floor((W - 2 * pad + 16) / (words.reduce(function (m, w) { return Math.max(m, w.length * fs * 0.6); }, 0) + 40))));
    var rows = Math.ceil(words.length / cols), colW = (W - 2 * pad) / cols;
    var titleH = 54, gridTop = titleH, gridH = n * cell, H = gridTop + gridH + 24 + rows * lineH + pad;
    var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H.toFixed(1) + '" role="img" aria-label="Word search: ' + BL.esc(p.title || 'Untitled') + '" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">';
    out += '<rect width="100%" height="100%" fill="#fff"/>';
    out += '<text x="' + W / 2 + '" y="36" text-anchor="middle" font-size="24" font-weight="700" fill="#111">' + BL.esc(p.title || 'Untitled') + '</text>';
    out += '<rect x="' + (pad - 4) + '" y="' + (gridTop - 4) + '" width="' + (gridH + 8) + '" height="' + (gridH + 8) + '" fill="none" stroke="#111" stroke-width="1.5" rx="2"/>';
    var used = {};
    if (showSol) {
      res.placed.forEach(function (pl) { pl.cells.forEach(function (c) { used[c] = 1; }); });
      out += '<path d="' + capsulesPath(res, pad, gridTop, cell) + '" fill="rgba(15,118,110,.13)" stroke="#0f766e" stroke-width="' + Math.max(1, cell * 0.06).toFixed(2) + '"/>';
    }
    var lf = cell * (st.large ? 0.66 : 0.58), dy = (st.lower ? 0.25 : 0.35) * lf;
    out += '<g font-size="' + lf.toFixed(1) + '" text-anchor="middle" font-weight="' + (st.large ? 700 : 400) + '">';
    for (var i = 0; i < n * n; i++) {
      var ch = caseOf(res.grid[i], st), x = pad + (i % n + 0.5) * cell, y = gridTop + (Math.floor(i / n) + 0.5) * cell + dy;
      var dim = showSol && !used[i];
      out += '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" fill="' + (dim ? '#9a9a9a' : '#111') + '">' + ch + '</text>';
    }
    out += '</g><g font-size="' + fs + '" fill="#222">';
    var ly = gridTop + gridH + 24;
    words.forEach(function (w, k) {
      var c = Math.floor(k / rows), r = k % rows;
      out += '<rect x="' + (pad + c * colW) + '" y="' + (ly + r * lineH + lineH / 2 - fs * 0.62).toFixed(1) + '" width="' + (fs * 0.72).toFixed(1) + '" height="' + (fs * 0.72).toFixed(1) + '" fill="none" stroke="#999"/>';
      out += '<text x="' + (pad + c * colW + fs * 1.1).toFixed(1) + '" y="' + (ly + r * lineH + lineH / 2).toFixed(1) + '">' + BL.esc(w) + '</text>';
    });
    return out + '</g></svg>';
  }

  var renderTimer = null, fitCache = {};
  function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 150); }

  function render() {
    var st = settings(), p = puzzles[cur], msg = $('#ws-msg'), box = $('#ws-preview'), stats = $('#ws-stats');
    $('#ws-pos').textContent = 'Puzzle ' + (cur + 1) + ' of ' + puzzles.length;
    $('#ws-prev').disabled = cur === 0; $('#ws-next').disabled = cur >= puzzles.length - 1;
    var g;
    try { g = gen(p, st); } catch (e) { BL.fail(e, msg); return; }
    var notes = [];
    if (!form.horizontal.checked && !form.vertical.checked && !form.diagonal.checked) notes.push('<div class="note warn">Pick at least one direction. Using across for now.</div>');
    g.parsed.skipped.forEach(function (s) { notes.push('<div class="note warn">Skipped "' + BL.esc(s.word) + '": it ' + BL.esc(s.why) + '.</div>'); });
    if (!g.res) {
      box.innerHTML = '<p class="muted">Add some words to see the puzzle.</p>';
      stats.innerHTML = '';
      msg.innerHTML = notes.join('');
      updateExportInfo();
      return;
    }
    var res = g.res;
    box.innerHTML = previewSvg(p, res, st, $('#ws-show').checked);
    if (res.unplaced.length) {
      var fitKey = st.dirs.join('') + '|' + st.size + '|' + g.parsed.words.map(function (w) { return w.letters; }).join(',');
      var fit = fitCache[fitKey] !== undefined ? fitCache[fitKey] : (fitCache[fitKey] = WS.fitSize(g.parsed.words, st.dirs, st.seed, st.size + 1, 30));
      notes.push('<div class="note err">' + res.unplaced.length + ' word' + (res.unplaced.length > 1 ? 's' : '') + ' didn\'t fit: ' + res.unplaced.map(BL.esc).join(', ') + '. ' +
        (fit && fit <= MAX_SIZE ? 'All of them fit in a ' + fit + ' × ' + fit + ' grid.' : fit ? 'They need a ' + fit + ' × ' + fit + ' grid, which is bigger than this tool makes, so split the list into two puzzles.' : 'Try a bigger grid, more directions, or split the list.') +
        ' Words that don\'t fit are left out of the printed list.</div>');
    }
    res.expectedDuplicates.forEach(function (d) {
      notes.push('<div class="note warn">' + BL.esc(d.word) + ' is hidden inside ' + BL.esc(d.inside) + ', so solvers will find it twice. Consider removing one of them.</div>');
    });
    if (res.duplicates.length) notes.push('<div class="note warn">Can\'t avoid a second copy of ' + res.duplicates.map(BL.esc).join(', ') + ' with these settings. Change the seed to try another layout.</div>');
    var letters = g.parsed.words.reduce(function (a, w) { return a + w.letters.length; }, 0);
    if (letters > st.size * st.size * 0.85) notes.push('<div class="note">This list fills most of the grid, so there is little filler and the puzzle will be easy. A bigger grid makes it harder.</div>');
    msg.innerHTML = notes.join('');

    var fr = Book.frame(bookSpec(), 30, 3);
    var inner = { x: fr.x, y: fr.y, w: fr.w, h: fr.h - ($('#ws-form').numbers.checked ? Book.NUMBER_BAND : 0) };
    var lay = layoutPuzzle(inner, listWords(res, st), st, approxMeasure);
    var dirsTxt = st.dirs.length + ' direction' + (st.dirs.length > 1 ? 's' : '');
    stats.innerHTML =
      stat('Words placed', res.placed.length + ' of ' + (res.placed.length + res.unplaced.length), res.unplaced.length ? 'some didn\'t fit' : 'all found exactly once', !res.unplaced.length) +
      stat('Grid', st.size + ' × ' + st.size, dirsTxt) +
      stat('Printed letters', '≈' + BL.fmt(lay.letterSize, 1) + ' pt', lay.letterSize < 9 ? 'small: use a bigger page or grid size' : 'on this page size', false, lay.letterSize < 9);
    updateExportInfo();
  }
  function stat(k, v, s, hi, warn) {
    return '<div class="stat' + (hi ? ' hi' : '') + '"><div class="k">' + k + '</div><div class="v" style="font-size:1.05rem">' + BL.esc(v) + '</div>' +
      (s ? '<div class="s"' + (warn ? ' style="color:var(--warn)"' : '') + '>' + BL.esc(s) + '</div>' : '') + '</div>';
  }

  // ---------- editor ----------
  function wordCount(p) { return WS.parseList(p.words).words.length; }
  function refreshPick() {
    $('#ws-pick').innerHTML = puzzles.map(function (p, i) {
      return '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + (i + 1) + '. ' + BL.esc(p.title || 'Untitled') + ' (' + wordCount(p) + ')</option>';
    }).join('');
    var n = puzzles.length;
    $('#ws-count').textContent = n + ' puzzle' + (n > 1 ? 's' : '') + ' in this book' + (n >= PRO_MAX ? ' (the maximum)' : '') + '. Saved in this browser.';
    $('#ws-del').disabled = false;
  }
  function loadEditor() {
    $('#ws-title').value = puzzles[cur].title || '';
    $('#ws-words').value = puzzles[cur].words || '';
  }
  function select(i) {
    cur = Math.max(0, Math.min(puzzles.length - 1, i));
    save(); refreshPick(); loadEditor(); render();
  }
  function addPuzzles(list, replace) {
    if (replace) puzzles = [];
    var room = PRO_MAX - puzzles.length;
    var added = list.slice(0, Math.max(0, room));
    if (!added.length) { BL.toast('A book can hold up to ' + PRO_MAX + ' puzzles.'); return 0; }
    // Replace a lone empty puzzle instead of keeping it.
    if (puzzles.length === 1 && !puzzles[0].words.trim()) puzzles = [];
    var first = puzzles.length;
    puzzles = puzzles.concat(added);
    select(first);
    if (added.length < list.length) BL.toast('Added ' + added.length + '. A book can hold up to ' + PRO_MAX + ' puzzles.');
    return added.length;
  }

  $('#ws-pick').addEventListener('change', function () { select(+this.value); });
  $('#ws-prev').addEventListener('click', function () { select(cur - 1); });
  $('#ws-next').addEventListener('click', function () { select(cur + 1); });
  $('#ws-add').addEventListener('click', function () {
    if (addPuzzles([{ title: 'Puzzle ' + (puzzles.length + 1), words: '' }])) $('#ws-words').focus();
  });
  $('#ws-del').addEventListener('click', function () {
    if (puzzles.length === 1) { puzzles[0] = { title: 'My puzzle', words: '' }; select(0); return; }
    puzzles.splice(cur, 1);
    select(Math.min(cur, puzzles.length - 1));
  });
  $('#ws-title').addEventListener('input', function () { puzzles[cur].title = this.value; save(); refreshPickSoon(); scheduleRender(); });
  $('#ws-words').addEventListener('input', function () { puzzles[cur].words = this.value; save(); refreshPickSoon(); scheduleRender(); });
  var pickTimer = null;
  function refreshPickSoon() { clearTimeout(pickTimer); pickTimer = setTimeout(refreshPick, 300); }
  $('#ws-theme-add').addEventListener('click', function () { addPuzzles([themePuzzle(THEMES[+$('#ws-theme').value])]); });
  $('#ws-theme-all').addEventListener('click', function () {
    var n = addPuzzles(THEMES.map(themePuzzle));
    if (n) BL.toast('Added ' + n + ' themed puzzles.');
  });
  function bulk(replace) {
    var list = WS.parseBulk($('#ws-bulk').value), out = $('#ws-bulk-msg');
    if (!list.length) { out.innerHTML = '<div class="note err">Nothing to add. Put the title on the first line of each block and the words below it, with a blank line between puzzles.</div>'; return; }
    if (replace && puzzles.some(function (p) { return p.words.trim(); }) && !window.confirm('Replace all ' + puzzles.length + ' puzzles with these ' + list.length + '?')) return;
    var n = addPuzzles(list, replace);
    out.innerHTML = n ? '<div class="note ok">' + (replace ? 'Replaced with ' : 'Added ') + n + ' puzzle' + (n > 1 ? 's' : '') + '.</div>' : '';
  }
  $('#ws-bulk-add').addEventListener('click', function () { bulk(false); });
  $('#ws-bulk-replace').addEventListener('click', function () { bulk(true); });
  $('#ws-reseed').addEventListener('click', function () {
    $('#ws-seed').value = String(Math.floor(Math.random() * 1e6));
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });
  $('#ws-show').addEventListener('change', render);

  // ---------- export ----------
  function bookPuzzles() {
    return puzzles.filter(function (p) { return wordCount(p) > 0; });
  }
  function syncRows() {
    var kdp = BL.radio('mode') === 'kdp';
    $('#ws-kdp-rows').hidden = !kdp;
    $('#ws-paper-row').hidden = kdp;
    $('#ws-title-rows').hidden = !$('#ws-titlepage').checked;
    $('#ws-density-row').hidden = !$('#ws-answers').checked;
  }
  function countPages(n) {
    var o = form, pages = 0;
    if (o.titlePage.checked) pages++;
    if (o.howto.checked) pages++;
    pages += n;
    if (o.answers.checked) pages += Math.ceil(n / (+$('#ws-density').value || 1));
    return pages;
  }
  function updateExportInfo() {
    var n = bookPuzzles().length, pro = BL.pro.active();
    var free = !pro && n > FREE_MAX;
    $('#ws-pdf').textContent = 'Download PDF' + (n ? ' (' + n + ' puzzle' + (n > 1 ? 's' : '') + ')' : '');
    $('#ws-pdf-free').hidden = !free;
    var spec = bookSpec(), d = Book.describe(spec, countPages(Math.min(n, pro ? PRO_MAX : FREE_MAX)));
    var info = [];
    if (spec.mode === 'kdp') {
      info.push(d.total + ' pages at ' + BL.fmt(d.pageIn.w, 3) + ' × ' + BL.fmt(d.pageIn.h, 3) + ' in' + (spec.bleed ? ' (with bleed)' : '') + (d.pad ? ', including ' + d.pad + ' blank page' + (d.pad > 1 ? 's' : '') + ' at the end to reach ' + (d.total <= 24 ? 'KDP\'s 24-page minimum' : 'an even page count') : '') + '.');
      info.push('Gutter ' + BL.fmt(d.inside, 3) + ' in, other margins ' + BL.fmt(d.outside, 3) + ' in.');
    } else info.push(d.total + ' page' + (d.total > 1 ? 's' : '') + ' on ' + Book.PAPER[spec.paper].label + '.');
    if (free) info.push('Free PDFs hold 5 puzzles, so the free download uses puzzles 1–5.');
    if (n > PRO_MAX) info.push('Only the first ' + PRO_MAX + ' puzzles fit in one PDF.');
    var em = $('#ws-export-msg');
    if (!em.dataset.busy) em.innerHTML = '<p class="small muted">' + BL.esc(info.join(' ')) + '</p>';
  }

  function howToText(st) {
    var o = st.dirsOn, parts = [];
    if (o.horizontal) parts.push('across');
    if (o.vertical) parts.push('down');
    if (o.diagonal) parts.push('diagonally');
    var dirs = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
    return [
      'Every word in the list under a grid is hidden in that grid. Words run in straight lines ' + dirs + (o.backwards ? ', and they can read backwards too.' : ', always reading forwards.'),
      'When you find a word, circle it in the grid and tick it off the list. Letters can be shared by two words that cross.',
      'Words with spaces or hyphens in the list are hidden without them, so "ice cream" appears in the grid as ' + (st.lower ? 'icecream' : 'ICECREAM') + '.',
      form.answers.checked ? 'Stuck? The solutions are at the back of the book, with every word circled.' : ''
    ].filter(Boolean);
  }

  function drawPuzzle(ctx, item, st) {
    var f = ctx.frame, fonts = ctx.fonts, res = item.res, n = res.size;
    var words = listWords(res, st);
    var lay = layoutPuzzle(f, words, st, function (s, size) { return fonts.regular.widthOfTextAtSize(s, size); });
    var top = f.y + f.h, cx = f.x + f.w / 2;
    ctx.text('PUZZLE ' + item.num, { x: cx, y: top - 10, size: 9, font: fonts.bold, align: 'center', color: ctx.gray(0.6) });
    ctx.text(item.title || 'Word search', { x: cx, y: top - 18 - lay.titleSize * 0.85, size: lay.titleSize, font: fonts.bold, align: 'center', maxW: f.w });
    var cell = lay.cell, gw = cell * n, gx = f.x + (f.w - gw) / 2, gTop = top - lay.headerH;
    var pad = cell * 0.18;
    ctx.rect(gx - pad, gTop - gw - pad, gw + 2 * pad, gw + 2 * pad, { stroke: ctx.black, width: 1.1 });
    var ls = lay.letterSize, off = (st.lower ? 0.496 : 0.668) * ls / 2, items = [];
    for (var i = 0; i < n * n; i++) items.push({ x: gx + (i % n + 0.5) * cell, y: gTop - (Math.floor(i / n) + 0.5) * cell - off, s: caseOf(res.grid[i], st) });
    ctx.chars(items, st.large ? fonts.bold : fonts.regular, ls);
    // word list, column by column, centred under the grid
    var listW = lay.cols * lay.colW - 18, lx = f.x + Math.max(0, (f.w - listW) / 2), ly = gTop - gw - pad - lay.gap;
    var maxText = lay.colW - 18 - lay.box - 6;
    words.forEach(function (w, k) {
      var c = Math.floor(k / lay.rows), r = k % lay.rows;
      var x = lx + c * lay.colW, base = ly - (r + 1) * lay.lineH + (lay.lineH - lay.listSize) / 2 + lay.listSize * 0.15;
      ctx.rect(x, base - lay.listSize * 0.05, lay.box, lay.box, { stroke: ctx.gray(0.55), width: 0.6 });
      ctx.text(w, { x: x + lay.box + 6, y: base, size: lay.listSize, maxW: maxText, minSize: 6 });
    });
  }

  function drawSolutions(ctx, chunk, first, density, st) {
    var f = ctx.frame, fonts = ctx.fonts, skip = 0;
    if (first) { ctx.text('Solutions', { x: f.x, y: f.y + f.h - 20, size: 20, font: fonts.bold }); skip = 38; }
    var shape = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3] }[density] || [1, 2];
    var slots = Book.slots(f, shape[0], shape[1], 18, 16, skip);
    var labelSize = density <= 2 ? 12 : 9.5;
    chunk.forEach(function (item, k) {
      var s = slots[k], res = item.res, n = res.size;
      var label = item.num + '. ' + (item.title || 'Word search');
      var side = Math.min(s.w, s.h - labelSize * 1.6 - 4), cell = side / n;
      var sTop = s.y + s.h - (s.h - labelSize * 1.6 - 4 - side) / 2;   // centre label + grid in the slot
      ctx.text(Book.clip(fonts.bold, label, labelSize, s.w), { x: s.x + s.w / 2, y: sTop - labelSize, size: labelSize, font: fonts.bold, align: 'center' });
      var gx = s.x + (s.w - side) / 2, gTop = sTop - labelSize * 1.6 - 4;
      var pageH = f.pageH;
      // capsules in y-down page coordinates
      ctx.path(capsulesPath(res, gx, pageH - gTop, cell), { fill: ctx.gray(0.1), stroke: ctx.black, width: Math.max(0.45, cell * 0.055) });
      var used = {};
      res.placed.forEach(function (p) { p.cells.forEach(function (c) { used[c] = 1; }); });
      var ls = cell * 0.58, off = (st.lower ? 0.496 : 0.668) * ls / 2, on = [], offItems = [];
      for (var i = 0; i < n * n; i++) {
        var it = { x: gx + (i % n + 0.5) * cell, y: gTop - (Math.floor(i / n) + 0.5) * cell - off, s: caseOf(res.grid[i], st) };
        (used[i] ? on : offItems).push(it);
      }
      ctx.chars(offItems, fonts.regular, ls, ctx.gray(0.4));
      ctx.chars(on, fonts.bold, ls, ctx.black);
      ctx.rect(gx - cell * 0.12, gTop - side - cell * 0.12, side + cell * 0.24, side + cell * 0.24, { stroke: ctx.black, width: 0.7 });
    });
  }

  var busy = false;
  function setProgress(frac, text) {
    var wrap = $('#ws-progress');
    wrap.hidden = frac === null;
    if (frac === null) return;
    wrap.querySelector('.progress > div').style.width = Math.round(frac * 100) + '%';
    wrap.querySelector('.progress').setAttribute('aria-valuenow', Math.round(frac * 100));
    $('#ws-progress-text').textContent = text;
  }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  function exportPdf(freeOnly) {
    if (busy) return;
    var list = bookPuzzles(), pro = BL.pro.active(), em = $('#ws-export-msg');
    if (!list.length) { BL.fail(new Error('Add at least one puzzle with words first.'), em); return; }
    var density = +$('#ws-density').value || 2;
    if (form.answers.checked && density > 2 && !freeOnly && !BL.pro.gate(true, 'Compact answer keys with 4 or 6 solutions per page are part of Pro. Free PDFs can use 1 or 2 per page.')) return;
    if (freeOnly && density > 2 && !pro) density = 2;
    if (list.length > FREE_MAX && !freeOnly && !BL.pro.gate(true, 'Free PDFs hold up to 5 puzzles. Pro makes word search books of up to 300 puzzles in one PDF.')) return;
    if (freeOnly || !pro) list = list.slice(0, FREE_MAX);
    if (list.length > PRO_MAX) list = list.slice(0, PRO_MAX);
    var st = settings(), spec = bookSpec(), t0 = performance.now();
    busy = true; em.dataset.busy = '1'; em.innerHTML = '';
    $('#ws-pdf').disabled = true; $('#ws-pdf-free').disabled = true;
    var items = [], skippedWords = 0, i = 0;
    setProgress(0, 'Making puzzles…');
    function genChunk() {
      var until = Math.min(list.length, i + 8);
      for (; i < until; i++) {
        var g = gen(list[i], st);
        skippedWords += g.res.unplaced.length;
        items.push({ num: i + 1, title: list[i].title, res: g.res });
      }
      setProgress(0.3 * i / list.length, 'Making puzzles… ' + i + ' of ' + list.length);
      if (i < list.length) return tick().then(genChunk);
      return null;
    }
    tick().then(genChunk).then(function () {
      var pages = [];
      if (form.titlePage.checked) pages.push({ type: 'title', title: $('#ws-btitle').value.trim() || 'Word Search Puzzles', subtitle: $('#ws-bsub').value.trim() });
      if (form.howto.checked) pages.push({ type: 'text', heading: 'How to play', body: howToText(st), size: st.large ? 15 : 12 });
      items.forEach(function (it) { pages.push({ type: 'content', draw: function (ctx) { drawPuzzle(ctx, it, st); } }); });
      if (form.answers.checked) {
        for (var k = 0; k < items.length; k += density) {
          (function (chunk, first) { pages.push({ type: 'content', draw: function (ctx) { drawSolutions(ctx, chunk, first, density, st); } }); })(items.slice(k, k + density), k === 0);
        }
      }
      return Book.build({
        spec: spec, pages: pages, pageNumbers: form.numbers.checked,
        meta: { title: $('#ws-btitle').value.trim() || 'Word Search Puzzles', subject: items.length + ' word search puzzles', creator: 'Bleedline word search maker' },
        onProgress: function (done, total) { setProgress(0.3 + 0.65 * done / total, 'Laying out pages… ' + done + ' of ' + total); }
      });
    }).then(function (out) {
      setProgress(1, 'Done');
      var name = 'word-search-' + (spec.mode === 'kdp' ? spec.trimId + (spec.bleed ? '-bleed' : '') : spec.paper) + '-' + items.length + '-puzzles.pdf';
      BL.download(new Blob([out.bytes], { type: 'application/pdf' }), name);
      BL.track('word-search-pdf', spec.mode);
      var secs = (performance.now() - t0) / 1000;
      em.innerHTML = '<div class="note ok">Saved ' + BL.esc(name) + ': ' + out.pages + ' pages, ' + items.length + ' puzzle' + (items.length > 1 ? 's' : '') + (out.padded ? ', ' + out.padded + ' blank page' + (out.padded > 1 ? 's' : '') + ' added at the end' : '') + ' (' + BL.fmt(secs, 1) + ' s).</div>' +
        (skippedWords ? '<div class="note warn">' + skippedWords + ' word' + (skippedWords > 1 ? 's' : '') + ' didn\'t fit in ' + (skippedWords > 1 ? 'their grids and were' : 'its grid and was') + ' left out of the printed lists. Check the puzzles marked in the preview.</div>' : '');
    }).catch(function (e) { BL.fail(e, em); }).then(function () {
      busy = false; delete em.dataset.busy;
      $('#ws-pdf').disabled = false; $('#ws-pdf-free').disabled = false;
      setTimeout(function () { if (!busy) setProgress(null); }, 1500);
    });
  }
  $('#ws-pdf').addEventListener('click', function () { exportPdf(false); });
  $('#ws-pdf-free').addEventListener('click', function () { exportPdf(true); });

  // ---------- wiring ----------
  form.addEventListener('change', function (e) { if (e.target.closest('[data-nopersist]')) return; syncRows(); scheduleRender(); });
  form.addEventListener('input', function (e) { if (e.target.id === 'ws-seed') scheduleRender(); });
  BL.pro.onChange(function () { updateExportInfo(); });
  syncRows(); refreshPick(); loadEditor(); render();

  // Test hook for automated checks (no effect on the page).
  window.__wsm = { settings: settings, gen: gen, puzzles: function () { return puzzles; } };
})();
