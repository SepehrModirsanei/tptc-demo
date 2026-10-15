/* TPTC Direction C: interface behaviour. Runs with or without the motion libraries.
   No scroll listeners: state that depends on scroll uses IntersectionObserver. */
(function () {
  'use strict';
  var doc = document;
  var root = doc.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };

  /* ---------- One copyright line, year computed ---------- */
  $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Header: background layer fades in after 40px of scroll ---------- */
  var header = $('[data-header]');
  if (header && 'IntersectionObserver' in window) {
    var sentinel = doc.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:40px;pointer-events:none;';
    doc.body.insertBefore(sentinel, doc.body.firstChild);
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-scrolled', !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* ---------- Desktop dropdowns: disclosure pattern, keyboard operable ---------- */
  var triggers = $$('.nav__trigger');
  function panelOf(t) { return doc.getElementById(t.getAttribute('aria-controls')); }
  function linksOf(t) { return $$('a', panelOf(t)); }
  function setPanel(t, open) {
    t.setAttribute('aria-expanded', open ? 'true' : 'false');
    panelOf(t).classList.toggle('is-open', open);
    if (header) header.classList.toggle('is-open', triggers.some(function (x) { return x.getAttribute('aria-expanded') === 'true'; }));
  }
  function closeAll(except) { triggers.forEach(function (t) { if (t !== except) setPanel(t, false); }); }
  triggers.forEach(function (t) {
    var li = t.closest('.has-panel');
    var timer = 0;
    t.addEventListener('click', function () {
      var open = t.getAttribute('aria-expanded') !== 'true';
      closeAll(t); setPanel(t, open);
    });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); closeAll(t); setPanel(t, true); var l = linksOf(t); if (l[0]) l[0].focus(); }
      if (e.key === 'Escape') { setPanel(t, false); }
    });
    panelOf(t).addEventListener('keydown', function (e) {
      var links = linksOf(t); var i = links.indexOf(doc.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); setPanel(t, false); t.focus(); return; }
      if (i < 0) return;
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = links[(i + 1) % links.length];
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = links[(i - 1 + links.length) % links.length];
      if (e.key === 'Home') next = links[0];
      if (e.key === 'End') next = links[links.length - 1];
      if (next) { e.preventDefault(); next.focus(); }
    });
    li.addEventListener('focusout', function (e) {
      if (!li.contains(e.relatedTarget)) setPanel(t, false);
    });
    li.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer);
      timer = setTimeout(function () { closeAll(t); setPanel(t, true); }, 90);
    });
    li.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer);
      timer = setTimeout(function () { setPanel(t, false); }, 200);
    });
  });
  doc.addEventListener('click', function (e) {
    if (!e.target.closest('.has-panel')) closeAll(null);
  });

  /* ---------- Mobile nav: full-height sheet, focus trapped, Esc closes ---------- */
  var mbtn = $('.menu-btn');
  var mnav = doc.getElementById('mnav');
  function focusables(el) {
    return $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', el)
      .filter(function (x) { return x.offsetParent !== null || x === doc.activeElement; });
  }
  function openNav() {
    mnav.hidden = false;
    void mnav.offsetHeight;
    mnav.classList.add('is-open');
    mbtn.setAttribute('aria-expanded', 'true');
    doc.body.classList.add('is-locked');
    if (window.__lenis) window.__lenis.stop();
    setTimeout(function () { var c = $('[data-close]', mnav); if (c) c.focus(); }, 60);
  }
  function closeNav(returnFocus) {
    mnav.classList.remove('is-open');
    mbtn.setAttribute('aria-expanded', 'false');
    doc.body.classList.remove('is-locked');
    if (window.__lenis) window.__lenis.start();
    var done = function () { if (!mnav.classList.contains('is-open')) mnav.hidden = true; };
    if (reduce.matches) done(); else setTimeout(done, 260);
    if (returnFocus !== false) mbtn.focus();
  }
  if (mbtn && mnav) {
    mbtn.addEventListener('click', function () { mbtn.getAttribute('aria-expanded') === 'true' ? closeNav() : openNav(); });
    $('[data-close]', mnav).addEventListener('click', function () { closeNav(); });
    mnav.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeNav(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables(mnav); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    $$('.mnav__link[aria-controls]', mnav).forEach(function (b) {
      b.addEventListener('click', function () {
        var open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        doc.getElementById(b.getAttribute('aria-controls')).hidden = !open;
      });
    });
    $$('a', mnav).forEach(function (a) {
      a.addEventListener('click', function () { if (a.getAttribute('href').charAt(0) === '#') closeNav(false); });
    });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', function (m) {
      if (m.matches && mbtn.getAttribute('aria-expanded') === 'true') closeNav(false);
    });
  }

  /* ---------- Live status: computed in the browser from published dates ---------- */
  function fmt(d) {
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }).replace('.', '');
  }
  /* A chip with only an end (data-live-end) is already running, e.g. the indoor season ("early October") */
  $$('[data-live-start], [data-live-end]').forEach(function (chip) {
    var s = chip.hasAttribute('data-live-start') ? new Date(chip.getAttribute('data-live-start') + 'T00:00:00') : new Date(0);
    var e = new Date(chip.getAttribute('data-live-end') + 'T23:59:59');
    var now = new Date();
    var label = $('[data-live-label]', chip);
    if (now >= s && now <= e) return; /* live: keep the chip and its Pulse */
    chip.classList.remove('chip--live');
    var dot = $('.live-dot', chip); if (dot) dot.remove();
    label.textContent = now < s ? 'Starts ' + fmt(s) : 'Ended ' + fmt(e);
  });
  /* Pulse replays once on hover or focus of its parent (2 iterations, then rests) */
  $$('[data-pulse-parent]').forEach(function (p) {
    var chip = $('.chip--live', p); if (!chip) return;
    var replay = function () { chip.classList.toggle('is-replay'); };
    p.addEventListener('pointerenter', replay);
    p.addEventListener('focusin', replay);
  });
  /* Pulse starts the first time its chip is actually seen, not at page load */
  var pulses = $$('.chip--live');
  if ('IntersectionObserver' in window && pulses.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-seen'); io.unobserve(en.target); }
      });
    }, { threshold: 0.9 });
    pulses.forEach(function (c) { io.observe(c); });
  } else {
    pulses.forEach(function (c) { c.classList.add('is-seen'); });
  }

  /* ---------- Find your program: the P2 chooser, built only from published ranges.
     One question at a time, the same four-question path as the full site (Batch 5). ---------- */
  var chooser = $('[data-chooser]');
  if (chooser) {
    var doors = $$('[data-door]');
    var resultBox = $('[data-result]', chooser);
    var restart = $('[data-restart]', chooser);
    var q = function (name) { return $('[data-q="' + name + '"]', chooser); };
    var val = function (name) { var i = $('input[name="' + name + '"]:checked', chooser); return i ? i.value : null; };
    /* The specimen has two pages, so only High Performance is a real address; the full site
       carries every route. Questions and suggestions are the full site's, word for word. */
    var R = { junior: '#', adult: '#', 'high-performance': 'high-performance.html', 'private-lessons': '#', camps: '#',
              'camps-summer': '#', 'camps-march-break': '#', 'camps-holiday': '#' };
    var ORDER = ['who', 'adultway', 'age', 'when', 'goal', 'season'];
    var HP = R['high-performance'];
    var arrow = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-arrow"/></svg>';
    function show(name, on) { var f = q(name); if (f) f.hidden = !on; }
    function clearResult() {
      resultBox.hidden = true; resultBox.innerHTML = '';
      doors.forEach(function (d) { d.classList.remove('is-dim', 'is-match'); });
    }
    function recommend() {
      var who = val('who'), way = val('adultway'), age = val('age'), when = val('when'), goal = val('goal'), season = val('season');
      if (who === 'adult') {
        if (way === 'group') return { door: 'adult', title: 'Adult Programs', line: 'Group lessons, round robins, house leagues and interclub teams, each with its own next step.', href: R.adult, cta: 'See Adult Programs', alt: { href: R['private-lessons'], text: 'Private Lessons' } };
        if (way === 'private') return { door: null, title: 'Private Lessons', line: 'One hour with a coach, private or semi-private, booked at a time that suits you.', href: R['private-lessons'], cta: 'See Private Lessons' };
        return null;
      }
      if (!(who && age && when)) return null;
      if (when === 'private') return { door: null, title: 'Private Lessons', line: 'One hour with a coach, private or semi-private, for juniors and adults.', href: R['private-lessons'], cta: 'See Private Lessons' };
      if (when === 'camp') {
        if (!season) return null;
        var C = {
          summer: { title: 'Summer Camps', line: 'Recreational Camp, Little Champs, Transition Tour and Pro National camps, at three locations. Camp ages differ from lesson ages, so check each camp.', href: R['camps-summer'], cta: 'See Summer Camps' },
          march: { title: 'March Break Camp', line: 'Monday to Friday of the March Break, registered day by day. Camp ages differ from lesson ages, so check each camp.', href: R['camps-march-break'], cta: 'See March Break Camp' },
          holiday: { title: 'Holiday Camps', line: 'Weekdays over the winter break, registered day by day. Camp ages differ from lesson ages, so check each camp.', href: R['camps-holiday'], cta: 'See Holiday Camps' }
        }[season];
        C.door = 'camps'; C.alt = { href: R.camps, text: 'Camps' };
        return C;
      }
      if (!goal) return null;
      var junior = R.junior;
      if (goal === 'learn') return { door: 'junior', title: 'Junior Recreational, ages ' + age, line: 'Choose a level on the next page: Beginner, Intermediate or Advanced. New players can ask for a free assessment.', href: junior, cta: 'See Junior Recreational' };
      if (age === '4-6') return { door: 'junior', title: 'Junior Recreational, ages 4-6', line: 'Little Champs, the first High Performance step, starts at age 6. Until then, recreational lessons build the base.', href: junior, cta: 'See Junior Recreational', alt: { href: HP + '#little-champs', text: 'Little Champs' } };
      if (age === '7-9') return { door: 'hp', title: 'Little Champs, ages 6-9', line: 'For players looking to compete, or already competing, in OTA U9 or U10 events. An assessment is required.', href: HP + '#little-champs', cta: 'See Little Champs' };
      if (age === '10-13') return { door: 'hp', title: 'Transition Tour, ages 10-15', line: 'For players competing in provincial events such as Future Stars and Rookies. An assessment is required.', href: HP + '#transition-tour', cta: 'See Transition Tour' };
      return { door: 'hp', title: 'Transition Tour or Pro National', line: 'Transition Tour runs to age 15. Pro National is for provincial and national level players, by pre-approval from the Head Pro.', href: HP + '#pro-national', cta: 'See Pro National', alt: { href: HP + '#transition-tour', text: 'Transition Tour' } };
    }
    function update() {
      var who = val('who'), child = who === 'child', when = val('when');
      show('adultway', who === 'adult');
      show('age', child);
      show('when', child && !!val('age'));
      show('goal', child && !!val('age') && when === 'weekly');
      show('season', child && !!val('age') && when === 'camp');
      restart.hidden = !who;
      var r = recommend();
      if (!r) { clearResult(); return; }
      resultBox.innerHTML =
        '<p class="label">Our suggestion</p>' +
        '<p class="h3">' + r.title + '</p>' +
        '<p class="small">' + r.line + '</p>' +
        '<div class="chooser__result-actions">' +
          '<a class="link" href="' + r.href + '"><span class="link__text">' + r.cta + '</span>' + arrow + '</a>' +
          (r.alt ? '<a class="link link--quiet" href="' + r.alt.href + '"><span class="link__text">Or ' + r.alt.text + '</span></a>' : '') +
        '</div>';
      resultBox.hidden = false;
      doors.forEach(function (d) {
        var m = r.door && d.getAttribute('data-door') === r.door;
        d.classList.toggle('is-match', !!m);
        d.classList.toggle('is-dim', !!r.door && !m);
      });
    }
    chooser.addEventListener('change', function (e) {
      /* changing an earlier answer clears the later ones */
      var i = ORDER.indexOf(e.target.name);
      ORDER.slice(i + 1).forEach(function (n) { $$('input[name="' + n + '"]', chooser).forEach(function (x) { x.checked = false; }); });
      update();
      var nextQ = ORDER.slice(i + 1).map(q).filter(function (f) { return f && !f.hidden; })[0];
      if (nextQ) { var first = $('input', nextQ); if (first && e.target.matches(':focus-visible')) first.focus(); }
    });
    chooser.addEventListener('submit', function (e) { e.preventDefault(); });
    restart.addEventListener('click', function () {
      $$('input', chooser).forEach(function (x) { x.checked = false; });
      update();
      var f = $('input', chooser); if (f) f.focus();
    });
  }

  /* ---------- Segmented tier switcher (membership option), price crossfade ---------- */
  $$('[data-tiers]').forEach(function (box) {
    var tabs = $$('[role="radio"]', box);
    var ind = $('.seg__ind', box);
    var out = $$('[data-tier-out]', box);
    var data = JSON.parse(box.getAttribute('data-tiers'));
    function moveInd(i) {
      if (!ind) return;
      ind.style.width = tabs[i].offsetWidth + 'px';
      ind.style.transform = 'translateX(' + tabs[i].offsetLeft + 'px)';
    }
    function current() { return Math.max(0, tabs.findIndex(function (t) { return t.getAttribute('aria-checked') === 'true'; })); }
    function select(i, focus) {
      var same = i === current() && box.classList.contains('is-ready');
      tabs.forEach(function (t, j) { t.setAttribute('aria-checked', i === j ? 'true' : 'false'); t.tabIndex = i === j ? 0 : -1; });
      moveInd(i);
      if (focus) tabs[i].focus();
      if (same) return;
      var d = data[i];
      out.forEach(function (o) {
        var key = o.getAttribute('data-tier-out');
        o.classList.add('is-swapping');
        setTimeout(function () { o.textContent = d[key]; o.classList.remove('is-swapping'); }, reduce.matches ? 0 : 140);
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i); });
      t.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
        if (n !== null) { e.preventDefault(); select(n, true); }
      });
    });
    requestAnimationFrame(function () { moveInd(current()); requestAnimationFrame(function () { box.classList.add('is-ready'); }); });
    window.addEventListener('resize', function () { moveInd(current()); });
  });

  /* ---------- FAQ accordion: button + aria-expanded, answer fades and rises 8px ---------- */
  $$('.acc__btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      var p = doc.getElementById(b.getAttribute('aria-controls'));
      p.hidden = !open;
    });
  });

  /* Magnetic buttons removed in the frontend-design pass (energy.md 3.10 bans them). */

})();

