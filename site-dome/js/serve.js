/* The serve (from Direction A, client-approved 1 Oct 2026; physics, order and stories unchanged).
   Each court door serves the way real tennis is played, in the court's own plan
   (the court-h symbol: viewBox 120 x 60, one unit is one foot, court 78 x 36 ft from x 21,
   net at x 60, service lines at x 39 and 81, centre service line at y 30, singles sidelines at
   y 16.5 and 43.5). Toss, strike at the top, a flight that clears the net into the diagonally
   opposite service box, one bounce inside its lines, then on toward the back fence. Height
   reads from a ground shadow that meets the ball at the bounce.
   Each court tells its program's story:
   - Junior: the safe topspin serve a young player learns, slower and floating, struck at the top
     of the toss, clearing the net with room and dipping into the middle of the box.
   - High Performance: a flat first serve down the T, the fastest of the four.
   - Adult: a slice out wide, its ground track curving away.
   - Camps: serve and return, the ball comes back like a summer rally.
   The four doors serve in turn when the section comes into view, deuce, ad, deuce, ad, like the
   first four points of a game, then rest. Hover or keyboard focus replays a door's serve.
   Reduced motion: no flight; each ball rests at its bounce mark inside the correct box. */
(function () {
  'use strict';
  var balls = document.querySelectorAll('.court__ball');
  if (!balls.length) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var VB_W = 120, VB_H = 60, BASELINE = 21, CENTRE = 30;
  var LIFT = 0.55, HAND = 3.2;

  var KINDS = {
    junior: { top: 8.2, contact: 7.4, toss: 640, flight: 760, bounce: [72, 6.75], power: 3, after: { ms: 640, carry: 18, kick: 2.4 } },
    hp:     { top: 10.2, contact: 9.8, toss: 540, flight: 300, bounce: [79, 1.2], power: 2, after: { ms: 440, carry: 30, kick: 2 } },
    adult:  { top: 10, contact: 9.4, toss: 560, flight: 400, bounce: [75, 12], power: 1.8, curve: 4, after: { ms: 540, carry: 24, kick: 2.6 } },
    camps:  { top: 9.8, contact: 9.2, toss: 560, flight: 440, bounce: [72, 7], power: 2, rally: true }
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeIn(t) { return t * t; }
  function pt(x, y) { return { x: x, y: y }; }
  function line(a, b) { return function (s) { return pt(lerp(a.x, b.x, s), lerp(a.y, b.y, s)); }; }
  function bezier(a, c, b) {
    return function (s) {
      var m = 1 - s;
      return pt(m * m * a.x + 2 * s * m * c.x + s * s * b.x, m * m * a.y + 2 * s * m * c.y + s * s * b.y);
    };
  }
  function unit(dx, dy) { var l = Math.sqrt(dx * dx + dy * dy) || 1; return pt(dx / l, dy / l); }
  function carryOn(from, dir, k) {
    var to = pt(from.x + dir.x * k.carry, from.y + dir.y * k.carry);
    var path = line(from, to);
    return { ms: k.ms, at: function (e) {
      var u = easeOut(e), p = path(u);
      return { x: p.x, y: p.y, h: 4 * k.kick * u * (1 - u), a: e < 0.6 ? 1 : 1 - (e - 0.6) / 0.4 };
    } };
  }

  function plan(kind, side) {
    var k = KINDS[kind] || KINDS.camps;
    var from = pt(BASELINE - 1.2, CENTRE + 2.5 * side);
    var bounce = pt(k.bounce[0], CENTRE - k.bounce[1] * side);
    var path, dir;
    if (k.curve) {
      var ctrl = pt((from.x + bounce.x) / 2, (from.y + bounce.y) / 2 + k.curve * side);
      path = bezier(from, ctrl, bounce);
      dir = unit(bounce.x - ctrl.x, bounce.y - ctrl.y);
    } else {
      path = line(from, bounce);
      dir = unit(bounce.x - from.x, bounce.y - from.y);
    }
    /* Every serve descends from the strike: height falls monotonically from contact to the
       bounce, never above the contact point. The power sets how late the ball dips (drag and
       topspin pull it down harder near the end of its flight). */
    var height = function (s) { return k.contact * (1 - Math.pow(s, k.power)); };

    var segs = [
      { ms: k.toss, at: function (e) { return { x: from.x, y: from.y, h: lerp(HAND, k.top, easeOut(e)), a: 1 }; } },
      { ms: 80, at: function (e) { return { x: from.x, y: from.y, h: lerp(k.top, k.contact, easeIn(e)), a: 1 }; } },
      { ms: k.flight, at: function (e) {
        var s = 1 - Math.pow(1 - e, 1.15), p = path(s);
        return { x: p.x, y: p.y, h: height(s), a: 1 };
      } }
    ];

    if (k.rally) {
      var hit = pt(93, CENTRE - 9 * side);
      var land = pt(32, CENTRE + 8 * side);
      var toReceiver = line(bounce, hit), back = line(hit, land);
      segs.push({ ms: 360, at: function (e) {
        var u = easeOut(e), p = toReceiver(u);
        return { x: p.x, y: p.y, h: 3 * u + 4 * 1.2 * u * (1 - u), a: 1 };
      } });
      segs.push({ ms: 640, at: function (e) {
        var p = back(e);
        return { x: p.x, y: p.y, h: 3 * (1 - e) + 4 * 4 * e * (1 - e), a: 1 };
      } });
      segs.push(carryOn(land, unit(land.x - hit.x, land.y - hit.y), { ms: 460, carry: 12, kick: 2.4 }));
    } else {
      segs.push(carryOn(bounce, dir, k.after));
    }
    segs.push({ ms: 420, at: function () { return { x: from.x, y: from.y, h: HAND, a: 0 }; } });
    segs.push({ ms: 320, at: function (e) { return { x: from.x, y: from.y, h: HAND, a: e }; } });
    return { from: from, bounce: bounce, segs: segs };
  }

  var players = [];

  function setup(ball, index) {
    var court = ball.closest('.court');
    var door = ball.closest('.door');
    if (!court) return;
    var kind = door ? (door.className.match(/door--([a-z]+)/) || [])[1] : 'camps';
    var side = index % 2 === 0 ? 1 : -1;
    var p = plan(kind, side);

    var shadow = document.createElement('span');
    shadow.className = 'court__shadow';
    shadow.setAttribute('aria-hidden', 'true');
    court.insertBefore(shadow, ball);

    var map = { s: 1, ox: 0, oy: 0 };
    function measure() {
      var w = court.clientWidth, h = court.clientHeight;
      var s = Math.max(w / VB_W, h / VB_H);
      map = { s: s, ox: (w - VB_W * s) / 2, oy: (h - VB_H * s) / 2 };
    }
    function place(st) {
      var px = map.ox + st.x * map.s, py = map.oy + st.y * map.s;
      ball.style.transform = 'translate(' + px + 'px,' + (py - st.h * LIFT * map.s) + 'px) translate(-50%,-50%) scale(' + (1 + st.h * 0.035) + ')';
      ball.style.opacity = st.a;
      shadow.style.transform = 'translate(' + px + 'px,' + py + 'px) translate(-50%,-50%) scale(' + (1 + st.h * 0.02) + ')';
      shadow.style.opacity = Math.max(0.15, 0.55 - st.h * 0.035) * st.a;
    }
    function rest() {
      measure();
      if (reduce.matches) place({ x: p.bounce.x, y: p.bounce.y, h: 0, a: 1 });
      else place({ x: p.from.x, y: p.from.y, h: HAND, a: 1 });
    }

    var playing = false;
    function play() {
      if (playing || reduce.matches || !ball.offsetParent) return; /* hidden on phone thumbnails */
      playing = true;
      measure();
      var start = null;
      requestAnimationFrame(function step(now) {
        if (start === null) start = now;
        var t = now - start, i = 0;
        while (i < p.segs.length && t >= p.segs[i].ms) { t -= p.segs[i].ms; i++; }
        if (i >= p.segs.length) { playing = false; rest(); return; }
        place(p.segs[i].at(t / p.segs[i].ms));
        requestAnimationFrame(step);
      });
    }

    rest();
    if (window.ResizeObserver) new ResizeObserver(function () { if (!playing) rest(); }).observe(court);
    if (reduce.addEventListener) reduce.addEventListener('change', rest);
    if (door) {
      door.addEventListener('mouseenter', play);
      /* In the full site the door is an article with one stretched link (its title), so keyboard
         focus arrives on that link: replay when it is focused from the keyboard. */
      door.addEventListener('focusin', function (e) { if (e.target.matches(':focus-visible')) play(); });
    }
    players.push(play);
  }

  Array.prototype.forEach.call(balls, setup);

  var group = balls[0].closest('.doors') || balls[0].closest('section');
  if (group && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (!entries.some(function (en) { return en.isIntersecting; })) return;
      io.disconnect();
      if (reduce.matches) return;
      players.forEach(function (play, i) { setTimeout(play, 400 + i * 1150); });
    }, { threshold: 0.3 });
    io.observe(group);
  }
})();
