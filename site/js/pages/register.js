/* Register page script (b7, end reworked in b8): one question at a time, then one filled form.
   Story: registering is the first serve of your season. Who is playing: the toss. What for: the
   ball crosses the net. Finish: the bounce, inside the service box.
   Flow: who, what, the program's detail questions, registered before, then "Your registration":
   every answer filled in and ticked (Change reopens it), and the phone number as the only empty
   required field. With a valid phone: finish here (demo, sends nothing) or, quieter, on
   JustBookIt (new tab) with the same answers in view. Private lessons: the summary, then Call the
   front desk. Leagues: the summary, then their own sign-up. Every answer lives in sessionStorage
   (tptc-register), so going back never loses it. */
(function () {
  'use strict';
  var doc = document;
  var flow = doc.querySelector('[data-reg-flow]');
  if (!flow) return;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var KEY = 'tptc-register';
  var JBI = 'https://justbookit.ca/imgr/srv/PreEnroll.do?tla=thp';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var court = $('[data-pc]');
  var cap = $('[data-pc-cap]');
  var live = $('[data-reg-live]', flow);

  var WHAT = {
    junior: 'Junior group lessons', hp: 'High Performance', 'pro-national': 'Pro National', camps: 'Camps',
    adult: 'Adult group lessons', membership: 'Membership', private: 'Private Lessons', leagues: 'Leagues & Events'
  };
  var DETAILS = { junior: ['age', 'level'], adult: ['level'], hp: ['hpstep'], 'pro-national': [], camps: ['camp'], membership: ['mtype'], private: ['ptype'], leagues: [] };
  var JBI_ROUTES = ['junior', 'adult', 'hp', 'pro-national', 'camps', 'membership'];
  var QUESTIONS = ['who', 'what', 'age', 'level', 'hpstep', 'camp', 'mtype', 'ptype', 'before'];
  var KEYS = { who: 'Player', what: 'Program', age: 'Age', level: 'Level', hpstep: 'Step', camp: 'Camp', mtype: 'Membership', ptype: 'Lesson', before: 'With the club' };
  var SR = { who: 'who is playing', what: 'what you are registering for', age: 'age', level: 'level', hpstep: 'step', camp: 'camp', mtype: 'membership', ptype: 'lesson type', before: 'registered before' };
  var SEASON = { junior: 'Fall & Winter Indoor 2026/27', adult: 'Fall & Winter Indoor 2026/27', hp: 'Fall & Winter Indoor 2026/27', 'pro-national': 'Fall & Winter Indoor 2026/27', membership: 'Fall & Winter Indoor 2026/27', camps: '2027, dates to be confirmed by the club', private: 'Arranged with your coach' };

  /* ---------- State ---------- */
  var S = load() || fresh();
  if (S.stage === 'form') S.stage = null; /* b7 sessions: the separate form is gone */
  function fresh() { return { a: {}, f: {}, stage: null, edit: null }; }
  function load() {
    try { var v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v && v.a ? v : null; } catch (e) { return null; }
  }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private window: the flow still works */ } }

  function seq() {
    var s = ['who', 'what'];
    var w = S.a.what;
    if (w && DETAILS[w]) s = s.concat(DETAILS[w]);
    if (w && JBI_ROUTES.indexOf(w) !== -1) s.push('before');
    return s;
  }
  function answered(q) { return !!S.a[q]; }
  function current() {
    var s = seq();
    if (S.edit && s.indexOf(S.edit) !== -1) return S.edit;
    for (var i = 0; i < s.length; i++) if (!answered(s[i])) return s[i];
    return S.stage || 'finish';
  }

  /* ---------- Phone ---------- */
  function phoneDigits(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return d;
  }
  function phoneOk(v) { var d = phoneDigits(v); return d.length === 10 && /[2-9]/.test(d.charAt(0)); }
  function phoneFmt(v) { var d = phoneDigits(v); return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6); }

  /* ---------- Labels ---------- */
  function optLabel(q, v) {
    var i = $('input[name="' + q + '"][value="' + v + '"]', flow);
    var n = i && $('.reg-opt__name', i.parentNode);
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : v;
  }
  function answerText(q) {
    var v = S.a[q];
    if (!v) return '';
    if (q === 'age') return 'Ages ' + v;
    return optLabel(q, v);
  }
  function programText() {
    var w = S.a.what; if (!w) return '';
    var bits = [WHAT[w]];
    if (w === 'junior' && S.a.age) bits.push('ages ' + S.a.age);
    if ((w === 'junior' || w === 'adult') && S.a.level) bits.push(S.a.level === 'unsure' ? 'level after a free assessment' : optLabel('level', S.a.level));
    if (w === 'hp' && S.a.hpstep) bits.push(optLabel('hpstep', S.a.hpstep));
    if (w === 'camps' && S.a.camp) bits.push(optLabel('camp', S.a.camp));
    if (w === 'membership' && S.a.mtype) bits.push(optLabel('mtype', S.a.mtype));
    if (w === 'private' && S.a.ptype) bits.push(optLabel('ptype', S.a.ptype));
    return bits.join(', ');
  }

  /* ---------- The route inside JustBookIt ---------- */
  function jbiPath() {
    var w = S.a.what, first = S.a.before !== 'returning';
    var acct = first ? 'Choose first time registration and create your account' : 'Log in to your account';
    var tail = 'Agree to the terms, enroll and pay online';
    if (w === 'membership') return [first ? 'TPTC Membership Registration' : 'TPTC Membership Renewal', 'Single, Couple or Family', 'Your category: age as of Jan 1', 'Pay online'];
    if (w === 'camps') return [acct, 'Program registration, then Camps', 'Camps are listed by location', 'Select your camp days or weeks', tail];
    if (w === 'hp') return [acct, 'Program registration, then Group lessons', 'Select your class', 'Enter its assessment code', tail];
    if (w === 'pro-national') return [acct, 'Program registration, then Group lessons', 'Select your class', tail];
    return [acct, 'Program registration, then Group lessons', 'Filter by level, age and day', 'Select your class: its name gives the location', tail];
  }

  /* ---------- Rendering ---------- */
  var steps = $$('[data-q]', flow);
  var phoneIn = $('#reg-phone');
  var codeIn = $('#f-code');
  function render() {
    var s = seq(), cur = current();
    var order = s.concat(['finish', 'done']);
    var ci = order.indexOf(cur);
    var end = cur === 'finish' || cur === 'done';
    steps.forEach(function (el) {
      var q = el.getAttribute('data-q'), i = order.indexOf(q), st;
      if (i === -1) st = 'off';
      /* At the end every answer lives inside "Your registration", so the score line folds away */
      else if (end && QUESTIONS.indexOf(q) !== -1) st = 'off';
      else if (i < ci) st = QUESTIONS.indexOf(q) !== -1 ? 'done' : 'off';
      else if (i === ci) st = 'current';
      else st = QUESTIONS.indexOf(q) !== -1 && answered(q) ? 'done' : 'todo';
      el.setAttribute('data-state', st);
      var a = $('[data-a]', el);
      if (a) a.textContent = st === 'done' ? answerText(q) : '';
    });
    flow.setAttribute('data-stage', cur);

    /* Options that depend on earlier answers */
    $$('.reg-opt[data-who]', flow).forEach(function (o) {
      o.hidden = !!S.a.who && o.getAttribute('data-who').split(' ').indexOf(S.a.who) === -1;
    });
    var low = S.a.what === 'junior' && S.a.age ? parseInt(S.a.age, 10) : 99;
    $$('.reg-opt[data-level-min]', flow).forEach(function (o) {
      var off = low < parseInt(o.getAttribute('data-level-min'), 10);
      o.classList.toggle('is-off', off);
      $('input', o).disabled = off;
    });
    /* The radios show the saved answers */
    QUESTIONS.forEach(function (q) {
      $$('input[name="' + q + '"]', flow).forEach(function (i) { i.checked = S.a[q] === i.value; });
    });
    if (phoneIn && doc.activeElement !== phoneIn) phoneIn.value = S.a.phone || '';
    if (codeIn && doc.activeElement !== codeIn) codeIn.value = S.f.code || '';

    /* Finish: notes and ways for this route */
    var w = S.a.what || '';
    $$('[data-route]', flow).forEach(function (n) { n.hidden = n.getAttribute('data-route').split(' ').indexOf(w) === -1; });
    var show = { jbi: JBI_ROUTES.indexOf(w) !== -1, call: w === 'private', here: JBI_ROUTES.indexOf(w) !== -1, leagues: w === 'leagues' };
    $$('[data-way]', flow).forEach(function (el) { el.hidden = !show[el.getAttribute('data-way')]; });
    var path = $('[data-jbi-path]', flow);
    if (path) path.innerHTML = jbiPath().map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');

    /* Fields for this route, the ticked summary, the progress line */
    $$('[data-for-what]', flow).forEach(function (el) { el.hidden = el.getAttribute('data-for-what') !== w; });
    fillSum();
    fillDone();
    progress();

    /* The court: toss, net, bounce */
    var at = end ? 3 : S.a.what ? 2 : S.a.who ? 1 : 0;
    serve(at);
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* "Your registration": one ticked row per answer, each with Change */
  function rows() {
    var r = [];
    seq().forEach(function (q) {
      if (!S.a[q]) return;
      var v = q === 'what' ? WHAT[S.a.what] : q === 'level' && S.a.level === 'unsure' ? 'Not sure: a free assessment places you' : answerText(q);
      r.push([q, KEYS[q], v]);
    });
    if (SEASON[S.a.what]) r.splice(2, 0, ['', 'Season', SEASON[S.a.what]]);
    return r;
  }
  function fillSum() {
    var ul = $('[data-sum]', flow); if (!ul) return;
    ul.innerHTML = rows().map(function (r) {
      return '<li class="reg-sum__row"><span class="reg-sum__tick" aria-hidden="true"></span><span class="reg-sum__k">' + r[1] + '</span><span class="reg-sum__v">' + esc(r[2]) + '</span>' +
        (r[0] ? '<button class="reg-step__edit" type="button" data-edit="' + r[0] + '">Change<span class="sr-only"> ' + SR[r[0]] + '</span></button>' : '<span></span>') + '</li>';
    }).join('');
  }
  function fillDone() {
    var dl = $('[data-done-sum]', flow); if (!dl) return;
    var r = [['Program', programText()], ['Season', SEASON[S.a.what] || ''], ['Player', S.a.who ? answerText('who') : ''],
      ['With the club', S.a.before ? answerText('before') : ''], ['Phone', S.a.phone || '']];
    if (S.a.what === 'hp') r.push(['Assessment code', S.f.code || '']);
    dl.innerHTML = r.filter(function (x) { return x[1]; }).map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('');
  }
  /* The progress line: every answer counts, the phone is the one left */
  function progress() {
    var w = S.a.what, n = rows().filter(function (r) { return r[0]; }).length;
    var jbi = JBI_ROUTES.indexOf(w) !== -1;
    var ok = jbi && phoneIn && phoneOk(phoneIn.value);
    var txt = jbi ? (ok ? 'All filled in: ready to finish' : 'Almost done: one field left')
      : w === 'private' ? 'Almost done: one call to book' : 'Almost done: pick your league';
    var t = $('[data-progress-text]', flow), bar = $('[data-progress-bar]', flow);
    if (t) t.textContent = txt;
    if (bar) bar.style.width = Math.round(100 * (ok ? 1 : n / (n + 1))) + '%';
    var box = $('[data-progress]', flow); if (box) box.classList.toggle('is-ready', !!ok);
    $$('[data-finish], [data-jbi]', flow).forEach(function (b) { b.setAttribute('aria-disabled', ok ? 'false' : 'true'); });
    var need = $('[data-need]', flow);
    if (need) need.textContent = ok ? 'Ready: your phone number is in.' : 'Add your phone number to finish.';
  }

  var caps = {
    0: 'Your first serve of the season.',
    1: 'The toss: who is playing.',
    2: 'Over the net: what you are registering for.',
    3: 'In the box: one field left.'
  };
  var timer = null;
  function serve(n) {
    if (!court) return;
    var was = +court.getAttribute('data-at');
    clearTimeout(timer);
    /* From the toss the serve travels through the net position on its way to the bounce */
    if (n === 3 && was < 2 && !reduce) {
      court.setAttribute('data-at', '2');
      timer = setTimeout(function () { court.setAttribute('data-at', '3'); }, 380);
    } else court.setAttribute('data-at', String(n));
    if (cap) cap.textContent = caps[n];
  }

  /* ---------- Moving on ---------- */
  function scrollBelowHeader(el, instant) {
    var strip = court && getComputedStyle(court).position === 'sticky' && window.innerWidth < 1000 ? court.offsetHeight : 0;
    var head = $('[data-header]');
    var y = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - (head ? head.offsetHeight : 64) - strip - 16);
    var jump = instant || reduce;
    if (window.__lenis) window.__lenis.scrollTo(y, { immediate: jump, force: true });
    else window.scrollTo({ top: y, behavior: jump ? 'auto' : 'smooth' });
  }
  function focusCurrent(scroll) {
    var el = $('[data-state="current"]', flow);
    if (!el) return;
    var t = $('.reg-step__q', el), stg = el.getAttribute('data-q');
    if (live && t) live.textContent = stg === 'finish' ? 'Almost done: ' + t.textContent + ', every answer filled in.' : stg === 'done' ? t.textContent : 'Next: ' + t.textContent;
    var r = el.getBoundingClientRect();
    if (scroll !== false && (r.top < 80 || r.top > window.innerHeight * 0.6)) scrollBelowHeader(el, false);
    var f = $('input:not([disabled]):not([type="hidden"]), [tabindex="-1"]', el);
    var opt = $('.reg-opt:not([hidden]) input:not([disabled])', el);
    /* The final form and the confirmation: focus their heading */
    var target = stg === 'finish' || stg === 'done' ? t : (opt || f);
    if (target) target.focus({ preventScroll: true });
  }
  function advance() { S.edit = null; save(); render(); focusCurrent(); }

  /* Radios: a tap answers and moves on. With the keyboard, arrows only choose; Space or Enter
     confirms, so the next question never jumps in while you are still choosing. */
  var lastKey = '';
  flow.addEventListener('pointerdown', function () { lastKey = 'pointer'; }, true);
  flow.addEventListener('keydown', function (e) {
    lastKey = e.key;
    if (e.key === 'Enter' && e.target.type === 'radio') {
      e.preventDefault();
      if (e.target.checked || (e.target.checked = true)) { record(e.target); advance(); }
    }
  }, true);
  function record(r) {
    var q = r.name, v = r.value;
    S.a[q] = v;
    S.stage = null;
    if (q === 'who') {
      var ok = $('.reg-opt[data-who] input[name="what"][value="' + S.a.what + '"]', flow);
      if (S.a.what && ok && ok.closest('.reg-opt').getAttribute('data-who').split(' ').indexOf(v) === -1) S.a.what = '';
    }
    if (q === 'age' && S.a.level) {
      var lv = $('.reg-opt[data-level-min] input[value="' + S.a.level + '"]', flow);
      if (lv && parseInt(v, 10) < parseInt(lv.closest('.reg-opt').getAttribute('data-level-min'), 10)) S.a.level = '';
    }
  }
  $$('input[type="radio"]', flow).forEach(function (r) {
    r.addEventListener('change', function () {
      record(r);
      if (/^Arrow/.test(lastKey)) { S.edit = r.name; save(); render(); r.focus({ preventScroll: true }); return; }
      advance();
    });
    /* Reopened with Change and confirmed with the same answer: a tap on it moves on */
    r.addEventListener('click', function () {
      if (S.edit === r.name && S.a[r.name] === r.value && lastKey === 'pointer') advance();
    });
  });

  /* Change: reopen that question; later answers stay */
  flow.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-edit]');
    if (!b) return;
    S.edit = b.getAttribute('data-edit'); S.stage = null; save(); render(); focusCurrent();
  });

  /* Your registration: the phone number is the one field left */
  var form = $('[data-q="finish"]', flow);
  var phoneErr = $('[data-err="phone"]', flow);
  function phoneError(on) { phoneErr.hidden = !on; phoneIn.setAttribute('aria-invalid', on ? 'true' : 'false'); }
  /* Both ways need a valid phone: until then the buttons look unavailable and a press shows why */
  function needPhone() {
    if (phoneOk(phoneIn.value)) { phoneError(false); S.a.phone = phoneFmt(phoneIn.value); save(); return true; }
    phoneError(true); phoneIn.focus(); return false;
  }
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
  if (codeIn) codeIn.addEventListener('input', function () { S.f.code = codeIn.value.trim(); save(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (JBI_ROUTES.indexOf(S.a.what) === -1 || !needPhone()) return;
    S.stage = 'done';
    save(); render(); focusCurrent();
  });
  var jbiLink = $('[data-jbi]', flow);
  jbiLink.addEventListener('click', function (e) {
    if (!needPhone()) { e.preventDefault(); return; }
    /* The link opens JustBookIt in a new tab; this page keeps the answers and shows the route */
    var d = $('[data-jbi-details]', flow); if (d) d.open = true;
    var o = $('[data-jbi-opened]', flow); if (o) o.hidden = false;
  });

  /* Start again: clears every answer */
  $('[data-restart]', flow).addEventListener('click', function () {
    S = fresh(); save();
    phoneIn.value = ''; if (codeIn) codeIn.value = ''; phoneError(false);
    var o = $('[data-jbi-opened]', flow); if (o) o.hidden = true;
    render();
    scrollBelowHeader($('#start'), false);
    focusCurrent(false);
  });

  /* The hero's Start: to the question you are on */
  $$('[data-reg-begin]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var el = $('[data-state="current"]', flow) || $('#start');
      scrollBelowHeader(el, false);
      focusCurrent(false);
    });
  });

  /* ---------- ?for= from a program's own Register button (and age, level, season) ---------- */
  var q = new URLSearchParams(location.search);
  var map = {
    'junior': ['child', 'junior'], 'high-performance': ['child', 'hp'], 'pro-national': ['child', 'pro-national'],
    'camps': ['child', 'camps'], 'adult': ['adult', 'adult'], 'membership': ['adult', 'membership'],
    'private-lessons': ['adult', 'private'], 'leagues': ['adult', 'leagues']
  };
  var f = map[q.get('for')];
  if (f) {
    if (S.a.what !== f[1]) { ['age', 'level', 'hpstep', 'camp', 'mtype', 'ptype'].forEach(function (k) { delete S.a[k]; }); }
    if (S.a.who !== f[0] && !(f[1] === 'membership' || f[1] === 'private' || f[1] === 'leagues')) S.a.who = f[0];
    if (!S.a.who) S.a.who = f[0];
    S.a.what = f[1];
    S.stage = null; S.edit = null;
    var age = q.get('age');
    if (f[1] === 'junior' && /^(4-6|7-9|10-13|14-17)$/.test(age || '')) S.a.age = age;
    var lvl = q.get('level');
    if ((f[1] === 'junior' || f[1] === 'adult') && /^(beginner|intermediate|advanced)$/.test(lvl || '')) S.a.level = lvl;
    var se = q.get('season');
    if (f[1] === 'camps' && /^(summer|march-break|holiday)$/.test(se || '')) S.a.camp = se;
    save();
    var label = programText();
    var box = $('[data-reg-context]', flow), chip = $('[data-reg-context-chip]', flow);
    if (box && chip) { chip.textContent = label; box.hidden = false; }
    var forLine = $('[data-reg-for]'), forWhat = $('[data-reg-for-what]');
    if (forLine && forWhat) { forWhat.textContent = label; forLine.hidden = false; }
    $$('[data-reg-begin-label]').forEach(function (s) { s.textContent = 'Continue'; });
  }
  render();
})();
