/* Turn: names the one shared element for a cross-document View Transition.
   Loaded as a classic script in <head>, because pageswap and pagereveal fire before first render.
   An element opts in with data-vt="prog-hp" data-vt-peer="high-performance.html": it carries the
   name only when the page on the other side of this navigation is its peer, so no other named
   element lingers as a stray layer. Back navigation gets the reverse morph. */
(function () {
  'use strict';
  function file(url) {
    if (!url) return '';
    try { return new URL(url, location.href).pathname.split('/').pop() || 'index.html'; } catch (e) { return ''; }
  }
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.width > 0;
  }
  function nameFor(other) {
    var els = document.querySelectorAll('[data-vt]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var match = other && file(el.getAttribute('data-vt-peer')) === other && inView(el);
      el.style.viewTransitionName = match ? el.getAttribute('data-vt') : 'none';
    }
  }
  window.addEventListener('pageswap', function (e) {
    if (!e.viewTransition) return;
    var to = e.activation && e.activation.entry ? file(e.activation.entry.url) : '';
    nameFor(to);
  });
  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    var from = '';
    if (window.navigation && navigation.activation && navigation.activation.from) from = file(navigation.activation.from.url);
    if (!from && document.referrer) from = file(document.referrer);
    nameFor(from);
  });
})();
