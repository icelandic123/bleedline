/* Bleedline Pro: a Gumroad license key unlocks Pro features in this browser.
   Gumroad's license API accepts browser requests, so no server is needed. */
(function () {
  var BL = window.BL;
  var cfg = (window.BL_CONFIG || {}).gumroad || {};
  var KEY = 'pro';
  var REVERIFY_MS = 7 * 24 * 3600 * 1000;
  var listeners = [];

  function state() { return BL.store.get(KEY, null); }
  function isActive() { var s = state(); return !!(s && s.key && s.ok); }
  function apply() {
    document.body.classList.toggle('is-pro', isActive());
    listeners.forEach(function (cb) { try { cb(isActive()); } catch (e) {} });
  }

  function verify(key, increment) {
    if (!cfg.productId) return Promise.reject(new Error('Pro is not open for sale yet. Please check back soon.'));
    var body = new URLSearchParams({ product_id: cfg.productId, license_key: key.trim(), increment_uses_count: increment ? 'true' : 'false' });
    return fetch('https://api.gumroad.com/v2/licenses/verify', { method: 'POST', body: body })
      .then(function (r) { return r.json().catch(function () { return { success: false, message: 'Unexpected reply from Gumroad.' }; }); })
      .then(function (j) {
        if (!j.success) throw new Error(j.message || 'That license key was not recognised.');
        var p = j.purchase || {};
        if (p.refunded || p.chargebacked || p.disputed) throw new Error('This purchase was refunded, so the key no longer unlocks Pro.');
        if (p.subscription_ended_at || p.subscription_failed_at) throw new Error('This subscription has ended.');
        return { key: key.trim(), ok: true, email: p.email || '', verifiedAt: Date.now() };
      });
  }

  function activate(key) {
    return verify(key, true).then(function (s) { BL.store.set(KEY, s); apply(); BL.track('pro-activated'); return s; });
  }
  function deactivate() { BL.store.remove(KEY); apply(); }

  // Quiet re-check once a week. A network failure keeps Pro on; a definite "no" turns it off.
  function recheck() {
    var s = state();
    if (!s || !s.key || Date.now() - (s.verifiedAt || 0) < REVERIFY_MS) return;
    verify(s.key, false).then(function (n) { BL.store.set(KEY, n); }, function (err) {
      if (/not recognised|not found|refunded|ended|does not exist/i.test(err.message)) { deactivate(); }
    });
  }

  var modalEl = null;
  function openModal(reason) {
    closeModal();
    BL.track('pro-modal', reason ? 'gate' : 'open');
    var back = document.createElement('div');
    back.className = 'modal-back';
    var buy = cfg.productUrl
      ? '<a class="btn pro" href="' + BL.esc(cfg.productUrl) + '" target="_blank" rel="noopener">Get Pro for ' + BL.esc(cfg.price || '') + '</a>'
      : '<span class="note">Pro opens for sale soon.</span>';
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="pro-title">' +
      '<button class="close" aria-label="Close">×</button>' +
      '<h2 id="pro-title">Bleedline Pro</h2>' +
      (reason ? '<p class="note pro">' + BL.esc(reason) + '</p>' : '') +
      '<p>One payment, yours for life. It unlocks every Pro feature on every tool:</p>' +
      '<ul><li>Whole puzzle books: up to 300 word searches or 500 sudoku per PDF, with answer keys</li><li>Premium journal pages: planners, trackers, handwriting, music and log pages</li><li>Batch image jobs: resize, trim and fix DPI for many files in one zip</li><li>Posters up to 15 × 15 pages</li><li>Every future Pro feature, at no extra cost</li></ul>' +
      '<div class="btn-row">' + buy + '<a class="btn ghost" href="' + BL.root + 'pro/">Compare free and Pro</a></div>' +
      '<hr style="border:0;border-top:1px solid var(--border);margin:18px 0">' +
      '<form class="pro-form"><div class="field"><label for="pro-key">Already bought it? Enter your license key</label>' +
      '<input id="pro-key" type="text" autocomplete="off" spellcheck="false" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" required>' +
      '<div class="hint">The key is in your Gumroad receipt email and in your Gumroad library.</div></div>' +
      '<button class="btn block" type="submit">Unlock Pro</button><div class="pro-msg" aria-live="polite"></div></form>' +
      '</div>';
    document.body.appendChild(back);
    modalEl = back;
    var input = back.querySelector('#pro-key');
    setTimeout(function () { input.focus(); }, 30);
    back.addEventListener('click', function (e) { if (e.target === back || e.target.classList.contains('close')) closeModal(); });
    document.addEventListener('keydown', escClose);
    back.querySelector('.pro-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = back.querySelector('.pro-msg');
      var btn = back.querySelector('.pro-form .btn');
      btn.disabled = true; msg.innerHTML = '<p class="small muted"><span class="spinner"></span> Checking with Gumroad…</p>';
      activate(input.value).then(function () {
        msg.innerHTML = '<div class="note ok">Pro is unlocked in this browser. Thank you for supporting Bleedline.</div>';
        setTimeout(closeModal, 1400);
      }, function (err) {
        btn.disabled = false;
        msg.innerHTML = '<div class="note err">' + BL.esc(err.message === 'Failed to fetch' ? 'Could not reach Gumroad. Check your connection and try again.' : err.message) + '</div>';
      });
    });
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    if (modalEl) { modalEl.remove(); modalEl = null; document.removeEventListener('keydown', escClose); }
  }

  BL.pro = {
    active: isActive,
    open: openModal,
    deactivate: deactivate,
    activate: activate,
    onChange: function (cb) { listeners.push(cb); },
    // Returns true when allowed. Otherwise opens the upgrade dialog with the reason.
    gate: function (needsPro, reason) {
      if (!needsPro || isActive()) return true;
      openModal(reason);
      return false;
    },
    config: cfg
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-pro-open]');
    if (t) { e.preventDefault(); openModal(t.getAttribute('data-pro-open') || ''); }
  });
  apply();
  recheck();
})();