/* ---------- B8 (16 Oct 2026): synced word for word from the site, js/pages/home.js and
   js/pages/high-performance.js. Each block returns at once on a page without its markup. ---------- */
/* What's happening: each card carries its last day (data-ends="YYYY-MM-DD"). A card whose last
   day has passed is hidden, read against today's date in the visitor's browser, so the section
   always leads with what is running now. If the lead card itself is over, it is hidden too and the
   rows carry the section. No dates live in this script. */
(function () {
  'use strict';
  var box = document.querySelector('[data-happen]');
  if (!box) return;
  var today = new Date();
  Array.prototype.forEach.call(box.querySelectorAll('[data-ends]'), function (card) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(card.getAttribute('data-ends') || '');
    if (!m) return;
    var end = new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59);
    if (today > end) { card.hidden = true; card.setAttribute('data-ended', ''); }
  });
})();

/* B7, Why TPTC: the slideshow. The slides are a scroll-snap strip that works without script
   (swipe or scroll). Script adds previous/next, one dot per slide, a pause button and a slow
   autoplay. Autoplay never starts under reduced motion; it waits while the pointer or focus is in
   the slideshow and while it is off screen; the pause button stops it until pressed again.
   Arrow keys move one slide while focus is inside. */
(function () {
  'use strict';
  var root = document.querySelector('[data-show]');
  if (!root) return;
  var track = root.querySelector('[data-show-track]');
  var slides = track.children;
  var n = slides.length;
  var dots = root.querySelectorAll('[data-show-dot]');
  var toggle = root.querySelector('[data-show-toggle]');
  var bar = root.querySelector('[data-show-bar]');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DWELL = 6000;
  var i = 0, timer = null, playing = !reduce, held = false, visible = false;

  bar.hidden = false;
  root.classList.add('show--js');

  function mark() {
    for (var k = 0; k < dots.length; k++) {
      if (k === i) dots[k].setAttribute('aria-current', 'true'); else dots[k].removeAttribute('aria-current');
    }
    for (var s = 0; s < n; s++) slides[s].setAttribute('aria-hidden', s === i ? 'false' : 'true');
    for (var s2 = 0; s2 < n; s2++) {
      Array.prototype.forEach.call(slides[s2].querySelectorAll('a, button'), function (el) { el.tabIndex = s2 === i ? 0 : -1; });
    }
  }
  function go(k, user) {
    i = (k + n) % n;
    track.scrollTo({ left: i * track.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    mark();
    if (user) restart();
  }
  function tick() { go(i + 1, false); }
  function stop() { clearInterval(timer); timer = null; }
  function restart() { stop(); if (playing && !held && visible) timer = setInterval(tick, DWELL); }
  function setPlaying(p) {
    playing = p;
    root.classList.toggle('is-paused', !p);
    toggle.setAttribute('aria-label', p ? 'Pause slideshow' : 'Play slideshow');
    restart();
  }

  root.querySelector('[data-show-prev]').addEventListener('click', function () { go(i - 1, true); });
  root.querySelector('[data-show-next]').addEventListener('click', function () { go(i + 1, true); });
  Array.prototype.forEach.call(dots, function (d) {
    d.addEventListener('click', function () { go(+d.getAttribute('data-show-dot'), true); });
  });
  toggle.addEventListener('click', function () { setPlaying(!playing); });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1, true); }
  });
  root.addEventListener('mouseenter', function () { held = true; restart(); });
  root.addEventListener('mouseleave', function () { held = false; restart(); });
  root.addEventListener('focusin', function () { held = true; restart(); });
  root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) { held = false; restart(); } });

  /* a swipe or a scroll by hand moves the dots with it */
  var raf = 0;
  track.addEventListener('scroll', function () {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      var k = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (k !== i && k >= 0 && k < n) { i = k; mark(); }
    });
  }, { passive: true });
  window.addEventListener('resize', function () { track.scrollTo({ left: i * track.clientWidth, behavior: 'auto' }); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; restart(); }, { threshold: 0.4 }).observe(root);
  } else { visible = true; }
  mark();
  setPlaying(playing);
})();

