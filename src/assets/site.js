/* Bleedline shared helpers. Every tool runs fully in the browser. */
(function () {
  var cfg = window.BL_CONFIG || {};
  var BL = window.BL = window.BL || {};

  BL.$ = function (sel, root) { return (root || document).querySelector(sel); };
  BL.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // Storage that never throws (private windows, blocked storage).
  BL.store = {
    get: function (key, fallback) {
      try { var v = localStorage.getItem('bl:' + key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem('bl:' + key, JSON.stringify(value)); } catch (e) {}
    },
    remove: function (key) { try { localStorage.removeItem('bl:' + key); } catch (e) {} }
  };

  BL.fmt = function (n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '–';
    var d = digits === undefined ? 2 : digits;
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  BL.money = function (n, currency) {
    if (!isFinite(n)) return '–';
    try { return Number(n).toLocaleString(undefined, { style: 'currency', currency: currency || 'USD' }); }
    catch (e) { return (currency || '$') + ' ' + BL.fmt(n, 2); }
  };
  BL.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  BL.num = function (el, fallback) {
    if (typeof el === 'string') el = BL.$(el);
    var v = el ? parseFloat(String(el.value).replace(',', '.')) : NaN;
    return isFinite(v) ? v : (fallback === undefined ? NaN : fallback);
  };
  BL.radio = function (name, root) {
    var el = (root || document).querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  };

  BL.toast = function (msg, ms) {
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2600);
  };

  BL.download = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    BL.track('download', filename.split('.').pop());
  };
  BL.canvasBlob = function (canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not encode the image. It may be too large for this browser.')); }, type || 'image/png', quality);
    });
  };

  // Read an image File into an HTMLImageElement plus its natural size.
  BL.loadImage = function (file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url, width: img.naturalWidth, height: img.naturalHeight, file: file }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('This file could not be opened as an image: ' + file.name)); };
      img.src = url;
    });
  };

  // Wire a .drop element: click to browse, drag files in, or paste.
  BL.dropzone = function (el, onFiles, opts) {
    opts = opts || {};
    var input = el.querySelector('input[type=file]');
    el.addEventListener('click', function (e) { if (e.target !== input) input.click(); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { if (input.files.length) onFiles(Array.prototype.slice.call(input.files)); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { el.addEventListener(ev, function (e) { e.preventDefault(); el.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { el.addEventListener(ev, function (e) { e.preventDefault(); el.classList.remove('over'); }); });
    el.addEventListener('drop', function (e) { var f = Array.prototype.slice.call(e.dataTransfer.files || []); if (f.length) onFiles(f); });
    if (opts.paste !== false) {
      document.addEventListener('paste', function (e) {
        var items = Array.prototype.slice.call((e.clipboardData && e.clipboardData.files) || []);
        if (items.length) onFiles(items);
      });
    }
  };

  // Remember form values per tool so a returning visitor keeps their settings.
  BL.persist = function (formEl, key) {
    if (!formEl) return;
    var saved = BL.store.get('form:' + key, null);
    var fields = BL.$$('input, select, textarea', formEl).filter(function (f) { return f.name && f.type !== 'file' && !f.hasAttribute('data-nopersist'); });
    if (saved) {
      fields.forEach(function (f) {
        if (!(f.name in saved)) return;
        if (f.type === 'checkbox') f.checked = !!saved[f.name];
        else if (f.type === 'radio') f.checked = saved[f.name] === f.value;
        else f.value = saved[f.name];
      });
    }
    formEl.addEventListener('input', save); formEl.addEventListener('change', save);
    function save() {
      var out = {};
      fields.forEach(function (f) {
        if (f.type === 'checkbox') out[f.name] = f.checked;
        else if (f.type === 'radio') { if (f.checked) out[f.name] = f.value; }
        else out[f.name] = f.value;
      });
      BL.store.set('form:' + key, out);
    }
  };

  // Lazy script loader for heavy vendor files (pdf-lib, fontkit, fflate).
  var loaded = {};
  BL.root = document.querySelector('link[rel=stylesheet][href*="assets/site.css"]').getAttribute('href').replace(/assets\/site\.css.*$/, '');
  BL.loadScript = function (path) {
    if (!loaded[path]) {
      loaded[path] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = BL.root + path; s.onload = resolve;
        s.onerror = function () { delete loaded[path]; reject(new Error('Could not load ' + path + '. Check your connection and try again.')); };
        document.head.appendChild(s);
      });
    }
    return loaded[path];
  };
  BL.pdfLib = function (withFontkit) {
    var p = BL.loadScript('assets/vendor/pdf-lib.min.js');
    if (withFontkit) p = p.then(function () { return BL.loadScript('assets/vendor/fontkit.umd.min.js'); });
    return p.then(function () { return window.PDFLib; });
  };
  var fontCache = {};
  BL.fontBytes = function (file) {
    if (!fontCache[file]) {
      fontCache[file] = fetch(BL.root + 'assets/fonts/' + file).then(function (r) {
        if (!r.ok) throw new Error('Could not load the font ' + file);
        return r.arrayBuffer();
      });
    }
    return fontCache[file];
  };
  // Embedded fonts (KDP rejects PDFs with fonts that are not embedded).
  BL.embedFonts = function (pdfDoc) {
    pdfDoc.registerFontkit(window.fontkit);
    return Promise.all([BL.fontBytes('AtkinsonHyperlegible-Regular.ttf'), BL.fontBytes('AtkinsonHyperlegible-Bold.ttf')])
      .then(function (b) { return Promise.all([pdfDoc.embedFont(b[0], { subset: true }), pdfDoc.embedFont(b[1], { subset: true })]); })
      .then(function (f) { return { regular: f[0], bold: f[1] }; });
  };
  BL.zip = function (files) {
    // files: [{name, data: Uint8Array}]
    return BL.loadScript('assets/vendor/fflate.min.js').then(function () {
      var obj = {};
      files.forEach(function (f) { obj[f.name] = [f.data, { level: 0 }]; });
      return new Promise(function (resolve, reject) {
        window.fflate.zip(obj, function (err, out) { err ? reject(err) : resolve(new Blob([out], { type: 'application/zip' })); });
      });
    });
  };
  BL.blobBytes = function (blob) { return blob.arrayBuffer().then(function (b) { return new Uint8Array(b); }); };

  // Visitor counts: a public, cookie-free counter (abacus.jasoncameron.dev) that stores numbers only.
  // It only runs on the live host, so local builds and tests don't add to the counts.
  var an = cfg.analytics || {};
  var live = !!(an.counterNamespace && cfg.host && location.hostname === cfg.host);
  function hit(key) {
    if (!live) return;
    try { fetch('https://abacus.jasoncameron.dev/hit/' + an.counterNamespace + '/' + key, { mode: 'cors', keepalive: true }).catch(function () {}); } catch (e) {}
  }
  BL.track = function (name, label) {
    hit('ev-' + String(name + (label ? '-' + label : '')).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60));
  };
  (function countVisit() {
    if (!live) return;
    var rel = location.pathname.indexOf(cfg.basePath) === 0 ? location.pathname.slice(cfg.basePath.length) : location.pathname;
    var page = rel.split('/').filter(Boolean)[0] || 'home';
    if (page === 'index.html') page = 'home';
    hit('views');
    hit('page-' + page.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60));
    // A visitor is one browser per day.
    var last = BL.store.get('counted', 0);
    if (Date.now() - last > 24 * 3600 * 1000) { BL.store.set('counted', Date.now()); hit('visitors'); }
  })();
  if (an.cloudflareToken) {
    var s = document.createElement('script');
    s.defer = true; s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: an.cloudflareToken }));
    document.head.appendChild(s);
  }

  // Report errors to the person rather than failing silently.
  BL.fail = function (err, target) {
    console.error(err);
    var msg = (err && err.message) || String(err);
    if (target) { target.innerHTML = '<div class="note err">' + BL.esc(msg) + '</div>'; }
    else BL.toast(msg, 5000);
  };
})();
