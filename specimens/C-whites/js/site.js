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
