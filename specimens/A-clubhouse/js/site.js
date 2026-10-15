/* TPTC Direction A: site behaviour that does not depend on motion.
   Navigation, mobile sheet, disclosures, dated status chips, the live Pulse trigger. */
(function () {
  'use strict';
  var d = document;
  var h = d.documentElement;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var MONTHS = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); };

  /* Header: hairline appears after 40px of scroll (observer, no scroll listener) */
  var header = d.querySelector('[data-header]');
  if (header && 'IntersectionObserver' in window) {
    var sentinel = d.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:40px;pointer-events:none;';
    d.body.insertBefore(sentinel, d.body.firstChild);
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-scrolled', !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* Desktop dropdowns: Enter/Space/ArrowDown open, arrows move, Esc closes */
  var menus = $$('[data-menu]');
  function setOpen(m, open, focusFirst) {
    var btn = m.querySelector('.nav__trigger');
    m.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) m.removeAttribute('data-via');
    if (open && focusFirst) {
      var first = m.querySelector('.nav__panel a');
      if (first) first.focus();
    }
  }
  function closeAll(except) { menus.forEach(function (m) { if (m !== except) setOpen(m, false); }); }
  menus.forEach(function (m) {
    var btn = m.querySelector('.nav__trigger');
    var panel = m.querySelector('.nav__panel');
    var links = $$('a', panel);
    var timer;
    btn.addEventListener('click', function () {
      if (m.getAttribute('data-via') === 'hover') { m.setAttribute('data-via', 'click'); return; }
      var open = !m.classList.contains('is-open');
      closeAll(m);
      setOpen(m, open);
      if (open) m.setAttribute('data-via', 'click');
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); closeAll(m); setOpen(m, true, true); }
      else if (e.key === 'Escape') { setOpen(m, false); }
    });
    panel.addEventListener('keydown', function (e) {
      var i = links.indexOf(d.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); links[(i + 1) % links.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); links[(i - 1 + links.length) % links.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); links[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); links[links.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); setOpen(m, false); btn.focus(); }
    });
    m.addEventListener('focusout', function (e) {
      if (!m.contains(e.relatedTarget)) setOpen(m, false);
    });
    if (fine) {
      m.addEventListener('mouseenter', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          if (!m.classList.contains('is-open')) { closeAll(m); setOpen(m, true); m.setAttribute('data-via', 'hover'); }
        }, 70);
      });
      m.addEventListener('mouseleave', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { if (m.getAttribute('data-via') !== 'click' || !m.contains(d.activeElement)) setOpen(m, false); }, 200);
      });
    }
  });
  d.addEventListener('click', function (e) { if (!e.target.closest('[data-menu]')) closeAll(); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

  /* Mobile sheet: dialog, focus trapped, Esc closes, focus returns */
  var sheet = d.querySelector('[data-sheet]');
  var openBtn = d.querySelector('[data-sheet-open]');
  if (sheet && openBtn) {
    var closeBtn = sheet.querySelector('[data-sheet-close]');
    var lastFocus = null;
    var focusables = function () {
      return $$('a[href], button:not([disabled])', sheet).filter(function (el) {
        return el.getClientRects().length > 0;
      });
    };
    var openSheet = function () {
      lastFocus = d.activeElement;
      sheet.classList.add('is-open');
      d.body.classList.add('sheet-open');
      openBtn.setAttribute('aria-expanded', 'true');
      if (window.__tptcLenis) window.__tptcLenis.stop();
      setTimeout(function () { closeBtn.focus(); }, 80);
    };
    var closeSheet = function (restore) {
      if (!sheet.classList.contains('is-open')) return;
      sheet.classList.remove('is-open');
      d.body.classList.remove('sheet-open');
      openBtn.setAttribute('aria-expanded', 'false');
      if (window.__tptcLenis) window.__tptcLenis.start();
      if (restore !== false && lastFocus) lastFocus.focus();
    };
    openBtn.addEventListener('click', openSheet);
    closeBtn.addEventListener('click', function () { closeSheet(); });
    sheet.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables();
      if (!f.length) return;
      if (e.shiftKey && d.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && d.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    $$('[data-disclosure]', sheet).forEach(function (b) {
      b.addEventListener('click', function () {
        var panel = d.getElementById(b.getAttribute('aria-controls'));
        var open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.hidden = !open;
      });
    });
    sheet.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (a && a.getAttribute('href').length > 1) closeSheet(false);
    });
    window.matchMedia('(min-width: 1200px)').addEventListener('change', function (e) {
      if (e.matches) closeSheet(false);
    });
  }

  /* The one switch for the "Placeholder image" tags (system sheet demo) */
  $$('[data-ph-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var on = d.documentElement.classList.toggle('ph-tags');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      $$('.btn__label', b).forEach(function (l) { l.textContent = on ? 'Hide placeholder tags' : 'Show placeholder tags'; });
    });
  });

  /* Accordions: button + aria-expanded, height snaps, the answer settles in CSS */
  $$('[data-accordion] .faq__btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var panel = d.getElementById(b.getAttribute('aria-controls'));
      var open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    });
  });

  /* Placeholder labels: the ratio is read from the frame as drawn, never typed. The build
     writes it from --ar; this re-reads the rendered aspect-ratio so a CSS crop at a
     breakpoint is named as a crop of the master shot (data-master, from slots.json). */
  var slotFrames = $$('.frame[data-master]');
  var drawnRatio = function (f) {
    var media = f.querySelector('.frame__media');
    var ar = media ? getComputedStyle(media).aspectRatio : '';
    if (!ar || ar === 'auto') ar = getComputedStyle(f).getPropertyValue('--ar');
    var m = /([\d.]+)\s*\/\s*([\d.]+)/.exec(ar || '');
    return m ? parseFloat(m[1]) + ':' + parseFloat(m[2]) : null;
  };
  var labelRatios = function () {
    slotFrames.forEach(function (f) {
      var el = f.querySelector('.frame__ratio');
      var r = drawnRatio(f);
      if (!el || !r) return;
      var master = f.getAttribute('data-master');
      var t = r === master ? r : r + ' crop of ' + master;
      if (el.textContent !== t) el.textContent = t;
    });
  };
  if (slotFrames.length) {
    labelRatios();
    var ratioRaf = 0;
    window.addEventListener('resize', function () {
      cancelAnimationFrame(ratioRaf);
      ratioRaf = requestAnimationFrame(labelRatios);
    });
  }

  /* Dated status: computed in the browser from published dates only */
  var now = new Date();
  var fmt = function (dt) { return MONTHS[dt.getMonth()] + ' ' + dt.getDate() + ', ' + dt.getFullYear(); };
  $$('[data-window]').forEach(function (c) {
    var start = c.hasAttribute('data-start') ? new Date(c.getAttribute('data-start') + 'T00:00:00') : new Date(0); /* no start: already running (the indoor season, "early October") */
    var end = new Date(c.getAttribute('data-end') + 'T23:59:59');
    var txt = c.querySelector('.chip__text');
    if (now < start) {
      c.removeAttribute('data-live'); c.classList.add('chip--soon'); txt.textContent = c.getAttribute('data-before');
    } else if (now > end) {
      c.removeAttribute('data-live'); c.classList.add('chip--closed'); txt.textContent = c.getAttribute('data-after');
    } else {
      txt.textContent = c.getAttribute('data-during');
    }
  });
  $$('[data-asof]').forEach(function (el) { el.textContent = 'Status as of ' + fmt(now); });
  $$('[data-year]').forEach(function (el) { el.textContent = String(now.getFullYear()); });

  /* Pulse: the live dot bounces like a ball in play when first seen, then rests. Replays on hover or focus. */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var pulse = function (chip) {
    if (reduce.matches || !chip.hasAttribute('data-live')) return;
    chip.classList.remove('is-pulsing');
    void chip.offsetWidth;
    chip.classList.add('is-pulsing');
  };
  window.tptcPulse = pulse;
  /* System sheet: contrast measured from the live tokens */
  var hexOf = function (name) { return getComputedStyle(h).getPropertyValue(name).trim(); };
  var lum = function (hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return null;
    return [m[1], m[2], m[3]].map(function (x) {
      var c = parseInt(x, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce(function (acc, c, i) { return acc + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
  };
  var measure = function () {
    /* swatch captions name the value in force, so the sheet stays true in both schemes */
    $$('[data-hex]').forEach(function (el) {
      var v = hexOf(el.getAttribute('data-hex'));
      if (/^#[0-9a-f]{6}$/i.test(v)) el.textContent = v.toUpperCase();
    });
    $$('[data-cr]').forEach(function (el) {
      var pair = el.getAttribute('data-cr').split(' ');
      var a = lum(hexOf(pair[0])), b = lum(hexOf(pair[1]));
      if (a === null || b === null) return;
      var ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      el.textContent = ratio.toFixed(2);
      var pass = el.closest('tr') && el.closest('tr').querySelector('[data-cr-pass]');
      if (pass) pass.textContent = el.hasAttribute('data-cr-graphic')
        ? (ratio >= 3 ? 'Graphic 3:1' : 'Fail')
        : ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large' : 'Fail';
    });
  };
  measure();
  /* System sheet: colour scheme preview. "System" removes the override; a choice is kept per
     visitor, and storage may be blocked, so it is guarded. */
  var picks = $$('[data-theme-pick]');
  if (picks.length) {
    var cur = h.getAttribute('data-theme') || 'auto';
    picks.forEach(function (r) {
      r.checked = r.value === cur;
      r.addEventListener('change', function () {
        if (!r.checked) return;
        if (r.value === 'auto') h.removeAttribute('data-theme'); else h.setAttribute('data-theme', r.value);
        try { if (r.value === 'auto') localStorage.removeItem('tptc-theme'); else localStorage.setItem('tptc-theme', r.value); } catch (e) {}
        measure();
      });
    });
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', measure);
    }
  }

  /* System sheet: motion lab replays */
  $$('[data-play]').forEach(function (b) {
    b.addEventListener('click', function () {
      var kind = b.getAttribute('data-play');
      var t = d.querySelector(b.getAttribute('data-target'));
      if (!t) return;
      if (reduce.matches || !window.tptcMotion) {
        var msg = d.querySelector('[data-play-msg]');
        if (msg) msg.hidden = false;
        return;
      }
      if (kind === 'rise') window.tptcMotion.rise(t);
      else if (kind === 'settle') window.tptcMotion.settle(t.children);
      else if (kind === 'unveil') window.tptcMotion.unveil(t);
      else if (kind === 'press') window.tptcMotion.press(t);
      else if (kind === 'pulse') pulse(t);
    });
  });

  var liveChips = $$('.chip[data-live]:not([data-no-pulse])');
  if (liveChips.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { pulse(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 1, rootMargin: '0px 0px -10% 0px' });
    liveChips.forEach(function (c) {
      io.observe(c);
      var host = c.closest('.hlead, .hcard, .fact, [data-pulse-host]') || c;
      host.addEventListener('mouseenter', function () { pulse(c); });
      host.addEventListener('focusin', function () { pulse(c); });
    });
  }
})();
