/* Sudoku book maker: generate graded puzzles in Web Workers, preview, export printable or KDP book PDFs. */
(function () {
  var BL = window.BL, $ = BL.$, Book = window.BLBook, S = window.Sudoku;
  var FREE_MAX = 6, PRO_MAX = 500, AUTO_MAX = 24;
  var LEVELS = ['easy', 'medium', 'hard', 'expert'];
  var NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
  var form = $('#sd-form');
  var scriptSrc = (document.currentScript && document.currentScript.src) || '';
  var version = (scriptSrc.match(/\?v=[^&#]*/) || [''])[0];

  $('#sd-trim').innerHTML = BL.kdp.trims.filter(function (t) { return t.id !== '8.25x11'; }).map(function (t) {
    return '<option value="' + t.id + '"' + (t.id === '8.5x11' ? ' selected' : '') + '>' + BL.esc(t.label) + '</option>';
  }).join('');
  BL.persist(form, 'sudoku-book');

  // ---------- sections (Pro) ----------
  var sections = BL.store.get('sdk:sections', null);
  if (!Array.isArray(sections) || !sections.length) sections = [{ level: 'easy', count: 50 }, { level: 'medium', count: 50 }, { level: 'hard', count: 50 }];
  function saveSections() { BL.store.set('sdk:sections', sections); }
  function renderSections() {
    $('#sd-sections').innerHTML = sections.map(function (s, i) {
      return '<div class="sd-srow"><select data-i="' + i + '" data-k="level" aria-label="Section ' + (i + 1) + ' difficulty">' +
        LEVELS.map(function (l) { return '<option value="' + l + '"' + (l === s.level ? ' selected' : '') + '>' + NAMES[l] + '</option>'; }).join('') +
        '</select><input type="number" min="1" max="500" value="' + s.count + '" data-i="' + i + '" data-k="count" aria-label="Section ' + (i + 1) + ' puzzles" inputmode="numeric">' +
        '<button class="btn ghost" type="button" data-del="' + i + '" aria-label="Remove section ' + (i + 1) + '"' + (sections.length < 2 ? ' disabled' : '') + '>×</button></div>';
    }).join('');
  }
  $('#sd-sections').addEventListener('input', function (e) {
    var t = e.target, i = +t.getAttribute('data-i');
    if (isNaN(i)) return;
    if (t.getAttribute('data-k') === 'count') sections[i].count = Math.max(1, Math.min(PRO_MAX, parseInt(t.value, 10) || 1));
    else sections[i].level = t.value;
    saveSections(); changed();
  });
  $('#sd-sections').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]');
    if (!b) return;
    sections.splice(+b.getAttribute('data-del'), 1);
    saveSections(); renderSections(); changed();
  });
  $('#sd-sec-add').addEventListener('click', function () {
    var last = sections[sections.length - 1] || { level: 'easy' };
    sections.push({ level: LEVELS[Math.min(3, LEVELS.indexOf(last.level) + 1)], count: 50 });
    saveSections(); renderSections(); changed();
  });

  // ---------- plan: which puzzles the book contains ----------
  function isMixed() { return BL.radio('level') === 'mixed'; }
  function plan() {
    var seed = ($('#sd-seed').value || '').trim() || '1';
    var secs = isMixed() ? sections : [{ level: BL.radio('level') || 'medium', count: Math.max(1, Math.min(PRO_MAX, parseInt($('#sd-count').value, 10) || 1)) }];
    var perLevel = {}, items = [], num = 0;
    secs.forEach(function (s, si) {
      for (var k = 0; k < s.count && items.length < PRO_MAX; k++) {
        var idx = perLevel[s.level] = (perLevel[s.level] || 0) + 1;
        items.push({ num: ++num, section: si, level: s.level, key: s.level + '|' + seed + '|' + s.level + '|' + (idx - 1) });
      }
    });
    var total = secs.reduce(function (a, s) { return a + s.count; }, 0);
    return { items: items, sections: secs, total: total, overLimit: total > PRO_MAX };
  }
  function needsPro(p) { return isMixed() || p.total > FREE_MAX; }

  // ---------- generation in Web Workers ----------
  var cache = {};   // key -> result
  var running = null;
  function workerCount(n) {
    var cores = navigator.hardwareConcurrency || 2;
    return Math.max(1, Math.min(4, cores - 1, n));
  }
  function generateAll(items, onProgress) {
    if (running) running.cancel();
    var todo = items.filter(function (it) { return !cache[it.key]; });
    var done = items.length - todo.length;
    if (!todo.length) { onProgress(done, items.length); return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      var workers = [], next = 0, finished = 0, cancelled = false, failed = false;
      var job = { cancel: function () { cancelled = true; workers.forEach(function (w) { w.terminate(); }); reject(new Error('cancelled')); } };
      running = job;
      function seedOf(key) { return key.slice(key.indexOf('|') + 1); }
      function feed(w) {
        if (next >= todo.length) return;
        var it = todo[next++];
        w.postMessage({ id: it.key, level: it.level, seed: seedOf(it.key) });
      }
      function onResult(w, data) {
        if (cancelled || failed) return;
        if (!data.ok) { failed = true; workers.forEach(function (x) { x.terminate(); }); running = null; reject(new Error('Could not generate a puzzle: ' + data.error)); return; }
        cache[data.id] = data.result;
        finished++; done++;
        onProgress(done, items.length);
        if (finished === todo.length) { workers.forEach(function (x) { x.terminate(); }); if (running === job) running = null; resolve(); }
        else feed(w);
      }
      try {
        var n = workerCount(todo.length);
        for (var i = 0; i < n; i++) {
          var w = new Worker(new URL('worker.js' + version, scriptSrc || location.href).href);
          w.onmessage = (function (wk) { return function (e) { onResult(wk, e.data); }; })(w);
          w.onerror = function (e) { if (!failed && !cancelled) { failed = true; workers.forEach(function (x) { x.terminate(); }); running = null; reject(new Error('The puzzle generator stopped: ' + (e.message || 'unknown error'))); } };
          workers.push(w);
        }
        workers.forEach(feed);
      } catch (err) {
        // No Worker support: generate on the page in small chunks instead.
        workers.forEach(function (x) { x.terminate(); });
        workers = [];
        (function chunk() {
          if (cancelled) return;
          var end = Date.now() + 40;
          try {
            while (next < todo.length && Date.now() < end) { var it = todo[next++]; cache[it.key] = S.generate(it.level, seedOf(it.key)); done++; finished++; }
          } catch (e2) { reject(e2); return; }
          onProgress(done, items.length);
          if (next < todo.length) setTimeout(chunk, 0); else { if (running === job) running = null; resolve(); }
        })();
      }
    });
  }

  // ---------- preview ----------
  var view = 0, current = null; // current: {plan, results}
  function previewSvg(r, show) {
    var cell = 50, pad = 6, W = cell * 9 + pad * 2, out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + W + '" role="img" aria-label="Sudoku puzzle preview" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">';
    out += '<rect width="100%" height="100%" fill="#fff"/>';
    for (var i = 0; i < 81; i++) {
      var x = pad + (i % 9) * cell + cell / 2, y = pad + Math.floor(i / 9) * cell + cell / 2 + 10;
      var g = r.puzzle[i], s = r.solution[i];
      if (g !== '0') out += '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="29" font-weight="700" fill="#111">' + g + '</text>';
      else if (show) out += '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="27" fill="#0f766e">' + s + '</text>';
    }
    for (var k = 0; k <= 9; k++) {
      var p = pad + k * cell, w = k % 3 === 0 ? 3 : 1, c = k % 3 === 0 ? '#111' : '#999';
      out += '<line x1="' + p + '" y1="' + pad + '" x2="' + p + '" y2="' + (W - pad) + '" stroke="' + c + '" stroke-width="' + w + '"/>';
      out += '<line x1="' + pad + '" y1="' + p + '" x2="' + (W - pad) + '" y2="' + p + '" stroke="' + c + '" stroke-width="' + w + '"/>';
    }
    return out + '</svg>';
  }
  function hardest(r) {
    var best = null;
    Object.keys(r.techniques).forEach(function (t) { var T = S.TECH[t]; if (T && (!best || T.level > S.TECH[best].level)) best = t; });
    return best;
  }
  function renderPreview() {
    var box = $('#sd-preview'), stats = $('#sd-stats'), tech = $('#sd-tech');
    var have = current ? current.plan.items.filter(function (it) { return cache[it.key]; }) : [];
    if (!have.length) {
      $('#sd-pos').textContent = '';
      $('#sd-prev').disabled = $('#sd-next').disabled = true;
      stats.innerHTML = ''; tech.textContent = '';
      return;
    }
    view = Math.max(0, Math.min(have.length - 1, view));
    var it = have[view], r = cache[it.key];
    $('#sd-pos').textContent = 'Puzzle ' + it.num + ' of ' + current.plan.items.length;
    $('#sd-prev').disabled = view === 0; $('#sd-next').disabled = view >= have.length - 1;
    box.innerHTML = previewSvg(r, $('#sd-show').checked);
    var h = hardest(r);
    var used = Object.keys(r.techniques).sort(function (a, b) { return S.TECH[a].level - S.TECH[b].level; })
      .map(function (t) { return S.TECH[t].name + ' ×' + r.techniques[t]; }).join(' · ');
    tech.textContent = 'Steps the grader used: ' + used + '.';
    var lay = puzzleSlotSize();
    stats.innerHTML =
      stat('Difficulty', NAMES[r.level], r.level !== r.target ? 'closest match to ' + NAMES[r.target] : 'one unique solution', true) +
      stat('Givens', String(r.clues), (81 - r.clues) + ' empty squares') +
      stat('Hardest step', h ? S.TECH[h].name : '–', '') +
      stat('Printed cell', '≈' + BL.fmt(lay / 9 / 72, 2) + ' in', lay / 9 < 18 ? 'small: fewer puzzles per page' : form.per.value + ' per page', false, lay / 9 < 18);
  }
  function stat(k, v, s, hi, warn) {
    return '<div class="stat' + (hi ? ' hi' : '') + '"><div class="k">' + k + '</div><div class="v" style="font-size:1.05rem">' + BL.esc(v) + '</div>' +
      (s ? '<div class="s"' + (warn ? ' style="color:var(--warn)"' : '') + '>' + BL.esc(s) + '</div>' : '') + '</div>';
  }

  // ---------- layout ----------
  function bookSpec() {
    var kdp = BL.radio('mode') === 'kdp';
    return { mode: kdp ? 'kdp' : 'print', paper: BL.radio('paper') || 'letter', trimId: $('#sd-trim').value, bleed: kdp && $('#sd-bleed').checked };
  }
  var SHAPES = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 9: [3, 3] };
  var HEADER = 30;
  function slotGrid(fr, per, skip) {
    var sh = SHAPES[per] || [1, 2];
    var gapY = per === 1 ? 0 : 18;
    return Book.slots(fr, sh[0], sh[1], 22, gapY, skip);
  }
  function labelSize(per) { return per === 1 ? 14 : per === 2 ? 12 : 10; }
  function gridSide(slot, per) { var ls = labelSize(per); return Math.min(slot.w, slot.h - ls * 1.8); }
  function puzzleSlotSize() {
    var fr = Book.frame(bookSpec(), 40, 3), per = +form.per.value || 2;
    var inner = { x: fr.x, y: fr.y + (form.numbers.checked ? Book.NUMBER_BAND : 0), w: fr.w, h: fr.h - (form.numbers.checked ? Book.NUMBER_BAND : 0) };
    return gridSide(slotGrid(inner, per, HEADER)[0], per);
  }

  // Draws one grid. top: y of the top edge (PDF coordinates).
  function drawGrid(ctx, x, top, side, r, solution) {
    var cell = side / 9, fonts = ctx.fonts, size = cell * 0.6, off = 0.668 * size / 2;
    var givens = [], filled = [];
    for (var i = 0; i < 81; i++) {
      var cx = x + (i % 9 + 0.5) * cell, cy = top - (Math.floor(i / 9) + 0.5) * cell - off;
      if (r.puzzle[i] !== '0') givens.push({ x: cx, y: cy, s: r.puzzle[i] });
      else if (solution) filled.push({ x: cx, y: cy, s: r.solution[i] });
    }
    var thin = Math.max(0.35, side / 600), thick = Math.max(1, side / 180);
    for (var k = 1; k < 9; k++) {
      if (k % 3 === 0) continue;
      ctx.line(x + k * cell, top, x + k * cell, top - side, thin, ctx.gray(0.55));
      ctx.line(x, top - k * cell, x + side, top - k * cell, thin, ctx.gray(0.55));
    }
    for (k = 0; k <= 9; k += 3) {
      ctx.line(x + k * cell, top + thick / 2, x + k * cell, top - side - thick / 2, thick, ctx.black);
      ctx.line(x - thick / 2, top - k * cell, x + side + thick / 2, top - k * cell, thick, ctx.black);
    }
    ctx.chars(givens, fonts.bold, size, ctx.black);
    if (filled.length) ctx.chars(filled, fonts.regular, size, ctx.gray(0.6));
  }

  function drawPuzzlePage(ctx, list, per, heading) {
    var f = ctx.frame, fonts = ctx.fonts;
    ctx.text(heading, { x: f.x + f.w / 2, y: f.y + f.h - 14, size: 13, font: fonts.bold, align: 'center', color: ctx.gray(0.7), maxW: f.w });
    var slots = slotGrid(f, per, HEADER), ls = labelSize(per);
    list.forEach(function (it, k) {
      var s = slots[k], side = gridSide(s, per);
      var sTop = s.y + s.h - (s.h - ls * 1.8 - side) / 2;   // centre the label + grid in the slot
      var gx = s.x + (s.w - side) / 2, top = sTop - ls * 1.8;
      ctx.text('Puzzle ' + it.num, { x: gx, y: sTop - ls, size: ls, font: fonts.bold });
      ctx.text(NAMES[it.r.level], { x: gx + side, y: sTop - ls, size: ls * 0.85, align: 'right', color: ctx.gray(0.6) });
      drawGrid(ctx, gx, top, side, it.r, false);
    });
  }
  function drawSolutionPage(ctx, list, per, first) {
    var f = ctx.frame, fonts = ctx.fonts, skip = 0;
    if (first) { ctx.text('Solutions', { x: f.x, y: f.y + f.h - 20, size: 20, font: fonts.bold }); skip = 38; }
    var slots = slotGrid(f, per, skip), ls = per >= 9 ? 9 : 10;
    list.forEach(function (it, k) {
      var s = slots[k], side = Math.min(s.w, s.h - ls * 1.8);
      var sTop = s.y + s.h - (s.h - ls * 1.8 - side) / 2;
      var gx = s.x + (s.w - side) / 2, top = sTop - ls * 1.8;
      ctx.text(String(it.num), { x: gx, y: sTop - ls, size: ls, font: fonts.bold });
      drawGrid(ctx, gx, top, side, it.r, true);
    });
  }
  function howTo(levels) {
    return [
      'Fill every empty square with a digit from 1 to 9 so that each row, each column and each of the nine 3 × 3 boxes contains every digit exactly once.',
      'The digits already printed are the givens. Start where a row, column or box is almost full, and pencil small candidate digits into squares when you get stuck.',
      'Every puzzle in this book has exactly one solution and can be solved by logic alone, without guessing.',
      levels.length > 1 ? 'The puzzles get harder as you go: ' + levels.map(function (l) { return NAMES[l].toLowerCase(); }).join(', ') + '.' : '',
      form.answers.checked ? 'The solutions are at the back of the book. The givens are printed in bold so you can match each answer to its puzzle.' : ''
    ].filter(Boolean);
  }

  // ---------- UI state ----------
  var genTimer = null;
  function setBar(id, frac, text) {
    var wrap = $(id);
    wrap.hidden = frac === null;
    if (frac === null) return;
    wrap.querySelector('.progress > div').style.width = Math.round(frac * 100) + '%';
    wrap.querySelector('.progress').setAttribute('aria-valuenow', Math.round(frac * 100));
    wrap.querySelector('p').textContent = text;
  }
  function changed() {
    syncRows();
    var p = plan(), msg = $('#sd-msg');
    var notes = [];
    if (p.overLimit) notes.push('<div class="note warn">A PDF holds up to ' + PRO_MAX + ' puzzles, so only the first ' + PRO_MAX + ' will be made.</div>');
    var gated = needsPro(p) && !BL.pro.active();
    if (gated) notes.push('<div class="note pro">' + (isMixed() ? 'Sections of mixed difficulty are part of Pro.' : 'Free PDFs hold up to ' + FREE_MAX + ' puzzles. Pro goes up to ' + PRO_MAX + '.') + '</div>');
    var have = p.items.filter(function (it) { return cache[it.key]; }).length;
    $('#sd-gen').textContent = have === p.items.length ? 'Puzzles ready (' + p.items.length + ')' : 'Generate ' + p.items.length + ' puzzle' + (p.items.length > 1 ? 's' : '');
    msg.innerHTML = notes.join('');
    updatePdfInfo(p);
    clearTimeout(genTimer);
    if (!gated && p.items.length <= AUTO_MAX) genTimer = setTimeout(function () { generate(false).catch(function () {}); }, 350);
    else if (have) { current = { plan: p }; renderPreview(); }
  }
  function syncRows() {
    var kdp = BL.radio('mode') === 'kdp';
    $('#sd-kdp-rows').hidden = !kdp; $('#sd-paper-row').hidden = kdp;
    $('#sd-title-rows').hidden = !$('#sd-titlepage').checked;
    $('#sd-sections-box').hidden = !isMixed(); $('#sd-count-row').hidden = isMixed();
    $('#sd-solper').disabled = !$('#sd-answers').checked;
  }
  function buildPages(p, results) {
    var per = +form.per.value || 2, solPer = +form.solper.value || 6, pages = [];
    if (form.titlePage.checked) pages.push({ type: 'title', title: $('#sd-btitle').value.trim() || 'Sudoku Puzzles', subtitle: $('#sd-bsub').value.trim() });
    var levels = [];
    p.sections.forEach(function (s) { if (levels.indexOf(s.level) < 0) levels.push(s.level); });
    if (form.howto.checked) pages.push({ type: 'text', heading: 'How to play', body: howTo(levels), size: 12 });
    var all = p.items.map(function (it) { return { num: it.num, section: it.section, r: results[it.key] }; });
    p.sections.forEach(function (s, si) {
      var list = all.filter(function (x) { return x.section === si; });
      if (!list.length) return;
      var first = list[0].num, last = list[list.length - 1].num;
      var heading = NAMES[s.level] + (first === last ? ' · Puzzle ' + first : ' · Puzzles ' + first + '–' + last);
      for (var k = 0; k < list.length; k += per) {
        (function (chunk) { pages.push({ type: 'content', draw: function (ctx) { drawPuzzlePage(ctx, chunk, per, heading); } }); })(list.slice(k, k + per));
      }
    });
    if (form.answers.checked) {
      for (var k = 0; k < all.length; k += solPer) {
        (function (chunk, first) { pages.push({ type: 'content', draw: function (ctx) { drawSolutionPage(ctx, chunk, solPer, first); } }); })(all.slice(k, k + solPer), k === 0);
      }
    }
    return pages;
  }
  function pageCount(p) {
    var per = +form.per.value || 2, solPer = +form.solper.value || 6, n = 0;
    if (form.titlePage.checked) n++;
    if (form.howto.checked) n++;
    var counts = {};
    p.items.forEach(function (it) { counts[it.section] = (counts[it.section] || 0) + 1; });
    Object.keys(counts).forEach(function (k) { n += Math.ceil(counts[k] / per); });
    if (form.answers.checked) n += Math.ceil(p.items.length / solPer);
    return n;
  }
  function updatePdfInfo(p) {
    var em = $('#sd-export-msg');
    if (em.dataset.busy) return;
    var spec = bookSpec(), d = Book.describe(spec, pageCount(p)), info;
    if (spec.mode === 'kdp') {
      info = d.total + ' pages at ' + BL.fmt(d.pageIn.w, 3) + ' × ' + BL.fmt(d.pageIn.h, 3) + ' in' + (spec.bleed ? ' (with bleed)' : '') +
        (d.pad ? ', including ' + d.pad + ' blank page' + (d.pad > 1 ? 's' : '') + ' at the end to reach ' + (d.total <= 24 ? 'KDP\'s 24-page minimum' : 'an even page count') : '') +
        '. Gutter ' + BL.fmt(d.inside, 3) + ' in, other margins ' + BL.fmt(d.outside, 3) + ' in.';
    } else info = d.total + ' page' + (d.total > 1 ? 's' : '') + ' on ' + Book.PAPER[spec.paper].label + '.';
    em.innerHTML = '<p class="small muted">' + BL.esc(info) + '</p>';
  }

  function generate(userAsked) {
    var p = plan();
    if (needsPro(p) && !BL.pro.gate(true, isMixed() ? 'Mixed-difficulty sections are part of Pro.' : 'Free PDFs hold up to ' + FREE_MAX + ' sudoku puzzles. Pro makes books of up to ' + PRO_MAX + '.')) return Promise.reject(new Error('gated'));
    var t0 = performance.now(), missing = p.items.filter(function (it) { return !cache[it.key]; }).length;
    current = { plan: p };
    if (missing) setBar('#sd-gen-progress', 0, 'Generating… 0 of ' + p.items.length);
    $('#sd-gen').disabled = true;
    var lastPaint = 0;
    return generateAll(p.items, function (done, total) {
      setBar('#sd-gen-progress', done / total, 'Generating… ' + done + ' of ' + total);
      if (done === 1 || performance.now() - lastPaint > 500) { lastPaint = performance.now(); renderPreview(); }
    }).then(function () {
      $('#sd-gen').disabled = false;
      $('#sd-gen').textContent = 'Puzzles ready (' + p.items.length + ')';
      if (missing) setBar('#sd-gen-progress', 1, missing + ' puzzle' + (missing > 1 ? 's' : '') + ' generated in ' + BL.fmt((performance.now() - t0) / 1000, 1) + ' s.');
      if (userAsked && !missing) setBar('#sd-gen-progress', null);
      renderPreview();
      return p;
    }, function (e) {
      $('#sd-gen').disabled = false;
      if (e.message !== 'cancelled') { setBar('#sd-gen-progress', null); BL.fail(e, $('#sd-msg')); }
      throw e;
    });
  }

  function exportPdf() {
    var em = $('#sd-export-msg'), t0 = performance.now();
    var p0 = plan();
    if (needsPro(p0) && !BL.pro.gate(true, isMixed() ? 'Mixed-difficulty sections are part of Pro.' : 'Free PDFs hold up to ' + FREE_MAX + ' sudoku puzzles. Pro makes books of up to ' + PRO_MAX + '.')) return;
    $('#sd-pdf').disabled = true;
    em.dataset.busy = '1'; em.innerHTML = '';
    generate(true).then(function (p) {
      var spec = bookSpec(), results = {};
      p.items.forEach(function (it) { results[it.key] = cache[it.key]; });
      var pages = buildPages(p, results);
      setBar('#sd-pdf-progress', 0, 'Laying out pages…');
      return Book.build({
        spec: spec, pages: pages, pageNumbers: form.numbers.checked,
        meta: { title: $('#sd-btitle').value.trim() || 'Sudoku Puzzles', subject: p.items.length + ' sudoku puzzles with solutions', creator: 'Bleedline sudoku book maker' },
        onProgress: function (done, total) { setBar('#sd-pdf-progress', done / total, 'Laying out pages… ' + done + ' of ' + total); }
      }).then(function (out) {
        var name = 'sudoku-' + (spec.mode === 'kdp' ? spec.trimId + (spec.bleed ? '-bleed' : '') : spec.paper) + '-' + p.items.length + '-puzzles.pdf';
        BL.download(new Blob([out.bytes], { type: 'application/pdf' }), name);
        BL.track('sudoku-pdf', spec.mode);
        em.innerHTML = '<div class="note ok">Saved ' + BL.esc(name) + ': ' + out.pages + ' pages, ' + p.items.length + ' puzzle' + (p.items.length > 1 ? 's' : '') +
          (out.padded ? ', ' + out.padded + ' blank page' + (out.padded > 1 ? 's' : '') + ' added at the end' : '') + ' (' + BL.fmt((performance.now() - t0) / 1000, 1) + ' s).</div>';
      });
    }).catch(function (e) { if (e.message !== 'gated' && e.message !== 'cancelled') BL.fail(e, em); })
      .then(function () { $('#sd-pdf').disabled = false; delete em.dataset.busy; setTimeout(function () { setBar('#sd-pdf-progress', null); }, 1500); });
  }

  // ---------- wiring ----------
  form.addEventListener('change', function (e) { if (!e.target.closest('#sd-sections')) changed(); });
  form.addEventListener('input', function (e) { if (e.target.id === 'sd-count' || e.target.id === 'sd-seed') changed(); });
  $('#sd-gen').addEventListener('click', function () { generate(true).catch(function () {}); });
  $('#sd-pdf').addEventListener('click', exportPdf);
  $('#sd-prev').addEventListener('click', function () { view--; renderPreview(); });
  $('#sd-next').addEventListener('click', function () { view++; renderPreview(); });
  $('#sd-show').addEventListener('change', renderPreview);
  $('#sd-reseed').addEventListener('click', function () {
    $('#sd-seed').value = String(Math.floor(Math.random() * 1e6));
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });
  BL.pro.onChange(changed);
  renderSections();
  changed();
})();
