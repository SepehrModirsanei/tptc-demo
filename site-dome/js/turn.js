/* Turn: names the one shared element for a cross-document View Transition.
   Loaded as a classic script in <head>, because pageswap and pagereveal fire before first render.
   An element opts in with data-vt="prog-hp" data-vt-peer="programs/high-performance/index.html"
   (one or more relative urls, space separated; build.py writes them from page ids). It carries the
   name only when the page on the other side of this navigation is one of its peers, so no other
   named element lingers as a stray layer. Back navigation gets the reverse morph.
   Every page is a folder with an index.html, so pages are compared by their normalised path. */
(function () {
  'use strict';
  function norm(u) {
    if (!u) return '';
    try {
      var p = new URL(u, location.href).pathname;
      return p.replace(/index\.html$/, '');
    } catch (e) { return ''; }
  }
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.width > 0;
  }
  function nameFor(other) {
    var els = document.querySelectorAll('[data-vt]');
    var used = {};
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.getAttribute('data-vt');
      var peers = (el.getAttribute('data-vt-peer') || '').split(/\s+/).map(norm);
      var match = other && peers.indexOf(other) > -1 && inView(el) && !used[name];
      if (match) used[name] = true;
      el.style.viewTransitionName = match ? name : 'none';
    }
  }
  window.addEventListener('pageswap', function (e) {
    if (!e.viewTransition) return;
    var to = e.activation && e.activation.entry ? norm(e.activation.entry.url) : '';
    nameFor(to);
  });
  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    var from = '';
    if (window.navigation && navigation.activation && navigation.activation.from) from = norm(navigation.activation.from.url);
    if (!from && document.referrer) from = norm(document.referrer);
    nameFor(from);
  });
})();
