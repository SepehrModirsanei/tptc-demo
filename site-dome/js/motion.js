/* TPTC motion system (energy.md section 3), Direction C.
   Arrive like a first serve, settle like a held follow-through.
   Primitives: Rise, Settle, Unveil, Drift, Hold, Press (CSS), Turn (CSS), plus Pulse (CSS)
   and Chalk, this direction's court lines drawing themselves (transform only).
   Everything runs once. Nothing loops. All of it lives inside one gsap.matchMedia(),
   which reverts itself if the visitor switches to reduced motion mid-session. */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!window.gsap || !window.ScrollTrigger || !window.SplitText || !window.CustomEase) {
    root.classList.remove('motion');
    return;
  }
  gsap.registerPlugin(ScrollTrigger, CustomEase, SplitText);
  CustomEase.create('tptc.out', '0.16,1,0.3,1');
  CustomEase.create('tptc.inOut', '0.76,0,0.24,1');
  CustomEase.create('tptc.ui', '0.32,0.72,0,1');
  gsap.defaults({ ease: 'tptc.out', duration: 0.7 });

  var toArray = gsap.utils.toArray;

  function startLenis() {
    if (!window.Lenis) return function () {};
    var lenis = new Lenis({
      lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false,
      anchors: { offset: -96 }, stopInertiaOnNavigate: true, autoRaf: false
    });
    lenis.on('scroll', ScrollTrigger.update);
    var tick = function (t) { lenis.raf(t * 1000); };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    window.__lenis = lenis;
    return function () { gsap.ticker.remove(tick); lenis.destroy(); window.__lenis = null; };
  }

  /* Rise: display headline lines, each in its own mask */
  function riseLines(el, vars) {
    return SplitText.create(el, {
      type: 'lines', mask: 'lines', autoSplit: true, linesClass: 'rise-line',
      onSplit: function (self) {
        el.classList.add('is-split');
        return gsap.from(self.lines, Object.assign({ yPercent: 105, duration: 0.9, stagger: 0.07, ease: 'tptc.out' }, vars));
      }
    });
  }
  function rise() {
    toArray('[data-rise]').forEach(function (el) {
      if (el.hasAttribute('data-intro')) return;
      riseLines(el, { scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
    });
  }

  /* Settle: blocks rise 24px (16px on small screens) and fade in, batched */
  function settle(small) {
    var els = toArray('[data-settle]').filter(function (el) { return !el.hasAttribute('data-intro'); });
    if (!els.length) return;
    gsap.set(els, { opacity: 0, y: small ? 16 : 24 });
    ScrollTrigger.batch(els, {
      start: 'top 88%', once: true, interval: 0.1, batchMax: 6,
      onEnter: function (batch) {
        gsap.to(batch, { opacity: 1, y: 0, duration: 0.7, stagger: 0.09, ease: 'tptc.out', overwrite: true });
      }
    });
  }

  /* Unveil: the frame's inner layer rises while the picture counter-moves and settles from 1.12 */
  function unveil() {
    toArray('.frame[data-unveil]').forEach(function (fr) {
      var inner = fr.querySelector('.frame__inner');
      var media = fr.querySelector('.frame__media');
      var tl = gsap.timeline({
        defaults: { duration: 1.2, ease: 'tptc.out' },
        scrollTrigger: { trigger: fr, start: 'top 88%', once: true },
        onStart: function () { fr.classList.add('is-drawn'); }
      });
      tl.fromTo(inner, { yPercent: 100, y: 0 }, { yPercent: 0, y: 0 }, 0)
        .fromTo(media, { yPercent: -100, y: 0, scale: 1.12 }, { yPercent: 0, y: 0, scale: 1 }, 0);
    });
  }

  /* Chalk: court lines draw themselves when their court enters the view */
  function chalk() {
    toArray('[data-chalk], [data-chalk-self]').forEach(function (el) {
      if (el.matches('.frame[data-unveil]') || el.closest('[data-intro-root]')) return;
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: function () { el.classList.add('is-drawn'); }
      });
    });
  }

  /* Drift: the picture moves inside its frame; at most two per page, desktop only */
  function drift() {
    toArray('.frame[data-drift] .frame__drift').slice(0, 2).forEach(function (d) {
      gsap.fromTo(d, { yPercent: -6 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: d.closest('.frame'), start: 'clamp(top bottom)', end: 'bottom top', scrub: true }
      });
    });
  }

  /* Hold: the one sticky sequence on the site, the High Performance pathway */
  function hold() {
    var wrap = document.querySelector('[data-hold]');
    if (!wrap) return function () {};
    var fill = wrap.querySelector('.rail__fill');
    var steps = toArray('.step', wrap);
    var links = toArray('.pathway__steps-nav a', wrap);
    root.classList.add('hold-on');
    gsap.fromTo(fill, { scaleY: 0 }, {
      scaleY: 1, ease: 'none',
      scrollTrigger: { trigger: wrap.querySelector('[data-hold-steps]'), start: 'top 60%', end: 'bottom 60%', scrub: true }
    });
    var setActive = function (i) { links.forEach(function (l, j) { l.classList.toggle('is-active', i === j); }); };
    setActive(0);
    steps.forEach(function (st, i) {
      ScrollTrigger.create({
        trigger: st, start: 'top 60%', end: 'bottom 60%',
        onToggle: function (self) { if (self.isActive) setActive(i); }
      });
    });
    return function () { root.classList.remove('hold-on'); links.forEach(function (l) { l.classList.remove('is-active'); }); };
  }

  /* Load choreography: picture opaque from the first frame and settling, then headline, subline, actions */
  function intro() {
    toArray('[data-intro-root]').forEach(function (hero) {
      var media = hero.querySelector('.hero-media .frame__media, .hero-frame .frame__media');
      if (media) gsap.fromTo(media, { scale: 1.06 }, { scale: 1, duration: 1.4, ease: 'tptc.out' });
      toArray('[data-chalk], [data-chalk-self]', hero).forEach(function (el) {
        requestAnimationFrame(function () { el.classList.add('is-drawn'); });
      });
      var h = hero.querySelector('[data-rise][data-intro]');
      if (h) riseLines(h, { delay: 0.15 });
      toArray('[data-settle][data-intro]', hero).forEach(function (el) {
        var d = parseFloat(el.getAttribute('data-intro')) || 0.45;
        gsap.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, delay: d, ease: 'tptc.out' });
      });
    });
  }

  /* Season ledger (from Direction B): the dome inflates over the winter months once, the way the
     club's bubble goes up each October (scaleY from the baseline); fall sessions are laid like a
     court line, start to finish at an even pace; then today's mark arrives. Once, when seen. */
  function ledgers() {
    toArray('[data-ledger]').forEach(function (led) {
      var dome = led.querySelector('[data-dome]'), mark = led.querySelector('[data-ledger-today]');
      var sess = toArray('.ledger__session', led);
      var tl = gsap.timeline({ paused: true });
      if (dome) tl.fromTo(dome, { scaleY: 0 }, { scaleY: 1, duration: 1.6, ease: 'tptc.out', transformOrigin: '50% 100%' }, 0);
      if (sess.length) tl.fromTo(sess, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0 50%', duration: 0.9, ease: 'none', clearProps: 'transform' }, 0.3);
      if (mark && !mark.hidden) tl.fromTo(mark, { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.7, ease: 'tptc.out', transformOrigin: '50% 100%' }, 0.9);
      ScrollTrigger.create({ trigger: led, start: 'top 88%', once: true, onEnter: function () { tl.play(); } });
    });
  }

  /* Three contexts, so a change of width (rotation, resize) never replays a reveal:
     the reveals depend only on the motion preference; Lenis on a fine pointer; Drift and Hold on desktop. */
  var mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', function () {
    root.classList.add('motion');
    intro();
    rise();
    settle(window.matchMedia('(max-width: 767px)').matches);
    unveil();
    chalk();
    ledgers();
    return function () {
      root.classList.remove('motion');
      document.querySelectorAll('.is-drawn').forEach(function (el) { el.classList.remove('is-drawn'); });
    };
  });
  mm.add('(prefers-reduced-motion: reduce)', function () { root.classList.remove('motion'); });
  mm.add('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)', function () {
    return startLenis();
  });
  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 1024px)', function () {
    drift();
    return hold();
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
})();
