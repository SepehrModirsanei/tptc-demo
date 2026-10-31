/* Design system sheet: measured contrast, forced states, motion replays. */
(function () {
  'use strict';
  var doc = document;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };

  /* ---------- Contrast, measured from the live computed tokens ---------- */
  function rgb(str) {
    var m = str.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    var p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2] };
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  $$('.contrast tbody tr').forEach(function (tr) {
    var pair = tr.querySelector('[data-contrast]');
    var out = tr.querySelector('td:last-child');
    var cs = getComputedStyle(pair);
    var fg = rgb(cs.color), bg = rgb(cs.backgroundColor);
    if (!fg || !bg) return;
    var r = ratio(fg, bg);
    var mark = pair.hasAttribute('data-large');
    var verdict = r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? (mark ? 'Pass, 3:1 mark' : 'Large text only') : 'Fail';
    out.innerHTML = '<b style="font-weight:600">' + r.toFixed(2) + ':1</b> <span style="color:var(--fg-muted)">' + verdict + '</span>';
  });

  /* ---------- Theme preview: System, Day or Night for this page only ---------- */
  $$('[data-theme-switch]').forEach(function (group) {
    var buttons = $$('[data-set-theme]', group);
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-set-theme');
        if (t === 'auto') doc.documentElement.removeAttribute('data-theme');
        else doc.documentElement.setAttribute('data-theme', t);
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      });
    });
  });

  /* ---------- Forced states, so every state can be seen at once ---------- */
  $$('[data-force]').forEach(function (s) {
    var el = s.querySelector('.btn, .link');
    if (!el) return;
    el.classList.add('is-' + s.getAttribute('data-force'));
    el.setAttribute('tabindex', '-1');
    el.setAttribute('aria-hidden', 'true');
  });

  /* ---------- Motion replays ---------- */
  var buttons = $$('[data-replay]');
  function syncReduce() {
    buttons.forEach(function (b) {
      b.disabled = reduce.matches;
      b.querySelector('.link__text').textContent = reduce.matches ? 'Reduced motion is on' : 'Replay';
    });
  }
  syncReduce();
  reduce.addEventListener('change', syncReduce);
  var play = {
    rise: function (el) {
      gsap.fromTo(el.querySelectorAll('i'), { yPercent: 105 }, { yPercent: 0, duration: 0.9, stagger: 0.07, ease: 'tptc.out' });
    },
    settle: function (el) {
      gsap.fromTo(el.children, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.09, ease: 'tptc.out' });
    },
    unveil: function (el) {
      var inner = el.querySelector('.demo-inner'), block = el.querySelector('.demo-block');
      gsap.fromTo(inner, { yPercent: 100 }, { yPercent: 0, duration: 1.2, ease: 'tptc.out' });
      gsap.fromTo(block, { yPercent: -100, scale: 1.12 }, { yPercent: 0, scale: 1, duration: 1.2, ease: 'tptc.out' });
    },
    chalk: function (el) {
      el.classList.remove('is-drawn');
      void el.offsetWidth;
      requestAnimationFrame(function () { el.classList.add('is-drawn'); });
    },
    pulse: function (el) {
      var chip = el.querySelector('.chip--live'); if (chip) chip.classList.toggle('is-replay');
    }
  };
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      if (reduce.matches || !window.gsap) return;
      var kind = b.getAttribute('data-replay');
      var target = kind === 'pulse' ? b.closest('[data-pulse-parent]') : b.parentNode.querySelector('[data-demo="' + kind + '"]');
      if (target && play[kind]) play[kind](target);
    });
  });
})();
