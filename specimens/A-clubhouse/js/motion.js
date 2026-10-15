/* TPTC motion system (energy.md section 3), Direction A.
   Primitives: Rise, Settle, Unveil, Drift, Hold, Press (CSS), Turn (CSS), plus Pulse (CSS + site.js).
   Arrive like a first serve, settle like a held follow-through.

   Reveal states are applied only to elements that are still below the fold when the visitor
   first scrolls. Nothing on screen is ever hidden after it has been seen, and a page that is
   never scrolled (or captured whole) is complete. Reduced motion: nothing here runs. */
(function () {
  'use strict';
  var d = document;
  var h = d.documentElement;
  var gsap = window.gsap;
  if (!gsap || !window.ScrollTrigger || !h.classList.contains('motion')) { h.classList.remove('motion'); return; }

  var ST = window.ScrollTrigger;
  var Split = window.SplitText;
  var CE = window.CustomEase;
  gsap.registerPlugin(ST, CE, Split);
  CE.create('tptc.out', '0.16,1,0.3,1');
  CE.create('tptc.inOut', '0.76,0,0.24,1');
  CE.create('tptc.ui', '0.32,0.72,0,1');
  gsap.defaults({ ease: 'tptc.out', duration: 0.7 });
  h.classList.add('motion-ready');

  var $$ = function (sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); };
  var inHero = function (el) { return !!el.closest('[data-hero]'); };
  var fontsReady = (d.fonts && d.fonts.ready) ? d.fonts.ready : Promise.resolve();

  /* ---------------------------------------------------------------- primitives */
  function rise(lines, delay) {
    return gsap.fromTo(lines, { y: 0, yPercent: 105 }, { yPercent: 0, duration: 0.9, stagger: 0.07, ease: 'tptc.out', delay: delay || 0 });
  }
  function settleIn(els, delay) {
    return gsap.fromTo(els, { opacity: 0, y: window.innerWidth < 768 ? 16 : 24 },
      { opacity: 1, y: 0, duration: 0.7, stagger: 0.09, ease: 'tptc.out', delay: delay || 0, overwrite: true });
  }
  function unveilTl(frame) {
    var tl = gsap.timeline({ defaults: { ease: 'tptc.out' } });
    var w = frame.querySelector('.frame__wipe');
    var p = frame.querySelector('.frame__plate');
    var l = frame.querySelector('.frame__label');
    tl.fromTo(w, { y: 0, yPercent: 100 }, { yPercent: 0, duration: 1.2 }, 0)
      .fromTo(p, { y: 0, yPercent: -100, scale: 1.12 }, { yPercent: 0, scale: 1, duration: 1.2 }, 0);
    if (l) tl.fromTo(l, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, 0.8);
    return tl;
  }

  /* Split a heading into masked lines (SplitText) and rise it, once */
  function splitRise(el, trigger) {
    if (!Split) return;
    Split.create(el, {
      type: 'lines', mask: 'lines', autoSplit: true, linesClass: 'rl',
      onSplit: function (self) {
        if (el.getAttribute('data-risen') === '1') return;
        var tw = gsap.fromTo(self.lines, { yPercent: 105 }, {
          yPercent: 0, duration: 0.9, stagger: 0.07, ease: 'tptc.out',
          scrollTrigger: trigger === false ? null : { trigger: el, start: 'clamp(top 85%)', once: true },
          onComplete: function () { el.setAttribute('data-risen', '1'); }
        });
        return tw;
      }
    });
  }

  /* ---------------------------------------------------------------- Home and page load choreography */
  function heroIn(hero) {
    var turned = h.classList.contains('turn');
    var frame = hero.querySelector('.frame[data-unveil]');
    var lines = $$('[data-rise-lines] .line__in', hero);
    var settles = $$('[data-settle]', hero);
    var rule = $$('[data-draw]', hero);
    var tl = gsap.timeline({ paused: true, defaults: { ease: 'tptc.out' } });
    if (frame && !turned) tl.add(unveilTl(frame), 0);
    if (rule.length) tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.9 }, 0.1);
    if (lines.length) tl.fromTo(lines, { y: 0, yPercent: 105 }, { yPercent: 0, duration: 0.9, stagger: 0.07 }, 0.15);
    if (settles[0]) tl.fromTo(settles[0], { opacity: 0, y: 16, yPercent: 0 }, { opacity: 1, y: 0, duration: 0.7 }, 0.45);
    if (settles.length > 1) tl.fromTo(settles.slice(1), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.09 }, 0.6);
    var go = function () { tl.play(0); };
    fontsReady.then(function () {
      /* Arriving by Turn, the headline rides above the morph in its own layer (hp-copy), so it
         rises as soon as the morph has started instead of waiting for it to finish. */
      if (turned && window.__tptcTurn && window.__tptcTurn.ready) {
        window.__tptcTurn.ready.then(function () { setTimeout(go, 160); }, go);
      } else { go(); }
    });
    return tl;
  }

  /* ---------------------------------------------------------------- reveals below the fold
     The layout reads (which elements are still below the fold) are made once at load, in idle
     time. The first scroll only applies start states, in two animation frames, so the first
     wheel event never pays for a long task. */
  var armed = false;
  var revealCtx = null;
  var plan = null;
  function measure() {
    if (plan || armed) return;
    var vh = window.innerHeight;
    var below = function (el) { return !inHero(el) && el.getBoundingClientRect().top > vh * 0.92; };
    plan = {
      frames: $$('.frame[data-unveil]').filter(below),
      lines: $$('[data-rise-lines]').filter(below),
      heads: $$('[data-rise]').filter(below),
      settles: $$('[data-settle]').filter(below)
    };
  }
  /* The reveals are armed on the first scroll. A 5px sentinel at the top of the document
     tells us when that happens: an IntersectionObserver, never a scroll listener (taste 5.D). */
  var topWatch = null, sentinel = null;
  function watchTop() {
    sentinel = d.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:5px;opacity:0;pointer-events:none';
    d.body.appendChild(sentinel);
    topWatch = new IntersectionObserver(function (es) { if (!es[0].isIntersecting) arm(); });
    topWatch.observe(sentinel);
  }
  function unwatchTop() {
    if (topWatch) { topWatch.disconnect(); topWatch = null; }
    if (sentinel) { sentinel.remove(); sentinel = null; }
  }
  var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
  function arm() {
    if (armed) return;
    armed = true;
    if (topWatch) { topWatch.disconnect(); topWatch = null; }
    measure();
    revealCtx = gsap.context(function () {});
    requestAnimationFrame(function () { if (revealCtx) revealCtx.add(setupReveals); });
  }
  function setupReveals() {
    plan.frames.forEach(function (f) {
      var w = f.querySelector('.frame__wipe'), p = f.querySelector('.frame__plate'), l = f.querySelector('.frame__label');
      gsap.set(w, { yPercent: 100 });
      gsap.set(p, { yPercent: -100, scale: 1.12 });
      if (l) gsap.set(l, { opacity: 0 });
      ST.create({ trigger: f, start: 'clamp(top 88%)', once: true, onEnter: function () { unveilTl(f); } });
    });

    plan.lines.forEach(function (el) {
      var ls = $$('.line__in', el);
      gsap.set(ls, { yPercent: 105 });
      ST.create({ trigger: el, start: 'clamp(top 85%)', once: true, onEnter: function () { rise(ls); } });
    });

    var heads = plan.heads;
    heads.forEach(function (el) { el.style.visibility = 'hidden'; });
    fontsReady.then(function () {
      /* SplitText is the heaviest step: give it a frame of its own */
      requestAnimationFrame(function () {
        if (!revealCtx) return;
        revealCtx.add(function () {
          heads.forEach(function (el) { splitRise(el); el.style.visibility = ''; });
          ST.refresh();
        });
      });
    });

    var settles = plan.settles;
    if (settles.length) {
      gsap.set(settles, { opacity: 0, y: window.innerWidth < 768 ? 16 : 24 });
      ST.batch(settles, {
        start: 'clamp(top 88%)', once: true, interval: 0.1, batchMax: 6,
        onEnter: function (batch) { settleIn(batch); }
      });
    }
    ST.refresh();
  }

  /* ---------------------------------------------------------------- matchMedia wiring */
  var mm = gsap.matchMedia();

  /* Everything that hides and reveals, gated on the motion preference only */
  mm.add('(prefers-reduced-motion: no-preference)', function () {
    h.classList.add('motion');
    var hero = d.querySelector('[data-hero]');
    if (hero) heroIn(hero);
    if (d.documentElement.scrollTop > 4) arm();
    else {
      watchTop();
      fontsReady.then(function () { idle(measure); });
    }
    return function () {
      unwatchTop();
      if (revealCtx) { revealCtx.revert(); revealCtx = null; }
      armed = false;
      plan = null;
      $$('[data-rise]').forEach(function (el) { el.style.visibility = ''; });
      h.classList.remove('motion');
    };
  });

  /* Lenis on fine pointers only; touch keeps native momentum */
  mm.add('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)', function () {
    if (!window.Lenis) return;
    var lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false, anchors: true, stopInertiaOnNavigate: true });
    lenis.on('scroll', ST.update);
    var tick = function (t) { lenis.raf(t * 1000); };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    window.__tptcLenis = lenis;
    return function () { gsap.ticker.remove(tick); lenis.destroy(); window.__tptcLenis = null; };
  });

  /* Drift (two per page at most) and Hold (the pathway only), desktop only */
  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 1024px)', function () {
    $$('.frame[data-drift]').slice(0, 2).forEach(function (f) {
      gsap.fromTo(f.querySelector('.frame__drift'), { yPercent: -6 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: f, start: 'clamp(top bottom)', end: 'bottom top', scrub: true }
      });
    });
    var hold = d.querySelector('[data-hold]');
    if (hold) {
      h.classList.add('is-desktop');
      var fill = hold.querySelector('[data-rail]');
      var panels = hold.querySelector('.pathway__panels');
      gsap.fromTo(fill, { scaleY: 0 }, {
        scaleY: 1, ease: 'none',
        scrollTrigger: { trigger: panels, start: 'top 60%', end: 'bottom 60%', scrub: true }
      });
      $$('.step', hold).forEach(function (step) {
        var link = hold.querySelector('[data-step-link="' + step.getAttribute('data-step') + '"]');
        if (link) ST.create({ trigger: step, start: 'top 60%', end: 'bottom 60%', toggleClass: { targets: link, className: 'is-active' } });
      });
    }
    return function () { h.classList.remove('is-desktop'); };
  });

  fontsReady.then(function () { ST.refresh(); });

  /* Replays for the system sheet's motion lab */
  window.tptcMotion = {
    rise: function (el) {
      var ls = $$('.line__in', el);
      if (ls.length) return rise(ls);
      if (Split) {
        var s = Split.create(el, { type: 'lines', mask: 'lines' });
        return gsap.fromTo(s.lines, { yPercent: 105 }, { yPercent: 0, duration: 0.9, stagger: 0.07, ease: 'tptc.out', onComplete: function () { s.revert(); } });
      }
    },
    settle: function (els) { return settleIn(els); },
    unveil: function (frame) { return unveilTl(frame); },
    press: function (btn) {
      btn.classList.add('is-hover');
      gsap.delayedCall(0.9, function () { btn.classList.remove('is-hover'); });
    }
  };
})();
