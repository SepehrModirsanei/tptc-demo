/* High Performance: the court plan follows the Hold.
   Story: the court grows with the player. When the pathway's Hold marks a step active, the plan
   lights that step's court (three-quarter court for Little Champs, the full court for Transition
   Tour and Pro National). It only reads the Hold's state; it never animates by itself, so with
   reduced motion or on phones (no Hold) the plan stays static with both courts shown. */
(function () {
  var plan = document.querySelector('[data-courtplan]');
  var links = Array.prototype.slice.call(document.querySelectorAll('.pathway__steps-nav a'));
  if (!plan || !links.length || !('MutationObserver' in window)) return;
  function sync() {
    var at = 'all';
    if (document.documentElement.classList.contains('hold-on')) {
      links.forEach(function (l, i) { if (l.classList.contains('is-active')) at = String(i); });
    }
    if (plan.getAttribute('data-at') !== at) plan.setAttribute('data-at', at);
  }
  var mo = new MutationObserver(sync);
  links.forEach(function (l) { mo.observe(l, { attributes: true, attributeFilter: ['class'] }); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  sync();
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
