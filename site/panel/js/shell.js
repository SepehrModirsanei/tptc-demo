/* TPTC staff panel: the shell (shared, owned by the foundation; module agents never edit it).

   Fills the three slots every panel page carries, so a module owns its whole index.html and a
   change to the shell never touches a module:
     [data-shell-side]  the sidebar: the logo, the six modules, the role, Reset demo
     [data-shell-top]   the demo banner and the top bar: season, demo clock, Sample data, theme
   and adds the toast region. Exposes window.PanelUI (toast, sheet, confirm, can, icon, link,
   esc, chip, confirmSlot). The API is documented in ../PANEL.md.

   The story it tells: the club's day seen from the desk. The current module is marked the way
   a court is divided, by the red net between two posts; everything else stays quiet. */
(function () {
  'use strict';
  var D = window.PanelData;
  var html = document.documentElement, body = document.body;
  var ROOT = html.getAttribute('data-panel-root') || '../';
  var PAGE = html.getAttribute('data-panel-page') || '';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* this visit only */ } };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Icons: the site's sprite plus six panel icons in the same hand ---------- */
  var EXTRA = '<svg class="sprite" width="0" height="0" aria-hidden="true" style="position:absolute" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter">' +
    '<symbol id="i-scoreboard" viewBox="0 0 24 24"><path d="M3.5 5.5h17v13h-17zM3.5 12h17M10 5.5v13M14 5.5v13M18 5.5v13"/></symbol>' +
    '<symbol id="i-receipt" viewBox="0 0 24 24"><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9 8h6M9 11.5h6M9 15h3.5"/></symbol>' +
    '<symbol id="i-board" viewBox="0 0 24 24"><path d="M3.5 4.5h17v12h-17zM7 16.5V21M17 16.5V21M7 8.5h10M7 12h6.5"/></symbol>' +
    '<symbol id="i-signout" viewBox="0 0 24 24"><path d="M10 4H4.5v16H10M14.5 8l4 4-4 4M18.5 12H9"/></symbol>' +
    '<symbol id="i-reset" viewBox="0 0 24 24"><path d="M5.2 13.5A7 7 0 1 0 7 7.1M5 3.5V8h4.5"/></symbol>' +
    '<symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/></symbol>' +
    '</svg>';
  if (window.TPTC_SPRITE && !document.getElementById('i-court')) body.insertAdjacentHTML('afterbegin', window.TPTC_SPRITE + EXTRA);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(name, cls) { return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>'; }

  /* ---------- Modules, roles and what each role may do ---------- */
  var MODULES = [
    { id: 'bookings', label: 'Bookings', icon: 'court', job: 'The four courts by day and week' },
    { id: 'programs', label: 'Programs', icon: 'coach', job: 'Sessions, seats and waitlists' },
    { id: 'members', label: 'Members', icon: 'family', job: 'Memberships, renewals, history' },
    { id: 'payments', label: 'Payments', icon: 'receipt', job: 'Payments, refunds and HST' },
    { id: 'content', label: 'Content', icon: 'board', job: 'News, cards and season dates' },
    { id: 'dashboard', label: 'Dashboard', icon: 'scoreboard', job: 'Camps, courts, registrations' }
  ];
  var HOME = { frontdesk: 'bookings', headpro: 'programs', admin: 'dashboard' };
  var CAN = {
    frontdesk: ['bookings.view', 'bookings.walkin', 'bookings.hold', 'bookings.cancel', 'programs.view', 'programs.register', 'programs.waitlist',
      'members.view', 'members.edit', 'members.remind', 'payments.view', 'payments.record', 'content.view', 'dashboard.view'],
    headpro: ['bookings.view', 'bookings.hold', 'bookings.lesson', 'programs.view', 'programs.register', 'programs.waitlist', 'programs.approve', 'programs.edit',
      'members.view', 'members.notes', 'payments.view', 'content.view', 'dashboard.view'],
    admin: ['*']
  };
  /* WHO_CAN is derived from CAN, so a disabled action always names every role that may do it */
  var ROLE_LABEL = { frontdesk: 'Front desk', headpro: 'Head Pro', admin: 'Administrator' };
  function whoCan(action) {
    var who = ['frontdesk', 'headpro'].filter(function (r) { return CAN[r].indexOf(action) > -1; }).map(function (r) { return ROLE_LABEL[r]; });
    return who.length === 2 ? 'Front desk, Head Pro or Administrator' : who.length ? who[0] + ' or Administrator' : 'Administrator';
  }
  var WHO_CAN = {};
  Object.keys(CAN).forEach(function (r) { CAN[r].forEach(function (a) { if (a !== '*') WHO_CAN[a] = whoCan(a); }); });
  ['payments.refund', 'content.edit'].forEach(function (a) { WHO_CAN[a] = whoCan(a); });
  function role() { return D ? D.role() : (get('tptc-panel-role') || 'frontdesk'); }
  function can(action) { var list = CAN[role()] || []; return list.indexOf('*') > -1 || list.indexOf(action) > -1; }
  function link(module, query) { return ROOT + module + '/index.html' + (query ? '?' + query : ''); }

  /* ---------- Sidebar ---------- */
  function renderSide(slot) {
    var r = role();
    slot.id = 'pn-side';
    slot.setAttribute('aria-label', 'Staff panel');
    slot.innerHTML =
      '<div class="pn-side__inner">' +
        '<div class="pn-side__brand">' +
          '<a class="pn-logo" href="' + link(HOME[r] || 'dashboard') + '" aria-label="Thornhill Park Tennis Club staff panel, home">' +
            '<img src="' + ROOT + '../../assets/brand/tptc-lockup-on-dark.svg" alt="" width="249" height="38"></a>' +
          '<p class="pn-side__kicker">Staff panel <span class="pn-side__since">Since 1951</span></p>' +
          '<button class="pn-iconbtn pn-side__close" type="button" data-shell-close aria-label="Close menu">' + icon('close') + '</button>' +
        '</div>' +
        '<nav class="pn-nav" aria-label="Modules"><ul role="list">' +
          MODULES.map(function (m) {
            var cur = m.id === PAGE;
            return '<li><a class="pn-nav__item' + (cur ? ' is-current' : '') + '" href="' + link(m.id) + '"' + (cur ? ' aria-current="page"' : '') + '>' +
              icon(m.icon) + '<span class="pn-nav__text"><span class="pn-nav__label">' + m.label + '</span><span class="pn-nav__job">' + m.job + '</span></span></a></li>';
          }).join('') +
        '</ul></nav>' +
        '<div class="pn-side__foot">' +
          '<p class="pn-side__role"><span class="pn-side__role-k">Signed in as</span><span class="pn-side__role-v">' + esc(D ? D.roleName() : '') + '</span></p>' +
          '<a class="pn-side__link" href="' + ROOT + 'sign-in/index.html?switch=1">' + icon('signout', 'icon--20') + '<span>Switch role</span></a>' +
          '<button class="pn-side__link" type="button" data-shell-reset>' + icon('reset', 'icon--20') + '<span>Reset demo</span></button>' +
          '<a class="pn-side__link" href="' + ROOT + '../index.html">' + icon('arrow-external', 'icon--20') + '<span>The public site</span></a>' +
        '</div>' +
      '</div>';
  }

  /* ---------- Banner and top bar ---------- */
  function renderTop(slot) {
    var s = D ? D.currentSeason() : null, c = D ? D.clock : null;
    var day = s && c ? D.fmt.daysBetween(D.fmt.parse(s.start), c.today) + 1 : null;
    var theme = get('tptc-panel-theme') || 'system';
    slot.innerHTML =
      '<section class="pn-banner" aria-label="Demo notice">' +
        '<span class="chip chip--muted pn-banner__chip">' + icon('alert') + 'Demo</span>' +
        '<span><strong>Demo panel. Sample data. Nothing is saved to a server or charged.</strong>' +
        '<span class="pn-banner__more"> Changes stay in this browser until you reset the demo.</span></span>' +
      '</section>' +
      '<div class="pn-top">' +
        '<button class="pn-iconbtn pn-top__menu" type="button" data-shell-menu aria-controls="pn-side" aria-expanded="false" aria-label="Open menu">' + icon('menu') + '</button>' +
        '<a class="pn-top__mark" href="' + link(HOME[role()] || 'dashboard') + '" aria-label="Staff panel home"><img src="' + ROOT + '../../assets/brand/tptc-mark.svg" alt="" width="70" height="19" class="pn-mark--col"><img src="' + ROOT + '../../assets/brand/tptc-mark-on-dark.svg" alt="" width="70" height="19" class="pn-mark--rev"></a>' +
        '<div class="pn-top__season">' +
          (s ? '<p class="pn-top__season-name"><span class="live-dot" aria-hidden="true"></span>' + esc(s.name) + '</p>' +
            '<p class="pn-top__season-meta num">' + esc(D.fmt.long(c.today)) + (day > 0 ? ', day ' + day + ' of the season' : '') +
            (c.shifted ? ' <span class="pn-top__clock">(demo clock)</span>' : '') + '</p>' : '') +
        '</div>' +
        '<div class="pn-top__tools">' +
          '<span class="chip chip--confirm pn-top__sample" title="Every person, booking and payment here is made up">Sample data</span>' +
          '<span class="pn-top__role" aria-label="Role: ' + esc(D ? D.roleName() : '') + '">' + esc(D ? D.roleName() : '') + '</span>' +
          '<div class="pn-theme" role="group" aria-label="Theme">' +
            [['system', 'System', 'ball'], ['light', 'Day', 'sun'], ['dark', 'Night', 'dome']].map(function (t) {
              return '<button type="button" class="pn-theme__btn" data-theme-set="' + t[0] + '" aria-pressed="' + (theme === t[0]) + '" title="' + t[1] + '">' + icon(t[2], 'icon--20') + '<span class="sr-only">' + t[1] + '</span></button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function applyTheme(t) {
    if (t === 'light' || t === 'dark') html.setAttribute('data-theme', t); else html.removeAttribute('data-theme');
    set('tptc-panel-theme', t === 'system' ? null : t);
    $$('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === t)); });
  }

  /* ---------- Phone menu: the sidebar becomes a sheet ---------- */
  var lastFocus = null;
  function menuOpen() { return html.classList.contains('pn-menu-open'); }
  function setMenu(open) {
    var btn = $('[data-shell-menu]'), side = $('#pn-side'), main = $('.pn-body');
    if (!btn || !side) return;
    if (open) { lastFocus = document.activeElement; }
    html.classList.toggle('pn-menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (main) { if (open) main.setAttribute('inert', ''); else main.removeAttribute('inert'); }
    if (open) side.removeAttribute('inert'); else if (phone.matches) side.setAttribute('inert', '');
    if (open) { var first = $('.pn-nav__item.is-current', side) || $('a, button', side); if (first) first.focus(); }
    else if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  var phone = matchMedia('(max-width: 959.98px)');
  function syncSide() {
    var side = $('#pn-side'); if (!side) return;
    if (phone.matches && !menuOpen()) side.setAttribute('inert', ''); else side.removeAttribute('inert');
    if (!phone.matches && menuOpen()) setMenu(false);
  }

  /* ---------- Toasts: one polite live region, newest last ----------
     A modal <dialog> makes the page inert, so while a sheet or confirm is open the region moves
     into that dialog (its Undo stays reachable) and moves back to <body> when it closes. */
  var toasts;
  function hostToasts() {
    if (!toasts) return;
    var open = $$('dialog[open]'), host = open.length ? open[open.length - 1] : body;
    if (confirmEl && confirmEl.open) host = confirmEl;
    if (toasts.parentNode !== host) host.appendChild(toasts);
  }
  document.addEventListener('close', function (e) { if (e.target && e.target.tagName === 'DIALOG') setTimeout(hostToasts, 0); }, true);
  function toast(msg, opts) {
    opts = opts || {};
    if (!toasts) return;
    hostToasts();
    var t = document.createElement('div');
    t.className = 'pn-toast' + (opts.kind ? ' pn-toast--' + opts.kind : '');
    t.innerHTML = icon(opts.kind === 'warn' ? 'alert' : 'check', 'icon--20') + '<p class="pn-toast__msg">' + esc(msg) + '</p>' +
      (opts.action ? '<button type="button" class="pn-toast__act">' + esc(opts.action.label) + '</button>' : '') +
      '<button type="button" class="pn-iconbtn pn-toast__x" aria-label="Dismiss">' + icon('close', 'icon--16') + '</button>';
    toasts.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-in'); });
    var gone = function () { t.classList.remove('is-in'); setTimeout(function () { t.remove(); }, reduce.matches ? 0 : 240); };
    $('.pn-toast__x', t).addEventListener('click', gone);
    if (opts.action) $('.pn-toast__act', t).addEventListener('click', function () { opts.action.run(); gone(); });
    var timer = setTimeout(gone, opts.ms || 6000);
    t.addEventListener('mouseenter', function () { clearTimeout(timer); });
    t.addEventListener('focusin', function () { clearTimeout(timer); });
    return t;
  }

  /* ---------- Side sheet and confirm: native <dialog>, so focus, Esc and the inert page are the browser's ---------- */
  function makeDialog(cls, labelId) {
    var d = document.createElement('dialog');
    d.className = cls;
    d.setAttribute('aria-labelledby', labelId);
    body.appendChild(d);
    d.addEventListener('click', function (e) { if (e.target === d) d.close('scrim'); });
    return d;
  }
  var sheetEl = null, sheetClose = null;
  var sheet = {
    /* PanelUI.sheet.open({ title, kicker, body: html string or Node, foot: html string, wide, onClose })
       returns the <dialog>; its body is .pn-sheet__body. Close with PanelUI.sheet.close(). */
    open: function (o) {
      if (!sheetEl) sheetEl = makeDialog('pn-sheet', 'pn-sheet-title');
      sheetEl.classList.toggle('pn-sheet--wide', !!o.wide);
      sheetEl.innerHTML =
        '<div class="pn-sheet__head"><div>' + (o.kicker ? '<p class="pn-kicker">' + esc(o.kicker) + '</p>' : '') +
        '<h2 class="pn-sheet__title" id="pn-sheet-title">' + esc(o.title || '') + '</h2></div>' +
        '<button type="button" class="pn-iconbtn" data-sheet-close aria-label="Close">' + icon('close') + '</button></div>' +
        '<div class="pn-sheet__body"></div>' + (o.foot ? '<div class="pn-sheet__foot">' + o.foot + '</div>' : '');
      var b = $('.pn-sheet__body', sheetEl);
      if (typeof o.body === 'string') b.innerHTML = o.body; else if (o.body) b.appendChild(o.body);
      $$('[data-sheet-close]', sheetEl).forEach(function (x) { x.addEventListener('click', function () { sheet.close(); }); });
      if (sheetClose) sheetEl.removeEventListener('close', sheetClose);
      sheetClose = function () { html.classList.remove('pn-sheet-open'); if (o.onClose) o.onClose(sheetEl.returnValue); };
      sheetEl.addEventListener('close', sheetClose);
      if (!sheetEl.open) sheetEl.showModal();
      html.classList.add('pn-sheet-open');
      var f = $('[autofocus]', sheetEl) || $('.pn-sheet__body input, .pn-sheet__body select, .pn-sheet__body textarea, .pn-sheet__body button', sheetEl);
      if (f) f.focus();
      return sheetEl;
    },
    close: function (v) { if (sheetEl && sheetEl.open) sheetEl.close(v || ''); },
    el: function () { return sheetEl; }
  };
  var confirmEl = null;
  /* PanelUI.confirm({ title, body, confirm: 'Cancel booking', cancel: 'Keep it', danger }) resolves true or false */
  function confirmBox(o) {
    return new Promise(function (resolve) {
      if (!confirmEl) confirmEl = makeDialog('pn-confirm', 'pn-confirm-title');
      confirmEl.innerHTML = '<form method="dialog" class="pn-confirm__form">' +
        '<h2 class="pn-confirm__title" id="pn-confirm-title">' + esc(o.title) + '</h2>' +
        (o.body ? '<div class="pn-confirm__body">' + o.body + '</div>' : '') +
        '<div class="pn-confirm__actions"><button class="pn-btn pn-btn--quiet" value="no" autofocus>' + esc(o.cancel || 'Go back') + '</button>' +
        '<button class="pn-btn ' + (o.danger ? 'pn-btn--danger' : 'pn-btn--ink') + '" value="yes">' + esc(o.confirm || 'Confirm') + '</button></div></form>';
      confirmEl.onclose = function () { resolve(confirmEl.returnValue === 'yes'); };
      confirmEl.returnValue = '';
      confirmEl.showModal();
    });
  }

  /* ---------- Small shared renderers ---------- */
  var STATUS = {
    booked: ['Booked', ''], completed: ['Played', 'muted'], cancelled: ['Cancelled', 'muted'], 'late-cancel': ['Late cancel', 'warn'], 'no-show': ['No-show', 'warn'],
    'in-progress': ['Not confirmed', 'confirm'], confirmed: ['Confirmed', ''], waiting: ['Waiting', 'confirm'], offered: ['Spot offered', 'live'],
    active: ['Active', ''], ended: ['Ended', 'muted'], refunded: ['Refunded', 'muted'], pending: ['Pending', 'confirm'], approved: ['Approved', ''],
    succeeded: ['Paid', ''], partially_refunded: ['Part refunded', 'muted'], due: ['To settle', 'warn'], failed: ['Failed', 'warn'],
    running: ['Running now', 'live'], upcoming: ['Upcoming', ''], finished: ['Finished', 'muted'], draft: ['Club to confirm', 'confirm'], open: ['Open', ''],
    published: ['Published', ''], member: ['Member', ''], 'renewal-due': ['Renewal due', 'warn'], waitlist: ['Waitlist', 'confirm'], contact: ['Contact', 'muted'],
    sent: ['Sent', 'muted'], queued: ['Queued, not sent', 'confirm'], withdrawn: ['Withdrawn', 'muted'], closed: ['Closed', 'muted'], excused: ['Excused', 'muted'],
    disputed: ['Disputed', 'warn'], needs_response: ['Needs response', 'warn'], under_review: ['Under review', 'confirm'], won: ['Won', ''], lost: ['Lost', 'muted'],
    in_transit: ['In transit', 'confirm'], paid_out: ['Paid out', 'muted'], suspended: ['Booking suspended', 'warn']
  };
  function chip(status, label) {
    var s = STATUS[status] || [status, ''];
    var k = s[1] === 'live' ? ' chip--live' : s[1] === 'muted' ? ' chip--muted' : s[1] === 'confirm' ? ' chip--confirm' : s[1] === 'warn' ? ' pn-chip--warn' : '';
    return '<span class="chip pn-chip' + k + '">' + (s[1] === 'live' ? '<span class="live-dot" aria-hidden="true"></span>' : '') + esc(label || s[0]) + '</span>';
  }
  function confirmSlot(what) { return '<span class="confirm"><span class="confirm__tag">Club to confirm</span><span class="confirm__what">' + esc(what) + '</span></span>'; }

  /* ---------- Start ---------- */
  function init() {
    var side = $('[data-shell-side]'), top = $('[data-shell-top]');
    if (side) renderSide(side);
    if (top) renderTop(top);
    toasts = document.createElement('div');
    toasts.className = 'pn-toasts'; toasts.setAttribute('role', 'status'); toasts.setAttribute('aria-live', 'polite');
    body.appendChild(toasts);
    var scrim = document.createElement('div'); scrim.className = 'pn-scrim'; scrim.setAttribute('data-shell-close', ''); scrim.setAttribute('aria-hidden', 'true');
    body.appendChild(scrim);

    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null; if (!t) return;
      if (t.closest('[data-shell-menu]')) setMenu(!menuOpen());
      else if (t.closest('[data-shell-close]')) setMenu(false);
      var th = t.closest('[data-theme-set]'); if (th) applyTheme(th.getAttribute('data-theme-set'));
      if (t.closest('[data-shell-reset]')) {
        setMenu(false);
        confirmBox({ title: 'Reset the demo?', body: '<p>Every change made in this browser goes: bookings, registrations, notes, refunds and edits. The sample data comes back as it was.</p>', confirm: 'Reset demo', danger: true })
          .then(function (yes) { if (yes && D) { D.reset(); toast('Demo reset. The sample data is back as it was.'); } });
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen()) { e.preventDefault(); setMenu(false); }
      if (e.key === 'Tab' && menuOpen()) {
        var f = $$('#pn-side a, #pn-side button').filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    (phone.addEventListener ? phone.addEventListener('change', syncSide) : phone.addListener(syncSide));
    syncSide();
    /* Over http, show clean folder addresses; on disk keep index.html so links work */
    if (location.protocol.indexOf('http') === 0) $$('a[href$="/index.html"]').forEach(function (a) { a.setAttribute('href', a.getAttribute('href').replace(/index\.html$/, '')); });
    html.classList.add('pn-ready');
  }

  window.PanelUI = {
    modules: MODULES, page: PAGE, root: ROOT,
    role: role, can: can, whoCan: whoCan, link: link,
    icon: icon, esc: esc, chip: chip, statusLabel: function (s) { return (STATUS[s] || [s])[0]; }, confirmSlot: confirmSlot,
    toast: toast, sheet: sheet, confirm: confirmBox, closeMenu: function () { setMenu(false); },
    reducedMotion: function () { return reduce.matches; }
  };
  init();
})();
