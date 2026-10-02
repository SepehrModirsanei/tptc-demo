/* TPTC staff panel: the data layer (shared, owned by the foundation; module agents never edit it).

   One deterministic sample dataset, the same on every load, built from two things:
   1. The club's real facts (window.TPTC_CONTENT in js/facts.js, written by build.py from demo/content/*.json):
      four courts, the two seasons, the booking window and hours, the fee bands, membership
      categories and 2026/27 prices, programs, camps, leagues, refund policies.
   2. Fictional people and transactions (SAMPLE DATA): made-up Canadian names, example.com
      emails and 555-01xx phone numbers. Never a real member or a real staff name.

   Amounts are computed from the real fees in CAD. Membership, private lessons and the junior
   house league exclude HST, so 13% Ontario HST is added; court fees include HST, so the HST
   inside them is shown; camp prices do not say, so no HST is added and the record says so.

   Working changes live in localStorage under STORE_KEY as an overlay on the generated data,
   so Reset demo is one key removal. The public booking flow's stored booking is read from
   sessionStorage 'tptc-p1-booking' (see publicBooking()).

   Every module talks to window.PanelData only. The API is documented in ../PANEL.md. */
(function () {
  'use strict';
  var C = window.TPTC_CONTENT;
  if (!C) { console.error('PanelData: js/facts.js must load first'); return; }

  var STORE_KEY = 'tptc-panel-v1';
  var PUBLIC_KEY = 'tptc-p1-booking';
  var HST = 0.13;

  /* ---------- Time: the demo clock ----------
     The same rule as the public booking flow: before the dome goes up (or after it comes
     down) the panel sets its clock to the likely first indoor day, Oct 12, 2026 (club to
     confirm), at the real time of day. So a booking made on the public site lands on the
     same calendar the desk sees. */
  var INDOOR_START = new Date(2026, 9, 12);
  var INDOOR_END = new Date(2027, 3, 25);
  var real = new Date();
  var shifted = real < INDOOR_START || real > new Date(2027, 3, 25, 23, 59);
  var NOW = new Date(shifted ? INDOOR_START : real);
  if (shifted) NOW.setHours(real.getHours(), real.getMinutes(), 0, 0);
  var TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  var NOW_MIN = NOW.getHours() * 60 + NOW.getMinutes();

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function daysBetween(a, b) { return Math.round((parse(iso(b)) - parse(iso(a))) / 864e5); }
  function stamp(d, min) { var x = new Date(d); x.setHours(0, min || 0, 0, 0); return x.toISOString(); }

  var fmt = {
    money: function (n) {
      if (n == null || isNaN(n)) return '';
      var neg = n < 0, s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (neg ? '-$' : '$') + s;
    },
    time: function (min) {
      var h = Math.floor(min / 60) % 24, m = min % 60, ap = h < 12 ? 'am' : 'pm', h12 = h % 12 || 12;
      return h12 + (m ? ':' + pad(m) : '') + ap;
    },
    range: function (min, hours) { return fmt.time(min) + ' to ' + fmt.time(min + (hours || 1) * 60); },
    day: function (d) { d = typeof d === 'string' ? parse(d) : d; return DAYS[d.getDay()].slice(0, 3) + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(); },
    date: function (d) { d = typeof d === 'string' ? parse(d) : d; return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + d.getFullYear(); },
    long: function (d) { d = typeof d === 'string' ? parse(d) : d; return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); },
    stamp: function (s) { var d = new Date(s); return fmt.date(d) + ', ' + fmt.time(d.getHours() * 60 + d.getMinutes()); },
    iso: iso, parse: parse, addDays: addDays, daysBetween: daysBetween
  };

  /* ---------- Seeded randomness: the same dataset on every load ---------- */
  function fnv(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    var a = fnv(String(seed));
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function int(r, lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function hstOn(sub) { return round2(sub * HST); }
  function hstIn(total) { return round2(total - total / (1 + HST)); }

  /* ---------- The club's facts ---------- */
  var courts = [1, 2, 3, 4].map(function (n) { return { id: n, name: 'Court ' + n, short: 'C' + n }; });
  var seasons = C.seasons.map(function (s) { return Object.assign({}, s); });
  function seasonOf(d) {
    var s = iso(typeof d === 'string' ? parse(d) : d);
    for (var i = 0; i < seasons.length; i++) if (s >= seasons[i].start && s <= seasons[i].end) return seasons[i];
    return null;
  }
  var feeBands = C.booking.fee_bands.map(function (b) { return Object.assign({ hstIncluded: true }, b); });
  var FEE = {}; feeBands.forEach(function (b) { FEE[b.id] = b.fee; });
  var PLAYER_FEE = C.booking.non_member_player_fee;
  var WEEKDAY = { open: 390, close: 1410, primeFrom: 1110 };  // 6:30am to 11:30pm, prime from 6:30pm
  var WEEKEND = { open: 420, close: 1380 };                   // 7am to 11pm
  var PUBLIC_COURTS = [3, 4], PUBLIC_FROM = 1290;             // Fridays 9:30pm, 2 courts (which two: club to confirm)
  function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
  function indoorHours(d) { return isWeekend(d) ? WEEKEND : WEEKDAY; }
  function band(d, start) { d = typeof d === 'string' ? parse(d) : d; if (isWeekend(d)) return 'weekend'; return start >= WEEKDAY.primeFrom ? 'prime' : 'regular'; }
  function courtFee(d, start, hours) { var s = 0; for (var i = 0; i < (hours || 1); i++) s += FEE[band(d, start + i * 60)]; return s; }
  /* Indoor starts: weekdays on the half hour, weekends on the hour (the public flow's grid) */
  function indoorStarts(d) { var h = indoorHours(d), out = []; for (var m = h.open; m + 60 <= h.close; m += 60) out.push(m); return out; }

  /* Outdoor bookable windows, from the club's published outdoor schedule (content: hours.outdoor).
     Outside them, organized tennis has the courts ("Organized tennis is given priority"). */
  function outdoorWindows(d) {
    var dow = d.getDay(), mon = d.getMonth(), w = [[420, 540]];          // every day 7am to 9am
    if (dow >= 1 && dow <= 5 && (mon === 4 || mon === 5 || mon === 8)) w.push([540, 900]); // 9am to 3pm, May, June, Sept
    if (dow === 1) w.push([(mon < 6 || (mon === 6 && d.getDate() < 15)) ? 1260 : 1140, 1380]);
    if (dow === 2 || dow === 4) w.push([1260, 1380]);
    if (dow === 5) w.push([1140, 1380]);
    if (dow === 6) w = [[420, 1380]];
    if (dow === 0) w = [[420, 480], [840, 1080]];
    return w;
  }

  /* The same made-up but stable availability as the public booking flow
     (site/js/pages/p1-booking-flow.js, hash and hourState), so both sides agree on every hour. */
  function hash100(s) { return fnv(s) % 100; }
  function hourState(d, start, court) {
    if (d.getDay() === 5 && start >= PUBLIC_FROM && PUBLIC_COURTS.indexOf(court) > -1) return 'public';
    var busy = band(d, start) === 'regular' ? 30 : 58;
    return hash100(iso(d) + '|' + start + '|' + court) < busy ? 'taken' : 'free';
  }

  /* Membership pricing: the real 2026/27 indoor rates, resident first (15% Vaughan discount
     built in), $25 off for returning outdoor members (not Intercounty), plus 13% HST. */
  var CATS = [
    { id: 'adult', label: 'Adult', note: 'ages 18-64' },
    { id: 'couple', label: 'Couple', note: 'married' },
    { id: 'family', label: 'Family', note: 'same household' },
    { id: 'junior', label: 'Junior', note: 'ages 17 and under' },
    { id: 'senior', label: 'Senior', note: 'ages 65 and over' },
    { id: 'intercounty', label: 'Sunday Night Intercounty', note: 'matches only, pre-approved' }
  ];
  var categories = CATS.map(function (c, i) {
    var r = C.membership.indoor.rates[i];
    return Object.assign({}, c, { season: 'indoor-2026', resident: r.resident, nonResident: r.non_resident, source: r.category });
  });
  var outdoorCats = C.membership.outdoor.rates.map(function (r, i) {
    return { id: ['junior', 'student', 'adult', 'couple', 'family', 'intercounty'][i], label: r.category, fee: r.fee, season: 'outdoor-2026' };
  });
  function catById(id) { for (var i = 0; i < categories.length; i++) if (categories[i].id === id) return categories[i]; return null; }
  function membershipPrice(catId, opts) {
    opts = opts || {};
    var c = catById(catId); if (!c) return null;
    var base = opts.resident === false ? c.nonResident : c.resident;
    var discount = opts.returning && catId !== 'intercounty' ? C.membership.indoor.returning_amount : 0;
    var sub = round2(base - discount), hst = hstOn(sub);
    return { base: base, discount: discount, subtotal: sub, hst: hst, total: round2(sub + hst), hstIncluded: false };
  }

  /* ---------- People: fictional, realistic for Thornhill (SAMPLE DATA) ----------
     Names are combined at random from common given names and surnames; the club's board,
     coach and staff surnames are excluded so no record reads as a real person. */
  var FIRST = ['Daniel', 'Sarah', 'Michael', 'Rachel', 'David', 'Leah', 'Adam', 'Natalie', 'Ryan', 'Emily', 'Jonathan', 'Hannah',
    'Marco', 'Giulia', 'Luca', 'Sofia', 'Anthony', 'Francesca', 'Arash', 'Shirin', 'Kian', 'Nazanin', 'Darius', 'Yasmin',
    'Wei', 'Mei', 'Jason', 'Grace', 'Kevin', 'Vivian', 'Eric', 'Jenny', 'Min-jun', 'Ji-woo', 'Andrew', 'Hye-jin',
    'Dmitri', 'Anya', 'Alexei', 'Katya', 'Igor', 'Svetlana', 'Rohan', 'Priya', 'Arjun', 'Ananya', 'Vikram', 'Meera',
    'Liam', 'Olivia', 'Noah', 'Emma', 'Ethan', 'Ava', 'Lucas', 'Chloe', 'Owen', 'Maya', 'Nathan', 'Zoe', 'Julian', 'Ella',
    'Aaron', 'Talia', 'Eli', 'Noa', 'Gabriel', 'Isabella', 'Matteo', 'Alessia', 'Samuel', 'Abigail', 'Theo', 'Claire'];
  var LAST = ['Cohen', 'Levine', 'Goldberg', 'Friedman', 'Katz', 'Rosen', 'Weiss', 'Segal', 'Rossi', 'Bianchi', 'Romano', 'Ricci',
    'DeLuca', 'Esposito', 'Conti', 'Moretti', 'Ahmadi', 'Karimi', 'Hosseini', 'Rahimi', 'Tehrani', 'Moradi', 'Chen', 'Wong',
    'Li', 'Zhang', 'Liu', 'Lam', 'Kim', 'Park', 'Choi', 'Jung', 'Ivanov', 'Petrov', 'Volkov', 'Sokolov', 'Kuznetsov', 'Patel',
    'Shah', 'Mehta', 'Singh', 'Kapoor', 'Iyer', 'MacDonald', 'Campbell', 'Fraser', 'Tremblay', 'Gagnon', 'Roy', 'Leblanc',
    'Wilson', 'Thompson', 'Martin', 'Anderson', 'Clarke', 'Morrison', 'Stewart', 'Reid', 'Bennett', 'Hughes', 'Sullivan', 'Murphy'];
  var REAL_SURNAMES = ['Borenstein', 'Marquez', 'Shalamov', 'Jarvis', 'Rabinovitch', 'Brown', 'Shkolnikson', 'Widrich', 'Johnston'];
  var PLACES = [
    { city: 'Thornhill (Vaughan)', postal: 'L4J', resident: true }, { city: 'Concord (Vaughan)', postal: 'L4K', resident: true },
    { city: 'Maple (Vaughan)', postal: 'L6A', resident: true }, { city: 'Woodbridge (Vaughan)', postal: 'L4L', resident: true },
    { city: 'Thornhill (Markham)', postal: 'L3T', resident: false }, { city: 'Richmond Hill', postal: 'L4C', resident: false },
    { city: 'Toronto (North York)', postal: 'M2M', resident: false }
  ];
  var AREA = ['905', '416', '647', '289'];
  var phoneSeq = 0;
  function phone() { var n = phoneSeq++; return AREA[Math.floor(n / 100) % 4] + '-555-01' + pad(n % 100); }
  function slug(s) { return s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''); }

  var households = [], people = [];
  (function makePeople() {
    var r = rng('people-v1'), N = 168;
    var kinds = [['family', 28], ['couple', 18], ['adult', 30], ['senior', 10], ['junior', 14]];
    function kindOf() { var x = r() * 100, a = 0; for (var i = 0; i < kinds.length; i++) { a += kinds[i][1]; if (x < a) return kinds[i][0]; } return 'adult'; }
    for (var i = 1; i <= N; i++) {
      var last; do { last = pick(r, LAST); } while (REAL_SURNAMES.indexOf(last) > -1);
      var kind = kindOf(), place = r() < 0.64 ? pick(r, PLACES.slice(0, 4)) : pick(r, PLACES.slice(4));
      var hid = 'h' + pad3(i), h = { id: hid, name: last + ' household', surname: last, kind: kind, city: place.city, postal: place.postal + ' ' + int(r, 1, 9) + pick(r, ['A', 'B', 'C', 'E', 'G', 'H', 'J', 'K']) + int(r, 1, 9), resident: place.resident, people: [] };
      var adults = kind === 'family' || kind === 'couple' ? 2 : 1, kids = kind === 'family' ? int(r, 1, 3) : kind === 'junior' ? int(r, 1, 2) : 0;
      for (var a = 0; a < adults; a++) {
        var born = kind === 'senior' ? int(r, 1944, 1961) : kind === 'family' || kind === 'junior' ? int(r, 1974, 1990) : int(r, 1962, 2004);
        h.people.push(person(r, h, pick(r, FIRST), last, born, a === 0 ? 'primary' : 'adult'));
      }
      for (var k = 0; k < kids; k++) h.people.push(person(r, h, pick(r, FIRST), last, int(r, 2009, 2022), 'junior'));
      h.primary = h.people[0];
      households.push(h);
    }
    function person(r, h, first, last, born, role) {
      var id = 'p' + pad3(people.length + 1), age = 2026 - born;
      var p = {
        id: id, householdId: h.id, first: first, last: last, name: first + ' ' + last, born: born, age: age,
        role: role === 'junior' ? 'junior' : age >= 65 ? 'senior' : 'adult', primary: role === 'primary',
        email: role === 'junior' ? null : slug(first) + '.' + slug(last) + (people.length % 7 === 0 ? people.length : '') + '@example.com',
        phone: role === 'primary' ? phone() : role === 'adult' && r() < 0.6 ? phone() : null,
        resident: h.resident, city: h.city,
        rating: role === 'junior' ? null : pick(r, ['3.0', '3.0', '3.5', '3.5', '3.5', '4.0', '4.0', '4.5', 'Not rated']),
        marketing: r() < 0.7, notes: [], tags: [], sample: true
      };
      people.push(p);
      return p;
    }
  })();
  function pad3(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }

  /* ---------- Memberships: outdoor 2026 (finished) and indoor 2026/27 (current) ---------- */
  var memberships = [], payments = [], refunds = [], waitlists = [], reminders = [];
  var payN = 0, refN = 0;
  function method(r) { var x = r() * 100; return x < 50 ? 'Visa' : x < 85 ? 'Mastercard' : 'Interac'; }
  function payId(r) { payN++; return 'pay_' + (fnv('pay' + payN).toString(36) + '0000').slice(0, 6).toUpperCase() + pad3(payN % 1000); }
  function addPayment(r, o) {
    var m = o.method || method(r);
    var p = Object.assign({
      id: payId(r), status: 'succeeded', method: m, last4: m === 'Interac' ? null : String(int(r, 1000, 9999)),
      refunded: 0, currency: 'CAD', sample: true
    }, o);
    p.subtotal = round2(p.subtotal); p.hst = round2(p.hst); p.total = round2(p.total);
    payments.push(p);
    return p;
  }
  function memberCat(h, season) {
    if (h.kind === 'family') return 'family';
    if (h.kind === 'couple') return 'couple';
    if (h.kind === 'junior') return 'junior';
    if (h.kind === 'senior') return season === 'outdoor-2026' ? 'adult' : 'senior';
    return 'adult';
  }
  function rushDate(r, from, days) {
    /* Registration rushes on the day it opens, then tails off: most sign-ups in the first two weeks */
    var d = addDays(from, Math.floor(Math.pow(r(), 2.4) * days));
    return stamp(d, int(r, 600, 1380));
  }
  (function makeMemberships() {
    var r = rng('memberships-v1');
    households.forEach(function (h, i) {
      var hadOutdoor = r() < 0.56, juniorOnly = h.kind === 'junior';
      var payer = h.primary;
      if (hadOutdoor) {
        var oc = memberCat(h, 'outdoor-2026'), fee = (outdoorCats.filter(function (c) { return c.id === oc; })[0] || outdoorCats[2]).fee;
        var at = rushDate(r, new Date(2026, 3, 1), 45);
        var pay = addPayment(r, { at: at, personId: payer.id, householdId: h.id, kind: 'membership', season: 'outdoor-2026',
          description: 'Spring & Summer 2026 membership, ' + (outdoorCats.filter(function (c) { return c.id === oc; })[0] || outdoorCats[2]).label.split(' *')[0], subtotal: fee, hst: hstOn(fee), total: fee + hstOn(fee), hstIncluded: false });
        memberships.push({ id: 'm-o-' + h.id, householdId: h.id, personIds: h.people.map(function (p) { return p.id; }), season: 'outdoor-2026', category: oc,
          resident: h.resident, returning: false, subtotal: fee, hst: pay.hst, total: pay.total, status: 'ended', registeredAt: at, paymentId: pay.id, sample: true });
      }
      var x = r(), renews = hadOutdoor ? x < 0.68 : x < 0.42;
      if (juniorOnly && !hadOutdoor) renews = x < 0.2;
      var waitlisted = !renews && r() < 0.07;
      if (renews) {
        var cat = h.kind === 'adult' && r() < 0.06 ? 'intercounty' : memberCat(h, 'indoor-2026');
        var price = membershipPrice(cat, { resident: h.resident, returning: hadOutdoor });
        var at2 = rushDate(r, new Date(2026, 7, 1), 70);
        var pay2 = addPayment(r, { at: at2, personId: payer.id, householdId: h.id, kind: 'membership', season: 'indoor-2026',
          description: 'Fall & Winter 2026/27 membership, ' + catById(cat).label + (h.resident ? ', Vaughan resident' : ', non-resident') + (price.discount ? ', returning' : ''),
          subtotal: price.subtotal, hst: price.hst, total: price.total, hstIncluded: false });
        var m = { id: 'm-i-' + h.id, householdId: h.id, personIds: h.people.map(function (p) { return p.id; }), season: 'indoor-2026', category: cat,
          resident: h.resident, returning: hadOutdoor, base: price.base, discount: price.discount, subtotal: price.subtotal, hst: price.hst, total: price.total,
          status: 'active', registeredAt: at2, paymentId: pay2.id, sample: true };
        if (cat === 'intercounty') m.preApproved = true;
        /* A few use the club's 7-day satisfaction refund: 100% less the $50 administration fee */
        if (r() < 0.025) {
          var amt = round2(pay2.total - C.refunds.admin_fee);
          refunds.push({ id: 're_' + pad3(++refN), paymentId: pay2.id, at: stamp(addDays(new Date(at2), int(r, 1, 6)), 660), amount: amt, adminFee: C.refunds.admin_fee,
            reason: 'Not satisfied within 7 days', policy: 'membership', by: 'Administrator', status: 'succeeded', sample: true });
          pay2.status = 'refunded'; pay2.refunded = amt; m.status = 'refunded';
        }
        memberships.push(m);
      } else if (waitlisted) {
        waitlists.push({ id: 'w-m-' + h.id, list: 'membership-indoor-2026', sessionId: null, personId: payer.id, householdId: h.id,
          addedAt: rushDate(r, new Date(2026, 8, 1), 40), status: 'waiting', note: 'Indoor membership', sample: true });
      }
      if (hadOutdoor && !renews) {
        reminders.push({ id: 'rm-' + h.id + '-1', personId: payer.id, householdId: h.id, kind: 'renewal', channel: 'email', at: stamp(new Date(2026, 7, 1), 600), status: 'sent', sample: true });
        if (r() < 0.6) reminders.push({ id: 'rm-' + h.id + '-2', personId: payer.id, householdId: h.id, kind: 'renewal', channel: 'email', at: stamp(new Date(2026, 8, 15), 600), status: 'sent', sample: true });
      }
    });
    waitlists.filter(function (w) { return w.list === 'membership-indoor-2026'; })
      .sort(function (a, b) { return a.addedAt < b.addedAt ? -1 : 1; })
      .forEach(function (w, i) { w.position = i + 1; });
  })();

  /* ---------- Programs: sessions with capacity, registrations, waitlists ----------
     Session dates, ages, levels, locations and prices are the club's own. Where the club does
     not publish something (group lesson prices, class days and times, Fall & Winter 2026/27
     dates) the field is null and `gaps` names it, so a module shows "Club to confirm".
     Capacities and every registration are SAMPLE DATA. */
  var sessions = [], registrations = [];
  var regN = 0;
  function statusOf(start, end) {
    if (!start || !end) return 'draft';
    var t = iso(TODAY);
    return end < t ? 'finished' : start > t ? 'upcoming' : 'running';
  }
  function addSession(o) {
    var s = Object.assign({ capacitySample: true, sample: false, gaps: [] }, o);
    s.status = o.status || statusOf(s.start, s.end);
    sessions.push(s);
    return s;
  }
  function ageOk(p, lo, hi, onDate) { var age = (onDate ? +onDate.slice(0, 4) : 2026) - p.born; return p.role === 'junior' ? age >= lo && age <= hi : false; }
  function addReg(r, s, p, at, extra) {
    var reg = Object.assign({ id: 'r' + ('000' + (++regN)).slice(-4), sessionId: s.id, personId: p.id, householdId: p.householdId, createdAt: at,
      status: 'confirmed', option: null, price: s.price, hst: 0, total: s.price, paymentId: null, sample: true }, extra || {});
    registrations.push(reg);
    return reg;
  }
  function fill(r, s, pool, ratio, opts) {
    opts = opts || {};
    var want = Math.min(pool.length, Math.round(s.capacity * ratio)), used = {};
    var seats = 0, out = [];
    for (var tries = 0; tries < want * 4 && seats < want + (opts.overflow || 0); tries++) {
      var p = pool[Math.floor(r() * pool.length)];
      if (used[p.id]) continue;
      used[p.id] = 1; seats++;
      out.push(p);
    }
    return out;
  }

  var GROUP_TERMS = [
    { id: 'gl-fall-2025', label: 'Fall & Winter Indoor 2025/26, Session 1', start: '2025-10-02', end: '2026-01-14', indoor: true, opens: '2025-09-02' },
    { id: 'gl-winter-2026', label: 'Winter Indoor 2026, Session 2', start: '2026-01-15', end: '2026-04-26', indoor: true, opens: '2026-01-02' },
    { id: 'gl-spring-2026', label: 'Spring Outdoor 2026 (8 weeks)', start: '2026-05-01', end: '2026-06-25', indoor: false, opens: '2026-04-06' },
    { id: 'gl-summer-2026', label: 'Summer Outdoor 2026', start: null, end: null, indoor: false, opens: '2026-06-11', past: true },
    { id: 'gl-sumfall-2026', label: 'Summer/Fall Outdoor 2026 (7 weeks)', start: '2026-08-21', end: '2026-10-08', indoor: false, opens: '2026-08-06' },
    { id: 'gl-indoor-2026', label: 'Fall & Winter Indoor 2026/27', start: null, end: null, indoor: true, opens: null }
  ];
  var GAP_PRICE = 'Group lesson price (the site shows none; it is only inside JBI)';
  var GAP_TIMES = 'Class days and times';
  (function makeGroup() {
    var r = rng('group-v1');
    var juniors = people.filter(function (p) { return p.role === 'junior'; });
    var adults = people.filter(function (p) { return p.role !== 'junior'; });
    GROUP_TERMS.forEach(function (term) {
      var classes = [];
      C.programs.junior_age_bands.forEach(function (b) {
        var ages = b.band.replace('Ages ', '').split('-').map(Number);
        b.levels.forEach(function (lv) { classes.push({ who: 'Junior', band: b.band, lo: ages[0], hi: ages[1], level: lv, cap: ages[0] === 4 ? 6 : 8 }); });
      });
      C.programs.adult_levels.forEach(function (lv) { classes.push({ who: 'Adult', band: 'Adults', level: lv, cap: 8 }); });
      classes.forEach(function (c, i) {
        var s = addSession({
          id: term.id + '-' + i, kind: 'group', program: c.who === 'Junior' ? 'Junior Recreational' : 'Adult Group Lessons',
          title: (c.who === 'Junior' ? c.band + ', ' : 'Adults, ') + c.level, ageBand: c.band, level: c.level,
          term: term.label, termId: term.id, start: term.start, end: term.end, registrationOpens: term.opens,
          location: term.indoor ? 'Yonge & Centre (the Dome)' : pick(r, ['Yonge & Centre', 'Yonge & Centre', 'North Thornhill Community Centre', 'Garnet Williams Community Centre']),
          days: null, times: null, capacity: c.cap, price: null, hstIncluded: false,
          gaps: [GAP_PRICE, GAP_TIMES].concat(term.start ? [] : [term.label + ' dates']), status: term.past ? 'finished' : null, source: '/programs-and-lessons/'
        });
        if (s.status === 'draft') return;
        var pool = c.who === 'Junior' ? juniors.filter(function (p) { return ageOk(p, c.lo, c.hi); }) : adults;
        var ratio = 0.55 + r() * 0.5;
        fill(r, s, pool, ratio, { overflow: 2 }).forEach(function (p, k) {
          var at = stamp(addDays(parse(term.opens), Math.floor(Math.pow(r(), 2) * 20)), 600 + int(r, 0, 600));
          if (k < s.capacity) addReg(r, s, p, at);
          else waitlists.push({ id: 'w-' + s.id + '-' + p.id, list: 'session', sessionId: s.id, personId: p.id, householdId: p.householdId, addedAt: at, status: s.status === 'finished' ? 'closed' : 'waiting', position: k - s.capacity + 1, sample: true });
        });
      });
    });
  })();

  /* High Performance: the Fall Outdoor 2026 session and the pathway (pre-approval by the Head Pro) */
  (function makeHP() {
    var r = rng('hp-v1');
    var juniors = people.filter(function (p) { return p.role === 'junior'; });
    var bands = [['Little Champs', 6, 9, 10], ['Transition Tour', 10, 15, 12], ['Pro National', 12, 17, 10]];
    bands.forEach(function (b, i) {
      var s = addSession({
        id: 'hp-fall-2026-' + i, kind: 'hp', program: 'High Performance', title: b[0], ageBand: 'Ages ' + b[1] + '-' + b[2], level: b[0],
        term: 'Fall Outdoor 2026', termId: 'hp-fall-2026', start: '2026-08-24', end: '2026-10-08', registrationOpens: '2026-08-18',
        location: 'Club to confirm', days: null, times: null, capacity: b[3], price: null, hstIncluded: false,
        needsApproval: b[0] === 'Pro National', gaps: ['High Performance price', GAP_TIMES], source: '/high-performance-program/'
      });
      if (b[0] === 'Pro National') s.ageBand = 'Provincial and national level';
      fill(r, s, juniors.filter(function (p) { return ageOk(p, b[1], b[2]); }), 0.6 + r() * 0.35).forEach(function (p) {
        addReg(r, s, p, stamp(addDays(new Date(2026, 7, 18), int(r, 0, 8)), 600 + int(r, 0, 500)), s.needsApproval ? { approval: r() < 0.85 ? 'approved' : 'pending' } : null);
      });
    });
  })();

  /* Summer Camps 2026: weekly, three price tiers by the date a family registered */
  var TIER_DATES = [['2026-02-16', '2026-02-23'], ['2026-02-24', '2026-04-30'], ['2026-05-01', '2026-09-04']];
  function campPrice(row, option, at) {
    var d = at.slice(0, 10), t = 2;
    for (var i = 0; i < TIER_DATES.length; i++) if (d >= TIER_DATES[i][0] && d <= TIER_DATES[i][1]) { t = i; break; }
    var p = C.camps.summer.tiers[t].prices[row], key = { full: 'full_day', half_am: 'half_day', half_pm: 'half_day', morning: 'morning_8am_11am', afternoon: 'afternoon_12pm_3pm' }[option];
    var m = /\$([0-9.]+)/.exec(p[key] || '');
    return { price: m ? +m[1] : null, tier: C.camps.summer.tiers[t].period };
  }
  (function makeCamps() {
    var r = rng('camps-v1');
    var juniors = people.filter(function (p) { return p.role === 'junior'; });
    var CAMPS = [
      { id: 'rec-yc', row: 0, name: 'Recreational Camp', location: 'Yonge & Centre', ages: [4, 15], first: '2026-06-15', weeks: 12, cap: 24, opts: ['full', 'half_am', 'half_pm'] },
      { id: 'rec-nt', row: 1, name: 'Recreational Camp', location: 'North Thornhill Community Centre', ages: [4, 15], first: '2026-06-15', weeks: 12, cap: 16, opts: ['full', 'half_am', 'half_pm'] },
      { id: 'hp-gw', row: 2, name: 'High Performance Camp (Little Champs, Transition Tour, Pro National Fri/Sun groups)', location: 'Garnet Williams Community Centre', ages: [5, 17], first: '2026-06-29', weeks: 10, cap: 12, opts: ['full', 'half_am', 'half_pm'] },
      { id: 'pn-yc', row: 3, name: 'Pro National Camp (Mon-Thu groups)', location: 'Yonge & Centre', ages: [9, 17], first: '2026-06-15', weeks: 12, cap: 10, opts: ['morning', 'afternoon'] }
    ];
    var OPT = { full: 'Full day, 9am to 4pm', half_am: 'Half day, 9am to 12pm', half_pm: 'Half day, 1pm to 4pm', morning: 'Morning, 8am to 11am', afternoon: 'Afternoon, 12pm to 3pm' };
    CAMPS.forEach(function (c) {
      for (var w = 0; w < c.weeks; w++) {
        var start = addDays(parse(c.first), w * 7), end = addDays(start, 4);
        var s = addSession({
          id: 'camp-' + c.id + '-w' + (w + 1), kind: 'camp', program: 'Summer Camps', title: c.name + ', week ' + (w + 1), campId: c.id, week: w + 1,
          ageBand: 'Ages ' + c.ages[0] + '-' + c.ages[1], location: c.location, term: 'Summer 2026', termId: 'camps-summer-2026',
          start: iso(start), end: iso(end), registrationOpens: '2026-02-16', capacity: c.cap, price: null, priceUnit: 'week', options: c.opts.map(function (o) { return { id: o, label: OPT[o] }; }),
          hstIncluded: null, gaps: ['Whether HST is included in camp prices'], source: '/camps/'
        });
        /* July fills first; the last weeks of August thin out */
        var peak = 1 - Math.abs(w - 4) / 8, ratio = Math.min(1.12, 0.3 + peak * 0.72 + r() * 0.14);
        var pool = juniors.filter(function (p) { return ageOk(p, c.ages[0], c.ages[1]); });
        fill(r, s, pool, ratio, { overflow: 3 }).forEach(function (p, k) {
          var at = stamp(addDays(new Date(2026, 1, 16), Math.floor(Math.pow(r(), 1.8) * 110)), 600 + int(r, 0, 700));
          if (k >= c.cap) {
            waitlists.push({ id: 'w-' + s.id + '-' + p.id, list: 'session', sessionId: s.id, personId: p.id, householdId: p.householdId, addedAt: at, status: 'closed', position: k - c.cap + 1, sample: true });
            return;
          }
          var opt = pick(r, c.opts), cp = campPrice(c.row, opt, at);
          var reg = addReg(r, s, p, at, { option: opt, optionLabel: OPT[opt], price: cp.price, total: cp.price, tier: cp.tier });
          var payer = idx0(p.householdId);
          var pay = addPayment(r, { at: at, personId: payer.id, householdId: p.householdId, kind: 'camp', season: 'camps-summer-2026', ref: { type: 'registration', id: reg.id },
            description: 'Summer Camps 2026, ' + c.name.split(' (')[0] + ', week of ' + fmt.date(start) + ', ' + OPT[opt].split(',')[0].toLowerCase() + ' (' + cp.tier.toLowerCase().replace('!', '') + ')',
            subtotal: cp.price, hst: 0, total: cp.price, hstIncluded: null, hstNote: 'HST treatment not stated on the camp page (club to confirm)' });
          reg.paymentId = pay.id;
          /* Summer camp refunds: written notice 3 weeks or more before the week, less $50 */
          if (r() < 0.03) {
            var amt = round2(cp.price - C.refunds.admin_fee);
            refunds.push({ id: 're_' + pad3(++refN), paymentId: pay.id, at: stamp(addDays(start, -int(r, 22, 40)), 640), amount: amt, adminFee: C.refunds.admin_fee,
              reason: 'Written notice 3 weeks or more before the camp week', policy: 'summer_camp', by: 'Front desk', status: 'succeeded', sample: true });
            pay.status = 'refunded'; pay.refunded = amt; reg.status = 'refunded';
          }
        });
      }
    });
  })();
  function idx0(hid) { for (var i = 0; i < households.length; i++) if (households[i].id === hid) return households[i].primary; return null; }

  /* Winter Break 2026/27: not published yet, a draft the desk will fill in */
  addSession({ id: 'camp-winter-2026', kind: 'camp', program: 'Winter Break Camp', title: 'Winter Break Camp 2026/27', term: 'Winter Break 2026/27', termId: 'camps-winter-2026',
    start: null, end: null, capacity: null, price: null, location: 'Yonge & Centre', ageBand: 'Ages 4-15',
    gaps: ['Winter Break 2026/27 dates, prices and registration opening (last year: Dec 22, 2025 to Jan 2, 2026, registration opened Dec 8)'], source: '/camps/' });

  /* Fall & Winter leagues and round robins: real day, time, level and fee; 2026/27 dates not published */
  (function makeLeagues() {
    var r = rng('leagues-v1');
    var adults = people.filter(function (p) { return p.role !== 'junior'; });
    C.leagues.filter(function (l) { return /Fall & Winter/.test(l.season); }).forEach(function (l, i) {
      var fee = /\$([0-9.]+)/.exec(l.fee || ''), cap = /ROUND ROBIN/.test(l.name) ? 16 : 12;
      var s = addSession({ id: 'lg-' + i, kind: 'league', program: /ROUND ROBIN/.test(l.name) ? 'Round Robins' : 'Leagues', title: titleCase(l.name), level: l.level, days: l.day_time,
        term: 'Fall & Winter 2026/27', termId: 'leagues-indoor-2026', start: null, end: null, capacity: cap, price: fee ? +fee[1] : null,
        priceUnit: /week/.test(l.fee || '') ? 'week' : 'event', hstIncluded: null, waitlistOnly: !!l.waitlist, location: 'Yonge & Centre (the Dome)',
        gaps: ['Fall & Winter 2026/27 league dates'], status: 'open', source: '/programs-overview/' });
      fill(r, s, adults, 0.7 + r() * 0.4, { overflow: 4 }).forEach(function (p, k) {
        var at = stamp(addDays(new Date(2026, 8, 1), int(r, 0, 38)), 600 + int(r, 0, 600));
        if (k < cap) addReg(r, s, p, at, { price: s.price, total: s.price, note: 'Fee charged per ' + s.priceUnit + ' played' });
        else waitlists.push({ id: 'w-' + s.id + '-' + p.id, list: 'session', sessionId: s.id, personId: p.id, householdId: p.householdId, addedAt: at, status: 'waiting', position: k - cap + 1, sample: true });
      });
    });
  })();
  function titleCase(s) { return s.toLowerCase().replace(/(^|[\s(/])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/\bAnd\b/g, 'and').replace(/'S\b/g, "'s"); }

  /* ---------- Bookings ----------
     Indoor 2026/27: every hour the public booking flow shows as taken is a booking here, from
     the first indoor day to the end of the members' 7-day window, so the desk and the public
     site agree. A taken hour at a published league or round robin time is that league.
     Outdoor 2026: member bookings inside the club's published outdoor booking windows, no court
     fee (members played free outdoors). People, mixes and statuses are SAMPLE DATA. */
  var bookings = [];
  function leagueAt(d, start) {
    var dow = d.getDay();
    if (dow === 4 && start >= 1170) return "Men's and Women's Doubles House League";
    if (dow === 1 && start >= 1170) return 'Singles House League';
    if ((dow === 1 || dow === 3 || dow === 5) && start >= 570 && start < 690) return 'Weekday Mixed Doubles Round Robin';
    if (dow === 0 && start >= 600 && start < 720) return 'Weekend Mixed Doubles Round Robin';
    if (dow === 0 && start >= 1140 && start < 1260) return "Men's Interclub";
    if ((dow === 6 || dow === 0) && start >= 1260) return 'Advanced Doubles House League';
    return null;
  }
  (function makeBookings() {
    var r = rng('bookings-v1');
    var indoorMembers = [], outdoorMembers = [];
    memberships.forEach(function (m) {
      var adults = m.personIds.map(personById0).filter(function (p) { return p && p.role !== 'junior'; });
      if (m.season === 'indoor-2026' && m.status === 'active') indoorMembers = indoorMembers.concat(adults.length ? adults : m.personIds.map(personById0));
      if (m.season === 'outdoor-2026') outdoorMembers = outdoorMembers.concat(adults.length ? adults : m.personIds.map(personById0));
    });
    var contacts = people.filter(function (p) { return p.role !== 'junior' && indoorMembers.indexOf(p) < 0; });

    /* Indoor */
    var last = addDays(TODAY, 7);
    for (var d = new Date(INDOOR_START); d <= last && d <= INDOOR_END; d = addDays(d, 1)) {
      if (iso(d) === iso(last) && NOW_MIN < 450) break;   // the newest day opens at 7:30am
      var starts = indoorStarts(d);
      for (var c = 1; c <= 4; c++) {
        for (var si = 0; si < starts.length; si++) {
          var st = starts[si], state = hourState(d, st, c);
          if (state === 'free') continue;
          var key = iso(d) + '|' + st + '|' + c, h = fnv('kind|' + key) % 100;
          var b = { id: 'b-' + iso(d).replace(/-/g, '') + '-' + c + '-' + st, season: 'indoor-2026', date: iso(d), start: st, hours: 1, court: c,
            band: band(d, st), source: 'online', createdAt: stamp(addDays(d, -int(r, 0, 7)), 450 + int(r, 0, 600)), status: 'booked', hstIncluded: true, sample: true };
          var lg = state === 'taken' ? leagueAt(d, st) : null;
          if (state === 'public') {
            Object.assign(b, { type: 'public', title: 'Indoor public hours (weekly lottery)', players: null, courtFee: 0, extra: 0, total: 0, source: 'lottery' });
          } else if (lg) {
            Object.assign(b, { type: 'league', title: lg, players: 4, courtFee: 0, extra: 0, total: 0, source: 'program' });
          } else if (h < 7) {
            var kind = h < 2 ? 'Semi-private' : 'Private', rate = C.programs.private[kind === 'Private' ? 0 : 1].price;
            Object.assign(b, { type: 'lesson', title: kind + ' lesson, Head Pro', personId: pick(r, contacts.concat(indoorMembers)).id, players: kind === 'Private' ? 2 : 3,
              courtFee: 0, extra: 0, lessonFee: rate, hstIncluded: false, total: round2(rate + hstOn(rate)), source: 'head-pro', by: 'Head Pro' });
          } else if (h < 11) {
            Object.assign(b, { type: 'hold', title: pick(r, ['Held for an assessment', 'Held for court maintenance', 'Held for a lesson make-up']), players: null, courtFee: 0, extra: 0, total: 0, source: 'front-desk', by: 'Front desk' });
          } else if (h < 22) {
            var pl = r() < 0.7 ? 2 : 4, nm = pick(r, contacts);
            Object.assign(b, { type: 'non-member', title: 'Non-member booking', personId: nm.id, players: pl, courtFee: FEE[b.band], extra: pl * PLAYER_FEE });
          } else {
            var two = si + 1 < starts.length && hourState(d, starts[si + 1], c) === 'taken' && !leagueAt(d, starts[si + 1]) && r() < 0.35;
            var pm = pick(r, indoorMembers), players = r() < 0.62 ? 2 : 4, guests = r() < 0.18 ? 1 : 0;
            Object.assign(b, { type: 'member', title: 'Member booking', personId: pm.id, players: players, guests: guests, hours: two ? 2 : 1,
              courtFee: courtFee(d, st, two ? 2 : 1), extra: guests * PLAYER_FEE });
            if (two) si++;
          }
          if (b.courtFee != null && b.type !== 'lesson') b.total = round2(b.courtFee + (b.extra || 0));
          if (b.type === 'member' || b.type === 'non-member' || b.type === 'lesson') {
            var paidNow = b.type !== 'member' || r() < 0.58;
            b.paid = paidNow;
            if (paidNow && b.total) {
              var pay = addPayment(r, { at: b.createdAt, personId: b.personId, householdId: personById0(b.personId).householdId, kind: b.type === 'lesson' ? 'lesson' : 'court', season: 'indoor-2026',
                ref: { type: 'booking', id: b.id }, description: b.title + ', ' + courts[c - 1].name + ', ' + fmt.day(d) + ', ' + fmt.range(st, b.hours),
                subtotal: b.type === 'lesson' ? b.lessonFee : round2(b.total - hstIn(b.total)), hst: b.type === 'lesson' ? hstOn(b.lessonFee) : hstIn(b.total), total: b.total, hstIncluded: b.type !== 'lesson' });
              b.paymentId = pay.id;
            }
          }
          var end = new Date(d); end.setHours(0, st + b.hours * 60, 0, 0);
          if (end <= NOW && (b.type === 'member' || b.type === 'non-member')) b.status = h % 50 === 13 ? 'no-show' : 'completed';
          else if (end <= NOW) b.status = 'completed';
          bookings.push(b);
        }
      }
    }

    /* Outdoor 2026, May 1 to Sep 30: on the hour inside the published windows */
    for (var od = new Date(2026, 4, 1); od <= new Date(2026, 8, 30); od = addDays(od, 1)) {
      outdoorWindows(od).forEach(function (w) {
        for (var m = w[0]; m + 60 <= w[1]; m += 60) {
          for (var oc = 1; oc <= 4; oc++) {
            var k = 'o|' + iso(od) + '|' + m + '|' + oc, hv = fnv(k) % 100;
            var busy = od.getDay() === 0 || od.getDay() === 6 ? 62 : m < 540 ? 48 : m >= 1140 ? 70 : 34;
            if (hv >= busy) continue;
            var who = outdoorMembers[fnv('w' + k) % outdoorMembers.length];
            bookings.push({ id: 'b-' + iso(od).replace(/-/g, '') + '-' + oc + '-' + m, season: 'outdoor-2026', date: iso(od), start: m, hours: 1, court: oc,
              band: 'outdoor', type: 'member', title: 'Member booking', personId: who.id, players: hv % 3 === 0 ? 4 : 2, guests: 0,
              courtFee: 0, extra: 0, total: 0, paid: true, hstIncluded: true, source: 'online', createdAt: stamp(addDays(od, -(hv % 7)), 450 + hv * 7),
              status: hv === 7 ? 'no-show' : hv === 11 ? 'late-cancel' : 'completed', sample: true });
          }
        }
      });
    }
  })();
  function personById0(id) { for (var i = 0; i < people.length; i++) if (people[i].id === id) return people[i]; return null; }

  /* ---------- Content: the site's news, "What's happening" cards and season dates ---------- */
  var content = [];
  C.news.forEach(function (n, i) {
    content.push({ id: 'news-' + (i + 1), type: 'news', title: n.title, body: n.excerpt || '', status: 'published', listingDate: n.listing_date, updatedAt: n.modified, note: n.status, source: n.source });
  });
  C.whats_happening.forEach(function (c, i) {
    content.push({ id: 'card-' + (i + 1), type: 'card', title: c.card, body: c.fact || '', gap: c.gap || null, status: c.fact ? 'published' : 'draft', note: c.status || null, updatedAt: '2026-09-30', source: c.source || null });
  });
  seasons.forEach(function (s) {
    content.push({ id: 'season-' + s.id, type: 'season', title: s.name, start: s.start, end: s.end, startToConfirm: !!s.start_to_confirm, approx: !!s.approx, body: s.source, status: 'published', updatedAt: '2026-09-30', source: s.src });
  });

  /* ---------- The working copy: generated data plus the demo's changes ----------
     localStorage[STORE_KEY] = { v: 1, changes: { <collection>: { <id>: record | null } }, activity: [...] }
     null removes a record. Nothing ever leaves the browser. */
  var BASE = {
    people: people, households: households.map(function (h) { var o = Object.assign({}, h); o.personIds = h.people.map(function (p) { return p.id; }); o.primaryId = h.primary.id; delete o.people; delete o.primary; return o; }),
    memberships: memberships, bookings: bookings, sessions: sessions, registrations: registrations, waitlists: waitlists,
    payments: payments, refunds: refunds, reminders: reminders, content: content
  };
  var NAMES = Object.keys(BASE);
  var store = { v: 1, changes: {}, activity: [] };
  var storageOk = true;
  function load() {
    try { var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (s && s.v === 1) store = s; } catch (e) { storageOk = false; }
    store.changes = store.changes || {}; store.activity = store.activity || [];
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { storageOk = false; } }
  var data = {}, idx = {};
  function build() {
    NAMES.forEach(function (n) {
      var ch = store.changes[n] || {}, seen = {}, out = [];
      BASE[n].forEach(function (rec) {
        if (rec.id in ch) { seen[rec.id] = 1; if (ch[rec.id]) out.push(ch[rec.id]); }
        else out.push(rec);
      });
      Object.keys(ch).forEach(function (id) { if (!seen[id] && ch[id]) out.push(ch[id]); });
      data[n] = out; idx[n] = {};
      out.forEach(function (rec) { idx[n][rec.id] = rec; });
    });
  }
  load(); build();

  function role() { if (window.__panelRole) return window.__panelRole; try { return localStorage.getItem('tptc-panel-role') || 'frontdesk'; } catch (e) { return 'frontdesk'; } }
  var ROLE_NAMES = { frontdesk: 'Front desk', headpro: 'Head Pro', admin: 'Administrator' };
  function nowStamp() { var d = new Date(TODAY); d.setHours(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds(), 0); return d.toISOString(); }
  function emit(detail) {
    try { window.dispatchEvent(new CustomEvent('panel:change', { detail: detail })); } catch (e) { /* old browser: modules re-render on their own actions */ }
  }
  function log(text, ref) {
    var a = { id: 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), at: nowStamp(), role: role(), by: ROLE_NAMES[role()], text: text, ref: ref || null };
    store.activity.unshift(a); store.activity = store.activity.slice(0, 300);
    return a;
  }
  function put(name, rec, note, action) {
    store.changes[name] = store.changes[name] || {};
    store.changes[name][rec.id] = rec;
    if (note) log(note, { type: name, id: rec.id });
    save(); build(); emit({ collection: name, id: rec.id, action: action || 'update', record: rec });
    return rec;
  }
  var counters = {};
  function newId(name) {
    var prefix = { bookings: 'b-demo-', payments: 'pay_DEMO', refunds: 're_demo', registrations: 'r-demo-', waitlists: 'w-demo-', people: 'p-demo-', households: 'h-demo-', memberships: 'm-demo-', content: 'c-demo-', reminders: 'rm-demo-', sessions: 's-demo-' }[name] || name + '-';
    var n = Object.keys(store.changes[name] || {}).length + 1;
    while (idx[name][prefix + n]) n++;
    return prefix + n;
  }
  function matches(rec, q) {
    if (!q) return true;
    if (typeof q === 'function') return q(rec);
    for (var k in q) {
      var v = q[k];
      if (Array.isArray(v)) { if (v.indexOf(rec[k]) < 0) return false; }
      else if (rec[k] !== v) return false;
    }
    return true;
  }
  function collection(name) {
    return {
      name: name,
      all: function () { return data[name].slice(); },
      list: function (q) { return data[name].filter(function (r) { return matches(r, q); }); },
      get: function (id) { return idx[name][id] || null; },
      count: function (q) { return q ? data[name].filter(function (r) { return matches(r, q); }).length : data[name].length; },
      add: function (rec, note) { var o = Object.assign({ demo: true, sample: true }, rec); o.id = o.id || newId(name); o.createdAt = o.createdAt || nowStamp(); return put(name, o, note, 'add'); },
      update: function (id, patch, note) {
        var cur = idx[name][id] || (name === 'bookings' && publicBooking() && publicBooking().id === id ? publicBooking() : null);
        if (!cur) throw new Error('PanelData: no ' + name + ' record ' + id);
        var o = Object.assign({}, cur, patch, { id: id, updatedAt: nowStamp() });
        return put(name, o, note, 'update');
      },
      remove: function (id, note) {
        store.changes[name] = store.changes[name] || {};
        store.changes[name][id] = null;
        if (note) log(note, { type: name, id: id });
        save(); build(); emit({ collection: name, id: id, action: 'remove' });
      }
    };
  }

  /* ---------- The public booking flow's stored booking ----------
     site/court-bookings/book/ keeps its state in sessionStorage 'tptc-p1-booking' (one tab).
     It is read here as one booking; a localStorage copy under the same key is read too, if the
     flow ever mirrors it there. */
  function publicBooking() {
    var raw = null, S = null;
    try { raw = sessionStorage.getItem(PUBLIC_KEY); } catch (e) { /* blocked */ }
    if (!raw) try { raw = localStorage.getItem(PUBLIC_KEY); } catch (e) { /* blocked */ }
    try { S = JSON.parse(raw || 'null'); } catch (e) { return null; }
    if (!S || !S.day || S.time == null || S.court == null) return null;
    var d = parse(S.day), st = +S.time, hours = +S.hours || 1, member = S.who === 'member';
    var payers = member ? (+S.guests || 0) : (+S.players || 0), fee = courtFee(d, st, hours), total = fee + payers * PLAYER_FEE;
    var paid = (member && S.pay === 'now') || (!member && S.pay === 'online');
    var b = {
      id: S.ref || 'DEMO-PUBLIC-DRAFT', season: (seasonOf(d) || {}).id || null, date: S.day, start: st, hours: hours, court: +S.court, band: band(d, st),
      type: member ? 'member' : 'non-member', title: member ? 'Member booking (public site)' : 'Non-member booking (public site)',
      name: member ? 'Member, demo sign-in on the public site' : 'Non-member, from the public site', personId: null,
      players: +S.players || null, guests: member ? (+S.guests || 0) : 0, courtFee: fee, extra: payers * PLAYER_FEE, total: total,
      paid: paid, pay: S.pay, held: !member && S.pay === 'phone', hstIncluded: true, source: 'public-site', fromPublicFlow: true,
      status: S.done ? 'booked' : 'in-progress', done: !!S.done, createdAt: nowStamp(), sample: false
    };
    var over = (store.changes.bookings || {})[b.id];
    if (over === null) return null;
    return over ? Object.assign(b, over) : b;
  }

  /* ---------- The API every module uses: window.PanelData ---------- */
  var API = {
    version: 1, storageKey: STORE_KEY, storageOk: function () { return storageOk; },
    clock: { now: NOW, today: TODAY, nowMin: NOW_MIN, shifted: shifted, real: real,
      note: shifted ? 'Demo clock: ' + fmt.long(TODAY) + ', the likely first indoor day (club to confirm), at the real time of day.' : 'Live clock.' },
    today: function () { return new Date(TODAY); },
    fmt: fmt, HST: HST, hstOn: hstOn, hstIn: hstIn, round2: round2,
    content: C,
    courts: courts, seasons: seasons, season: seasonOf, currentSeason: function () { return seasonOf(TODAY) || seasons[1]; },
    feeBands: feeBands, band: band, courtFee: courtFee, playerFee: PLAYER_FEE,
    indoorStarts: indoorStarts, outdoorWindows: outdoorWindows, hourState: hourState, leagueAt: leagueAt,
    rules: { membersDaysAhead: 7, nonMembersDaysAhead: 1, opensAtMin: 450, maxHours: 2, cancelHours: 48, guestVisitsPerSeason: 4 },
    categories: categories, outdoorCategories: outdoorCats, membershipPrice: membershipPrice,
    campPrice: campPrice, refundPolicy: C.refunds,
    people: collection('people'), households: collection('households'), memberships: collection('memberships'),
    bookings: collection('bookings'), sessions: collection('sessions'), registrations: collection('registrations'),
    waitlists: collection('waitlists'), payments: collection('payments'), refunds: collection('refunds'),
    reminders: collection('reminders'), contentItems: collection('content'),
    publicBooking: publicBooking,
    activity: function (q) { return store.activity.filter(function (a) { return !q || !q.ref || (a.ref && a.ref.id === q.ref); }); },
    log: function (text, ref) { var a = log(text, ref); save(); emit({ collection: 'activity', id: a.id, action: 'add' }); return a; },
    changed: function () { var n = 0; NAMES.forEach(function (k) { n += Object.keys(store.changes[k] || {}).length; }); return n; },
    reset: function () { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* nothing stored */ } store = { v: 1, changes: {}, activity: [] }; build(); emit({ collection: '*', action: 'reset' }); },
    role: role, roleName: function (r) { return ROLE_NAMES[r || role()]; }, roles: ROLE_NAMES
  };

  /* Convenience views the modules share */
  API.member = function (personId) {
    var p = idx.people[personId]; if (!p) return null;
    var hh = idx.households[p.householdId];
    var ms = data.memberships.filter(function (m) { return m.personIds.indexOf(personId) > -1; });
    var cur = ms.filter(function (m) { return m.season === 'indoor-2026'; })[0] || null;
    var prev = ms.filter(function (m) { return m.season === 'outdoor-2026'; })[0] || null;
    var status = cur && cur.status === 'active' ? 'member' : data.waitlists.some(function (w) { return w.list === 'membership-indoor-2026' && w.householdId === p.householdId && w.status === 'waiting'; }) ? 'waitlist' : prev ? 'renewal-due' : 'contact';
    return { person: p, household: hh, memberships: ms, current: cur, previous: prev, status: status };
  };
  API.renewalsDue = function () {
    return data.households.filter(function (h) {
      var has = function (s) { return data.memberships.some(function (m) { return m.householdId === h.id && m.season === s && (m.status === 'active' || m.status === 'ended'); }); };
      return has('outdoor-2026') && !has('indoor-2026');
    });
  };
  API.sessionStats = function (sessionId) {
    var s = idx.sessions[sessionId]; if (!s) return null;
    var regs = data.registrations.filter(function (r) { return r.sessionId === sessionId && r.status === 'confirmed'; });
    var wl = data.waitlists.filter(function (w) { return w.sessionId === sessionId && w.status === 'waiting'; });
    return { session: s, registered: regs.length, capacity: s.capacity, open: s.capacity == null ? null : Math.max(0, s.capacity - regs.length), waitlist: wl.length, full: s.capacity != null && regs.length >= s.capacity };
  };
  API.dayBookings = function (date) {
    var d = typeof date === 'string' ? date : iso(date);
    var list = data.bookings.filter(function (b) { return b.date === d; });
    var pb = publicBooking();
    if (pb && pb.done && pb.date === d && !idx.bookings[pb.id]) list.push(pb);
    return list.sort(function (a, b) { return a.court - b.court || a.start - b.start; });
  };
  API.personName = function (id) { var p = idx.people[id]; return p ? p.name : ''; };

  window.addEventListener('storage', function (e) { if (e.key === STORE_KEY) { load(); build(); emit({ collection: '*', action: 'sync' }); } });
  window.PanelData = API;
})();
