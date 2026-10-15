/* TPTC motion system (energy.md section 3), cut to what tennis justifies: Rise (the toss), Hold (a line laid),
   Dome (the air dome going up), Pulse (the pre-serve bounce, CSS), Press (CSS feedback) and Turn (CSS).
   Transform and opacity only. */
(function () {
  'use strict';
  var html = document.documentElement;
  if (!window.gsap || !window.ScrollTrigger || !window.SplitText || !window.CustomEase) { html.classList.remove('motion'); return; }
  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST, window.CustomEase, window.SplitText);
  window.CustomEase.create('tptc.out', '0.16,1,0.3,1');
  window.CustomEase.create('tptc.inOut', '0.76,0,0.24,1');
  window.CustomEase.create('tptc.ui', '0.32,0.72,0,1');
  gsap.defaults({ ease: 'tptc.out', duration: 0.7 });

  var q = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var one = function (s, r) { return (r || document).querySelector(s); };
  var headerOffset = function () { var h = one('.site-header'); return -((h ? h.offsetHeight : 72) + 24); };

  function startLenis() {
    if (!window.Lenis) return null;
    var lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false, autoRaf: false,
      anchors: { offset: headerOffset() }, stopInertiaOnNavigate: true });
    var raf = function (t) { lenis.raf(t * 1000); };
    lenis.on('scroll', ST.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    window.__lenis = lenis;
    return function () { gsap.ticker.remove(raf); lenis.destroy(); window.__lenis = null; };
  }

  /* 1. Rise, as the service toss: each line goes straight up out of its mask and slows under gravity to a dead stop
     at its apex, where a serve is struck. Constant deceleration is a quadratic ease-out (power1.out), never an
     overshoot or a bounce; 0.55s is the time a real 1.5m toss takes to peak (t = sqrt(2h/g)). Never replays on re-split. */
  function riseEl(el, opts) {
    var played = false;
    window.SplitText.create(el, {
      type: 'lines', mask: 'lines', autoSplit: true, aria: 'none', linesClass: 'split-line',
      onSplit: function (self) {
        gsap.set(el, { opacity: 1 });
        if (played) return;
        played = true;
        return gsap.from(self.lines, Object.assign({ yPercent: 105, duration: 0.55, stagger: 0.07, ease: 'power1.out' }, opts || {}));
      }
    });
  }
  function rise() {
    q('[data-rise]:not([data-hero-title])').forEach(function (el) {
      riseEl(el, { scrollTrigger: { trigger: el, start: 'clamp(top 85%)', once: true } });
    });
  }

  /* Settle, Unveil and Drift were cut in the lead review (1 Oct 2026): a fade-up, a wipe and a parallax tell no
     tennis story, so text and photographs are simply there. Motion is spent only where tennis gives it a reason. */

  /* 5. Hold: the High Performance pathway (CSS sticky + scrubbed rail) */
  function hold() {
    var sec = one('[data-pathway]'); if (!sec) return;
    sec.classList.add('is-holding');
    var steps = one('[data-steps]', sec);
    gsap.fromTo(one('[data-rail-fill]', sec), { scaleY: 0 }, { scaleY: 1, ease: 'none',
      scrollTrigger: { trigger: steps, start: 'top 60%', end: 'bottom 60%', scrub: true } });
    q('[data-step]', sec).forEach(function (st, i) {
      var link = one('[data-step-link="' + st.id + '"]', sec);
      ST.create({ trigger: st, start: 'top 60%', end: 'bottom 60%', toggleClass: { targets: link, className: 'is-active' },
        onEnter: function () { if (i === 0) link.classList.add('is-active'); } });
    });
    return function () { sec.classList.remove('is-holding'); };
  }

  function splitCompact() {
    var sec = one('[data-split]'); if (!sec) return;
    var fill = one('[data-ladder-fill]', sec);
    /* the pathway rail is laid like a court line: a line marker walks it at one even pace, start to finish */
    if (fill) gsap.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'none',
      scrollTrigger: { trigger: fill, start: 'clamp(top 85%)', once: true } });
  }

  /* Signature: the dome inflates over the winter months, once, then the live mark for today arrives */
  function domes() {
    q('[data-season]').forEach(function (sea) {
      var dome = one('[data-dome]', sea), mark = one('[data-season-today]', sea), sess = q('.season__session', sea);
      var tl = gsap.timeline({ paused: true });
      tl.fromTo(dome, { scaleY: 0 }, { scaleY: 1, duration: 1.6, ease: 'tptc.out' }, 0);
      if (sess.length) tl.fromTo(sess, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0 50%', duration: 0.9, ease: 'none', clearProps: 'transform' }, 0.3);  /* laid like a court line, even pace */
      if (mark) tl.fromTo(mark, { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.7, ease: 'tptc.out' }, 0.9);
      if (sea.closest('.hero')) { tl.delay(0.5).play(); return; }
      ST.create({ trigger: sea, start: 'clamp(top 85%)', once: true, onEnter: function () { tl.play(); } });
    });
  }

  /* Load choreography, timed to the toss: the photograph and the eyebrow are there from the first frame; the
     headline is tossed at 0.15s and reaches its apex 0.55s later; the lede and the actions arrive at that apex,
     together and quickly (opacity only), the way a serve is struck at the top of the toss. */
  function heroLoad() {
    var hero = one('.hero'); if (!hero) return;
    var title = one('[data-hero-title]', hero);
    if (title) riseEl(title, { delay: 0.15 });
    var lines = title ? title.children.length : 1;
    var apex = 0.15 + 0.55 + 0.07 * Math.max(0, lines - 1);
    var struck = q('.hero__lede, [data-hero-cta]', hero);
    if (struck.length) gsap.fromTo(struck, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: 'none', delay: apex - 0.05 });
  }

  var mm = gsap.matchMedia();
  mm.add({
    motion: '(prefers-reduced-motion: no-preference)',
    desktop: '(min-width: 1024px)',
    fine: '(hover: hover) and (pointer: fine)'
  }, function (ctx) {
    var c = ctx.conditions;
    if (!c.motion) { html.classList.remove('motion'); return; }
    html.classList.add('motion');
    var cleanups = [];
    if (c.fine) cleanups.push(startLenis());
    heroLoad();
    splitCompact();  /* one Hold per site (energy.md): the HP pathway keeps it; the Home split only lays its rail */
    domes();
    rise();
    if (c.desktop) cleanups.push(hold());
    ST.refresh();
    return function () { cleanups.forEach(function (fn) { if (typeof fn === 'function') fn(); }); };
  });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ST.refresh(); });
  window.addEventListener('load', function () { ST.refresh(); });
})();
