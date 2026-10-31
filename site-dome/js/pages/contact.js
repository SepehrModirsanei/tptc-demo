/* Contact page script: the ticket feed runs once, when it comes into view.
   Story: questions are answered in the order they arrive, like a coach feeding from the basket. */
(function () {
  'use strict';
  var f = document.querySelector('[data-feed]');
  if (!f || !('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { setTimeout(function () { f.classList.add('is-fed'); }, 300); io.disconnect(); }
    });
  }, { threshold: 0.8 });
  io.observe(f);
})();