/* Which step (b7): one question at a time, like Home's program finder. Age first; then where
   the player's game is now; then one result card: the step, its published facts, its first
   action. Story: a draw sheet read one round at a time; the card is the player's line in the draw.
   Facts only from the club's High Performance page (content/programs.json). */
(function () {
  var f = document.querySelector('[data-hpf]');
  if (!f) return;
  var $ = function (s) { return f.querySelector(s); };
  var box = $('[data-hpf-result]'), restart = $('[data-hpf-restart]'), play = $('[data-q="play"]');
  var coaches = f.getAttribute('data-coaches'), junior = f.getAttribute('data-junior');
  var ico = function (n) { return '<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-' + n + '"/></svg>'; };
  var arrow = ico('arrow');
  var head = '<a class="inline-link" href="' + coaches + '">Head Pro Josh Borenstein</a>';
  var mail = function (subj) { return 'mailto:info@thornhillparktennisclub.ca?subject=' + encodeURIComponent(subj); };
  var R = {
    lc: { n: '01', name: 'Little Champs', gate: 'Assessment required', facts: [['junior', 'Ages 6-9'], ['court', 'Three-quarter court, orange or green dot ball'], ['trophy', 'OTA tournaments at U9 or U10']],
      act: ['Request an assessment', mail('High Performance assessment')], see: '#little-champs', how: 'An assessment with ' + head + ', then register with your code.' },
    tt: { n: '02', name: 'Transition Tour', gate: 'Assessment required', facts: [['junior', 'Ages 10-15'], ['court', 'Full court, regular ball'], ['trophy', 'Provincial events, such as Future Stars and Rookies']],
      act: ['Request an assessment', mail('High Performance assessment')], see: '#transition-tour', how: 'An assessment with ' + head + ', then register with your code.' },
    pn: { n: '03', name: 'Pro National', gate: 'Pre-approval required', facts: [['pathway', 'Provincial and national level players only'], ['racquet', 'Tennis and fitness'], ['location', 'Yonge &amp; Centre']],
      act: ['Ask about pre-approval', mail('Pro National pre-approval')], see: '#pro-national', how: 'Pre-approval by ' + head + ' before registering.' },
    rec: { n: '', name: 'Junior Recreational first', gate: 'Free assessment', facts: [['junior', 'Ages 4-17'], ['ball', 'Beginner to Advanced'], ['calendar', 'Group lessons in multi-week sessions']],
      act: ['See Junior Recreational', junior], see: '#pathway', how: 'High Performance starts when your player is ready to compete.' }
  };
  function val(n) { var i = f.querySelector('input[name="' + n + '"]:checked'); return i ? i.value : null; }
  function pick() {
    var a = val('age'), p = val('play');
    if (a === '5') return ['rec', 'Little Champs starts at age 6.'];
    if (!p) return null;
    if (p === 'learn') return ['rec', ''];
    if (p === 'nat') return ['pn', ''];
    if (a === '6-9') return ['lc', ''];
    if (a === '10-15') return ['tt', ''];
    return ['pn', 'Transition Tour runs to age 15.'];
  }
  function update(focusNext) {
    var a = val('age');
    play.hidden = !a || a === '5';
    if (play.hidden) Array.prototype.forEach.call(play.querySelectorAll('input'), function (i) { i.checked = false; });
    restart.hidden = !a;
    var r = pick();
    if (!r) { box.hidden = true; box.innerHTML = ''; if (focusNext && !play.hidden) play.querySelector('input').focus(); return; }
    var d = R[r[0]];
    box.innerHTML =
      '<div class="hpf__top">' + (d.n ? '<span class="hpf__n num" aria-hidden="true">' + d.n + '</span>' : '') +
        '<div><p class="label">Your player&rsquo;s step</p><p class="hpf__name">' + d.name + '</p></div>' +
        '<span class="chip">' + d.gate + '</span></div>' +
      '<ul class="hpf__facts" role="list">' + d.facts.map(function (x) { return '<li>' + ico(x[0]) + '<span>' + x[1] + '</span></li>'; }).join('') + '</ul>' +
      (r[1] ? '<p class="small hpf__note">' + r[1] + '</p>' : '') +
      '<p class="small hpf__how">' + d.how + '</p>' +
      '<div class="hpf__acts"><a class="btn btn--ink" href="' + d.act[1] + '"><span class="btn__fill" aria-hidden="true"></span><span class="btn__label"><span>' + d.act[0] + '</span><span aria-hidden="true">' + d.act[0] + '</span></span></a>' +
      (r[0] !== 'rec' ? '<a class="link" href="' + d.see + '"><span class="link__text">See ' + d.name + '</span>' + arrow + '</a>' : '<a class="link" href="#pathway"><span class="link__text">See the three steps</span>' + arrow + '</a>') + '</div>';
    box.hidden = false;
  }
  f.addEventListener('change', function (e) {
    if (e.target.name === 'age') Array.prototype.forEach.call(play.querySelectorAll('input'), function (i) { i.checked = false; });
    update(e.target.name === 'age' && e.target.matches(':focus-visible'));
  });
  f.addEventListener('submit', function (e) { e.preventDefault(); });
  restart.addEventListener('click', function () {
    Array.prototype.forEach.call(f.querySelectorAll('input'), function (i) { i.checked = false; });
    update(); var i = f.querySelector('input'); if (i) i.focus();
  });
  update();
})();


/* B8, specimen only: a link with href="#" leads to a page this specimen does not include. Instead of
   doing nothing (or jumping to the top), it says so in a short note that a screen reader also hears,
   and the note leaves on its own after a few seconds or on Escape. */
(function () {
  'use strict';
  var note = null, t = null;
  function hide() { if (note) note.hidden = true; clearTimeout(t); }
  function show(text) {
    if (!note) {
      note = document.createElement('p');
      note.className = 'deadnote';
      note.setAttribute('role', 'status');
      note.hidden = true;
      document.body.appendChild(note);
    }
    note.textContent = '';
    note.hidden = false;
    /* set the words after the region is shown, so the status is announced each time */
    requestAnimationFrame(function () { note.textContent = text; });
    clearTimeout(t);
    t = setTimeout(hide, 4500);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#"]');
    if (!a) return;
    e.preventDefault();
    var what = (a.textContent || '').replace(/\s+/g, ' ').trim();
    show((what ? '\u201C' + what + '\u201D' : 'This page') + ' is not part of this design specimen.');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
})();
