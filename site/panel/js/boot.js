/* TPTC staff panel: boot (shared). Loaded in <head>, before any CSS paints.
   1. Applies the saved theme (System, Day or Night) so the page never flashes the wrong one.
   2. Signs in by address for tests and links: ?role=frontdesk | headpro | admin.
   3. Sends anyone without a role to the sign-in screen, and back here after it. */
(function () {
  'use strict';
  var html = document.documentElement;
  html.classList.add('js');
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: this visit only */ } };

  var theme = get('tptc-panel-theme');
  if (theme === 'light' || theme === 'dark') html.setAttribute('data-theme', theme);

  var q = new URLSearchParams(location.search), asked = q.get('role');
  if (asked === 'frontdesk' || asked === 'headpro' || asked === 'admin') { set('tptc-panel-role', asked); window.__panelRole = asked; }

  var page = html.getAttribute('data-panel-page');
  var role = window.__panelRole || get('tptc-panel-role');
  if (!role && page && page !== 'sign-in') {
    /* No storage at all (a private window that blocks it): let the page show as Front desk
       rather than loop back to sign-in forever. */
    var blocked = false;
    try { localStorage.setItem('tptc-panel-probe', '1'); localStorage.removeItem('tptc-panel-probe'); } catch (e) { blocked = true; }
    if (!blocked) {
      var root = html.getAttribute('data-panel-root') || '../';
      location.replace(root + 'sign-in/index.html?next=' + encodeURIComponent(page));
    }
  }
  if (matchMedia('(prefers-reduced-motion: no-preference)').matches) html.classList.add('motion');
})();
