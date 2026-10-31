/* Membership page script (B8; b13: a guide to JustBookIt, where membership registration happens).
   Same pattern as the Register flow: one question at a time (season, membership, Vaughan resident,
   members in the household for a Family), answered questions fold into one line with Change, then
   the hand-off: every answer ticked, the steps on JustBookIt and one button, Continue on
   JustBookIt (new tab). The membership card beside the flow shows the rate as you answer;
   the rates sit on the radios (data-res, data-non), copied from content/membership.json, the
   resident rate already including the 15%. Plus HST, never computed here.
   A Couple is two members by definition, so the household question is asked only for a Family.
   Answers live in sessionStorage (tptc-membership). Every "Choose" on a rate card lands on the
   question you are on and focuses it; Become a member goes straight to JustBookIt (b13). */
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
  if (S.stage === 'done') S.stage = null; /* older sessions: the on-page request is gone (b13) */
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
      who.textContent = r === 'yes' ? '+ HST, Vaughan resident, 15% saved' : r === 'no' ? '+ HST, non-resident. Vaughan residents pay $' + p.res + '.' : '+ HST, Vaughan resident rate. Non-resident $' + p.non + '.';
    }
    res.textContent = r === 'yes' ? 'Yes' : r === 'no' ? 'No' : ' ';
    mem.textContent = membersText() || ' ';
    card.classList.toggle('is-set', !!(p && r));
    if (!reduce && p) { card.classList.remove('is-tick'); void card.offsetWidth; card.classList.add('is-tick'); }
  }

  /* ---------- Rendering ---------- */
  var steps = $$('[data-q]', flow);
  function render() {
    var s = seq(), cur = current();
    var order = s.concat(['finish']);
    var ci = order.indexOf(cur);
    var end = cur === 'finish';
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
    fillSum(); fillPath(); fillCard();
  }
  function rows() {
    var r = [];
    seq().forEach(function (q) { if (S.a[q]) r.push([q, KEYS[q], answerText(q)]); });
    if (S.a.mtype === 'couple') r.push(['', 'Members', membersText()]);
    var pt = priceText(); if (pt) r.push(['', 'Rate', pt]);
    return r;
  }
  function fillSum() {
    var ul = $('[data-sum]', flow); if (!ul) return;
    ul.innerHTML = rows().map(function (x) {
      return '<li class="reg-sum__row"><span class="reg-sum__tick" aria-hidden="true"></span><span class="reg-sum__k">' + x[1] + '</span><span class="reg-sum__v">' + esc(x[2]) + '</span>' +
        (x[0] ? '<button class="reg-step__edit" type="button" data-edit="' + x[0] + '">Change<span class="sr-only"> ' + SR[x[0]] + '</span></button>' : '<span></span>') + '</li>';
    }).join('');
  }
  /* b13: the steps on JustBookIt, with this membership's own choice */
  function fillPath() {
    var ol = $('[data-mf-path]', flow); if (!ol) return;
    var m = S.a.mtype;
    var cat = m === 'couple' ? 'Couple' : m === 'family' ? 'Family' : m ? 'Single, then your category: ' + optLabel('mtype', m) : 'Single, Couple or Family (Single covers Adult, Junior and Senior)';
    var st = ['TPTC Membership Registration (or TPTC Membership Renewal if you were a member before)', 'Choose ' + cat, 'Your category goes by age as of Jan 1', 'Pay online'];
    ol.innerHTML = st.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
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
    if (live && t) live.textContent = stg === 'finish' ? t.textContent + ': every answer in.' : 'Next: ' + t.textContent;
    var r = el.getBoundingClientRect();
    if (scroll !== false && (r.top < 160 || r.top > window.innerHeight * 0.6)) scrollBelowHeader(el);
    var opt = $('.reg-opt:not([hidden]) input:not([disabled])', el);
    var target = stg === 'finish' ? t : opt;
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

  /* ---------- The hand-off ---------- */
  var jbi = $('[data-mf-jbi]', flow);
  if (jbi) jbi.addEventListener('click', function () { var o = $('[data-mf-opened]', flow); if (o) o.hidden = false; });
  $('[data-restart]', flow).addEventListener('click', function () {
    S = fresh(); save();
    var o = $('[data-mf-opened]', flow); if (o) o.hidden = true;
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
        save(); render();
      }
      begin(e);
    });
  });
  render();
})();
