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
