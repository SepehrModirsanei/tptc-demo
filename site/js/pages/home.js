/* Home: the four serving courts draw their lines in full only while a serve is in play.
   js/serve.js (client-approved, not edited) moves each ball frame by frame; this script only
   watches that movement and marks the court, so the CSS can raise the lines for the serve and
   let them rest afterwards. It changes nothing about the serve: no timing, no order, no physics.
   Under reduced motion no serve plays, so no court is ever marked: all four rest alike. */
(function () {
  'use strict';
  if (!('MutationObserver' in window)) return;
  var QUIET = 260; /* ms without a frame before the court rests again */
  Array.prototype.forEach.call(document.querySelectorAll('.court__ball'), function (ball) {
    var court = ball.closest('.court');
    if (!court) return;
    var last = 0, timer = null;
    new MutationObserver(function () {
      var now = performance.now();
      /* One isolated write is the ball being placed at rest; two within a few frames is flight */
      if (now - last < 120) {
        court.classList.add('is-serving');
        clearTimeout(timer);
        timer = setTimeout(function () { court.classList.remove('is-serving'); }, QUIET);
      }
      last = now;
    }).observe(ball, { attributes: true, attributeFilter: ['style'] });
  });
})();

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
