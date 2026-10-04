/* P1, the demo booking flow at /court-bookings/book/.
   Front end only: nothing is booked or charged. Every rule below is the club's own
   (content/court-bookings.json); availability is made up but stable for a given day, hour and court.
   The booking is scored as a service game held to love: the toss (who is booking) decides who
   serves, then four points win the game: the day, the players, the hour and court, the confirm.
   State lives in sessionStorage, so it survives a visit to another page and back. */
(function () {
  'use strict';
  var root = document.querySelector('[data-bk]');
  var form = document.getElementById('bk-form');
  if (!root || !form) return;

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var KEY = 'tptc-p1-booking';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- The club's facts ---------- */
  var FEE = { regular: 24, prime: 28 };          // per hour, HST included (/court-bookings/)
  var PLAYER_FEE = 10;                           // per non-member player, per guest
  var OPENS = 7 * 60 + 30;                       // the newest day opens at 7:30am
  var INDOOR_START = new Date(2026, 9, 12);      // "likely October 12", club to confirm
  var INDOOR_END = new Date(2027, 3, 25);        // April 25, 2027
  var WEEKDAY = { open: 6 * 60 + 30, close: 23 * 60 + 30, primeFrom: 18 * 60 + 30 }; // starts on the half hour
  var WEEKEND = { open: 7 * 60, close: 23 * 60 };                                       // starts on the hour
  var PUBLIC_COURTS = [3, 4];                    // Friday public hours use 2 courts; which two: club to confirm
  var PUBLIC_FROM = 21 * 60 + 30;                // Fridays 9:30pm to 11:30pm (a 2024 post says 9pm to 11pm)
  var LOCATION = 'Thornhill Park Tennis Club, corner of Centre St and Yonge St, Thornhill, ON L4J 8C5';

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* ---------- The clock ----------
     Before the dome goes up the courts are between seasons, so the demo sets its clock to the
     likely first indoor day at the real time of day, and says so in the banner. */
  var real = new Date();
  var shifted = real < INDOOR_START || real > new Date(2027, 3, 25, 23, 59);
  var now = new Date(shifted ? INDOOR_START : real);
  if (shifted) now.setHours(real.getHours(), real.getMinutes(), 0, 0);
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  /* ---------- Formatting: $24.00, 7:30am, Mon Oct 12 ---------- */
  function money(n) { return '$' + n.toFixed(2); }
  function t(min) {
    var h = Math.floor(min / 60) % 24, m = min % 60, ap = h < 12 ? 'am' : 'pm', h12 = h % 12 || 12;
    return h12 + (m ? ':' + (m < 10 ? '0' : '') + m : '') + ap;
  }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dShort(d) { return DAYS[d.getDay()].slice(0, 3) + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(); }
  function dLong(d) { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
  function confirmSlot(what) {
    return '<span class="confirm"><span class="confirm__tag">Club to confirm</span><span class="confirm__what">' + what + '</span></span>';
  }
  function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
  function isThanksgiving(d) { return d.getMonth() === 9 && d.getDay() === 1 && d.getDate() >= 8 && d.getDate() <= 14; }

  /* ---------- State ---------- */
  var blank = function () { return { who: null, day: null, players: null, hours: 1, guests: 0, time: null, court: null, pay: null, done: false, ref: null }; };
  var S = blank();
  try { var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (saved) for (var k in S) if (k in saved) S[k] = saved[k]; } catch (e) { /* storage blocked: start fresh */ }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* the flow still works in memory */ } }

  /* ---------- The window: today plus 7 for members, plus 1 for non-members, from 7:30am ---------- */
  function windowDays() {
    var out = [];
    for (var i = 0; i <= 7; i++) {
      var d = new Date(today); d.setDate(today.getDate() + i);
      var reach = S.who === 'guest' ? 1 : 7;
      var why = null;
      if (d > INDOOR_END) why = 'After the season';
      else if (i > reach) why = 'Members only';
      else if (i === reach && nowMin < OPENS) why = 'Opens ' + t(OPENS);
      out.push({ d: d, i: i, iso: iso(d), why: why });
    }
    return out;
  }
  function dayOk(s) { return windowDays().some(function (x) { return x.iso === s && !x.why; }); }

  /* ---------- Hours and fee bands for a day ---------- */
  function hoursOf(d) { return isWeekend(d) ? WEEKEND : WEEKDAY; }
  function band(d, start) {
    if (isWeekend(d)) return 'weekend';
    return start >= WEEKDAY.primeFrom ? 'prime' : 'regular';
  }
  function feeOf(b) { return b === 'regular' ? FEE.regular : FEE.prime; }
  function starts(d) {
    var h = hoursOf(d), out = [];
    for (var m = h.open; m + S.hours * 60 <= h.close; m += 60) out.push(m);
    return out;
  }
  function courtFee(d, start) {
    var sum = 0;
    for (var i = 0; i < S.hours; i++) sum += feeOf(band(d, start + i * 60));
    return sum;
  }

  /* Made-up but stable availability: the same day, hour and court always read the same */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100; }
  function hourState(d, start, court) {
    if (d.getDay() === 5 && start >= PUBLIC_FROM && PUBLIC_COURTS.indexOf(court) > -1) return 'public';
    var b = band(d, start), busy = b === 'regular' ? 30 : 58;
    return hash(iso(d) + '|' + start + '|' + court) < busy ? 'taken' : 'free';
  }
  function courtState(d, start, court) {
    for (var i = 0; i < S.hours; i++) {
      var s = hourState(d, start + i * 60, court);
      if (s !== 'free') return s;
    }
    return 'free';
  }
  function slotInfo(d, start) {
    var past = iso(d) === iso(today) && start < nowMin;
    var free = 0;
    for (var c = 1; c <= 4; c++) if (courtState(d, start, c) === 'free') free++;
    return { past: past, free: past ? 0 : free };
  }

  /* ---------- Keep later choices honest when an earlier one changes ---------- */
  function settle() {
    if (S.who !== 'member' && S.who !== 'guest') { S.who = null; }
    if (S.day && (!S.who || !dayOk(S.day))) S.day = null;
    if (S.players && ['2', '3', '4'].indexOf(String(S.players)) < 0) S.players = null;
    if (String(S.players) !== '4') S.hours = 1;
    if (S.who !== 'member') S.guests = 0;
    S.guests = Math.max(0, Math.min(S.guests, (+S.players || 2) - 1));
    if (S.time != null) {
      var d = S.day && parse(S.day);
      var ok = d && S.players && starts(d).indexOf(+S.time) > -1;
      if (ok) { var si = slotInfo(d, +S.time); ok = !si.past && si.free > 0; }
      if (!ok) { S.time = null; S.court = null; }
    }
    if (S.court != null && (S.time == null || courtState(parse(S.day), +S.time, +S.court) !== 'free')) S.court = null;
    var payOk = S.who === 'member' ? ['now', 'later'] : ['online', 'phone'];
    if (S.pay && payOk.indexOf(S.pay) < 0) S.pay = null;
  }
  function points() {
    var p = 0;
    if (S.day) p++;
    if (S.day && S.players && (String(S.players) !== '4' || S.hours)) p++;
    if (p === 2 && S.time != null && S.court != null) p++;
    if (p === 3 && S.done) p++;
    return p;
  }

  /* ---------- Step 2: the date strip ---------- */
  function renderDays() {
    var wrap = $('[data-bk-days]'), list = windowDays(), reach = S.who === 'guest' ? 1 : 7;
    wrap.innerHTML = list.map(function (x) {
      var tag = x.why ? '<span class="bk-day__why">' + x.why + '</span>'
        : '<span class="bk-day__band">' + (isWeekend(x.d) ? 'Weekend' : 'Weekday') + '</span>';
      return '<label class="bk-day' + (x.why ? ' is-off' : '') + (isWeekend(x.d) ? ' is-weekend' : '') + '">' +
        '<input type="radio" name="day" value="' + x.iso + '"' + (x.why ? ' disabled' : '') + (S.day === x.iso ? ' checked' : '') + '>' +
        '<span class="bk-day__face"><span class="bk-day__dow">' + (x.i === 0 ? 'Today' : DAYS[x.d.getDay()].slice(0, 3)) + '</span>' +
        '<span class="bk-day__n num">' + x.d.getDate() + '</span>' +
        '<span class="bk-day__m">' + MONTHS[x.d.getMonth()].slice(0, 3) + '</span>' + tag + '</span></label>';
    }).join('');
    var reachEl = $('[data-bk-reach]');
    reachEl.style.setProperty('--reach', String(reach + 1));
    reachEl.classList.toggle('is-short', reach < 3);
    $('[data-bk-reach-n]').textContent = S.who === 'guest' ? 'Today plus 1 day' : 'Today plus 7 days';
    var note = [];
    note.push(S.who === 'guest'
      ? 'Non-members book up to 1 day ahead. The days beyond are for members.'
      : 'Members book up to 7 days ahead. The newest day opens at 7:30am.');
    if (list.some(function (x) { return isThanksgiving(x.d); })) note.push('Thanksgiving Monday shows weekday hours here. ' + confirmSlot('Holiday court hours'));
    $('[data-bk-days-note]').innerHTML = note.join(' ');
  }

  /* ---------- Step 4: the hours, grouped by fee band ---------- */
  var BAND_NAME = {
    regular: ['Regular time', 'Weekdays 6:30am to 6:30pm', FEE.regular],
    prime: ['Prime time', 'Weeknights 6:30pm to 11:30pm', FEE.prime],
    weekend: ['Prime time weekends', 'Saturday and Sunday, 7am to 11pm', FEE.prime]
  };
  function renderSlots() {
    var d = parse(S.day), groups = {}, order = [];
    starts(d).forEach(function (m) {
      var b = band(d, m);
      if (!groups[b]) { groups[b] = []; order.push(b); }
      groups[b].push(m);
    });
    $('[data-bk-time-rule]').innerHTML = isWeekend(d)
      ? 'On weekends court time starts on the hour, from 7am to 11pm.'
      : 'On weekdays court time starts on the half hour, from 6:30am to 11:30pm.';
    $('[data-bk-slots]').innerHTML = order.map(function (b) {
      var n = BAND_NAME[b];
      return '<div class="bk-band bk-band--' + b + '"><p class="bk-band__head"><span class="bk-band__name">' + n[0] + '</span>' +
        '<span class="bk-band__when">' + n[1] + '</span><span class="bk-band__fee"><span class="num">$' + n[2] + '</span> an hour, HST included</span></p>' +
        '<div class="bk-band__slots">' + groups[b].map(function (m) {
          var si = slotInfo(d, m), off = si.past || !si.free;
          var cross = S.hours === 2 && band(d, m) !== band(d, m + 60);
          var state = si.past ? 'Past' : !si.free ? 'Full' : si.free + ' of 4 free';
          return '<label class="bk-slot' + (off ? ' is-off' : '') + '"><input type="radio" name="time" value="' + m + '"' + (off ? ' disabled' : '') + (+S.time === m && S.time != null ? ' checked' : '') + '>' +
            '<span class="bk-slot__face"><span class="bk-slot__t num">' + t(m) + '</span><span class="bk-slot__e num">to ' + t(m + S.hours * 60) + '</span>' +
            '<span class="bk-slot__s">' + state + '</span>' +
            (cross ? '<span class="bk-slot__x num">$' + courtFee(d, m) + ', both bands</span>' : '') +
            '<span class="bk-slot__dots" aria-hidden="true">' + [1, 2, 3, 4].map(function (c) {
              return '<i class="' + (si.past ? 'is-taken' : 'is-' + courtState(d, m, c)) + '"></i>';
            }).join('') + '</span></span></label>';
        }).join('') + '</div></div>';
    }).join('');
  }

  /* ---------- Step 4: the four courts at the chosen hour ---------- */
  function renderCourts() {
    var plan = $('[data-bk-plan]');
    plan.hidden = S.time == null;
    if (S.time == null) return;
    var d = parse(S.day), doubles = String(S.players) === '4';
    $('[data-bk-plan-at]').textContent = 'for ' + t(+S.time) + ' to ' + t(+S.time + S.hours * 60);
    $$('.bk-court').forEach(function (el) {
      var c = +el.getAttribute('data-court'), st = courtState(d, +S.time, c), input = $('input', el);
      el.classList.remove('is-free', 'is-taken', 'is-public');
      el.classList.add('is-' + st);
      input.disabled = st !== 'free';
      input.checked = +S.court === c && S.court != null;
      var inRect = $('.bk-court__in', el);
      inRect.setAttribute('x', doubles ? '0' : '4.5');
      inRect.setAttribute('width', doubles ? '36' : '27');
      $('[data-court-state]', el).innerHTML = st === 'free' ? (input.checked ? 'Yours' : 'Free') : st === 'taken' ? 'Booked' : 'Public hours';
    });
    plan.classList.toggle('is-doubles', doubles);
    plan.classList.toggle('has-public', $$('.bk-court.is-public').length > 0);
    var pub = $('[data-bk-public]');
    if (pub) pub.hidden = !plan.classList.contains('has-public');
  }

  /* ---------- Price ---------- */
  function bill() {
    if (S.time == null || !S.day) return null;
    var d = parse(S.day), lines = [], start = +S.time;
    for (var i = 0; i < S.hours; i++) {
      var b = band(d, start + i * 60);
      lines.push([BAND_NAME[b][0] + ', ' + t(start + i * 60) + ' to ' + t(start + (i + 1) * 60), feeOf(b)]);
    }
    var payers = S.who === 'guest' ? +S.players : S.guests;
    if (payers) lines.push([(S.who === 'guest' ? 'Non-member fee, ' : 'Guest fee, ') + payers + ' x $10', payers * PLAYER_FEE]);
    var total = lines.reduce(function (a, l) { return a + l[1]; }, 0);
    return { lines: lines, total: total, court: courtFee(d, start), extra: payers * PLAYER_FEE };
  }

  /* ---------- 48 hours: the real deadline for this booking ---------- */
  function cancelLine() {
    var d = parse(S.day), start = new Date(d); start.setMinutes(+S.time);
    var by = new Date(start.getTime() - 48 * 3600 * 1000);
    var b = bill();
    /* The club's rule for any court paid when booked, member or not */
    if (paid()) return 'Once a court is reserved and paid for, the club gives no refunds and no rescheduling. A no-show still counts toward a 7-day suspension. ' + confirmSlot('Whether a court paid when booked can still be cancelled 48 hours ahead');
    if (now >= by) return 'This hour starts in less than 48 hours, so from the moment you confirm, cancelling still costs the court fee (' + money(b.court) + '). Three late cancellations or no-shows can suspend booking for 7 days.';
    return 'Cancel online before <strong>' + dShort(by) + ', ' + t(by.getHours() * 60 + by.getMinutes()) + '</strong>, 48 hours ahead, and nothing is charged. After that, or for a no-show, the court fee is charged to the card on file. Three of either can suspend booking for 7 days.';
  }

  function paid() { return (S.who === 'member' && S.pay === 'now') || (S.who === 'guest' && S.pay === 'online'); }

  /* ---------- Step 5: review ---------- */
  function playersText() {
    var p = +S.players;
    return p + ' players, ' + (p === 4 ? 'doubles' : 'singles') + (S.who === 'member' && S.guests ? ', ' + S.guests + (S.guests === 1 ? ' guest' : ' guests') : '');
  }
  /* Which of the club's three per-member limits this booking counts toward */
  function limitLine(d) {
    var LIM = { regular: '3 regular-time bookings', prime: '1 weeknight prime-time booking', weekend: '1 weekend booking, Saturday or Sunday' };
    var seen = [];
    for (var i = 0; i < S.hours; i++) { var b = band(d, +S.time + i * 60); if (seen.indexOf(b) < 0) seen.push(b); }
    return 'It counts toward your limit of ' + seen.map(function (b) { return LIM[b]; }).join(' and of ') + '.';
  }
  function renderReview() {
    if (points() < 3) return;
    var d = parse(S.day), b = bill();
    $('[data-bk-sum]').innerHTML = [
      ['Who', S.who === 'member' ? 'Member (demo sign-in)' : 'Non-member'],
      ['Day', dLong(d)],
      ['Hour', '<span class="num">' + t(+S.time) + ' to ' + t(+S.time + S.hours * 60) + '</span>'],
      ['Court', 'Court <span class="num">' + S.court + '</span>, under the Dome'],
      ['Players', playersText()]
    ].map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('');
    $('[data-bk-bill]').innerHTML = '<ul class="bk-bill__lines" role="list">' + b.lines.map(function (l) {
      return '<li><span>' + l[0] + '</span><span class="num">' + money(l[1]) + '</span></li>';
    }).join('') + '</ul><p class="bk-bill__total"><span class="label">Total</span><span class="bk-bill__sum num">' + money(b.total) + '</span></p>' +
      '<p class="small bk-bill__tax">Court fees include HST, as the club publishes them. ' +
      (b.extra ? confirmSlot('Whether HST is included in the $10 fee, and whether it is per hour on a 2-hour booking') + ' ' : '') +
      confirmSlot('Court fees for 2026/27 (the club’s table carries no year)') + '</p>';
    $$('input[name="pay"]').forEach(function (i) { i.checked = S.pay === i.value; });
    $('[data-bk-cancel]').innerHTML = cancelLine();
    var checks = S.who === 'member'
      ? ['One booking a day: this is yours for ' + dShort(d) + '.',
         limitLine(d) + ' ' + confirmSlot('The period these limits count over'),
         'A credit card on file is required for every client.']
      : ['A credit card on file is required for every client.',
         'An unpaid balance from an earlier booking blocks a new one.',
         'Bring no more than 6 balls to the court. Ball machines are not permitted.'];
    $('[data-bk-checks]').innerHTML = checks.map(function (c) {
      return '<li><svg class="icon" aria-hidden="true" focusable="false"><use href="#i-check"/></svg><span>' + c + '</span></li>';
    }).join('');
  }

  /* ---------- The scorecard ---------- */
  var SCORES = [
    ['Love all', 'Four points to a game: the day, the players, the hour and court, the confirm.'],
    ['15-Love', 'Next: singles or doubles.'],
    ['30-Love', 'Next: an hour and a court.'],
    ['40-Love', 'Game point. Check it, then confirm.'],
    ['Game', 'Confirmed, in the demo.']
  ];
  var NEXT = [['#who', 'Start: who is booking'], ['#day', 'Next: pick a day'], ['#players', 'Next: singles or doubles'], ['#time', 'Next: an hour and a court'], ['#confirm-booking', 'Last: confirm the booking']];
  function renderCard() {
    var p = points();
    var sc = S.who ? SCORES[p] : ['The toss', 'Who is booking decides who serves.'];
    $('[data-bk-score]').textContent = sc[0];
    $('[data-bk-score-k]').textContent = sc[1];
    $$('.bk-pips li').forEach(function (li, i) { li.classList.toggle('is-won', i < p); });
    var d = S.day && parse(S.day);
    var set = function (k, v) { var el = $('[data-c="' + k + '"]'); el.innerHTML = v || 'Not yet'; el.classList.toggle('is-empty', !v); };
    set('who', S.who && (S.who === 'member' ? 'Member' : 'Non-member'));
    set('day', d && dShort(d));
    set('players', S.players && playersText());
    set('time', S.time != null && '<span class="num">' + t(+S.time) + ' to ' + t(+S.time + S.hours * 60) + '</span>');
    set('court', S.court != null && 'Court <span class="num">' + S.court + '</span>');
    var b = bill();
    $('[data-bk-total]').textContent = money(b ? b.total : 0);
    var step = !S.who ? 0 : !S.day ? 1 : !S.players ? 2 : (S.time == null || S.court == null) ? 3 : 4;
    var nx = $('[data-bk-next]');
    nx.setAttribute('href', NEXT[step][0]);
    $('[data-bk-next-l]').textContent = NEXT[step][1];
    $('[data-bk-next-l2]').textContent = NEXT[step][1];
  }

  /* ---------- Steps open in order ---------- */
  function renderSteps() {
    var open = { who: true, day: !!S.who, players: !!S.day, time: !!(S.day && S.players), review: points() >= 3 };
    Object.keys(open).forEach(function (k) {
      var body = $('[data-body="' + k + '"]'), wait = $('[data-wait="' + k + '"]'), step = document.getElementById(k);
      if (body) body.hidden = !open[k];
      if (wait) wait.hidden = open[k];
      step.classList.toggle('is-waiting', !open[k]);
    });
    var d = S.day && parse(S.day);
    var done = {
      who: S.who && (S.who === 'member' ? 'Member' : 'Non-member'),
      day: d && dShort(d),
      players: S.players && (+S.players === 4 ? 'Doubles' : 'Singles'),
      time: S.court != null && S.time != null && t(+S.time) + ', Court ' + S.court,
      review: ''
    };
    Object.keys(done).forEach(function (k) {
      var el = $('[data-done="' + k + '"]');
      el.textContent = done[k] || '';
      document.getElementById(k).classList.toggle('is-done', !!done[k]);
    });
    $$('[data-when-who]').forEach(function (el) { el.hidden = el.getAttribute('data-when-who') !== S.who; });
    $$('[data-when-players]').forEach(function (el) { el.hidden = String(S.players) !== el.getAttribute('data-when-players'); });
    $$('input[name="who"]').forEach(function (i) { i.checked = S.who === i.value; });
    $$('input[name="players"]').forEach(function (i) { i.checked = String(S.players) === i.value; });
    $$('input[name="hours"]').forEach(function (i) { i.checked = String(S.hours) === i.value; });
    $('[data-bk-guests]').textContent = String(S.guests);
    var g = $$('[data-guests]');
    g[0].disabled = S.guests <= 0;
    g[1].disabled = S.guests >= (+S.players || 2) - 1;
  }

  /* ---------- Game: the confirmation ---------- */
  function renderDone() {
    var doneEl = document.getElementById('done');
    root.hidden = !!S.done;
    doneEl.hidden = !S.done;
    if (!S.done) return;
    var d = parse(S.day), b = bill(), start = +S.time, end = start + S.hours * 60;
    var held = S.who === 'guest' && S.pay === 'phone';
    $('[data-d="ref"]').textContent = S.ref;
    $('[data-d="headline"]').textContent = held ? 'Court ' + S.court + ' is held for you, ' : 'Court ' + S.court + ' is yours, ';
    $('[data-d="when"]').textContent = dShort(d) + ' at ' + t(start) + '.';
    $('[data-d="lede"]').innerHTML = held
      ? 'Under the Club Policies version a non-member pre-pays by phone or in person: call the front desk at <a class="inline-link num" href="tel:+19057315551">905-731-5551</a>. ' + confirmSlot('How long a court is held before payment')
      : S.who === 'guest' ? 'Paid in the demo, under the Court Bookings version. On the real site a receipt would follow by email.'
      : S.pay === 'now' ? 'Paid in the demo. On the real site a receipt would follow by email.'
      : 'Booked, with the court fee to settle later. On the real site a confirmation would follow by email.';
    var inRect = $('[data-d="in"]');
    inRect.setAttribute('x', +S.players === 4 ? '0' : '4.5');
    inRect.setAttribute('width', +S.players === 4 ? '36' : '27');
    var by = new Date(d); by.setMinutes(start); by = new Date(by.getTime() - 48 * 3600 * 1000);
    $('[data-d="fields"]').innerHTML = [
      ['Court', 'Court <span class="num">' + S.court + '</span>, under the Dome'],
      ['Day', dLong(d)],
      ['Hour', '<span class="num">' + t(start) + ' to ' + t(end) + '</span>'],
      ['Players', playersText()],
      ['Total', '<span class="num">' + money(b.total) + '</span> <span class="small">court fees include HST</span>'],
      ['Payment', held ? 'Pre-pay by phone or in person' : (S.who === 'guest' || S.pay === 'now') ? 'Paid (demo)' : 'To settle later'],
      ['Cancel by', paid() ? 'No refunds or rescheduling once paid' : (now >= by ? 'Inside 48 hours: the court fee applies' : '<span class="num">' + dShort(by) + ', ' + t(by.getHours() * 60 + by.getMinutes()) + '</span>, online')]
    ].map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('');
    var wk = !isWeekend(d);
    $('[data-d="before"]').innerHTML = [
      ['Arrive on time, step on at ' + t(start), 'Court time starts on the exact ' + (wk ? 'half hour on weekdays' : 'hour on weekends') + '. Crossing other courts, wait for the point to finish, then walk briskly behind the baseline.'],
      ['Change into court shoes', 'Outside shoes stay off the courts. Water only on court.'],
      ['Dress for 19.5 \u00b0C', 'The club keeps the Dome at 19.5 \u00b0C: long sleeves and athletic pants over shorts and a T-shirt.'],
      ['First buzzer at ' + t(end - 3), 'It sounds 3 minutes before your end time. Gather your things, so the next players start on time.']
    ].map(function (s, i) {
      return '<li><span class="step-n num">' + (i + 1) + '</span><div><h4 class="bk-before__t">' + s[0] + '</h4><p class="small">' + s[1] + '</p></div></li>';
    }).join('');
  }

  /* A real .ics file for the demo booking, local time, nothing sent anywhere */
  function ics() {
    var d = parse(S.day), start = +S.time, end = start + S.hours * 60;
    var stamp = function (m) { return S.day.replace(/-/g, '') + 'T' + pad(Math.floor(m / 60)) + pad(m % 60) + '00'; };
    var esc = function (s) { return s.replace(/([,;\\])/g, '\\$1'); };
    var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TPTC demo//Court booking//EN', 'BEGIN:VEVENT',
      'UID:' + S.ref + '@tptc-demo', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', 'DTSTART:' + stamp(start), 'DTEND:' + stamp(end),
      'SUMMARY:' + esc('Tennis, Court ' + S.court + ' (demo booking)'),
      'LOCATION:' + esc(LOCATION),
      'DESCRIPTION:' + esc('Demo booking from the new club website mock-up. Nothing was booked. ' + playersText() + '. ' + dLong(d) + '.'),
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
    a.download = 'tptc-court-' + S.court + '-' + S.day + '.ics';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function goTo(el) {
    if (!el) return;
    /* phones: the header is shorter, and the target sits flush under it so nothing above peeks in */
    var y = el.getBoundingClientRect().top + window.pageYOffset - (window.innerWidth < 700 ? 72 : 96);
    if (window.__lenis) window.__lenis.scrollTo(y, { immediate: reduce });
    else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }

  /* ---------- One render ---------- */
  function render() {
    settle();
    renderSteps();
    if (S.who) renderDays();
    if (S.day && S.players) renderSlots();
    if (S.day && S.players) renderCourts();
    renderReview();
    renderCard();
    renderDone();
    save();
  }

  /* ---------- Events ---------- */
  form.addEventListener('change', function (e) {
    var n = e.target.name, v = e.target.value;
    if (!n) return;
    var hadTime = S.time != null;
    if (n === 'who') S.who = v;
    else if (n === 'day') S.day = v;
    else if (n === 'players') S.players = v;
    else if (n === 'hours') S.hours = +v;
    else if (n === 'time') { S.time = +v; S.court = null; }
    else if (n === 'court') S.court = +v;
    else if (n === 'pay') { S.pay = v; $('[data-bk-error]').hidden = true; }
    render();
    var sel = n === 'time' ? 'input[name="time"][value="' + v + '"]' : n === 'day' ? 'input[name="day"][value="' + v + '"]' : null;
    if (sel) { var el = $(sel); if (el) el.focus({ preventScroll: true }); }
    if (n === 'time' && !hadTime) { var plan = $('[data-bk-plan]'); var r = plan.getBoundingClientRect(); if (r.bottom > window.innerHeight) goTo(plan); }
  });
  $$('[data-guests]').forEach(function (b) {
    b.addEventListener('click', function () { S.guests += +b.getAttribute('data-guests'); render(); });
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (points() < 3) return;
    if (!S.pay) { $('[data-bk-error]').hidden = false; var p = $('input[name="pay"]:not([disabled])', $('[data-when-who="' + S.who + '"]')); if (p) p.focus(); return; }
    S.done = true;
    S.ref = 'DEMO-' + S.day.slice(5).replace('-', '') + '-C' + S.court + '-' + pad(Math.floor(S.time / 60)) + pad(S.time % 60);
    render();
    var done = document.getElementById('done');
    goTo(done.closest('.section') || done);
    done.focus({ preventScroll: true });
  });
  $('[data-bk-ics]').addEventListener('click', ics);
  $('[data-bk-again]').addEventListener('click', function () {
    var who = S.who; S = blank(); S.who = who;
    render();
    goTo(document.getElementById('day'));
    var first = $('input[name="day"]:not([disabled])'); if (first) first.focus({ preventScroll: true });
  });

  /* The banner and the hero say which clock and which window the demo is using */
  (function () {
    var clock = $('[data-bk-clock]');
    if (shifted) {
      clock.hidden = false;
      clock.innerHTML = 'Demo clock: <strong>' + dShort(now) + ', ' + t(nowMin) + '</strong><span class="bk-banner__more">, the likely first day under the Dome. Today, ' + dShort(real) + ', the courts are between seasons. ' + confirmSlot('Indoor start date') + '</span>';
    }
    var last = new Date(today); last.setDate(today.getDate() + 7);
    var next = new Date(today); next.setDate(today.getDate() + 1);
    var w = $('[data-bk-window]');
    /* Before 7:30am the newest day of each window is not open yet: say so, rather than promise it */
    var early = nowMin < OPENS, lastOpen = new Date(last), nextOpen = new Date(next);
    if (early) { lastOpen.setDate(last.getDate() - 1); nextOpen.setDate(next.getDate() - 1); }
    if (w) w.innerHTML = 'Members: <span class="num">' + dShort(today) + '</span> to <span class="num">' + dShort(lastOpen) + '</span>. Non-members: ' + (early ? 'today only' : 'to <span class="num">' + dShort(nextOpen) + '</span>') + '. ' +
      (early ? '<span class="num">' + dShort(next) + '</span> and <span class="num">' + dShort(last) + '</span> open at <span class="num">7:30am</span>.' : 'Each new day opens at <span class="num">7:30am</span>.');
  })();

  render();
})();
