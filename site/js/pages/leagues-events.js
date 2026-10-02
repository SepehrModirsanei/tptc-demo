/* Leagues & Events: the type filter and its counts, read like a draw sheet's entries per event.
   The season select (site.js) hides rows of the other season through data-when-season; this script
   counts what is left per type, shows one type or all, and hides a type with no entries this season. */
(function () {
  'use strict';
  var types = Array.prototype.slice.call(document.querySelectorAll('.le-type[data-type]'));
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.le-filters [data-filter]'));
  if (!types.length || !buttons.length) return;
  var current = 'all';

  function season() {
    var on = document.querySelector('[data-select="season"] [aria-checked="true"]');
    return on ? on.getAttribute('data-value') : 'fw';
  }
  function inSeason(row, s) {
    var list = (row.getAttribute('data-when-season') || '').split(/\s+/);
    return list.indexOf(s) > -1;
  }
  function update() {
    var s = season();
    var total = 0;
    types.forEach(function (sec) {
      var n = 0;
      sec.querySelectorAll('.lrow[data-when-season]').forEach(function (r) { if (inSeason(r, s)) n++; });
      total += n;
      var c = document.querySelector('[data-count="' + sec.getAttribute('data-type') + '"]');
      if (c) c.textContent = n;
      var btn = document.querySelector('[data-filter="' + sec.getAttribute('data-type') + '"]');
      if (btn) btn.disabled = n === 0;
      sec.hidden = n === 0 || (current !== 'all' && current !== sec.getAttribute('data-type'));
    });
    var all = document.querySelector('[data-count="all"]');
    if (all) all.textContent = total;
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      current = b.getAttribute('data-filter');
      buttons.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      update();
    });
  });
  document.addEventListener('tptc:select', function (e) {
    if (!e.detail || e.detail.name !== 'season') return;
    var b = document.querySelector('[data-filter="' + current + '"]');
    if (b && current !== 'all') {
      var n = document.querySelector('[data-count="' + current + '"]');
      update();
      if (n && n.textContent === '0') { current = 'all'; buttons[0].click(); return; }
    }
    update();
  });
  update();
})();
