/* TPTC Ledger: interface behaviour that works with or without GSAP. No scroll listeners. */
(function () {
  'use strict';
  var d = document, html = d.documentElement;
  var q = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* One copyright line, year computed */
  q('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* Header: background layer fades in after 40px of scroll (IntersectionObserver sentinel) */
  var header = d.getElementById('top-header');
  if (header && !header.hasAttribute('data-solid') && 'IntersectionObserver' in window) {
    var sentinel = d.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:40px;pointer-events:none;';
    d.body.insertBefore(sentinel, d.body.firstChild);
    new IntersectionObserver(function (e) { header.classList.toggle('is-solid', !e[0].isIntersecting); }).observe(sentinel);
  }

  /* Desktop dropdowns: Enter/Space toggle, ArrowDown opens, arrows move, Esc closes */
  var menus = q('[data-menu]');
  function setOpen(m, open) {
    var t = m.querySelector('.nav__trigger');
    if (open) m.setAttribute('data-open', ''); else { m.removeAttribute('data-open'); m._hover = false; }
    t.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeOthers(keep) { menus.forEach(function (m) { if (m !== keep) setOpen(m, false); }); }
  menus.forEach(function (m) {
    var t = m.querySelector('.nav__trigger');
    var links = q('.nav__panel a', m);
    var timer;
    t.addEventListener('click', function () {
      if (m.hasAttribute('data-open') && m._hover) { m._hover = false; return; }
      var open = !m.hasAttribute('data-open');
      closeOthers(m); setOpen(m, open);
    });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); closeOthers(m); setOpen(m, true); links[0].focus(); }
    });
    m.addEventListener('keydown', function (e) {
      var i = links.indexOf(d.activeElement);
      if (e.key === 'Escape' && m.hasAttribute('data-open')) { setOpen(m, false); t.focus(); return; }
      if (i < 0 || e.target === t) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
      } else if (e.key === 'Home') { e.preventDefault(); links[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); links[links.length - 1].focus(); }
    });
    m.addEventListener('focusout', function (e) { if (!m.contains(e.relatedTarget)) setOpen(m, false); });
    m.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse' || !fine.matches) return;
      clearTimeout(timer); closeOthers(m);
      if (!m.hasAttribute('data-open')) { m._hover = true; setOpen(m, true); }
    });
    m.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      timer = setTimeout(function () { if (!m.contains(d.activeElement)) setOpen(m, false); }, 180);
    });
  });
  d.addEventListener('click', function (e) { menus.forEach(function (m) { if (!m.contains(e.target)) setOpen(m, false); }); });

  /* Mobile menu: a focus-trapped sheet, Programs and About as disclosures */
  var mbtn = d.querySelector('.menu-btn');
  var sheet = d.getElementById('mobile-menu');
  var outside = [d.getElementById('main'), d.querySelector('.footer'), d.querySelector('.skip')];
  function menu(open, restore) {
    if (!mbtn || !sheet) return;
    html.classList.toggle('menu-open', open);
    mbtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    mbtn.querySelector('.vh').textContent = open ? 'Close menu' : 'Menu';
    outside.forEach(function (el) { if (el) el.inert = open; });
    if (window.__lenis) { if (open) window.__lenis.stop(); else window.__lenis.start(); }
    if (open) setTimeout(function () { var f = sheet.querySelector('button, a'); if (f) f.focus(); }, 60);
    else if (restore) mbtn.focus();
  }
  if (mbtn && sheet) {
    mbtn.addEventListener('click', function () { menu(!html.classList.contains('menu-open'), true); });
    q('.mnav__toggle', sheet).forEach(function (b) {
      b.addEventListener('click', function () {
        var sub = d.getElementById(b.getAttribute('aria-controls'));
        var open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        sub.hidden = !open;
      });
    });
    d.addEventListener('keydown', function (e) {
      if (!html.classList.contains('menu-open')) return;
      if (e.key === 'Escape') { menu(false, true); return; }
      if (e.key !== 'Tab') return;
      var f = [mbtn].concat(q('a[href], button', sheet).filter(function (el) { return el.offsetParent !== null; }));
      var i = f.indexOf(d.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      else if (i === -1) { e.preventDefault(); f[0].focus(); }
    });
    window.matchMedia('(min-width: 1180px)').addEventListener('change', function (e) { if (e.matches) menu(false); });
  }

  /* Pages outside this specimen: say so instead of jumping to the top */
  var toast = d.querySelector('.toast'), toastTimer;
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#"]');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    if (html.classList.contains('menu-open')) menu(false);
    if (!toast) return;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2800);
  }, true);

  /* Status chips computed from crawl dates: only a real clock may light the live accent */
  function day(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmt(dt) { return MONTHS[dt.getMonth()] + ' ' + dt.getDate(); }
  function today() { var t = new Date(); t.setHours(0, 0, 0, 0); return t; }
  q('[data-status]').forEach(function (c) {
    var st = c.hasAttribute('data-start') ? day(c.getAttribute('data-start')) : new Date(0) /* no start: already running */, en = day(c.getAttribute('data-end')), t = today();
    if (t >= st && t <= en) {
      c.classList.add('chip--live');
      c.innerHTML = '<span class="chip__dot" aria-hidden="true"></span>' + (c.getAttribute('data-label-live') || 'Running now');
    } else if (t < st) {
      c.textContent = (c.getAttribute('data-label-before') || 'Starts') + ' ' + fmt(st);
    } else {
      c.textContent = c.getAttribute('data-label-end') || 'Ended ' + fmt(en);
    }
  });
  /* Season ledger: today's place on the club year, May 1 to April 30 */
  q('[data-season-today]').forEach(function (m) {
    var t = today(), y = t.getMonth() < 4 ? t.getFullYear() - 1 : t.getFullYear();
    var start = new Date(y, 4, 1), end = new Date(y + 1, 4, 1);
    var x = Math.max(0, Math.min(1, (t - start) / (end - start)));
    m.style.setProperty('--x', (x * 100).toFixed(2) + '%');
    var lab = m.querySelector('[data-season-date]'); if (lab) lab.textContent = fmt(t);
    m.classList.toggle('is-late', x > 0.55);
  });
  function countdownText(en) {
    var n = Math.round((en - today()) / 864e5);
    if (n < 0) return '';
    if (n === 0) return 'Final day today.';
    return n + (n === 1 ? ' day' : ' days') + ' left in this session.';
  }
  q('[data-countdown]').forEach(function (el) {
    var en = day(el.getAttribute('data-countdown'));
    el.innerHTML = '<span class="tick"><span class="tick__v">' + countdownText(en) + '</span></span>';
    setInterval(function () {
      var next = countdownText(en), v = el.querySelector('.tick__v');
      if (!v || v.textContent === next) return;
      if (window.gsap && html.classList.contains('motion')) {
        window.gsap.to(v, { yPercent: -100, opacity: 0, duration: 0.24, ease: 'tptc.ui', onComplete: function () {
          v.textContent = next; window.gsap.fromTo(v, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.24, ease: 'tptc.ui' });
        } });
      } else { v.textContent = next; }
    }, 60000);
  });

  /* Pulse: two rings when first seen, replays once on hover or focus of its host */
  var live = q('.chip--live:not([data-nopulse])');
  if (live.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-pulsing'); io.unobserve(en.target); } });
    }, { threshold: 0.6 });
    live.forEach(function (c) {
      io.observe(c);
      var host = c.closest('[data-pulse-host]') || c;
      var replay = function () { if (c.classList.contains('is-pulsing')) c.classList.toggle('is-replay'); };
      host.addEventListener('pointerenter', replay);
      host.addEventListener('focusin', replay);
    });
  }

  /* Accordions: button + aria-expanded */
  q('[data-accordion] button[aria-controls]').forEach(function (b) {
    b.addEventListener('click', function () {
      var panel = d.getElementById(b.getAttribute('aria-controls'));
      var open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
    });
  });

  /* Turn: only the High Performance door morphs into the High Performance hero (it carries the same photograph).
     Every other link to that page turns the page without a morph. */
  var hpDoor = d.querySelector('.board__row--hp') || d.querySelector('.door--hp');
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href$="high-performance.html"]');
    if (!a || !hpDoor) return;
    hpDoor.classList.toggle('vt-off', !hpDoor.contains(a));
  });
  window.addEventListener('pageshow', function () {
    html.classList.remove('is-turning');
    if (hpDoor) hpDoor.classList.remove('vt-off');
    var hero = d.querySelector('.hero--steps');
    if (hero) hero.classList.remove('vt-off');
    if (html.classList.contains('menu-open')) menu(false);
  });
  window.addEventListener('pageswap', function (e) {
    /* the leaving page's masthead is captured opaque, whatever its scroll state (pagereveal, in the head, does the arriving page) */
    if (e.viewTransition) {
      html.classList.add('is-turning');
      /* the leaving side's promises settle as the page goes; a skipped turn must not surface as an unhandled rejection */
      var vt = e.viewTransition, none = function () {};
      [vt.ready, vt.finished, vt.updateCallbackDone].forEach(function (pr) { if (pr && pr.catch) pr.catch(none); });
    }
    var hero = d.querySelector('.hero--steps');
    var type = e.activation && e.activation.navigationType;
    if (hero && type !== 'traverse') hero.classList.add('vt-off');
  });
})();
