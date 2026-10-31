/* Junior Recreational. The court plan follows the chosen age band: half court (4-6),
   three-quarter (7-9), full (10+). The rally counts on the level cards are played by site.js. */
(function () {
  'use strict';
  var STAGE = { '4-6': 'half', '7-9': 'three', '10-13': 'full', '14-17': 'full' };
  var court = document.querySelector('.jr-court');

  function setStage(age) {
    if (court && STAGE[age]) court.setAttribute('data-stage', STAGE[age]);
  }

  document.addEventListener('tptc:select', function (e) {
    if (e.detail && e.detail.name === 'age') setStage(e.detail.value);
  });

  var start = document.querySelector('[data-select="age"] [aria-checked="true"]');
  setStage(start ? start.getAttribute('data-value') : '4-6');
})();
