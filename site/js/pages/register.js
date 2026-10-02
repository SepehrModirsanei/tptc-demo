/* Register page script: the three-choice flow, the handoff, the progress court, ?for= preselect.
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
    0: 'Your first serve of the season: from the deuce court, over the net, into the box.',
    1: 'The toss: who is playing.',
    2: 'Over the net: what you are registering for.',
    3: 'In. Your route is below: continue to enrol.'
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

  $$('input[type="radio"]', flow).forEach(function (r) { r.addEventListener('change', update); });

  /* ?for= from a program's own Register button (and age, level, season) */
  var q = new URLSearchParams(location.search);
  var map = {
    'junior': ['child', 'junior', 'Junior group lessons'],
    'high-performance': ['child', 'hp', 'High Performance'],
    'pro-national': ['child', 'pro-national', 'Pro National'],
    'camps': ['child', 'camps', 'Camps'],
    'adult': ['adult', 'adult', 'Adult group lessons'],
    'membership': ['adult', 'membership', 'Membership'],
    'private-lessons': ['adult', 'private', 'Private lessons'],
    'leagues': ['adult', 'leagues', 'Leagues and events']
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
  }
  update();
})();
