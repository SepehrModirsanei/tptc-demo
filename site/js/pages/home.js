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
