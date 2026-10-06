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
