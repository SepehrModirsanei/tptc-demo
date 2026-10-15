/* Membership page script (B8): the membership request finishes on this page.
   Same pattern as the Register flow: one question at a time (season, membership, Vaughan resident,
   members in the household for a Family), answered questions fold into one line with Change, then
   ONE form already filled in where only the phone number is required (name and email optional),
   then the demo confirmation. The membership card beside the flow shows the price as you answer;
   the rates sit on the radios (data-res, data-non), copied from content/membership.json, the
   resident rate already including the 15%. Plus HST, never computed here.
   A Couple is two members by definition, so the household question is asked only for a Family.
   Answers live in sessionStorage (tptc-membership). Every "Become a member" (#join) and every
   "Choose" on a rate card lands on the question you are on and focuses it. */
(function () {
  'use strict';
  var doc = document;
  var flow = doc.querySelector('[data-mf-flow]');
  if (!flow) return;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var KEY = 'tptc-membership';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var live = $('[data-mf-live]', flow);
  var QUESTIONS = ['season', 'mtype', 'resident', 'members'];
  var KEYS = { season: 'Season', mtype: 'Membership', resident: 'Vaughan resident', members: 'Members' };
  var SR = { season: 'season', mtype: 'membership', resident: 'Vaughan resident', members: 'members in the household' };
  var SEASON = { indoor: 'Fall & Winter Indoor 2026/27' };

  /* ---------- State ---------- */
  var S = load() || fresh();
  function fresh() { return { a: {}, f: {}, stage: null, edit: null }; }
  function load() {
    try { var v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v && v.a ? v : null; } catch (e) { return null; }
  }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private window: the flow still works */ } }

  function seq() {
    var s = ['season', 'mtype', 'resident'];
    if (S.a.mtype === 'family') s.push('members');
    return s;
  }
  function current() {
    var s = seq();
    if (S.edit && s.indexOf(S.edit) !== -1) return S.edit;
    for (var i = 0; i < s.length; i++) if (!S.a[s[i]]) return s[i];
    return S.stage || 'finish';
  }

  /* ---------- Phone (same rule as Register) ---------- */
  function phoneDigits(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return d;
  }
  function phoneOk(v) { var d = phoneDigits(v); return d.length === 10 && /[2-9]/.test(d.charAt(0)); }
  function phoneFmt(v) { var d = phoneDigits(v); return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6); }

  /* ---------- Labels and price ---------- */
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function typeInput(v) { return $('input[name="mtype"][value="' + v + '"]', flow); }
  function optLabel(q, v) {
    var i = $('input[name="' + q + '"][value="' + v + '"]', flow);
    var n = i && $('.reg-opt__name', i.parentNode);
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : v;
  }
  function typeText() {
    var i = typeInput(S.a.mtype); if (!i) return '';
    var meta = $('.reg-opt__meta', i.parentNode);
    var m = meta ? meta.textContent.trim() : '';
    return optLabel('mtype', S.a.mtype) + (m ? ' (' + m.charAt(0).toLowerCase() + m.slice(1) + ')' : '');
  }
  function membersText() {
    if (S.a.mtype === 'couple') return '2, the couple';
    if (S.a.mtype === 'family' && S.a.members) return S.a.members === '5+' ? '5 or more' : S.a.members;
    return S.a.mtype ? '1' : '';
  }
  function price() {
    var i = typeInput(S.a.mtype); if (!i) return null;
    return { res: i.getAttribute('data-res'), non: i.getAttribute('data-non') };
  }
  function priceText() {
    var p = price(); if (!p || !S.a.resident) return '';
    return '$' + (S.a.resident === 'yes' ? p.res : p.non) + ' + HST' + (S.a.resident === 'yes' ? ', includes the 15% saving' : '');
  }
  function answerText(q) {
    var v = S.a[q]; if (!v) return '';
    if (q === 'season') return SEASON[v] || optLabel(q, v);
    if (q === 'mtype') return typeText();
    if (q === 'resident') return v === 'yes' ? 'Yes, save 15%' : 'No';
    if (q === 'members') return membersText();
    return optLabel(q, v);
  }

  /* ---------- The live card ---------- */
  var card = $('[data-mf-card]');
  function fillCard() {
    if (!card) return;
    var p = price(), r = S.a.resident;
    var opt = $('[data-mf-opt]', card), pr = $('[data-mf-price]', card), who = $('[data-mf-who]', card);
    var res = $('[data-mf-res]', card), mem = $('[data-mf-members]', card);
    if (!p) {
      opt.textContent = 'Choose a membership';
      pr.textContent = 'From $143.50';
      who.textContent = '+ HST. Vaughan residents save 15%.';
    } else {
      opt.textContent = optLabel('mtype', S.a.mtype) + ', a season';
      pr.textContent = '$' + (r === 'no' ? p.non : p.res);
      who.textContent = r === 'yes' ? '+ HST, Vaughan resident, 15% saved' : r === 'no' ? '+ HST, non-resident. Vaughan residents pay $' + p.res + '.' : '+ HST, Vaughan resident price. Non-resident $' + p.non + '.';
    }
    res.textContent = r === 'yes' ? 'Yes' : r === 'no' ? 'No' : ' ';
    mem.textContent = membersText() || ' ';
    card.classList.toggle('is-set', !!(p && r));
    if (!reduce && p) { card.classList.remove('is-tick'); void card.offsetWidth; card.classList.add('is-tick'); }
  }

  /* ---------- Rendering ---------- */
  var steps = $$('[data-q]', flow);
  var phoneIn = $('#mf-phone'), nameIn = $('#mf-name'), mailIn = $('#mf-email');
  function render() {
    var s = seq(), cur = current();
    var order = s.concat(['finish', 'done']);
    var ci = order.indexOf(cur);
    var end = cur === 'finish' || cur === 'done';
    steps.forEach(function (el) {
      var q = el.getAttribute('data-q'), i = order.indexOf(q), st;
      if (i === -1) st = 'off';
      else if (end && QUESTIONS.indexOf(q) !== -1) st = 'off';
      else if (i < ci) st = QUESTIONS.indexOf(q) !== -1 ? 'done' : 'off';
      else if (i === ci) st = 'current';
      else st = QUESTIONS.indexOf(q) !== -1 && S.a[q] ? 'done' : 'todo';
      el.setAttribute('data-state', st);
      var a = $('[data-a]', el);
      if (a) a.textContent = st === 'done' ? answerText(q) : '';
    });
    flow.setAttribute('data-stage', cur);
    $$('.reg-opt[data-for-type]', flow).forEach(function (o) {
      o.hidden = !!S.a.mtype && o.getAttribute('data-for-type').split(' ').indexOf(S.a.mtype) === -1;
    });
    QUESTIONS.forEach(function (q) {
      $$('input[name="' + q + '"]', flow).forEach(function (i) { i.checked = S.a[q] === i.value; });
    });
    if (phoneIn && doc.activeElement !== phoneIn) phoneIn.value = S.a.phone || '';
    if (nameIn && doc.activeElement !== nameIn) nameIn.value = S.f.name || '';
    if (mailIn && doc.activeElement !== mailIn) mailIn.value = S.f.email || '';
    fillSum(); fillDone(); progress(); fillCard();
  }
  function rows() {
    var r = [];
    seq().forEach(function (q) { if (S.a[q]) r.push([q, KEYS[q], answerText(q)]); });
    if (S.a.mtype === 'couple') r.push(['', 'Members', membersText()]);
    var pt = priceText(); if (pt) r.push(['', 'Price', pt]);
    return r;
  }
  function fillSum() {
    var ul = $('[data-sum]', flow); if (!ul) return;
    ul.innerHTML = rows().map(function (x) {
      return '<li class="reg-sum__row"><span class="reg-sum__tick" aria-hidden="true"></span><span class="reg-sum__k">' + x[1] + '</span><span class="reg-sum__v">' + esc(x[2]) + '</span>' +
        (x[0] ? '<button class="reg-step__edit" type="button" data-edit="' + x[0] + '">Change<span class="sr-only"> ' + SR[x[0]] + '</span></button>' : '<span></span>') + '</li>';
    }).join('');
  }
  function fillDone() {
    var dl = $('[data-done-sum]', flow); if (!dl) return;
    var r = rows().map(function (x) { return [x[1], x[2]]; });
    r.push(['Phone', S.a.phone || ''], ['Name', S.f.name || ''], ['Email', S.f.email || '']);
    dl.innerHTML = r.filter(function (x) { return x[1]; }).map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('');
  }
  function progress() {
    var n = rows().filter(function (x) { return x[0]; }).length;
    var ok = phoneIn && phoneOk(phoneIn.value);
    var t = $('[data-progress-text]', flow), bar = $('[data-progress-bar]', flow);
    if (t) t.textContent = ok ? 'All filled in: ready to finish' : 'Almost done: one field left';
    if (bar) bar.style.width = Math.round(100 * (ok ? 1 : n / (n + 1))) + '%';
    var box = $('[data-progress]', flow); if (box) box.classList.toggle('is-ready', !!ok);
    $$('[data-finish]', flow).forEach(function (b) { b.setAttribute('aria-disabled', ok ? 'false' : 'true'); });
    var need = $('[data-need]', flow);
    if (need) need.textContent = ok ? 'Ready: your phone number is in.' : 'Add your phone number to finish.';
  }

  /* ---------- Moving on ---------- */
  function scrollBelowHeader(el) {
    /* On a desktop the live card stands beside the flow: when the question is near the top of the
       flow, land on the flow's top so the card and the answered lines are in view with it */
    var grid = $('.mf__grid');
    if (grid && window.innerWidth >= 1000 && el !== grid && el.getBoundingClientRect().top - grid.getBoundingClientRect().top < window.innerHeight * 0.45) el = grid;
    var head = $('[data-header]'), side = $('.mf__side');
    /* on a phone the price strip rides under the header: land the question below it */
    var strip = side && getComputedStyle(side).position === 'sticky' && window.innerWidth < 1000 ? side.offsetHeight : 0;
    var y = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - (head ? head.offsetHeight : 64) - strip - 24);
    if (window.__lenis) window.__lenis.scrollTo(y, { immediate: reduce, force: true });
    else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }
  function focusCurrent(scroll) {
    var el = $('[data-state="current"]', flow);
    if (!el) return;
    var t = $('.reg-step__q', el), stg = el.getAttribute('data-q');
    if (live && t) live.textContent = stg === 'finish' ? 'Almost done: ' + t.textContent + ', every answer filled in.' : stg === 'done' ? t.textContent : 'Next: ' + t.textContent;
    var r = el.getBoundingClientRect();
    if (scroll !== false && (r.top < 160 || r.top > window.innerHeight * 0.6)) scrollBelowHeader(el);
    var opt = $('.reg-opt:not([hidden]) input:not([disabled])', el);
    var target = stg === 'finish' || stg === 'done' ? t : opt;
    if (target) target.focus({ preventScroll: true });
  }
  function advance() { S.edit = null; save(); render(); focusCurrent(); }

  /* Radios: a tap answers and moves on; with the keyboard, arrows only choose and Space or Enter confirms */
  var lastKey = '';
  flow.addEventListener('pointerdown', function () { lastKey = 'pointer'; }, true);
  flow.addEventListener('keydown', function (e) {
    lastKey = e.key;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.type === 'radio') {
      e.preventDefault();
      e.target.checked = true; record(e.target); advance();
    }
  }, true);
  function record(r) {
    S.a[r.name] = r.value;
    S.stage = null;
    if (r.name === 'mtype' && r.value !== 'family') delete S.a.members;
  }
  $$('input[type="radio"]', flow).forEach(function (r) {
    r.addEventListener('change', function () {
      record(r);
      if (/^Arrow/.test(lastKey)) { S.edit = r.name; save(); render(); r.focus({ preventScroll: true }); return; }
      advance();
    });
    r.addEventListener('click', function () {
      if (S.edit === r.name && S.a[r.name] === r.value && lastKey === 'pointer') advance();
    });
  });
  flow.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-edit]');
    if (!b) return;
    S.edit = b.getAttribute('data-edit'); S.stage = null; save(); render(); focusCurrent();
  });

  /* ---------- The one form ---------- */
  var form = $('[data-q="finish"]', flow);
  var phoneErr = $('[data-err="phone"]', flow);
  function phoneError(on) { phoneErr.hidden = !on; phoneIn.setAttribute('aria-invalid', on ? 'true' : 'false'); }
  phoneIn.addEventListener('input', function () {
    var ok = phoneOk(phoneIn.value);
    S.a.phone = ok ? phoneFmt(phoneIn.value) : '';
    if (ok && !phoneErr.hidden) phoneError(false);
    save(); progress();
  });
  phoneIn.addEventListener('blur', function () {
    var v = phoneIn.value.trim();
    if (v && !phoneOk(v)) phoneError(true);
    else if (phoneOk(v)) phoneIn.value = phoneFmt(v);
  });
  nameIn.addEventListener('input', function () { S.f.name = nameIn.value.trim(); save(); });
  mailIn.addEventListener('input', function () { S.f.email = mailIn.value.trim(); save(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!phoneOk(phoneIn.value)) { phoneError(true); phoneIn.focus(); return; }
    phoneError(false); S.a.phone = phoneFmt(phoneIn.value);
    S.stage = 'done'; save(); render(); focusCurrent();
  });
  $('[data-restart]', flow).addEventListener('click', function () {
    S = fresh(); save();
    phoneIn.value = ''; nameIn.value = ''; mailIn.value = ''; phoneError(false);
    render(); scrollBelowHeader($('#join')); focusCurrent(false);
  });

  /* ---------- Into the flow: every Become a member, and Choose on a rate card ---------- */
  function begin(e) {
    e.preventDefault(); e.stopPropagation(); /* the site's own #anchor scroll would land on the section top */
    var el = $('[data-state="current"]', flow) || flow;
    scrollBelowHeader(el);
    /* Focus after the scroll settles so the screen reader lands on the question in view */
    setTimeout(function () { focusCurrent(false); }, reduce ? 0 : 450);
  }
  $$('a[href="#join"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var pick = a.getAttribute('data-mf-pick');
      if (pick) {
        if (S.a.mtype !== pick) delete S.a.members;
        S.a.season = 'indoor'; S.a.mtype = pick; S.edit = null;
        if (S.stage === 'done') S.stage = null;
        save(); render();
      }
      begin(e);
    });
  });
  render();
})();
