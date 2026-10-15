/* Design system sheet: measure contrast from the live tokens, replay the motion sample. */
(function () {
  'use strict';
  var root = getComputedStyle(document.documentElement);
  var q = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function hex(name) { return root.getPropertyValue(name).trim(); }
  function rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/(.)/g, '$1$1'); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; }); }
  function lum(h) { var c = rgb(h).map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function grade(r, large) { if (large) return r >= 4.5 ? 'AAA large' : r >= 3 ? 'AA large' : 'Fail'; return r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA large only' : 'Fail'; }

  function measure() {
    q('[data-swatch]').forEach(function (s) {
      var name = s.getAttribute('data-swatch'), v = hex(name);
      s.querySelector('.swatch__hex').textContent = v;
      var box = s.querySelector('.swatch__cr');
      box.textContent = '';
      [['--paper', 'on paper'], ['--night', 'on night']].forEach(function (g) {
        if (g[0] === name) return;
        var r = ratio(v, hex(g[0]));
        var el = document.createElement('span');
        el.className = 'cr';
        el.innerHTML = '<i style="background:var(' + g[0] + ')"></i>' + r.toFixed(2) + ':1 ' + g[1];
        box.appendChild(el);
      });
    });
    q('[data-pair]').forEach(function (tr) {
      var fg = hex(tr.getAttribute('data-fg')), bg = hex(tr.getAttribute('data-bg'));
      var r = ratio(fg, bg), large = tr.hasAttribute('data-large');
      var sample = tr.querySelector('.pair-sample');
      sample.style.color = 'var(' + tr.getAttribute('data-fg') + ')';
      sample.style.background = 'var(' + tr.getAttribute('data-bg') + ')';
      if (large) { sample.style.fontFamily = 'var(--font-sans)'; sample.style.fontWeight = '800'; sample.style.fontStretch = '64%'; }
      tr.querySelector('[data-ratio]').textContent = r.toFixed(2) + ':1';
      tr.querySelector('[data-grade]').innerHTML = '<span class="grade">' + grade(r, large) + '</span>';
    });
  }
  measure();

  /* theme preview: sets data-theme on <html> for this visit only, then re-measures every pair */
  q('[data-theme-set]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-theme-set');
      if (v) document.documentElement.setAttribute('data-theme', v); else document.documentElement.removeAttribute('data-theme');
      q('[data-theme-set]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      measure();
    });
  });
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', measure);

  var btn = document.querySelector('[data-replay]');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var html = document.documentElement;
    if (!window.gsap || !html.classList.contains('motion')) { document.querySelector('[data-replay-note]').hidden = false; return; }
    var gsap = window.gsap, stage = document.querySelector('[data-replay-stage]');
    var title = stage.querySelector('.replay__title'), line = stage.querySelector('.replay__line');
    if (!title._split) title._split = window.SplitText.create(title, { type: 'lines', mask: 'lines' });
    var tl = gsap.timeline();
    tl.from(title._split.lines, { yPercent: 105, duration: 0.55, stagger: 0.07, ease: 'power1.out' }, 0)  /* Rise: the service toss */
      .fromTo(line, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: 'none' }, 0.57);  /* struck at the apex */
  });
})();
