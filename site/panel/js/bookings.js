/* Bookings: the four courts by day and week (owned by the bookings module; see ../PANEL.md).
   One job: show the desk who is on which court, in the club's own fee bands and rules, and let it
   do the four things the club lets staff do: book a walk-in, hold a court, put a lesson on court
   and cancel for non-compliance. Members book their own courts online ("staff are not allowed to
   book courts for members"), so a free hour never offers a member booking.
   Story (brief: every detail is tennis): the calendar is the order of play. Each court's column
   is headed by its own plan at true 36 x 78 ft proportion, and the plan shows who is on it this
   hour the way they would stand: singles on the centre marks, doubles with the server's partner
   at the net, a lesson with the coach and the ball basket. The time axis is the club's real fee
   bands. Nothing moves but the clock. People and transactions are sample data; nothing is saved
   to a server or charged. */
(function () {
  'use strict';
  var D = window.PanelData, UI = window.PanelUI;
  if (!D || !UI) return;

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = UI.esc, icon = UI.icon, F = D.fmt;
  var C = D.content, R = D.rules;
  var TODAY = D.today(), TODAY_ISO = F.iso(TODAY), NOW_MIN = D.clock.nowMin;
  var OUT = D.seasons.filter(function (s) { return /^outdoor/.test(s.id); })[0];
  var IND = D.seasons.filter(function (s) { return /^indoor/.test(s.id); })[0];
  var PRIVATE = (C.programs && C.programs.private) || [{ kind: 'Private', price: 100 }, { kind: 'Semi Private', price: 110 }];
  var METHODS = ['Visa', 'Mastercard', 'Interac'];   /* "We do not accept cash or cheque payments" */
  var HOLD_REASONS = ['Held for an assessment', 'Held for court maintenance', 'Held for a lesson make-up', 'Held for a program or event'];
  var PREF = 'tptc-panel-bookings-';

  /* ---------- State: date, view and filter (in the address, so a link opens the same screen) ---------- */
  var q = new URLSearchParams(location.search);
  function pref(k, v) { try { if (v === undefined) return localStorage.getItem(PREF + k); localStorage.setItem(PREF + k, v); } catch (e) { return null; } return null; }
  var S = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : TODAY_ISO,
    view: q.get('view') === 'week' || (!q.get('view') && pref('view') === 'week') ? 'week' : 'day',
    filter: q.get('show') || 'all',
    focusKey: null
  };
  var FILTERS = [['all', 'All'], ['member', 'Members'], ['non-member', 'Non-members'], ['lesson', 'Lessons'], ['hold', 'Holds'], ['program', 'Leagues and public']];
  function syncUrl() {
    var u = new URLSearchParams(location.search);
    u.set('date', S.date); u.set('view', S.view);
    if (S.filter !== 'all') u.set('show', S.filter); else u.delete('show');
    u.delete('booking');
    try { history.replaceState(null, '', location.pathname + '?' + u.toString()); } catch (e) { /* file:// in some browsers */ }
    pref('view', S.view);
  }

  /* ---------- Dates and the club's calendar ---------- */
  function P(s) { return F.parse(s); }
  function addIso(s, n) { return F.iso(F.addDays(P(s), n)); }
  function daysFrom(a, b) { return Math.round((P(b) - P(a)) / 864e5); }
  function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
  function seasonKind(s) { var x = D.season(s); return x ? (/^indoor/.test(x.id) ? 'indoor' : 'outdoor') : null; }
  function mondayOf(s) { var d = P(s), k = (d.getDay() + 6) % 7; return F.iso(F.addDays(d, -k)); }
  function startAt(dateIso, min) { var d = P(dateIso); d.setHours(0, min, 0, 0); return d; }
  function hoursUntil(b) { return (startAt(b.date, b.start) - D.clock.now) / 36e5; }
  function isThanksgiving(d) { return d.getMonth() === 9 && d.getDay() === 1 && d.getDate() >= 8 && d.getDate() <= 14; }

  /* The rows of a day: indoor starts (half hour on weekdays, hour at weekends), outdoor on the
     hour from 7am, inside or outside the club's published outdoor windows. */
  function rowsOf(dateIso) {
    var d = P(dateIso), kind = seasonKind(dateIso);
    if (kind === 'indoor') return D.indoorStarts(d).map(function (m) { return { start: m, band: D.band(d, m), open: true }; });
    if (kind === 'outdoor') {
      var w = D.outdoorWindows(d), out = [];
      for (var m = 420; m + 60 <= 1380; m += 60) {
        var open = w.some(function (x) { return m >= x[0] && m + 60 <= x[1]; });
        out.push({ start: m, band: 'outdoor', open: open });
      }
      return out;
    }
    return [];
  }
  function bandInfo(id) {
    if (id === 'outdoor') return { id: 'outdoor', name: 'Outdoor', fee: 0, when: 'No court fees for members outdoors' };
    for (var i = 0; i < D.feeBands.length; i++) if (D.feeBands[i].id === id) return D.feeBands[i];
    return { id: id, name: id, fee: 0 };
  }

  /* Who can book a day, and from when: members 7 days ahead and non-members 1 day ahead, the newest
     day opening at 7:30am. */
  function windowOf(dateIso) {
    var n = daysFrom(TODAY_ISO, dateIso);
    var opened = function (k) { return n < k || (n === k && NOW_MIN >= R.opensAtMin); };
    return { n: n, past: n < 0, members: n >= 0 && n <= R.membersDaysAhead && opened(R.membersDaysAhead), nonMembers: n >= 0 && n <= R.nonMembersDaysAhead && opened(R.nonMembersDaysAhead),
      membersFrom: addIso(dateIso, -R.membersDaysAhead), nonMembersFrom: addIso(dateIso, -R.nonMembersDaysAhead) };
  }

  /* ---------- Bookings of a day ---------- */
  var OFF = { cancelled: 1, 'late-cancel': 1 };
  function groupOf(b) { return b.type === 'league' || b.type === 'public' ? 'program' : b.type; }
  function scheduled(dateIso) {
    /* Past the members' window the sample data has no bookings yet; programs are booked ahead,
       so the leagues and the Friday public hours show as they will be. */
    var d = P(dateIso), out = [];
    if (seasonKind(dateIso) !== 'indoor') return out;
    D.indoorStarts(d).forEach(function (st) {
      for (var c = 1; c <= 4; c++) {
        var s = D.hourState(d, st, c), lg = s === 'taken' ? D.leagueAt(d, st) : null;
        if (s === 'public' || lg) out.push({ id: 'sched-' + dateIso + '-' + c + '-' + st, date: dateIso, start: st, hours: 1, court: c, band: D.band(d, st),
          type: s === 'public' ? 'public' : 'league', title: s === 'public' ? 'Indoor public hours (weekly lottery)' : lg, players: s === 'public' ? null : 4,
          total: 0, status: 'booked', source: s === 'public' ? 'lottery' : 'program', scheduled: true, sample: true });
      }
    });
    return out;
  }
  function dayList(dateIso) {
    var list = D.dayBookings(dateIso);
    var w = windowOf(dateIso);
    if (w.n > R.membersDaysAhead || (w.n === R.membersDaysAhead && !w.members)) {
      var have = {}; list.forEach(function (b) { if (!OFF[b.status]) for (var h = 0; h < (b.hours || 1); h++) have[b.court + '|' + (b.start + h * 60)] = 1; });
      list = list.concat(scheduled(dateIso).filter(function (b) { return !have[b.court + '|' + b.start]; }));
    }
    return list;
  }
  /* The public flow's booking while it is still being made: a ghost, never a booking */
  function ghost(dateIso) {
    var pb = D.publicBooking();
    return pb && !pb.done && pb.status === 'in-progress' && pb.date === dateIso ? pb : null;
  }
  function occupancy(dateIso, list) {
    var map = {};
    (list || dayList(dateIso)).forEach(function (b) {
      if (OFF[b.status]) return;
      for (var h = 0; h < (b.hours || 1); h++) map[b.court + '|' + (b.start + h * 60)] = { b: b, first: h === 0 };
    });
    return map;
  }
  function slotFree(dateIso, court, start, hours, ignoreId) {
    var occ = occupancy(dateIso), rows = rowsOf(dateIso).filter(function (r) { return r.open; }).map(function (r) { return r.start; });
    for (var h = 0; h < (hours || 1); h++) {
      var m = start + h * 60, o = occ[court + '|' + m];
      if (rows.indexOf(m) < 0) return false;
      if (o && o.b.id !== ignoreId) return false;
    }
    return true;
  }
  /* An hour that has started cannot be booked: indoor court time starts exactly on the half hour (weekdays) or the hour (weekends) */
  function isPastSlot(dateIso, start) { return dateIso < TODAY_ISO || (dateIso === TODAY_ISO && start < NOW_MIN); }
  function inPlay(b) { return b.date === TODAY_ISO && b.start <= NOW_MIN && NOW_MIN < b.start + (b.hours || 1) * 60 && !OFF[b.status] && b.status !== 'no-show'; }

  /* ---------- Words for a booking ---------- */
  function who(b) {
    if (b.fromPublicFlow) return b.name || 'From the public site';
    if (b.personId) return D.personName(b.personId);
    if (b.name) return b.name;
    return '';
  }
  function typeLabel(b) {
    if (b.fromPublicFlow) return b.type === 'member' ? 'Member, public site' : 'Non-member, public site';
    return { member: 'Member', 'non-member': b.source === 'front-desk' ? 'Walk-in' : 'Non-member', lesson: 'Lesson', hold: 'Hold', league: 'League', public: 'Public hours' }[b.type] || b.type;
  }
  function shortTitle(b) {
    if (b.type === 'hold') return (b.title || 'Hold').replace(/^Held for (an? )?/, '').replace(/^./, function (x) { return x.toUpperCase(); });
    if (b.type === 'league' || b.type === 'public') return b.title;
    if (b.type === 'lesson') return who(b) || (b.title || 'Lesson').replace(/, Head Pro$/, '');
    return who(b);
  }
  /* A singles league is two players a court; data.js gives every league 4 (review R1) */
  function playersOf(b) { return (b.type === 'league' && /singles/i.test(b.title || '')) ? 2 : b.players; }
  function playersText(b) { var n = playersOf(b); return n ? n + (n <= 3 ? ', singles' : ', doubles') : ''; }
  /* "Maximum of one booking and court use per day per member": the desk sees a second one (review R6) */
  function sameDay(b) {
    if (b.type !== 'member' || !b.personId || OFF[b.status]) return [];
    return D.bookings.list({ date: b.date, personId: b.personId, type: 'member' }).filter(function (x) { return x.id !== b.id && !OFF[x.status]; });
  }
  function payState(b) {
    if (!b.total) return null;
    if (b.held) return 'due';
    return b.paid ? 'succeeded' : 'due';
  }
  function cellLabel(b, court, start) {
    var bits = ['Court ' + court, F.range(b.start, b.hours || 1), typeLabel(b)];
    var w = who(b); if (w && !b.fromPublicFlow && b.type !== 'league' && b.type !== 'public') bits.push(w);
    if (b.type === 'hold' || b.type === 'league' || b.type === 'public') bits.push(b.title);
    if (b.players) bits.push(playersOf(b) + ' players');
    bits.push(UI.statusLabel(b.status));
    var p = payState(b); if (p) bits.push(p === 'succeeded' ? 'paid' : 'to settle');
    if (inPlay(b)) bits.push('in play now');
    if (sameDay(b).length) bits.push('second booking this day for this member');
    return bits.join(', ');
  }

  /* ---------- The court plan: 36 x 78 ft, the net in club red, posts 3 ft outside the doubles
     sidelines, service lines 21 ft from the net, singles sidelines 4.5 ft in. Who is on it this
     hour stands where they would: singles server on the deuce side of the centre mark and the
     receiver diagonally opposite; doubles with the server's partner at the net and the receiver's
     partner on the service line; a lesson with the coach (hollow) and the basket across the net. ---------- */
  function people(b) {
    if (!b) return '';
    var dot = function (x, y) { return '<circle class="who" cx="' + x + '" cy="' + y + '" r="2.4"/>'; };
    if (b.type === 'hold') return '<rect class="bk-plan__hold" x="0" y="0" width="36" height="78"/>';
    if (b.type === 'lesson') return dot(18, 80.5) + '<circle class="who who--coach" cx="18" cy="21" r="2.4"/><rect class="who__basket" x="22.5" y="19" width="4" height="4"/>';
    var four = b.type === 'public' || (playersOf(b) || 2) >= 4;
    return four ? dot(22, 80.5) + dot(9, 45) + dot(9, -2.5) + dot(27, 18) : dot(22, 80.5) + dot(13, -2.5);
  }
  function plan(b, cls) {
    return '<svg class="cplan bk-plan' + (cls ? ' ' + cls : '') + '" viewBox="-6 -7 48 92" aria-hidden="true" focusable="false">' +
      '<g class="cplan__lines"><path d="M0 0H36V78H0ZM4.5 0V78M31.5 0V78M4.5 18H31.5M4.5 60H31.5M18 18V60M18 0V1.2M18 76.8V78"/></g>' +
      '<path class="cplan__net" d="M-3 39H39"/><circle class="bk-plan__post" cx="-3" cy="39" r="0.9"/><circle class="bk-plan__post" cx="39" cy="39" r="0.9"/>' +
      people(b) + '</svg>';
  }

  /* ---------- Head actions: shown to every role, disabled with the reason when the role cannot ---------- */
  function actBtn(perm, cls, label, attr) {
    var ok = UI.can(perm);
    return '<button class="pn-btn ' + cls + '" type="button" ' + attr + (ok ? '' : ' aria-disabled="true" title="' + esc(UI.whoCan(perm)) + ' only" data-bk-why="' + esc(UI.whoCan(perm)) + ' only"') + '>' + label + '</button>';
  }
  function renderActions() {
    $('[data-bk-actions]').innerHTML =
      actBtn('bookings.lesson', 'pn-btn--quiet', icon('coach') + 'Lesson on court', 'data-bk-new="lesson"') +
      actBtn('bookings.hold', 'pn-btn--quiet', icon('clock') + 'Hold a court', 'data-bk-new="hold"') +
      actBtn('bookings.walkin', 'pn-btn--ink', icon('plus') + 'Book a walk-in', 'data-bk-new="walkin"');
  }

  /* ---------- Figures for the selected day ---------- */
  function renderKpis() {
    var d = S.date, rows = rowsOf(d), list = dayList(d).filter(function (b) { return !OFF[b.status]; });
    var open = rows.filter(function (r) { return r.open; }).length * 4, used = 0, fees = 0, due = 0, holds = 0, now = 0;
    list.forEach(function (b) {
      used += b.hours || 1;
      if (b.type === 'hold') holds++;
      if (b.total && !b.scheduled) { fees += b.total; if (payState(b) === 'due') due += b.total; }
      if (inPlay(b)) now++;
    });
    var k = seasonKind(d), label = F.day(d);
    var cells = !k ? [
      ['Courts', 'Between seasons', 'The outdoor season ended Sep 30; the dome goes up likely Oct 12'],
      ['Members book from', F.day(addIso(IND.start, -R.membersDaysAhead)), 'At 7:30am, for the first indoor day']
    ] : [
      ['Court hours booked', used + ' of ' + open, label + ', Courts 1 to 4'],
      d === TODAY_ISO ? ['In play now', now + ' of 4', F.time(NOW_MIN) + ' on the demo clock'] : ['Holds', String(holds), 'Held by the desk or the Head Pro'],
      k === 'outdoor' ? ['Court fees', '$0.00', 'No court fees for members outdoors'] : ['Court and player fees', F.money(fees), 'HST included, ' + F.money(D.hstIn(fees)) + ' of it'],
      ['To settle', F.money(due), k === 'outdoor' ? 'Nothing to settle outdoors' : 'Members may pay later; walk-ins pay at booking']
    ];
    $('[data-bk-kpis]').innerHTML = cells.map(function (c) {
      return '<div class="pn-kpi"><p class="pn-kpi__label">' + esc(c[0]) + '</p><p class="pn-kpi__value pn-num">' + esc(c[1]) + '</p><p class="pn-kpi__note">' + esc(c[2]) + '</p></div>';
    }).join('');
  }

  /* ---------- The members' window: today and the 7 days ahead, the newest opening at 7:30am ---------- */
  function renderWindow() {
    var days = [];
    for (var i = 0; i <= R.membersDaysAhead; i++) days.push(addIso(TODAY_ISO, i));
    var newestOpen = NOW_MIN >= R.opensAtMin;
    var html = '<div class="bk-window__days" role="group" aria-label="Booking window: today and the next ' + R.membersDaysAhead + ' days">' + days.map(function (s, i) {
      var w = windowOf(s), k = seasonKind(s);
      var state = w.nonMembers ? 'Members and non-members' : w.members ? 'Members' : 'Opens ' + F.time(R.opensAtMin);
      return '<button type="button" class="bk-window__day' + (s === S.date ? ' is-current' : '') + (w.members ? '' : ' is-closed') + '" data-bk-go="' + s + '"' + (s === S.date ? ' aria-current="date"' : '') +
        ' aria-label="' + esc(F.long(s) + ': ' + state + (k ? '' : ', between seasons')) + '">' +
        '<span class="bk-window__dow">' + (i === 0 ? 'Today' : F.day(s).slice(0, 3)) + '</span><span class="bk-window__num pn-num">' + P(s).getDate() + '</span>' +
        '<span class="bk-window__mark" aria-hidden="true">' + (w.nonMembers ? '<i class="is-nm"></i>' : '') + (w.members ? '<i class="is-m"></i>' : '<i class="is-wait"></i>') + '</span></button>';
    }).join('') + '</div>';
    html += '<ul class="bk-window__key" role="list">' +
      '<li><i class="is-m" aria-hidden="true"></i>Members book ' + R.membersDaysAhead + ' days ahead, as early as ' + F.time(R.opensAtMin) + '</li>' +
      '<li><i class="is-nm" aria-hidden="true"></i>Non-members ' + R.nonMembersDaysAhead + ' day ahead</li>' +
      (newestOpen ? '<li class="bk-window__next">Next to open: ' + esc(F.day(addIso(TODAY_ISO, R.membersDaysAhead + 1))) + ', tomorrow at ' + F.time(R.opensAtMin) + '</li>'
        : '<li><i class="is-wait" aria-hidden="true"></i>' + esc(F.day(addIso(TODAY_ISO, R.membersDaysAhead))) + ' opens today at ' + F.time(R.opensAtMin) + '</li>') + '</ul>';
    $('[data-bk-window]').innerHTML = html;
  }

  /* ---------- Toolbar ---------- */
  function renderToolbar() {
    var week = S.view === 'week';
    var prev = $('[data-bk-step="-1"]'), next = $('[data-bk-step="1"]');
    prev.innerHTML = icon('chevron', 'bk-rot90'); next.innerHTML = icon('chevron', 'bk-rot-90');
    prev.setAttribute('aria-label', week ? 'Previous week' : 'Previous day');
    next.setAttribute('aria-label', week ? 'Next week' : 'Next day');
    var mon = mondayOf(S.date);
    $('[data-bk-date]').textContent = week ? 'Week of ' + F.day(mon) + ' to ' + F.day(addIso(mon, 6)) : F.long(S.date);
    $('[data-bk-pick]').value = S.date;
    var k = seasonKind(S.date);
    $('[data-bk-seasonjump]').innerHTML = [['indoor', 'Indoor 2026/27', 'dome'], ['outdoor', 'Outdoor 2026', 'sun']].map(function (x) {
      return '<button type="button" aria-pressed="' + (k === x[0]) + '" data-bk-jump="' + x[0] + '">' + icon(x[2], 'icon--16') + x[1] + '</button>';
    }).join('');
    $('[data-bk-filter]').innerHTML = FILTERS.map(function (f) {
      return '<button type="button" aria-pressed="' + (S.filter === f[0]) + '" data-bk-show="' + f[0] + '">' + f[1] + '</button>';
    }).join('');
    $$('[data-bk-view]').forEach(function (t) {
      var on = t.getAttribute('data-bk-view') === S.view;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
    });
    $$('[data-bk-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-bk-panel') !== S.view; });
    var seasonEl = $('[data-bk-season]'), so = D.season(S.date);
    seasonEl.innerHTML = so ? icon(k === 'indoor' ? 'dome' : 'sun', 'icon--16') + '<span>' + esc(so.name) + ', ' + esc(F.date(so.start)) + ' to ' + esc(F.date(so.end)) +
      (so.start_to_confirm ? ' (start likely, club to confirm)' : so.approx ? ' (approximately)' : '') + '</span>' : icon('calendar', 'icon--16') + '<span>Between seasons</span>';
    $('[data-bk-cal-title]').textContent = week ? 'The week, court by court' : 'Order of play';
  }

  /* ---------- Day view: the order of play ---------- */
  function bandHead(r) {
    var b = bandInfo(r.band);
    if (r.band === 'outdoor') return '<span class="bk-band__name">Outdoor</span><span class="bk-band__fee">No member fee</span>';
    return '<span class="bk-band__name">' + esc(b.id === 'weekend' ? 'Weekend' : b.name.replace(/ time$/, '')) + '</span><span class="bk-band__fee pn-money">$' + b.fee + '</span>';
  }
  function blockHtml(b, extra) {
    var pay = payState(b), live = inPlay(b);
    var cls = 'bk-slot bk-slot--' + b.type + (b.fromPublicFlow ? ' bk-slot--site' : '') + (b.scheduled ? ' bk-slot--sched' : '') +
      (S.filter !== 'all' && groupOf(b) !== S.filter ? ' is-dim' : '') + (b.status === 'no-show' ? ' is-noshow' : '') + (b.status === 'completed' ? ' is-played' : '') + (extra || '');
    var meta = [];
    if (b.type === 'lesson') meta.push(/semi/i.test(b.title || '') ? 'Semi-private' : 'Private');
    else if (b.players) meta.push(playersText(b));
    if ((b.hours || 1) > 1) meta.push(b.hours + ' hours');
    return '<button type="button" class="' + cls + '" data-bk-open="' + esc(b.id) + '" aria-label="' + esc(cellLabel(b, b.court, b.start)) + '">' +
      '<span class="bk-slot__type">' + (live ? '<span class="live-dot" aria-hidden="true"></span>' : '') + (b.fromPublicFlow ? icon('arrow-external', 'icon--16') : '') + esc(typeLabel(b)) + '</span>' +
      '<span class="bk-slot__who">' + esc(shortTitle(b)) + '</span>' +
      '<span class="bk-slot__meta">' + esc(meta.join(', ')) + (b.status !== 'booked' ? ' <span class="bk-slot__state">' + esc(UI.statusLabel(b.status)) + '</span>' : '') +
      (pay === 'due' ? ' <span class="bk-slot__due">To settle</span>' : '') + (sameDay(b).length ? ' <span class="bk-slot__due">Twice today</span>' : '') + '</span></button>';
  }
  function renderDay() {
    var box = $('[data-bk-panel="day"]'), d = S.date, rows = rowsOf(d);
    if (!rows.length) {
      var toIndoor = d < IND.start;
      box.innerHTML = '<div class="pn-empty bk-between">' + plan(null, 'bk-plan--lg') +
        '<p class="pn-empty__title">Between seasons on ' + esc(F.day(d)) + '</p>' +
        '<p>The outdoor season ran from ' + esc(F.day(OUT.start)) + ' to ' + esc(F.day(OUT.end)) + ' (approximately). The dome goes up for the indoor season likely on ' + esc(F.day(IND.start)) + '. No courts are booked in between.</p>' +
        '<p>' + UI.confirmSlot('first indoor day') + '</p>' +
        '<button type="button" class="pn-btn pn-btn--quiet" data-bk-go="' + (toIndoor ? IND.start : OUT.end) + '">' + (toIndoor ? 'Go to the first indoor day, ' + esc(F.day(IND.start)) : 'Go to the last outdoor day') + '</button></div>';
      return;
    }
    var list = dayList(d), occ = occupancy(d, list), g = ghost(d), isToday = d === TODAY_ISO;
    var head = '<thead><tr><th scope="col" class="bk-day__corner"><span>Start</span><span class="pn-sub">Fee band</span></th>' + D.courts.map(function (c) {
      var cur = null;
      if (isToday) list.forEach(function (b) { if (b.court === c.id && inPlay(b)) cur = b; });
      return '<th scope="col" class="bk-day__court"><span class="bk-day__courtname">' + esc(c.name) + '</span>' + plan(cur) +
        '<span class="bk-day__courtstate">' + (!isToday ? '' : cur ? '<span class="live-dot" aria-hidden="true"></span>In play now' : 'Free now') + '</span></th>';
    }).join('') + '</tr></thead>';
    var body = rows.map(function (r, ri) {
      var first = ri === 0 || rows[ri - 1].band !== r.band;
      var nowRow = isToday && r.start <= NOW_MIN && NOW_MIN < r.start + 60;
      var tr = '<tr class="bk-band--' + r.band + (first ? ' is-bandstart' : '') + (r.open ? '' : ' is-closed') + (nowRow ? ' is-now' : '') + '" data-row="' + ri + '">' +
        '<th scope="row" class="bk-day__time"><span class="bk-day__t pn-num">' + F.time(r.start) + '</span>' + (first ? '<span class="bk-band">' + bandHead(r) + '</span>' : '') + '</th>';
      D.courts.forEach(function (c) {
        var key = c.id + '|' + r.start, o = occ[key], pos = ' data-r="' + ri + '" data-c="' + c.id + '" data-key="' + key + '"';
        if (o && !o.first) return;
        if (o) {
          var span = Math.min(o.b.hours || 1, rows.length - ri);
          tr += '<td' + (span > 1 ? ' rowspan="' + span + '"' : '') + ' class="bk-day__cell">' + blockHtml(o.b).replace('<button ', '<button' + pos + ' data-span="' + span + '" ') + '</td>';
          return;
        }
        if (g && g.court === c.id && r.start >= g.start && r.start < g.start + (g.hours || 1) * 60) {
          tr += '<td class="bk-day__cell"><button type="button" class="bk-slot bk-slot--ghost"' + pos + ' data-span="1" data-bk-public-open aria-label="' + esc('Court ' + c.id + ', ' + F.time(r.start) + ', being booked on the public site, not confirmed') + '">' +
            '<span class="bk-slot__type">' + icon('arrow-external', 'icon--16') + 'Public site</span><span class="bk-slot__who">Being booked</span><span class="bk-slot__meta">Not confirmed</span></button></td>';
          return;
        }
        var past = isPastSlot(d, r.start);
        var label = 'Court ' + c.id + ', ' + F.range(r.start, 1) + ', ' + (!r.open ? 'organized tennis, not bookable' : past ? (d < TODAY_ISO || r.start + 60 <= NOW_MIN ? 'past' : 'under way, not bookable') : 'free, ' + (r.band === 'outdoor' ? 'no member court fee' : '$' + bandInfo(r.band).fee + ' an hour'));
        tr += '<td class="bk-day__cell"><button type="button" class="bk-slot bk-slot--' + (!r.open ? 'closed' : past ? 'past' : 'free') + '"' + pos + ' data-span="1" data-bk-free="' + c.id + '|' + r.start + '" aria-label="' + esc(label) + '">' +
          '<span class="bk-slot__free">' + (!r.open ? 'Organized tennis' : past ? '' : 'Free') + '</span></button></td>';
      });
      return tr + '</tr>';
    }).join('');
    var off = list.filter(function (b) { return OFF[b.status]; });
    var etiquette = seasonKind(d) === 'indoor'
      ? 'Courts change on the ' + (isWeekend(P(d)) ? 'hour at weekends' : 'half hour on weekdays') + '; the first buzzer sounds 3 minutes before the end of each hour.'
      : 'Outdoors, members book inside the club’s published windows; outside them organized tennis has the courts. No guests outdoors.';
    var notes = '<p class="pn-note bk-daynote">' + icon('clock') + '<span>' + esc(etiquette) + (isThanksgiving(P(d)) ? ' Thanksgiving Monday shows weekday hours. ' + UI.confirmSlot('holiday court hours') : '') + '</span></p>';
    var w = windowOf(d);
    if (!w.past && !w.members) notes += '<p class="pn-note bk-daynote">' + icon('calendar') + '<span>Not open to members yet: they can book ' + esc(F.day(d)) + ' from ' + esc(F.day(w.membersFrom)) + ' at ' + F.time(R.opensAtMin) + '. Leagues and the Friday public hours are booked ahead and show already.</span></p>';
    box.innerHTML = notes + '<div class="bk-daywrap"><table class="bk-day bk-grid" role="grid" aria-label="' + esc('Courts 1 to 4 on ' + F.long(d)) + '" aria-describedby="bk-keys">' + head + '<tbody>' + body + '</tbody></table>' +
      (isToday ? '<div class="bk-now" aria-hidden="true"><span class="bk-now__t pn-num">' + F.time(NOW_MIN) + '</span></div>' : '') + '</div>' +
      (off.length ? '<div class="bk-off"><h3 class="pn-h3">Cancelled on this day <span class="pn-muted">(' + off.length + ')</span></h3><ul class="bk-off__list" role="list">' + off.map(function (b) {
        return '<li><button type="button" class="pn-rowlink" data-bk-open="' + esc(b.id) + '">' + esc('Court ' + b.court + ', ' + F.range(b.start, b.hours || 1)) + '</button> <span class="pn-muted">' + esc(typeLabel(b) + (who(b) ? ', ' + who(b) : '')) + '</span> ' + UI.chip(b.status) + '</li>';
      }).join('') + '</ul></div>' : '');
    placeNow();
  }
  function placeNow() {
    var line = $('.bk-now'); if (!line) return;
    var row = $('.bk-day tr.is-now'), wrap = $('.bk-daywrap');
    if (!row || !wrap) { line.hidden = true; return; }
    var rows = rowsOf(S.date), ri = +row.getAttribute('data-row'), frac = (NOW_MIN - rows[ri].start) / 60;
    line.hidden = false;
    line.style.transform = 'translateY(' + Math.round(row.offsetTop + frac * row.offsetHeight) + 'px)';
  }

  /* ---------- Week view: seven days, each hour a row, each cell the four courts side by side ---------- */
  function hourLabel(h) { return F.time(h * 60).replace(':00', ''); }
  function renderWeek() {
    var box = $('[data-bk-panel="week"]'), mon = mondayOf(S.date), days = [];
    for (var i = 0; i < 7; i++) days.push(addIso(mon, i));
    var info = days.map(function (s) {
      var rows = rowsOf(s), list = dayList(s), occ = occupancy(s, list), used = 0, open = 0;
      rows.forEach(function (r) { if (r.open) open += 4; });
      list.forEach(function (b) { if (!OFF[b.status]) used += b.hours || 1; });
      return { iso: s, rows: rows, occ: occ, used: used, open: open, kind: seasonKind(s), ghost: ghost(s) };
    });
    var hours = [];
    info.forEach(function (x) { x.rows.forEach(function (r) { var h = Math.floor(r.start / 60); if (hours.indexOf(h) < 0) hours.push(h); }); });
    hours.sort(function (a, b) { return a - b; });
    if (!hours.length) {
      box.innerHTML = '<div class="pn-empty bk-between">' + plan(null, 'bk-plan--lg') + '<p class="pn-empty__title">Between seasons all week</p><p>The outdoor season ended ' + esc(F.day(OUT.end)) +
        ' (approximately) and the dome goes up likely on ' + esc(F.day(IND.start)) + '. ' + UI.confirmSlot('first indoor day') + '</p><button type="button" class="pn-btn pn-btn--quiet" data-bk-go="' + IND.start + '">Go to the first indoor week</button></div>';
      return;
    }
    var head = '<thead><tr><th scope="col" class="bk-wk__corner">Hour</th>' + info.map(function (x, ci) {
      var pct = x.open ? Math.round(x.used / x.open * 100) : 0;
      return '<th scope="col" class="bk-wk__day' + (x.iso === TODAY_ISO ? ' is-today' : '') + (x.iso === S.date ? ' is-current' : '') + '">' +
        '<button type="button" class="bk-wk__dayname" data-r="-1" data-c="' + ci + '" data-span="1" data-key="d|' + x.iso + '" data-bk-day="' + x.iso + '" aria-label="' + esc(F.long(x.iso) + ', open the day' + (x.open ? ', ' + x.used + ' of ' + x.open + ' court hours booked' : ', between seasons')) + '">' +
        '<span>' + esc(F.day(x.iso).slice(0, 3)) + '</span><span class="pn-num">' + P(x.iso).getDate() + '</span></button>' +
        '<span class="bk-wk__use pn-num">' + (x.open ? pct + '%' : 'Closed') + '</span>' +
        (x.open ? '<span class="pn-meter bk-wk__meter" aria-hidden="true"><span class="pn-meter__fill" style="width:' + pct + '%"></span></span>' : '') + '</th>';
    }).join('') + '</tr></thead>';
    var body = hours.map(function (h, ri) {
      return '<tr><th scope="row" class="bk-wk__hour pn-num">' + hourLabel(h) + '</th>' + info.map(function (x, ci) {
        var r = null; x.rows.forEach(function (y) { if (Math.floor(y.start / 60) === h) r = y; });
        if (!r) return '<td class="bk-wk__cell is-none"><span class="sr-only">' + esc(x.kind ? 'Courts closed' : 'Between seasons') + '</span></td>';
        var taken = 0, ticks = '', past = isPastSlot(x.iso, r.start), match = 0;
        D.courts.forEach(function (c) {
          var o = x.occ[c.id + '|' + r.start], g = x.ghost && x.ghost.court === c.id && r.start >= x.ghost.start && r.start < x.ghost.start + (x.ghost.hours || 1) * 60;
          var t = !r.open ? 'closed' : o ? o.b.type + (o.b.fromPublicFlow ? ' is-site' : '') : g ? 'ghost' : 'free';
          if (o) { taken++; if (S.filter === 'all' || groupOf(o.b) === S.filter) match++; }
          ticks += '<i class="bk-tick bk-tick--' + t + (o && S.filter !== 'all' && groupOf(o.b) !== S.filter ? ' is-dim' : '') + '"></i>';
        });
        var label = F.day(x.iso) + ', ' + F.time(r.start) + ': ' + (!r.open ? 'organized tennis, not bookable' : taken + ' of 4 courts taken' + (S.filter !== 'all' ? ', ' + match + ' ' + FILTERS.filter(function (f) { return f[0] === S.filter; })[0][1].toLowerCase() : '')) + (past ? ', past' : '');
        return '<td class="bk-wk__cell bk-band--' + r.band + (past ? ' is-past' : '') + '"><button type="button" class="bk-wk__btn" data-r="' + ri + '" data-c="' + ci + '" data-span="1" data-key="' + x.iso + '|' + r.start + '" data-bk-day="' + x.iso + '" data-bk-row="' + r.start + '" aria-label="' + esc(label) + '">' +
          '<span class="bk-wk__ticks" aria-hidden="true">' + ticks + '</span><span class="bk-wk__min pn-num" aria-hidden="true">' + F.time(r.start).replace(/(am|pm)$/, '') + '</span></button></td>';
      }).join('') + '</tr>';
    }).join('');
    var anyIndoor = info.some(function (x) { return x.kind === 'indoor'; });
    box.innerHTML = '<p class="pn-note bk-daynote">' + icon('court') + '<span>Each cell is the four courts in order, 1 to 4. ' + (anyIndoor ? 'Indoors, weekday courts start on the half hour and weekend courts on the hour, as the club’s etiquette says. ' : '') + 'Choose a cell to open that day.</span></p>' +
      '<div class="bk-wkwrap"><table class="bk-wk bk-grid" role="grid" aria-label="' + esc('Week of ' + F.day(mon)) + '" aria-describedby="bk-keys">' + head + '<tbody>' + body + '</tbody></table></div>';
  }

  /* ---------- Keyboard: one tab stop per grid, arrows move like a grid (WAI-ARIA grid pattern) ---------- */
  function gridButtons(grid) { return $$('button[data-r]', grid); }
  function setStop(grid, btn) {
    gridButtons(grid).forEach(function (b) { b.tabIndex = b === btn ? 0 : -1; });
  }
  function initGrid(grid, prefer) {
    var btns = gridButtons(grid); if (!btns.length) return;
    var stop = (prefer && $('button[data-key="' + prefer + '"]', grid)) || $('button.bk-slot--free', grid) || btns[0];
    setStop(grid, stop);
    return stop;
  }
  function cellAt(grid, r, c) {
    var hit = null;
    gridButtons(grid).forEach(function (b) {
      var br = +b.getAttribute('data-r'), sp = +b.getAttribute('data-span') || 1;
      if (+b.getAttribute('data-c') === c && r >= br && r < br + sp) hit = b;
    });
    return hit;
  }
  document.addEventListener('keydown', function (e) {
    var btn = e.target.closest && e.target.closest('.bk-grid button[data-r]'); if (!btn) return;
    var grid = btn.closest('.bk-grid'), r = +btn.getAttribute('data-r'), c = +btn.getAttribute('data-c'), sp = +btn.getAttribute('data-span') || 1;
    var cols = gridButtons(grid).map(function (b) { return +b.getAttribute('data-c'); });
    var minC = Math.min.apply(null, cols), maxC = Math.max.apply(null, cols);
    var rows = gridButtons(grid).map(function (b) { return +b.getAttribute('data-r') + (+b.getAttribute('data-span') || 1) - 1; });
    var minR = Math.min.apply(null, gridButtons(grid).map(function (b) { return +b.getAttribute('data-r'); })), maxR = Math.max.apply(null, rows);
    var row = +(grid.getAttribute('data-row-memory') || r); if (row < r || row >= r + sp) row = r;
    var t = null, k = e.key;
    var scan = function (rr, dc) { for (var cc = c + dc; cc >= minC && cc <= maxC; cc += dc) { var x = cellAt(grid, rr, cc); if (x) return x; } return null; };
    var scanR = function (start, dr) { for (var rr = start; rr >= minR && rr <= maxR; rr += dr) { var x = cellAt(grid, rr, c); if (x) return x; } return null; };
    if (k === 'ArrowRight') t = scan(row, 1);
    else if (k === 'ArrowLeft') t = scan(row, -1);
    else if (k === 'ArrowDown') t = scanR(r + sp, 1);
    else if (k === 'ArrowUp') t = scanR(r - 1, -1);
    else if (k === 'Home') t = e.ctrlKey ? gridButtons(grid)[0] : (function () { for (var cc = minC; cc <= maxC; cc++) { var x = cellAt(grid, row, cc); if (x) return x; } return null; })();
    else if (k === 'End') t = e.ctrlKey ? gridButtons(grid)[gridButtons(grid).length - 1] : (function () { for (var cc = maxC; cc >= minC; cc--) { var x = cellAt(grid, row, cc); if (x) return x; } return null; })();
    else if (k === 'PageDown') t = scanR(Math.min(maxR, r + 4), 1) || scanR(maxR, -1);
    else if (k === 'PageUp') t = scanR(Math.max(minR, r - 4), -1) || scanR(minR, 1);
    else return;
    e.preventDefault();
    if (!t) return;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End') grid.setAttribute('data-row-memory', row);
    else grid.removeAttribute('data-row-memory');
    setStop(grid, t); t.focus();
    S.focusKey = t.getAttribute('data-key');
  });
  document.addEventListener('focusin', function (e) {
    var btn = e.target.closest && e.target.closest('.bk-grid button[data-r]');
    if (btn) { setStop(btn.closest('.bk-grid'), btn); S.focusKey = btn.getAttribute('data-key'); }
  });

  /* ---------- The club's rules, found by their own words ---------- */
  function rule(re) { var r = (C.booking.rules || []).filter(function (x) { return re.test(x); })[0]; return r ? r.replace(/\s+/g, ' ').trim() : ''; }
  var RULE = {
    nonCompliance: rule(/non compliance/i), staff: rule(/staff are not allowed/i), length: rule(/maximum duration/i), limits: rule(/limit of 1 booking/i),
    notice: rule(/48 hours cancellation/i), strikes: rule(/no-shows for a court booking 3 times/i), noRefund: rule(/no refunds or rescheduling/i),
    balance: rule(/outstanding balance/i), card: rule(/credit card on file will be charged/i).replace(/\s*\[.*$/, '.'), guests: rule(/same guest/i)
  };
  function quote(t) { return t ? '<blockquote class="bk-quote"><p>' + esc(t) + '</p><footer>Club booking policy, Court Bookings page</footer></blockquote>' : ''; }

  /* ---------- Finding a booking, wherever it lives ---------- */
  function findBooking(id) {
    var b = D.bookings.get(id); if (b) return b;
    var pb = D.publicBooking(); if (pb && pb.id === id) return pb;
    var m = /^sched-(\d{4}-\d{2}-\d{2})-/.exec(id || '');
    if (m) return scheduled(m[1]).filter(function (x) { return x.id === id; })[0] || null;
    return null;
  }
  function strikesOf(personId) {
    var n = { noShow: 0, late: 0 };
    if (!personId) return n;
    D.bookings.list({ personId: personId }).forEach(function (b) { if (b.status === 'no-show') n.noShow++; if (b.status === 'late-cancel') n.late++; });
    return n;
  }
  var SOURCE = { online: 'Online, by the member', 'front-desk': 'Front desk', 'head-pro': 'Head Pro', program: 'Program schedule', lottery: 'Friday lottery (phone)', 'public-site': 'The new public site (demo)' };

  /* ---------- Booking sheet ---------- */
  function moneyRows(b) {
    var rows = [], band = bandInfo(b.band);
    if (b.type === 'lesson') {
      rows.push(['Lesson fee', F.money(b.lessonFee || 0)]);
      rows.push(['HST 13% added', F.money(D.hstOn(b.lessonFee || 0))]);
    } else if (b.band === 'outdoor') {
      rows.push(['Court fee', '$0.00, no court fees for members outdoors']);
    } else if (b.type === 'member' || b.type === 'non-member') {
      rows.push(['Court fee', F.money(b.courtFee || 0) + ' (' + (b.hours || 1) + ' x ' + band.name.toLowerCase() + ')']);
      if (b.type === 'non-member') rows.push(['Player fees', F.money(b.extra || 0) + ' (' + (b.players || 0) + ' x ' + F.money(D.playerFee) + ')']);
      else if (b.guests) rows.push(['Guest fees', F.money(b.extra || 0) + ' (' + b.guests + ' x ' + F.money(D.playerFee) + ')']);
    }
    if (!b.total) return rows;
    rows.push(['Total', '<strong class="pn-money">' + F.money(b.total) + '</strong>' + (b.hstIncluded ? ' <span class="pn-muted">HST included, ' + F.money(D.hstIn(b.total)) + ' of it</span>' : '')]);
    var pay = b.paymentId ? D.payments.get(b.paymentId) : null;
    rows.push(['Payment', pay ? UI.chip('succeeded') + ' <a class="inline-link" href="' + esc(UI.link('payments', 'pay=' + pay.id)) + '">' + esc(pay.id) + '</a> <span class="pn-muted">' + esc(pay.method + (pay.last4 ? ' ending ' + pay.last4 : '')) + '</span>'
      : b.held ? UI.chip('due', 'Pre-pay by phone') + ' <span class="pn-muted">Non-member, held until paid</span> ' + UI.confirmSlot('how long a court is held before payment')
      : b.paid ? UI.chip('succeeded') + ' <span class="pn-muted">Paid on the public site (demo)</span>'
      : UI.chip('due') + ' <span class="pn-muted">' + esc(C.booking.member_payment) + '</span>']);
    return rows;
  }
  function dl(rows) { return '<dl class="pn-dl">' + rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>'; }
  function btn(perm, cls, label, attr) {
    var ok = !perm || UI.can(perm);
    return '<button class="pn-btn ' + cls + '" type="button" ' + attr + (ok ? '' : ' aria-disabled="true" data-bk-why="' + esc(UI.whoCan(perm)) + ' only"') + '>' + label + (ok ? '' : '<span class="sr-only">, ' + esc(UI.whoCan(perm)) + ' only</span>') + '</button>';
  }
  function whenText(b) { return 'Court ' + b.court + ', ' + F.day(b.date) + ', ' + F.time(b.start); }
  function openBooking(id) {
    var b = findBooking(id);
    if (!b) { UI.toast('That booking is not in this browser any more. Reset demo may have cleared it.', { kind: 'warn' }); return; }
    var future = !isPastSlot(b.date, b.start);
    var started = !future, live = inPlay(b), stk = strikesOf(b.personId);
    var chips = [UI.chip(b.status === 'booked' && live ? 'running' : b.status, b.status === 'booked' && live ? 'In play now' : null)];
    var ps = payState(b); if (ps && !b.held) chips.push(UI.chip(ps));
    if (b.fromPublicFlow) chips.push('<span class="chip chip--muted pn-chip">' + icon('arrow-external', 'icon--16') + 'Public site</span>');
    var whoRow = b.personId ? '<a class="inline-link" href="' + esc(UI.link('members', 'person=' + b.personId)) + '">' + esc(who(b)) + '</a><span class="pn-sub">' + esc((D.member(b.personId) || {}).status === 'member' ? 'Indoor 2026/27 member' : b.type === 'lesson' ? 'Student' : 'Non-member contact') + ', sample person</span>'
      : esc(who(b) || 'No one named');
    var rows = [
      ['When', esc(F.long(b.date)) + '<span class="pn-sub">' + esc(F.range(b.start, b.hours || 1)) + '</span>'],
      ['Court', esc('Court ' + b.court)],
      ['Fee band', b.band === 'outdoor' ? 'Outdoor season' : esc(bandInfo(b.band).name + ', $' + bandInfo(b.band).fee + ' an hour, HST included')],
      ['Kind', esc(typeLabel(b)) + (b.type === 'hold' || b.type === 'league' || b.type === 'public' || b.type === 'lesson' ? '<span class="pn-sub">' + esc(b.title) + '</span>' : '')]
    ];
    if (b.type !== 'league' && b.type !== 'public' && b.type !== 'hold') rows.push([b.type === 'lesson' ? 'Student' : 'Booked by', whoRow]);
    if (b.players) rows.push(['Players', playersText(b) + (b.guests ? ', ' + b.guests + ' guest' + (b.guests > 1 ? 's' : '') : '')]);
    rows.push(['Booked', esc(SOURCE[b.source] || b.source || '') + (b.createdAt && !b.scheduled ? '<span class="pn-sub">' + esc(F.stamp(b.createdAt)) + (b.by ? ', ' + esc(b.by) : '') + '</span>' : '')]);
    var twice = sameDay(b);
    if (twice.length) rows.push(['Same day', esc('Also ' + twice.map(function (x) { return 'Court ' + x.court + ' at ' + F.time(x.start); }).join(' and ')) + '<span class="pn-sub">The club allows one booking and court use per day per member</span>']);
    if (b.personId && (stk.noShow || stk.late)) rows.push(['Strikes', esc(stk.noShow + ' no-show' + (stk.noShow === 1 ? '' : 's') + ', ' + stk.late + ' late cancel' + (stk.late === 1 ? '' : 's')) + '<span class="pn-sub">3 of either may suspend booking for 7 days</span>']);
    if (b.cancelReason) rows.push(['Cancelled', esc(b.cancelReason) + (b.lateFee ? '<span class="pn-sub">Cancellation fee ' + esc(F.money(b.lateFee)) + ', not charged in the demo</span>' : '')]);
    var note = b.scheduled ? '<p class="pn-note">' + icon('calendar') + '<span>Booked ahead by the club’s program schedule. It turns into the day’s booking when members can book this day.</span></p>'
      : b.fromPublicFlow ? '<p class="pn-note">' + icon('arrow-external') + '<span>Made on the new public site in this browser tab (reference ' + esc(b.id) + '). The site keeps it in this tab only, so it shows here in the same tab. Nothing was sent anywhere.</span></p>'
      : b.type === 'member' ? quote(RULE.staff)
      : b.type === 'non-member' ? quote(RULE.noRefund)
      : b.type === 'public' ? '<p class="pn-note">' + icon('phone') + '<span>' + esc(C.booking.public_hours_how.split('. ')[1] || '') + '. Which two courts: ' + '</span>' + UI.confirmSlot('public hours courts') + '</p>' : '';
    var acts = D.activity({ ref: b.id }).slice(0, 5);
    var body = '<div class="bk-sheet__top">' + plan(started && !OFF[b.status] && live ? b : b.type === 'hold' ? b : null, 'bk-plan--sheet') + '<div class="pn-row">' + chips.join('') + '</div></div>' +
      dl(rows) + (moneyRows(b).length ? '<div><h3 class="pn-h3 bk-sheet__h">Money</h3>' + dl(moneyRows(b)) + '</div>' : '') + note +
      (acts.length ? '<div><h3 class="pn-h3 bk-sheet__h">In this demo</h3><ul class="bk-acts" role="list">' + acts.map(function (a) { return '<li><span class="pn-muted pn-num">' + esc(F.stamp(a.at)) + '</span> ' + esc(a.by + ': ' + a.text) + '</li>'; }).join('') + '</ul></div>' : '');
    var foot = '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button>';
    if (!b.scheduled && !OFF[b.status]) {
      if (ps === 'due' && b.status !== 'cancelled') foot += btn('payments.record', 'pn-btn--quiet', 'Record payment', 'data-bk-act="pay"');
      if (started && b.status === 'booked' && (b.type === 'member' || b.type === 'non-member')) foot += btn('bookings.cancel', 'pn-btn--quiet', 'Mark no-show', 'data-bk-act="noshow"') + btn(null, 'pn-btn--quiet', 'Mark played', 'data-bk-act="played"');
      if (b.status === 'no-show') foot += btn('bookings.cancel', 'pn-btn--quiet', 'Undo no-show', 'data-bk-act="unnoshow"');
      if (future && b.type === 'hold') foot += btn('bookings.hold', 'pn-btn--danger', 'Release hold', 'data-bk-act="release"');
      else if (future && b.type === 'lesson') foot += btn('bookings.lesson', 'pn-btn--danger', 'Cancel lesson', 'data-bk-act="cancel"');
      else if (future && b.type !== 'league' && b.type !== 'public') foot += btn('bookings.cancel', 'pn-btn--danger', 'Cancel booking', 'data-bk-act="cancel"');
    } else if (OFF[b.status] && !b.scheduled) foot += btn('bookings.cancel', 'pn-btn--quiet', 'Restore booking', 'data-bk-act="restore"');
    UI.sheet.open({ kicker: typeLabel(b) + (b.sample ? ', sample data' : ''), title: whenText(b), body: body, foot: foot, onClose: refocus });
    var el = UI.sheet.el();
    $$('[data-bk-act]', el).forEach(function (x) { x.addEventListener('click', function () { if (x.getAttribute('aria-disabled') === 'true') return; doAct(x.getAttribute('data-bk-act'), b); }); });
  }

  /* ---------- Actions on a booking: every one an overlay write with an Undo ---------- */
  function undoable(id, before, msg) {
    UI.toast(msg, { action: { label: 'Undo', run: function () {
      D.bookings.update(id, before, 'Undid: ' + msg.split('.')[0]);
      UI.toast('Undone. The booking is as it was.');
    } } });
  }
  function snapshot(b) { return { status: b.status, cancelReason: b.cancelReason || null, lateFee: b.lateFee || 0, paid: !!b.paid, paymentId: b.paymentId || null, held: !!b.held }; }
  function doAct(act, b) {
    var before = snapshot(b), w = whenText(b);
    if (act === 'cancel') return cancelSheet(b);
    if (act === 'noshow') {
      var s = strikesOf(b.personId), n = s.noShow + 1;
      UI.confirm({ title: 'Mark a no-show?', body: '<p>' + esc(w) + '. ' + esc(who(b)) + ' did not come.</p><p>' + esc(RULE.card) + '</p>' +
        (b.personId ? '<p>This would be no-show ' + n + ' of 3. ' + (n >= 3 ? 'At 3 the club may suspend booking for 7 days.' : '') + '</p>' : '') + '<p>Nothing is charged in the demo.</p>', confirm: 'Mark no-show', cancel: 'Go back' })
        .then(function (yes) { if (!yes) return; UI.sheet.close(); D.bookings.update(b.id, { status: 'no-show' }, 'Marked a no-show, ' + w); undoable(b.id, before, 'No-show recorded, ' + w + '. Nothing is charged in the demo.'); });
      return;
    }
    if (act === 'unnoshow') { UI.sheet.close(); D.bookings.update(b.id, { status: 'booked' }, 'Cleared a no-show, ' + w); undoable(b.id, before, 'No-show cleared, ' + w + '.'); return; }
    if (act === 'played') { UI.sheet.close(); D.bookings.update(b.id, { status: 'completed' }, 'Marked played, ' + w); undoable(b.id, before, 'Marked played, ' + w + '.'); return; }
    if (act === 'restore') { UI.sheet.close(); D.bookings.update(b.id, { status: 'booked', cancelReason: null, lateFee: 0 }, 'Restored a cancelled booking, ' + w); undoable(b.id, before, 'Booking restored, ' + w + '.'); return; }
    if (act === 'release') {
      UI.confirm({ title: 'Release this hold?', body: '<p>' + esc(w) + ', ' + esc(b.title.toLowerCase()) + '. The hour goes back to free and members can book it online.</p>', confirm: 'Release hold', cancel: 'Keep the hold', danger: true })
        .then(function (yes) {
          if (!yes) return; UI.sheet.close();
          if (/^b-demo-/.test(b.id)) { var copy = Object.assign({}, b); D.bookings.remove(b.id, 'Released a hold, ' + w); UI.toast('Hold released, ' + w + '.', { action: { label: 'Undo', run: function () { D.bookings.add(copy, 'Put a released hold back, ' + w); } } }); }
          else { D.bookings.update(b.id, { status: 'cancelled', cancelReason: 'Hold released by the desk' }, 'Released a hold, ' + w); undoable(b.id, before, 'Hold released, ' + w + '.'); }
        });
      return;
    }
    if (act === 'pay') return paySheet(b);
  }

  /* Cancelling: the 48-hour rule decides what the cancellation is */
  function cancelSheet(b) {
    var hrs = hoursUntil(b), late = hrs < R.cancelHours, w = whenText(b), member = b.type === 'member';
    var reasons = (sameDay(b).length ? ['More than one booking on the same day'] : []).concat(['Over the 2 hour doubles or 1 hour singles limit', 'Over the weekly prime-time or weekend limit', 'Outstanding balance from a previous booking', 'Booked with automated tools (bots)', 'Court closed for maintenance or an event']);
    var opts = [['club', 'The club cancels it', 'For non-compliance with the booking policies, or the court is closed. ' + (member ? 'The member is told by email (not sent in the demo).' : '')]];
    if (member && late && hrs > 0) opts.push(['late', 'Record the member’s late cancellation', 'They cancelled under 48 hours before play. Cancellation fee equal to the court fee, ' + F.money(b.courtFee || 0) + ', on the card on file.']);
    if (member && !late) opts.push(['notice', 'Record the member’s cancellation with notice', '48 hours or more before play: no fee. Members normally do this themselves online.']);
    if (b.type === 'lesson') opts = [['club', 'Cancel the lesson', 'The lesson fee is not charged in the demo.']];
    var body = '<div class="bk-rule48' + (late ? ' is-late' : '') + '"><p class="bk-rule48__h">' + (hrs <= 0 ? 'Already started' : late ? 'Under 48 hours before play' : '48 hours or more before play') + '</p>' +
      '<p class="bk-rule48__n pn-num">' + (hrs <= 0 ? 'No time' : hrs < 1 ? 'Under an hour' : Math.floor(hrs) === 1 ? '1 hour' : Math.floor(hrs) + ' hours') + ' to go</p>' +
      '<div class="bk-rule48__bar" aria-hidden="true"><span style="width:' + Math.max(0, Math.min(100, hrs / (R.cancelHours * 2) * 100)) + '%"></span><i style="left:50%"></i></div><p class="pn-sub">The mark is 48 hours, the club’s notice for court bookings and round robins.</p></div>' +
      '<fieldset class="bk-choice"><legend class="pn-label">What is this cancellation?</legend>' + opts.map(function (o, i) {
        return '<label class="bk-choice__opt"><input type="radio" name="bk-cx" value="' + o[0] + '"' + (i === 0 ? ' checked' : '') + '><span><strong>' + esc(o[1]) + '</strong><span class="pn-sub">' + esc(o[2]) + '</span></span></label>';
      }).join('') + '</fieldset>' +
      '<div class="pn-field" data-bk-cx-reason><label class="pn-label" for="bk-cx-why">Reason</label><select class="pn-select" id="bk-cx-why">' + reasons.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select>' +
      '<p class="pn-help">Fee on a club cancellation: </p>' + UI.confirmSlot('fee when the club cancels') + '</div>' +
      (b.type === 'non-member' && b.paid ? quote(RULE.noRefund) + '<p class="pn-note">' + icon('receipt') + '<span>A refund, if the club makes an exception, is an Administrator’s action in <a class="inline-link" href="' + esc(UI.link('payments', b.paymentId ? 'pay=' + b.paymentId : '')) + '">Payments</a>.</span></p>' : quote(RULE.notice)) +
      (member ? quote(RULE.strikes) : '');
    UI.sheet.open({ kicker: 'Cancel, ' + typeLabel(b), title: w, body: body, onClose: refocus,
      foot: '<button class="pn-btn pn-btn--quiet" type="button" data-bk-back>Keep the booking</button><button class="pn-btn pn-btn--danger" type="button" data-bk-do-cancel>Cancel booking</button>' });
    var el = UI.sheet.el();
    var sync = function () { var v = ($('input[name="bk-cx"]:checked', el) || {}).value; $('[data-bk-cx-reason]', el).hidden = v !== 'club' || b.type === 'lesson'; };
    $$('input[name="bk-cx"]', el).forEach(function (i) { i.addEventListener('change', sync); }); sync();
    $('[data-bk-back]', el).addEventListener('click', function () { openBooking(b.id); });
    $('[data-bk-do-cancel]', el).addEventListener('click', function () {
      var v = ($('input[name="bk-cx"]:checked', el) || {}).value, before = snapshot(b);
      var patch = v === 'late' ? { status: 'late-cancel', cancelReason: 'Member cancelled under 48 hours', lateFee: b.courtFee || 0 }
        : v === 'notice' ? { status: 'cancelled', cancelReason: 'Member cancelled with 48 hours notice', lateFee: 0 }
        : { status: 'cancelled', cancelReason: b.type === 'lesson' ? 'Lesson cancelled' : 'Club cancelled: ' + $('#bk-cx-why', el).value, lateFee: 0 };
      UI.sheet.close();
      D.bookings.update(b.id, patch, (v === 'late' ? 'Recorded a late cancellation, ' : 'Cancelled, ') + w);
      undoable(b.id, before, (v === 'late' ? 'Late cancellation recorded, ' + w + '. Fee ' + F.money(b.courtFee || 0) + ', not charged in the demo.' : 'Booking cancelled, ' + w + '. The hour is free again. Nothing is charged in the demo.'));
    });
  }

  /* Taking a payment at the desk: a record, never card details */
  function paySheet(b) {
    var body = dl([['For', esc(whenText(b) + ', ' + typeLabel(b))], ['Amount', '<strong class="pn-money">' + esc(F.money(b.total)) + '</strong> ' + (b.hstIncluded ? '<span class="pn-muted">HST included, ' + esc(F.money(D.hstIn(b.total))) + '</span>' : '<span class="pn-muted">including HST ' + esc(F.money(D.hstOn(b.lessonFee || 0))) + '</span>')]]) +
      '<div class="pn-field"><label class="pn-label" for="bk-pay-m">Taken on the desk terminal by</label><select class="pn-select" id="bk-pay-m" autofocus>' + METHODS.map(function (m) { return '<option>' + m + '</option>'; }).join('') + '</select>' +
      '<p class="pn-help">' + esc(C.booking.accepted_payment.replace(/^WE DO NOT ACCEPT CASH OR CHEQUE PAYMENTS! /, 'No cash or cheques. ')) + ' The card stays on the terminal: nothing about it is typed here.</p></div>' +
      '<p class="pn-note">' + icon('alert') + '<span>Demo: this writes a payment record in this browser. Nothing is charged.</span></p>';
    UI.sheet.open({ kicker: 'Record payment', title: F.money(b.total) + ', ' + whenText(b), body: body, onClose: refocus,
      foot: '<button class="pn-btn pn-btn--quiet" type="button" data-bk-back>Back</button><button class="pn-btn pn-btn--ink" type="button" data-bk-do-pay>Record payment</button>' });
    var el = UI.sheet.el();
    $('[data-bk-back]', el).addEventListener('click', function () { openBooking(b.id); });
    $('[data-bk-do-pay]', el).addEventListener('click', function () {
      var m = $('#bk-pay-m', el).value, lesson = b.type === 'lesson';
      var pay = D.payments.add({ at: D.clock.now.toISOString(), personId: b.personId || null, householdId: b.personId ? (D.people.get(b.personId) || {}).householdId : null, kind: lesson ? 'lesson' : 'court', season: b.season,
        ref: { type: 'booking', id: b.id }, description: b.title + ', ' + whenText(b), subtotal: lesson ? b.lessonFee : D.round2(b.total - D.hstIn(b.total)), hst: lesson ? D.hstOn(b.lessonFee) : D.hstIn(b.total),
        total: b.total, hstIncluded: !lesson, method: m, last4: null, status: 'succeeded', refunded: 0, currency: 'CAD' }, 'Recorded a ' + m + ' payment at the desk, ' + F.money(b.total));
      var before = snapshot(b);
      UI.sheet.close();
      D.bookings.update(b.id, { paid: true, paymentId: pay.id, held: false }, 'Payment recorded, ' + whenText(b));
      UI.toast('Payment of ' + F.money(b.total) + ' recorded by ' + m + ' as ' + pay.id + '. Nothing is charged in the demo.', { action: { label: 'Undo', run: function () {
        D.payments.remove(pay.id, 'Removed a payment recorded in error'); D.bookings.update(b.id, before, 'Undid a payment record'); UI.toast('Undone. The booking is to settle again.');
      } } });
    });
  }

  /* ---------- New on court: walk-in, hold, lesson. One form, the club's rules checked live ---------- */
  var KIND = {
    walkin: { perm: 'bookings.walkin', kicker: 'Walk-in, non-member', title: 'Book a walk-in', go: 'Book and record payment' },
    hold: { perm: 'bookings.hold', kicker: 'Hold', title: 'Hold a court', go: 'Hold the court' },
    lesson: { perm: 'bookings.lesson', kicker: 'Private lesson, Head Pro', title: 'Put a lesson on court', go: 'Book the lesson' }
  };
  function bookableDays(kind) {
    var out = [], last = kind === 'walkin' ? R.nonMembersDaysAhead : 21;
    for (var i = 0; i <= last; i++) {
      var s = addIso(TODAY_ISO, i), w = windowOf(s);
      if (seasonKind(s) !== 'indoor') continue;
      if (kind === 'walkin' && !w.nonMembers) continue;
      if (rowsOf(s).some(function (r) { return r.open && !isPastSlot(s, r.start); })) out.push(s);
    }
    return out;
  }
  function firstFree(days, hours) {
    for (var i = 0; i < days.length; i++) {
      var rows = rowsOf(days[i]);
      for (var j = 0; j < rows.length; j++) for (var c = 1; c <= 4; c++)
        if (!isPastSlot(days[i], rows[j].start) && slotFree(days[i], c, rows[j].start, hours)) return { date: days[i], start: rows[j].start, court: c };
    }
    return null;
  }
  function opt(v, label, sel, dis) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + (dis ? ' disabled' : '') + '>' + esc(label) + '</option>'; }
  function formSheet(kind, init) {
    var K = KIND[kind];
    if (!UI.can(K.perm)) { UI.toast(K.title + ': ' + UI.whoCan(K.perm) + ' only.', { kind: 'warn' }); return; }
    var days = bookableDays(kind);
    if (init && days.indexOf(init.date) < 0) {
      UI.toast(kind === 'walkin' ? 'Non-members book up to ' + R.nonMembersDaysAhead + ' day ahead. ' + F.day(init.date) + ' is not open to them yet.' : F.day(init.date) + ' is outside what the desk can book here.', { kind: 'warn' });
      init = null;
    }
    var st = init || firstFree(days, 1) || { date: days[0], start: null, court: 1 };
    if (!days.length) { UI.toast('No bookable indoor days in reach.', { kind: 'warn' }); return; }
    var people = D.people.all().filter(function (p) { return p.role !== 'junior' || kind === 'lesson'; }).slice(0, 400);
    var f = '<form class="pn-form bk-form" novalidate data-bk-form>';
    if (kind === 'walkin') f += '<div class="pn-field"><label class="pn-label" for="bk-f-name">Name on the booking</label><input class="pn-input" id="bk-f-name" autocomplete="off" autofocus aria-describedby="bk-f-name-help"><p class="pn-help" id="bk-f-name-help">As the player gives it. Stays in this browser only.</p></div>' +
      '<fieldset class="bk-choice bk-choice--row"><legend class="pn-label">Players</legend>' + [[2, '2, singles'], [3, '3, singles'], [4, '4, doubles']].map(function (x, i) { return '<label class="bk-choice__opt"><input type="radio" name="bk-f-players" value="' + x[0] + '"' + (i === 0 ? ' checked' : '') + '><span>' + x[1] + '</span></label>'; }).join('') + '</fieldset>';
    if (kind === 'lesson') f += '<fieldset class="bk-choice bk-choice--row"><legend class="pn-label">Lesson</legend>' + PRIVATE.map(function (x, i) { return '<label class="bk-choice__opt"><input type="radio" name="bk-f-lesson" value="' + i + '"' + (i === 0 ? ' checked' : '') + (i === 0 ? ' autofocus' : '') + '><span>' + esc(x.kind.replace('Semi Private', 'Semi-private')) + ', ' + F.money(x.price) + ' + HST</span></label>'; }).join('') + '</fieldset>' +
      '<div class="pn-field"><label class="pn-label" for="bk-f-name">Student</label><input class="pn-input" id="bk-f-name" list="bk-f-people" autocomplete="off" aria-describedby="bk-f-name-help"><datalist id="bk-f-people">' + people.map(function (p) { return '<option value="' + esc(p.name) + '"></option>'; }).join('') + '</datalist><p class="pn-help" id="bk-f-name-help">Pick a sample person or type a name. The coach is the Head Pro.</p></div>';
    if (kind === 'hold') f += '<div class="pn-field"><label class="pn-label" for="bk-f-why">Held for</label><select class="pn-select" id="bk-f-why" autofocus>' + HOLD_REASONS.map(function (r) { return opt(r, r.replace(/^Held for /, '').replace(/^./, function (x) { return x.toUpperCase(); })); }).join('') + '</select></div>';
    f += '<div class="pn-form__row pn-form__row--2"><div class="pn-field"><label class="pn-label" for="bk-f-day">Day</label><select class="pn-select" id="bk-f-day">' + days.map(function (s) { return opt(s, F.day(s) + (s === TODAY_ISO ? ', today' : ''), s === st.date); }).join('') + '</select></div>' +
      '<div class="pn-field"><label class="pn-label" for="bk-f-hours">Hours</label><select class="pn-select" id="bk-f-hours" aria-describedby="bk-f-hours-help"></select><p class="pn-help" id="bk-f-hours-help"></p></div></div>' +
      '<div class="pn-form__row pn-form__row--2"><div class="pn-field"><label class="pn-label" for="bk-f-start">Start</label><select class="pn-select" id="bk-f-start"></select></div>' +
      '<div class="pn-field"><label class="pn-label" for="bk-f-court">Court</label><select class="pn-select" id="bk-f-court"></select></div></div>' +
      '<p class="pn-error" id="bk-f-err" hidden></p>';
    if (kind === 'walkin') f += '<div class="pn-field"><label class="pn-label" for="bk-f-method">Paid at booking, on the desk terminal, by</label><select class="pn-select" id="bk-f-method">' + METHODS.map(function (m) { return opt(m, m); }).join('') + '</select><p class="pn-help">' + esc(C.booking.non_member_payment.replace(/\s+/g, ' ')) + ' No card details are typed here.</p></div>';
    if (kind === 'lesson') f += '<fieldset class="bk-choice bk-choice--row"><legend class="pn-label">Payment</legend><label class="bk-choice__opt"><input type="radio" name="bk-f-pay" value="later" checked><span>To settle after the lesson</span></label><label class="bk-choice__opt"><input type="radio" name="bk-f-pay" value="now"' + (UI.can('payments.record') ? '' : ' disabled') + '><span>Paid now at the desk' + (UI.can('payments.record') ? '' : ' (' + esc(UI.whoCan('payments.record')) + ' only)') + '</span></label></fieldset>';
    if (kind === 'hold') f += '<div class="pn-field"><label class="pn-label" for="bk-f-note">Note for the desk</label><textarea class="pn-textarea" id="bk-f-note" rows="3"></textarea></div>';
    f += '<div class="bk-sum" aria-live="polite" data-bk-sum></div></form>';
    UI.sheet.open({ kicker: K.kicker, title: K.title, body: f, onClose: refocus,
      foot: '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button><button class="pn-btn pn-btn--ink" type="button" data-bk-go-new>' + esc(K.go) + '</button>' });
    var el = UI.sheet.el(), $f = function (s) { return $(s, el); };
    function players() { var x = $f('input[name="bk-f-players"]:checked'); return x ? +x.value : null; }
    function maxHours() { return kind === 'walkin' ? (players() >= 4 ? R.maxHours : 1) : kind === 'hold' ? 4 : 1; }
    function fill(keep) {
      var day = $f('#bk-f-day').value, hSel = $f('#bk-f-hours'), mh = maxHours(), h = Math.min(+hSel.value || 1, mh);
      hSel.innerHTML = ''; for (var i = 1; i <= mh; i++) hSel.insertAdjacentHTML('beforeend', opt(i, i + (i === 1 ? ' hour' : ' hours'), i === h));
      $f('#bk-f-hours-help').textContent = kind === 'walkin' ? (mh > 1 ? 'Doubles may book up to 2 hours.' : 'Singles (2 or 3 players): 1 hour at most.') : kind === 'lesson' ? 'Private lessons are 1 hour.' : 'A hold blocks the court for everyone.';
      var rows = rowsOf(day).filter(function (r) { return r.open && !isPastSlot(day, r.start) && rowsOf(day).some(function (y) { return y.start === r.start + (h - 1) * 60; }); });
      var sSel = $f('#bk-f-start'), want = keep && keep.start != null ? keep.start : +sSel.value;
      sSel.innerHTML = rows.map(function (r) {
        var n = 0; for (var c = 1; c <= 4; c++) if (slotFree(day, c, r.start, h)) n++;
        return opt(r.start, F.time(r.start) + ', ' + (n ? n + ' free' : 'full') + (kind === 'walkin' && r.band !== 'outdoor' ? ', $' + bandInfo(r.band).fee : ''), r.start === want, !n);
      }).join('');
      if (sSel.selectedOptions[0] && sSel.selectedOptions[0].disabled) { var ok = $$('option:not([disabled])', sSel)[0]; if (ok) sSel.value = ok.value; }
      var cSel = $f('#bk-f-court'), wc = keep && keep.court ? keep.court : +cSel.value || 1;
      cSel.innerHTML = D.courts.map(function (c) { var free = slotFree(day, c.id, +sSel.value, h); return opt(c.id, c.name + (free ? '' : ', taken'), c.id === wc, !free); }).join('');
      if (cSel.selectedOptions[0] && cSel.selectedOptions[0].disabled) { var oc = $$('option:not([disabled])', cSel)[0]; if (oc) cSel.value = oc.value; }
      summary();
    }
    function calc() {
      var day = $f('#bk-f-day').value, start = +$f('#bk-f-start').value, h = +$f('#bk-f-hours').value || 1, court = +$f('#bk-f-court').value;
      var o = { date: day, start: start, hours: h, court: court, band: D.band(P(day), start) };
      if (kind === 'walkin') { o.players = players(); o.courtFee = D.courtFee(P(day), start, h); o.extra = o.players * D.playerFee; o.total = D.round2(o.courtFee + o.extra); }
      if (kind === 'lesson') { var L = PRIVATE[+($f('input[name="bk-f-lesson"]:checked') || { value: 0 }).value]; o.lesson = L; o.lessonFee = L.price; o.total = D.round2(L.price + D.hstOn(L.price)); o.players = /semi/i.test(L.kind) ? 3 : 2; }
      return o;
    }
    function summary() {
      var o = calc(), box = $f('[data-bk-sum]');
      if (isNaN(o.start)) { box.innerHTML = '<p class="pn-muted">No free start on this day.</p>'; return; }
      var line = 'Court ' + o.court + ', ' + F.day(o.date) + ', ' + F.range(o.start, o.hours);
      if (kind === 'walkin') box.innerHTML = '<p class="bk-sum__what">' + esc(line) + '</p>' + dl([['Court fee', esc(F.money(o.courtFee) + ', ' + bandInfo(o.band).name.toLowerCase())], ['Players', esc(o.players + ' x ' + F.money(D.playerFee) + ' = ' + F.money(o.extra))], ['Total', '<strong class="pn-money">' + esc(F.money(o.total)) + '</strong> <span class="pn-muted">HST included, ' + esc(F.money(D.hstIn(o.total))) + ' of it</span>']]);
      else if (kind === 'lesson') box.innerHTML = '<p class="bk-sum__what">' + esc(line) + '</p>' + dl([['Lesson', esc(F.money(o.lessonFee) + ' + HST ' + F.money(D.hstOn(o.lessonFee)))], ['Total', '<strong class="pn-money">' + esc(F.money(o.total)) + '</strong>'], ['Court fee', 'None: the lesson has the court']]);
      else box.innerHTML = '<p class="bk-sum__what">' + esc(line) + '</p><p class="pn-muted">No fee. Members see the court as taken online.</p>';
    }
    fill(st);
    ['#bk-f-day', '#bk-f-hours'].forEach(function (s) { $f(s).addEventListener('change', function () { fill(); }); });
    $f('#bk-f-start').addEventListener('change', function () { fill({ start: +$f('#bk-f-start').value }); });
    $f('#bk-f-court').addEventListener('change', summary);
    $$('input[type="radio"]', el).forEach(function (i) { i.addEventListener('change', function () { fill({ start: +$f('#bk-f-start').value }); }); });
    $f('[data-bk-form]').addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    $f('[data-bk-form]').addEventListener('input', function () { var err = $f('#bk-f-err'); if (!err.hidden) { err.hidden = true; $$('[aria-invalid]', el).forEach(function (x) { x.removeAttribute('aria-invalid'); }); } });
    $f('[data-bk-go-new]').addEventListener('click', submit);
    function fail(msg, field) {
      var err = $f('#bk-f-err'); err.hidden = false; err.innerHTML = icon('alert') + '<span>' + esc(msg) + '</span>';
      if (field) { field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', 'bk-f-err'); field.focus(); }
    }
    function submit() {
      var o = calc(), nameEl = $f('#bk-f-name'), name = nameEl ? nameEl.value.trim() : '';
      $$('[aria-invalid]', el).forEach(function (x) { x.removeAttribute('aria-invalid'); });
      if (nameEl && !name) return fail(kind === 'lesson' ? 'Enter the student’s name' : 'Enter the name on the booking', nameEl);
      if (isNaN(o.start)) return fail('No free start on this day. Choose another day.', $f('#bk-f-day'));
      if (!slotFree(o.date, o.court, o.start, o.hours)) return fail('Court ' + o.court + ' is taken then. Choose another court or time.', $f('#bk-f-court'));
      var w = 'Court ' + o.court + ', ' + F.day(o.date) + ', ' + F.time(o.start);
      var base = { season: (D.season(o.date) || {}).id, date: o.date, start: o.start, hours: o.hours, court: o.court, band: o.band, status: 'booked', by: D.roleName(), sample: true };
      var rec, pay = null, person = kind === 'lesson' ? D.people.list(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })[0] : null;
      if (kind === 'walkin') rec = Object.assign(base, { type: 'non-member', title: 'Non-member booking, walk-in', name: name, personId: null, players: o.players, guests: 0, courtFee: o.courtFee, extra: o.extra, total: o.total, hstIncluded: true, paid: true, source: 'front-desk' });
      else if (kind === 'lesson') rec = Object.assign(base, { type: 'lesson', title: o.lesson.kind.replace('Semi Private', 'Semi-private') + ' lesson, Head Pro', name: person ? null : name, personId: person ? person.id : null, players: o.players, courtFee: 0, extra: 0, lessonFee: o.lessonFee, total: o.total, hstIncluded: false, paid: false, source: 'head-pro' });
      else rec = Object.assign(base, { type: 'hold', title: $f('#bk-f-why').value, note: $f('#bk-f-note').value.trim(), players: null, courtFee: 0, extra: 0, total: 0, source: D.role() === 'headpro' ? 'head-pro' : 'front-desk' });
      var added = D.bookings.add(rec, (kind === 'walkin' ? 'Booked a walk-in, ' : kind === 'lesson' ? 'Put a lesson on court, ' : 'Held ') + w);
      var payNow = kind === 'walkin' || (kind === 'lesson' && ($f('input[name="bk-f-pay"]:checked') || {}).value === 'now');
      if (payNow) {
        var m = kind === 'walkin' ? $f('#bk-f-method').value : 'Visa';
        pay = D.payments.add({ at: D.clock.now.toISOString(), personId: added.personId, householdId: added.personId ? (D.people.get(added.personId) || {}).householdId : null, kind: kind === 'lesson' ? 'lesson' : 'court', season: added.season,
          ref: { type: 'booking', id: added.id }, description: added.title + ', ' + w, subtotal: kind === 'lesson' ? o.lessonFee : D.round2(o.total - D.hstIn(o.total)), hst: kind === 'lesson' ? D.hstOn(o.lessonFee) : D.hstIn(o.total),
          total: o.total, hstIncluded: kind !== 'lesson', method: m, last4: null, status: 'succeeded', refunded: 0, currency: 'CAD', name: name }, 'Recorded a ' + m + ' payment at the desk, ' + F.money(o.total));
        D.bookings.update(added.id, { paid: true, paymentId: pay.id });
      }
      UI.sheet.close();
      S.date = o.date; S.focusKey = o.court + '|' + o.start; if (S.view !== 'day') S.view = 'day';
      render();
      UI.toast((kind === 'walkin' ? 'Walk-in booked, ' + w + ', ' + F.money(o.total) + ' paid' : kind === 'lesson' ? 'Lesson on court, ' + w : 'Court held, ' + w) + '. Nothing is charged in the demo.', { action: { label: 'Undo', run: function () {
        if (pay) D.payments.remove(pay.id, 'Removed a payment made in error');
        D.bookings.remove(added.id, 'Undid: ' + w); UI.toast('Undone. The hour is free again.');
      } } });
      focusKey();
    }
  }

  /* ---------- A free hour: what the desk may do with it ---------- */
  function openFree(court, start) {
    var d = S.date, r = rowsOf(d).filter(function (x) { return x.start === start; })[0];
    if (!r) return;
    if (!r.open) { UI.toast('Outside the published outdoor booking windows: organized tennis has the courts then.'); return; }
    if (isPastSlot(d, start)) { UI.toast(d === TODAY_ISO && start + 60 > NOW_MIN ? 'This hour is under way. Court time starts on the ' + (isWeekend(P(d)) ? 'hour' : 'half hour') + ', so book the next one.' : 'That hour has been played. Past hours cannot be booked.'); return; }
    var w = windowOf(d), band = bandInfo(r.band), init = { date: d, start: start, court: court };
    var choice = function (kind, ic, title, note, perm, reason) {
      var ok = UI.can(perm) && !reason, why = !UI.can(perm) ? UI.whoCan(perm) + ' only' : reason;
      return '<li><button type="button" class="bk-pick" data-bk-new="' + kind + '"' + (ok ? '' : ' aria-disabled="true" data-bk-why="' + esc(why) + '"') + '>' + icon(ic) +
        '<span><strong>' + esc(title) + '</strong><span class="pn-sub">' + esc(ok ? note : why) + '</span></span></button></li>';
    };
    var body = '<div class="bk-sheet__top">' + plan(null, 'bk-plan--sheet') + '<div class="pn-row">' + UI.chip('open', 'Free') + '<span class="chip chip--muted pn-chip">' + esc(band.id === 'outdoor' ? 'Outdoor' : band.name + ', $' + band.fee) + '</span></div></div>' +
      dl([['When', esc(F.long(d)) + '<span class="pn-sub">' + esc(F.range(start, 1)) + '</span>'], ['Members', w.members ? 'Can book this hour online now' : esc('Can book from ' + F.day(w.membersFrom) + ' at ' + F.time(R.opensAtMin))], ['Non-members', w.nonMembers ? esc('Can book now: ' + F.money(band.fee) + ' court fee plus ' + F.money(D.playerFee) + ' a player') : esc('Can book from ' + F.day(w.nonMembersFrom) + ' at ' + F.time(R.opensAtMin))]]) +
      '<ul class="bk-picks" role="list">' +
      choice('walkin', 'adult', 'Walk-in, non-member', 'Paid at booking: court fee plus $10 a player', 'bookings.walkin', w.nonMembers ? null : 'Non-members book up to 1 day ahead') +
      choice('hold', 'clock', 'Hold the court', 'An assessment, maintenance, a make-up', 'bookings.hold') +
      choice('lesson', 'coach', 'Private lesson', 'Private ' + F.money(PRIVATE[0].price) + ' or semi-private ' + F.money(PRIVATE[1].price) + ', plus HST', 'bookings.lesson') +
      '<li><button type="button" class="bk-pick" aria-disabled="true" data-bk-why="Members book their own courts online. Staff are not allowed to book courts for members.">' + icon('racquet') + '<span><strong>Member booking</strong><span class="pn-sub">Members book their own, online</span></span></button></li></ul>' +
      quote(RULE.staff);
    UI.sheet.open({ kicker: 'Free hour', title: 'Court ' + court + ', ' + F.day(d) + ', ' + F.time(start), body: body, onClose: refocus, foot: '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button>' });
    $$('[data-bk-new]', UI.sheet.el()).forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); if (b.getAttribute('aria-disabled') === 'true') return why(b); formSheet(b.getAttribute('data-bk-new'), init); }); });
  }

  /* ---------- The public site's booking, read from this tab ---------- */
  function renderPublic() {
    var box = $('[data-bk-public]'), pb = D.publicBooking();
    var siteHref = '../../court-bookings/book/' + (location.protocol.indexOf('http') === 0 ? '' : 'index.html');
    var how = '<p class="pn-note">' + icon('alert') + '<span>The public site keeps its booking in this browser tab only, so book there in this tab, then come back here. Nothing is sent to a server.</span></p>';
    if (!pb) { box.innerHTML = '<div class="pn-empty bk-public__empty"><p class="pn-empty__title">Nothing booked on the site in this tab yet</p><p>Book a court on the public demo, the way a member or a non-member would, and it lands on this calendar.</p><a class="pn-btn pn-btn--quiet" href="' + siteHref + '">' + icon('arrow-external') + 'Book on the public site</a></div>' + how; return; }
    var w = 'Court ' + pb.court + ', ' + F.day(pb.date) + ', ' + F.range(pb.start, pb.hours || 1);
    var payChip = pb.held ? UI.chip('due', 'Pre-pay by phone') : pb.paid ? UI.chip('succeeded') : UI.chip('due');
    box.innerHTML = '<div class="bk-public__card">' + plan(pb.done ? pb : null, 'bk-plan--sheet') + '<div class="pn-stack">' +
      '<div class="pn-row">' + UI.chip(pb.done ? pb.status : 'in-progress') + (pb.done ? payChip : '') + '</div>' +
      '<p class="bk-public__what">' + esc(w) + '</p>' +
      dl([['Who', esc(pb.type === 'member' ? 'A member (demo sign-in)' : 'A non-member')], ['Players', esc((pb.players || '?') + (pb.guests ? ', ' + pb.guests + ' guest' + (pb.guests > 1 ? 's' : '') : ''))], ['Fees', esc(F.money(pb.total)) + ' <span class="pn-muted">HST included</span>'], ['Reference', pb.done ? '<span class="pn-num">' + esc(pb.id) + '</span>' : 'Not confirmed yet']]) +
      '<div class="pn-row"><button class="pn-btn pn-btn--ink pn-btn--sm" type="button" data-bk-show-public>' + (pb.done ? 'Show on the calendar' : 'Show the hour being booked') + '</button><a class="pn-btn pn-btn--text pn-btn--sm" href="' + siteHref + '">Back to the public site</a></div>' +
      (pb.done ? '' : '<p class="pn-muted">It shows as a dashed hour until it is confirmed on the site.</p>') + '</div></div>' + how;
  }

  /* ---------- Three strikes: no-shows and late cancellations in 2026 ---------- */
  function renderStrikes() {
    var by = {};
    D.bookings.list(function (b) { return b.personId && (b.status === 'no-show' || b.status === 'late-cancel'); }).forEach(function (b) {
      var x = by[b.personId] = by[b.personId] || { id: b.personId, noShow: 0, late: 0, last: '' };
      if (b.status === 'no-show') x.noShow++; else x.late++;
      if (b.date > x.last) x.last = b.date;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (x) { return x.noShow >= 2 || x.late >= 2; })
      .sort(function (a, b) { return Math.max(b.noShow, b.late) - Math.max(a.noShow, a.late) || (a.last < b.last ? 1 : -1); }).slice(0, 6);
    var box = $('[data-bk-strikes]');
    if (!list.length) { box.innerHTML = '<div class="pn-empty"><p class="pn-empty__title">No one near three strikes</p><p>' + esc(RULE.strikes) + '</p></div>'; return; }
    box.innerHTML = '<p class="pn-muted bk-strikes__lede">' + esc(RULE.strikes) + ' Counted here across Outdoor 2026 and Indoor 2026/27. ' + '</p><p>' + UI.confirmSlot('the period the 3 strikes count over') + '</p>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Three strikes watch"><table class="pn-table"><thead><tr><th scope="col">Person</th><th scope="col" class="is-num">No-shows</th><th scope="col" class="is-num">Late cancels</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead><tbody>' +
      list.map(function (x) {
        var p = D.people.get(x.id) || {}, at3 = x.noShow >= 3 || x.late >= 3, sus = p.bookingSuspendedUntil && p.bookingSuspendedUntil >= TODAY_ISO;
        return '<tr><td><a href="' + esc(UI.link('members', 'person=' + x.id)) + '">' + esc(p.name || x.id) + '</a><span class="pn-sub">Last ' + esc(F.day(x.last)) + '</span></td>' +
          '<td class="is-num">' + strikeBalls(x.noShow) + '</td><td class="is-num">' + strikeBalls(x.late) + '</td><td class="is-tight">' +
          (sus ? UI.chip('due', 'Suspended to ' + F.day(p.bookingSuspendedUntil).slice(4)) : btn('bookings.cancel', 'pn-btn--quiet pn-btn--sm', at3 ? 'Suspend 7 days' : 'Remind of the rule', 'data-bk-strike="' + (at3 ? 'suspend' : 'remind') + '" data-person="' + esc(x.id) + '"')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function strikeBalls(n) {
    var s = '<span class="bk-strike" role="img" aria-label="' + n + ' of 3">';
    for (var i = 0; i < 3; i++) s += '<i class="' + (i < n ? 'is-on' : '') + '"></i>';
    return s + '</span><span class="bk-strike__n pn-num" aria-hidden="true">' + n + '</span>';
  }

  /* ---------- Rules and the desk's own log ---------- */
  function renderRules() {
    var rows = [
      ['Who books', RULE.staff],
      ['How far ahead', C.booking.who_can_book[0] + ' ' + C.booking.who_can_book[1]],
      ['Fees', D.feeBands.map(function (b) { return b.name + ' $' + b.fee; }).join(', ') + ' an hour. ' + C.booking.fees_hst + ' ' + C.booking.non_member_fee_text + '.'],
      ['How long', RULE.length],
      ['Cancelling', RULE.notice],
      ['No-shows', RULE.strikes],
      ['Paid courts', RULE.noRefund],
      ['Outdoors', 'No court fees for members during the outdoor season. ' + C.booking.who_can_book[2]]
    ];
    $('[data-bk-rules]').innerHTML = rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') +
      '<div><dt>Not published</dt><dd>' + UI.confirmSlot('which two courts the Friday public hours use') + ' ' + UI.confirmSlot('fee rates current for 2026/27') + '</dd></div>';
  }
  function renderLog() {
    var acts = D.activity().filter(function (a) { return a.ref && (a.ref.type === 'bookings' || a.ref.type === 'payments' || a.ref.type === 'people'); }).slice(0, 8);
    var box = $('[data-bk-log]');
    if (!acts.length) { box.innerHTML = '<div class="pn-empty"><p class="pn-empty__title">Nothing yet</p><p>Book a walk-in, hold a court or cancel a booking and it is listed here, with the role that did it.</p></div>'; return; }
    box.innerHTML = '<ul class="bk-acts bk-acts--log" role="list">' + acts.map(function (a) {
      var open = a.ref.type === 'bookings' && findBooking(a.ref.id);
      return '<li><span class="pn-muted pn-num">' + esc(F.stamp(a.at)) + '</span><span>' + esc(a.by) + ': ' + (open ? '<button type="button" class="pn-rowlink" data-bk-open="' + esc(a.ref.id) + '">' + esc(a.text) + '</button>' : esc(a.text)) + '</span></li>';
    }).join('') + '</ul>';
  }

  /* ---------- Legend and keys ---------- */
  function renderLegend() {
    var k = seasonKind(S.date);
    var items = [['member', 'Member'], ['non-member', 'Non-member or walk-in'], ['lesson', 'Lesson'], ['hold', 'Hold'], ['league', 'League or public hours'], ['site', 'Public site']];
    /* Day view keys only the fee bands that day has (a weekday has no weekend band); the week keys all three */
    var dayBands = S.view === 'day' ? rowsOf(S.date).map(function (r) { return r.band; }) : null;
    var bands = k === 'indoor' ? D.feeBands.filter(function (b) { return !dayBands || dayBands.indexOf(b.id) >= 0; }).map(function (b) { return '<li><i class="bk-key bk-key--band bk-band--' + b.id + '" aria-hidden="true"></i>' + esc(b.name) + ' $' + b.fee + '</li>'; }).join('')
      : k === 'outdoor' ? '<li><i class="bk-key bk-key--band bk-band--outdoor" aria-hidden="true"></i>Outdoor, no member court fee</li><li><i class="bk-key bk-key--closed" aria-hidden="true"></i>Organized tennis</li>' : '';
    $('[data-bk-legend]').innerHTML = '<ul class="bk-legend__list" role="list" aria-label="Key">' + items.map(function (x) { return '<li><i class="bk-key bk-key--' + x[0] + '" aria-hidden="true"></i>' + x[1] + '</li>'; }).join('') + bands + '</ul>';
    var keys = $('[data-bk-keys]'); keys.id = 'bk-keys';
    keys.innerHTML = icon('alert') + '<span>Keyboard: Tab into the calendar, arrow keys move between hours and courts, Home and End go to the row’s ends, Page Up and Page Down jump 4 hours, Enter opens.</span>';
  }

  /* ---------- Render everything and keep focus where it was ---------- */
  function render() {
    renderActions(); renderKpis(); renderWindow(); renderToolbar(); renderLegend();
    if (S.view === 'day') renderDay(); else renderWeek();
    $$('.bk-grid').forEach(function (g) { initGrid(g, S.focusKey); });
    renderPublic(); renderStrikes(); renderRules(); renderLog();
    syncUrl();
  }
  function focusKey() {
    var g = $('[data-bk-panel="' + S.view + '"] .bk-grid'); if (!g) return;
    var b = (S.focusKey && $('button[data-key="' + S.focusKey + '"]', g)) || $('button[tabindex="0"]', g);
    if (b) { setStop(g, b); b.focus({ preventScroll: false }); }
  }
  function refocus() {
    setTimeout(function () {
      if (document.activeElement && document.activeElement !== document.body && document.body.contains(document.activeElement)) return;
      focusKey();
    }, 0);
  }
  function why(el) { UI.toast(el.getAttribute('data-bk-why') || 'Not available for this role.', { kind: 'warn' }); }
  function go(dateIso, view) { S.date = dateIso; if (view) S.view = view; render(); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : null; if (!t || !t.closest('.pn-main')) return;
    var dis = t.closest('[aria-disabled="true"][data-bk-why]'); if (dis) { e.preventDefault(); why(dis); return; }
    var x;
    if ((x = t.closest('[data-bk-open]'))) return openBooking(x.getAttribute('data-bk-open'));
    if ((x = t.closest('[data-bk-free]'))) { var p = x.getAttribute('data-bk-free').split('|'); S.focusKey = x.getAttribute('data-key'); return openFree(+p[0], +p[1]); }
    if ((x = t.closest('[data-bk-public-open]'))) { UI.toast('Being booked on the public site in this tab. It becomes a booking when the visitor confirms it.'); return; }
    if ((x = t.closest('[data-bk-new]'))) return formSheet(x.getAttribute('data-bk-new'), null);
    if ((x = t.closest('[data-bk-go]'))) return go(x.getAttribute('data-bk-go'));
    if ((x = t.closest('[data-bk-step]'))) return go(addIso(S.date, +x.getAttribute('data-bk-step') * (S.view === 'week' ? 7 : 1)));
    if (t.closest('[data-bk-today]')) return go(TODAY_ISO);
    if ((x = t.closest('[data-bk-jump]'))) { var j = x.getAttribute('data-bk-jump'); return go(j === 'indoor' ? (TODAY_ISO >= IND.start && TODAY_ISO <= IND.end ? TODAY_ISO : IND.start) : addIso(OUT.end, -((P(OUT.end).getDay() + 1) % 7))); }
    if ((x = t.closest('[data-bk-show]'))) { S.filter = x.getAttribute('data-bk-show'); render(); var nb = $('[data-bk-show="' + S.filter + '"]'); if (nb) nb.focus(); return; }
    if ((x = t.closest('[data-bk-view]'))) { S.view = x.getAttribute('data-bk-view'); render(); $('[data-bk-view="' + S.view + '"]').focus(); return; }
    if ((x = t.closest('[data-bk-day]'))) { var row = x.getAttribute('data-bk-row'); S.focusKey = row ? '1|' + row : null; go(x.getAttribute('data-bk-day'), 'day'); focusKey(); return; }
    if (t.closest('[data-bk-show-public]')) { var pb = D.publicBooking(); if (!pb) return; S.focusKey = pb.court + '|' + pb.start; go(pb.date, 'day'); focusKey(); if (pb.done) openBooking(pb.id); return; }
    if ((x = t.closest('[data-bk-strike]'))) {
      var pid = x.getAttribute('data-person'), pn = D.personName(pid);
      if (x.getAttribute('data-bk-strike') === 'remind') { D.log('Reminded ' + pn + ' of the no-show and late cancellation rule (not sent)', { type: 'people', id: pid }); UI.toast('Reminder to ' + pn + ' written. Not sent in the demo.'); return; }
      var until = addIso(TODAY_ISO, 7);
      UI.confirm({ title: 'Suspend booking for 7 days?', body: '<p>' + esc(pn) + ' could not book courts until ' + esc(F.day(until)) + '.</p><p>' + esc(RULE.strikes) + '</p><p>Nothing is sent or blocked outside this demo.</p>', confirm: 'Suspend 7 days', cancel: 'Not now' })
        .then(function (yes) { if (!yes) return; D.people.update(pid, { bookingSuspendedUntil: until }, 'Suspended court booking for 7 days, to ' + F.day(until)); UI.toast(pn + ': booking suspended to ' + F.day(until) + ' in the demo.', { action: { label: 'Undo', run: function () { D.people.update(pid, { bookingSuspendedUntil: null }, 'Lifted a booking suspension'); } } }); });
    }
  });
  $('[data-bk-pick]').addEventListener('change', function (e) { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) go(e.target.value); });
  /* Tabs: arrow keys between Day and Week */
  $('.bk-tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault(); S.view = S.view === 'day' ? 'week' : 'day'; if (e.key === 'Home') S.view = 'day'; if (e.key === 'End') S.view = 'week';
    render(); $('[data-bk-view="' + S.view + '"]').focus();
  });

  window.addEventListener('panel:change', function () { var keep = S.focusKey; render(); S.focusKey = keep; });
  /* Coming back from the public site in this tab: read its booking again */
  window.addEventListener('pageshow', function (e) { if (e.persisted) render(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });
  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(placeNow, 120); });
  /* The now line is measured from the rows, so measure again once the club's fonts have loaded */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeNow);
  window.addEventListener('load', placeNow);

  render();
  var deep = q.get('booking');
  if (deep) { var db = findBooking(deep); if (db) { S.date = db.date; render(); openBooking(deep); } }
})();
