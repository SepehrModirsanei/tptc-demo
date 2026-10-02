/* TPTC staff panel: the demo sign-in (shared, owned by the foundation).
   No password: choosing a role is the whole sign-in. The chosen role's place on the court is
   marked on the plan (the gate, the service line, the umpire's chair at the net post). */
(function () {
  'use strict';
  var body = document.body;
  if (window.TPTC_SPRITE) body.insertAdjacentHTML('afterbegin', window.TPTC_SPRITE);
  var form = document.querySelector('[data-si-form]');
  if (!form) return;
  var go = form.querySelector('[data-si-go]');
  var NAMES = { frontdesk: 'Front desk', headpro: 'Head Pro', admin: 'Administrator' };
  var HOME = { frontdesk: 'bookings', headpro: 'programs', admin: 'dashboard' };
  var MODULES = ['bookings', 'programs', 'members', 'payments', 'content', 'dashboard'];
  var q = new URLSearchParams(location.search);
  var next = MODULES.indexOf(q.get('next')) > -1 ? q.get('next') : null;
  var saved = null;
  try { saved = localStorage.getItem('tptc-panel-role'); } catch (e) { /* storage blocked */ }

  function current() { var c = form.querySelector('input[name="role"]:checked'); return c ? c.value : 'frontdesk'; }
  function show() {
    var r = current();
    go.textContent = 'Continue as ' + NAMES[r];
    Array.prototype.forEach.call(document.querySelectorAll('[data-spot]'), function (g) {
      g.classList.toggle('is-on', g.getAttribute('data-spot') === r);
    });
  }
  if (saved && NAMES[saved]) {
    var pre = form.querySelector('input[value="' + saved + '"]');
    if (pre) pre.checked = true;
  }
  form.addEventListener('change', show);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var r = current(), ok = true;
    try { localStorage.setItem('tptc-panel-role', r); } catch (err) { ok = false; }
    var dest = '../' + (next || HOME[r]) + '/' + (location.protocol.indexOf('http') === 0 ? '' : 'index.html');
    location.href = dest + (ok ? '' : '?role=' + r);
  });
  show();
})();
