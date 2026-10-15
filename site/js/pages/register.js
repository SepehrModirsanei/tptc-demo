/* Register page script: the two-choice flow, the handoff, the progress court, ?for= preselect.
   Story: registering is the first serve of your season. Who is playing: the toss. What for: the
   ball crosses the net. The route appears: the bounce, inside the service box. */
(function () {
  'use strict';
  var doc = document;
  var flow = doc.querySelector('[data-reg-flow]');
  if (!flow) return;
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var step2 = flow.querySelector('[data-step="2"]');
  var wait = flow.querySelector('[data-wait]');
  var panels = $$('.reg-go__panel', flow);
  var court = doc.querySelector('[data-pc]');
  var cap = doc.querySelector('[data-pc-cap]');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var timer = null;
  var caps = {
    0: 'Your first serve of the season: over the net, into the box.',
    1: 'Step 1 of 3, the toss: who is playing.',
    2: 'Step 2 of 3, over the net: what you are registering for.',
    3: 'Step 3 of 3, in: your route is ready. Continue to register.'
  };

  function at(n) {
    if (!court) return;
    var cur = +court.getAttribute('data-at');
    clearTimeout(timer);
    /* From the toss the serve travels through the net position on its way to the bounce */
    if (n === 3 && cur < 2 && !reduce) {
      court.setAttribute('data-at', '2');
      timer = setTimeout(function () { court.setAttribute('data-at', '3'); }, 380);
    } else court.setAttribute('data-at', String(n));
    if (cap) cap.textContent = caps[n];
  }

  function val(name) {
    var r = flow.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : '';
  }

  function update() {
    var who = val('who');
    step2.disabled = !who;
    if (wait) wait.hidden = !!who;
    $$('.reg-opt[data-who]', step2).forEach(function (o) {
      var show = !who || o.getAttribute('data-who').split(' ').indexOf(who) !== -1;
      o.hidden = !show;
      var i = o.querySelector('input');
      if (!show && i.checked) i.checked = false;
    });
    var what = val('what');
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-route') !== (what || 'none'); });
    at(what ? 3 : who ? 1 : 0);
  }

  /* Scroll so el's top sits below the sticky header and, on phones, the court strip under it.
     Lenis (fine pointers) owns the scroll when it runs; reduced motion jumps. */
  function scrollBelowHeader(el, instant) {
    var strip = court && getComputedStyle(court).position === 'sticky' && window.innerWidth < 1000 ? court.offsetHeight : 0;
    var head = doc.querySelector('[data-header]');
    var y = el.getBoundingClientRect().top + window.pageYOffset - (head ? head.offsetHeight : 64) - strip - 16;
    y = Math.max(0, y);
    var jump = instant || reduce;
    if (window.__lenis) window.__lenis.scrollTo(y, { immediate: jump, force: true });
    else window.scrollTo({ top: y, behavior: jump ? 'auto' : 'smooth' });
  }

  /* The answer, where the visitor is looking (QC M1): once a route exists, bring its panel into
     view and put focus on its first action. */
  function showRoute(instant) {
    var what = val('what');
    if (!what) return;
    var panel = flow.querySelector('.reg-go__panel[data-route="' + what + '"]');
    if (!panel) return;
    scrollBelowHeader(panel, instant);
    var act = panel.querySelector('.reg-go__acts a, .reg-go__acts button');
    if (act) act.focus({ preventScroll: true });
  }

  $$('input[type="radio"]', flow).forEach(function (r) {
    r.addEventListener('change', function () {
      update();
      if (r.name === 'what') showRoute(false);
    });
  });

  /* The hero's first choice (phones): a tap on "A child" or "An adult, or the family" answers step 1
     and lands on step 2. Without script the same link scrolls to that option. */
  $$('a[href="#who-child"], a[href="#who-adult"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var w = flow.querySelector('input[name="who"][value="' + a.getAttribute('href').slice(5) + '"]');
      if (!w) return;
      e.preventDefault();
      e.stopPropagation(); /* the site's own anchor scroll would stop at the option, under the strip */
      w.checked = true;
      update();
      var first = flow.querySelector('[data-step="1"]');
      if (first) scrollBelowHeader(first, false);
      var nxt = step2.querySelector('.reg-opt:not([hidden]) input');
      if (nxt) nxt.focus({ preventScroll: true });
    });
  });

  /* ?for= from a program's own Register button (and age, level, season) */
  var q = new URLSearchParams(location.search);
  var map = {
    'junior': ['child', 'junior', 'Junior group lessons'],
    'high-performance': ['child', 'hp', 'High Performance'],
    'pro-national': ['child', 'pro-national', 'Pro National'],
    'camps': ['child', 'camps', 'Camps'],
    'adult': ['adult', 'adult', 'Adult group lessons'],
    'membership': ['adult', 'membership', 'Membership'],
    'private-lessons': ['adult', 'private', 'Private Lessons'],
    'leagues': ['adult', 'leagues', 'Leagues & Events']
  };
  var seasons = { 'summer': 'Summer', 'march-break': 'March Break', 'holiday': 'Holiday' };
  var f = map[q.get('for')];
  if (f) {
    var w = flow.querySelector('input[name="who"][value="' + f[0] + '"]');
    if (w) w.checked = true;
    update();
    var t = flow.querySelector('input[name="what"][value="' + f[1] + '"]');
    if (t) t.checked = true;
    var bits = [f[2]];
    var age = q.get('age');
    if (age && /^\d{1,2}-\d{1,2}$/.test(age)) bits.push('ages ' + age);
    var lvl = q.get('level');
    if (lvl && /^[a-z0-9-]{3,24}$/.test(lvl)) bits.push(lvl.charAt(0).toUpperCase() + lvl.slice(1).replace(/-/g, ' '));
    var se = seasons[q.get('season')];
    if (se) {
      bits.push(se);
      /* Point the camp panel's onward link at that season's own page */
      var cl = flow.querySelector('[data-route="camps"] .reg-go__acts a.link');
      if (cl) cl.setAttribute('href', cl.getAttribute('href').replace(/camps\/(index\.html)?$/, 'camps/' + q.get('season') + '/$1'));
    }
    var box = flow.querySelector('[data-reg-context]');
    var chip = flow.querySelector('[data-reg-context-chip]');
    if (box && chip) { chip.textContent = bits.join(', '); box.hidden = false; }
    /* The hero says what they are registering for (QC M2), with the chosen answer marked */
    var forLine = doc.querySelector('[data-reg-for]');
    var forWhat = doc.querySelector('[data-reg-for-what]');
    var heroQ = doc.querySelector('.reg-hero__q');
    var go = doc.querySelector('[data-reg-go]');
    if (forLine && forWhat) { forWhat.textContent = f[2]; forLine.hidden = false; if (heroQ) heroQ.hidden = true; }
    if (go) go.hidden = false;
    $$('.reg-hero .hero__points a').forEach(function (a) {
      if (a.getAttribute('href') === '#who-' + f[0]) a.setAttribute('aria-current', 'true');
    });
  }
  update();
  if (f) {
    /* Land on the pre-filled route: once layout has settled (fonts, the hero's intro), jump to it */
    var landed = false;
    var land = function () { if (landed) return; landed = true; showRoute(true); };
    if (doc.readyState === 'complete') setTimeout(land, 60);
    else window.addEventListener('load', function () { setTimeout(land, 60); });
    var goBtn = doc.querySelector('[data-reg-go]');
    if (goBtn) goBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); showRoute(false); });
  }
})();
