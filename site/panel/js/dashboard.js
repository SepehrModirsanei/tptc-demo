/* Dashboard module (owned by the dashboard module agent). See ../PANEL.md.
   What the club asked for (questionnaire, item 4): "track our camps, court usage times and
   registration numbers overall within programs". Plus renewals and revenue by line.
   Every chart is hand-drawn SVG in the site's tokens, one hue per chart, with a table view
   behind it, a tooltip on hover and keyboard focus, and a side sheet on Enter or click.
   Facts (courts, seasons, fee bands, camp weeks, prices) are the club's own; people and
   transactions are the panel's sample data. Nothing here saves to a server. */
(function () {
  'use strict';
  var D = window.PanelData, UI = window.PanelUI;
  if (!D || !UI) return;
  var esc = UI.esc, F = D.fmt;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LIVE_STATUS = ['booked', 'completed', 'no-show', 'in-progress'];   /* a court held, played or not */
  var SVGNS = 'http://www.w3.org/2000/svg';

  function n(x) { return Number(x || 0).toLocaleString('en-CA'); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function money(x) { return F.money(Math.round(x * 100) / 100); }
  function moneyShort(x) { return x >= 1000 ? '$' + (x / 1000).toFixed(x >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K' : money(x); }
  function plural(k, one, many) { return n(k) + ' ' + (k === 1 ? one : (many || one + 's')); }
  function hourLabel(h) { var hh = h % 12 || 12; return hh + (h < 12 || h === 24 ? 'am' : 'pm'); }
  function attr(o) {
    return Object.keys(o).map(function (k) { return o[k] == null || o[k] === false ? '' : ' ' + k + '="' + esc(String(o[k])) + '"'; }).join('');
  }
  function today() { return D.today(); }
  function todayIso() { return F.iso(today()); }

  /* ---------- Aggregates ---------- */

  /* Courts booked per indoor start time for one date: {start: {courts: Set-like obj, list: [bookings]}} */
  function occupancy(dateIso) {
    var out = {};
    var list = D.dayBookings(dateIso) || [];
    list.forEach(function (b) {
      if (LIVE_STATUS.indexOf(b.status) < 0) return;
      for (var i = 0; i < (b.hours || 1); i++) {
        var s = b.start + i * 60;
        var cell = out[s] || (out[s] = { courts: {}, list: [] });
        cell.courts[b.court] = b; cell.list.push(b);
      }
    });
    return out;
  }
  function courtsIn(cell) { return cell ? Object.keys(cell.courts).length : 0; }

  /* The dome this week: seven days from the demo clock's today, on the dome's own start grid. */
  function indoorWeek() {
    var days = [], booked = 0, slots = 0, bands = { regular: { b: 0, s: 0, fee: 0 }, prime: { b: 0, s: 0, fee: 0 }, weekend: { b: 0, s: 0, fee: 0 } };
    for (var i = 0; i < 7; i++) {
      var d = F.addDays(today(), i), iso = F.iso(d), occ = occupancy(iso), starts = D.indoorStarts(d), cells = {};
      starts.forEach(function (s) {
        var c = courtsIn(occ[s]), band = D.band(d, s);
        cells[s] = { date: iso, start: s, courts: c, cell: occ[s] || null, band: band };
        booked += c; slots += 4; bands[band].b += c; bands[band].s += 4;
      });
      days.push({ date: d, iso: iso, starts: starts, cells: cells, weekend: d.getDay() === 0 || d.getDay() === 6 });
    }
    /* court fees actually charged at each band this week (HST included in the fee) */
    days.forEach(function (day) {
      (D.dayBookings(day.iso) || []).forEach(function (b) {
        if (LIVE_STATUS.indexOf(b.status) < 0 || !b.courtFee) return;
        var bd = D.band(day.date, b.start); if (bands[bd]) bands[bd].fee += b.courtFee;
      });
    });
    return { days: days, booked: booked, slots: slots, bands: bands };
  }

  /* Outdoor 2026: each weekday and hour, the share of bookable court hours that were booked. */
  var outdoorCache = null;
  function outdoorSeason() {
    if (outdoorCache) return outdoorCache;
    var grid = {}, byCourt = { 1: 0, 2: 0, 3: 0, 4: 0 }, total = 0, bookable = 0, noShow = 0, late = 0;
    var bk = D.bookings.list({ season: 'outdoor-2026' });
    var held = {};
    bk.forEach(function (b) {
      if (b.status === 'no-show') noShow++;
      if (b.status === 'late-cancel') { late++; return; }
      if (LIVE_STATUS.indexOf(b.status) < 0) return;
      for (var i = 0; i < (b.hours || 1); i++) held[b.date + '|' + (b.start + i * 60) + '|' + b.court] = 1;
      byCourt[b.court] = (byCourt[b.court] || 0) + (b.hours || 1); total += (b.hours || 1);
    });
    for (var d = F.parse('2026-05-01'); d <= F.parse('2026-09-30'); d = F.addDays(d, 1)) {
      var dow = d.getDay(), iso = F.iso(d);
      D.outdoorWindows(d).forEach(function (w) {
        for (var m = w[0]; m + 60 <= w[1]; m += 60) {
          var k = dow + '|' + m, g = grid[k] || (grid[k] = { dow: dow, start: m, days: 0, slots: 0, booked: 0 });
          g.days++; g.slots += 4; bookable += 4;
          for (var c = 1; c <= 4; c++) if (held[iso + '|' + m + '|' + c]) g.booked++;
        }
      });
    }
    outdoorCache = { grid: grid, byCourt: byCourt, total: total, bookable: bookable, noShow: noShow, late: late };
    return outdoorCache;
  }

  /* The four camp lines, in the order the club lists them, each with its weeks. */
  var CAMP_LINES = [
    { id: 'rec-yc', name: 'Recreational Camp', where: 'Yonge & Centre' },
    { id: 'rec-nt', name: 'Recreational Camp', where: 'North Thornhill Community Centre' },
    { id: 'hp-gw', name: 'High Performance Camp', where: 'Garnet Williams Community Centre' },
    { id: 'pn-yc', name: 'Pro National Camp', where: 'Yonge & Centre' }
  ];
  function campLines() {
    var all = D.sessions.list({ kind: 'camp' });
    var weeks = {};
    var lines = CAMP_LINES.map(function (L) {
      var rows = all.filter(function (s) { return s.campId === L.id; }).sort(function (a, b) { return a.week - b.week; });
      var reg = 0, cap = 0, full = 0, wait = 0;
      var wk = rows.map(function (s) {
        var st = D.sessionStats(s.id); reg += st.registered; cap += st.capacity || 0; wait += st.waitlist || 0; if (st.full) full++;
        weeks[s.start] = 1;
        return { s: s, st: st };
      });
      return { line: L, ages: rows[0] ? rows[0].ageBand : '', weeks: wk, reg: reg, cap: cap, full: full, wait: wait, status: rows[0] ? rows[0].status : 'draft' };
    });
    var draft = all.filter(function (s) { return !s.campId; });
    return { lines: lines, weekStarts: Object.keys(weeks).sort(), draft: draft };
  }

  /* Registrations within programs, term by term. PROGRAM_TAB: the Programs module's tab (?tab=) for each row. */
  var PROGRAM_TAB = { 'Junior Recreational': 'junior', 'Adult Group Lessons': 'adult', 'High Performance': 'hp', 'Summer Camps': 'camps', 'Leagues': 'leagues', 'Round Robins': 'leagues' };
  var PROGRAMS = [
    { id: 'Junior Recreational', note: 'Group lessons, ages 4-17' },
    { id: 'Adult Group Lessons', note: 'Group lessons, adults' },
    { id: 'High Performance', note: 'Little Champs, Transition Tour, Pro National' },
    { id: 'Summer Camps', note: 'Seat-weeks across four camps' },
    { id: 'Leagues', note: 'House leagues and interclub' },
    { id: 'Round Robins', note: 'Weekday and weekend mixed doubles' }
  ];
  function programStats() {
    var sess = D.sessions.all();
    var regs = D.registrations.list({ status: 'confirmed' });
    var bySession = {};
    regs.forEach(function (r) { bySession[r.sessionId] = (bySession[r.sessionId] || 0) + 1; });
    return PROGRAMS.map(function (P) {
      var mine = sess.filter(function (s) { return s.program === P.id; });
      var terms = {}, order = [];
      mine.forEach(function (s) {
        var t = terms[s.termId];
        if (!t) { t = terms[s.termId] = { id: s.termId, name: s.term, start: s.start, reg: 0, cap: 0, wait: 0, sessions: 0, status: s.status, gaps: {} }; order.push(t); }
        var st = D.sessionStats(s.id);
        t.reg += bySession[s.id] || 0; t.cap += s.capacity || 0; t.wait += st.waitlist || 0; t.sessions++;
        if (s.start && (!t.start || s.start < t.start)) t.start = s.start;
        if (s.status !== 'finished') t.status = s.status;
        (s.gaps || []).forEach(function (g) { t.gaps[g] = 1; });
      });
      var termOrder = ['gl-fall-2025', 'gl-winter-2026', 'gl-spring-2026', 'gl-summer-2026', 'gl-sumfall-2026', 'gl-indoor-2026'];
      order.sort(function (a, b) {
        var ia = termOrder.indexOf(a.id), ib = termOrder.indexOf(b.id);
        if (ia > -1 && ib > -1) return ia - ib;
        return String(a.start || '9').localeCompare(String(b.start || '9'));
      });
      var reg = 0, cap = 0, wait = 0;
      order.forEach(function (t) { if (t.status !== 'draft') { reg += t.reg; cap += t.cap; } wait += t.wait; });
      return { p: P, terms: order, reg: reg, cap: cap, wait: wait, pending: order.filter(function (t) { return t.status === 'draft'; }) };
    });
  }

  /* Indoor 2026/27 memberships since registration opened, renewals from outdoor 2026. */
  function membershipStats() {
    var all = D.memberships.all();
    var outdoorHH = {}, indoorActive = {};
    all.forEach(function (m) { if (m.season === 'outdoor-2026') outdoorHH[m.householdId] = m; });
    var indoor = all.filter(function (m) { return m.season === 'indoor-2026'; });
    var refundAt = {};
    D.refunds.all().forEach(function (r) { refundAt[r.paymentId] = r.at; });
    var events = [];
    indoor.forEach(function (m) {
      var ret = !!outdoorHH[m.householdId];
      events.push({ at: m.registeredAt, d: 1, ret: ret });
      if (m.status === 'refunded') events.push({ at: refundAt[m.paymentId] || m.registeredAt, d: -1, ret: ret });
      else if (m.status === 'active') indoorActive[m.householdId] = m;
    });
    events.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    var opened = (D.seasons.filter(function (s) { return s.id === 'indoor-2026'; })[0] || {}).registration_opened || '2026-08-01';
    var start = F.parse(opened), end = today(), series = [], tot = 0, ret = 0, ei = 0;
    for (var d = start; d <= end; d = F.addDays(d, 1)) {
      var iso = F.iso(d);
      while (ei < events.length && events[ei].at.slice(0, 10) <= iso) { tot += events[ei].d; if (events[ei].ret) ret += events[ei].d; ei++; }
      series.push({ iso: iso, d: new Date(d), total: tot, ret: ret });
    }
    var renewed = Object.keys(outdoorHH).filter(function (h) { return indoorActive[h]; }).length;
    var outdoorCount = Object.keys(outdoorHH).length;
    var cats = {};
    D.categories.forEach(function (c) { cats[c.id] = { c: c, r: 0, nr: 0, total: 0 }; });
    Object.keys(indoorActive).forEach(function (h) {
      var m = indoorActive[h], k = cats[m.category]; if (!k) return;
      if (m.resident) k.r++; else k.nr++; k.total += m.total;
    });
    var rem = {}, remQueued = {};
    D.reminders.list({ kind: 'renewal' }).forEach(function (r) { var k = r.at.slice(0, 10); rem[k] = (rem[k] || 0) + 1; if (r.status === 'pending') remQueued[k] = (remQueued[k] || 0) + 1; });
    return {
      series: series, opened: opened, outdoorCount: outdoorCount, renewed: renewed,
      active: Object.keys(indoorActive).length, newCount: Object.keys(indoorActive).length - renewed,
      due: D.renewalsDue().length, waiting: D.waitlists.count({ list: 'membership-indoor-2026', status: 'waiting' }),
      refunded: indoor.filter(function (m) { return m.status === 'refunded'; }).length,
      cats: D.categories.map(function (c) { return cats[c.id]; }), reminders: rem, remindersQueued: remQueued
    };
  }

  /* Revenue by line, net of refunds, with each line's tax treatment. */
  var LINES = [
    { id: 'camp', name: 'Summer Camps', tax: 'HST not stated', taxNote: 'The camp page does not say whether HST is included; nothing is added.' },
    { id: 'membership', name: 'Memberships', tax: '+ HST', taxNote: 'Membership prices exclude HST; 13% is added.' },
    { id: 'court', name: 'Court fees', tax: 'HST included', taxNote: 'Court fees include HST; the HST shown is inside the fee.' },
    { id: 'lesson', name: 'Private lessons', tax: '+ HST', taxNote: 'Lesson fees exclude HST; 13% is added.' }
  ];
  function revenueStats() {
    var pays = D.payments.all().filter(function (p) { return p.at.slice(0, 4) === '2026'; });
    var lines = {}, months = {};
    LINES.forEach(function (L) { lines[L.id] = { L: L, count: 0, gross: 0, refunded: 0, net: 0, hst: 0 }; });
    pays.forEach(function (p) {
      var l = lines[p.kind]; if (!l) return;
      var refunded = p.refunded || 0, net = p.total - refunded, keep = p.total ? net / p.total : 0;
      l.count++; l.gross += p.total; l.refunded += refunded; l.net += net; l.hst += (p.hst || 0) * keep;
      var mk = p.at.slice(0, 7), m = months[mk] || (months[mk] = { key: mk, net: 0, by: {} });
      m.net += net; m.by[p.kind] = (m.by[p.kind] || 0) + net;
    });
    var list = LINES.map(function (L) { return lines[L.id]; });
    var total = list.reduce(function (s, l) { return s + l.net; }, 0);
    /* every month from January to the demo clock, so an empty month shows as empty, not as missing */
    var endKey = todayIso().slice(0, 7), mlist = [];
    for (var mi = 1; mi <= 12; mi++) {
      var key = '2026-' + (mi < 10 ? '0' : '') + mi;
      if (key > endKey) break;
      mlist.push(months[key] || { key: key, net: 0, by: {}, none: true });
    }
    return { lines: list, total: total, months: mlist };
  }

  /* ---------- Tooltip: one for the page; values lead, labels follow; textContent only ---------- */
  var tip = null;
  function tipShow(target, ev) {
    tip = tip || document.getElementById('db-tip');
    if (!tip) return;
    var v = target.getAttribute('data-tip-v'), l = target.getAttribute('data-tip-l') || '', m = target.getAttribute('data-tip-m') || '';
    if (!v) return;
    tip.textContent = '';
    var b = document.createElement('strong'); b.className = 'db-tip__v'; b.textContent = v; tip.appendChild(b);
    l.split('\n').forEach(function (line) { if (!line) return; var s = document.createElement('span'); s.className = 'db-tip__l'; s.textContent = line; tip.appendChild(s); });
    if (m) { var s2 = document.createElement('span'); s2.className = 'db-tip__m'; s2.textContent = m; tip.appendChild(s2); }
    tip.hidden = false;
    var r = target.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    var x = ev && ev.clientX != null ? ev.clientX : r.left + r.width / 2;
    var y = ev && ev.clientY != null ? ev.clientY : r.top;
    var left = Math.min(window.innerWidth - tw - 8, Math.max(8, x - tw / 2));
    var top = y - th - 14; if (top < 8) top = (ev && ev.clientY != null ? y : r.bottom) + 16;
    tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  }
  function tipHide() { if (tip) tip.hidden = true; }
  document.addEventListener('pointermove', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-tip-v]') : null;
    if (t && e.pointerType !== 'touch') tipShow(t, e); else if (!t) tipHide();
  });
  document.addEventListener('focusin', function (e) { var t = e.target.closest && e.target.closest('[data-tip-v]'); if (t) tipShow(t); else tipHide(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') tipHide(); });
  window.addEventListener('scroll', tipHide, { passive: true });

  /* ---------- A court at true proportion ----------
     Doubles court 78 x 36 ft drawn end on (length down the page), singles sidelines 4.5 ft
     inside, service lines 21 ft from the net, the centre service line, the centre marks, and
     the net carried 3 ft past the doubles sidelines to its posts (the net is the panel's one red).
     state: 'free' | 'booked' | 'live' | 'closed'. */
  function courtSvg(o) {
    var pad = 5, W = 36 + pad * 2, H = 78 + pad * 2, x0 = pad, y0 = pad;
    var s = '<svg class="db-court db-court--' + o.state + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + (o.w || 46) + '" height="' + Math.round((o.w || 46) * H / W) + '" aria-hidden="true" focusable="false">';
    s += '<rect class="db-court__ground" x="0" y="0" width="' + W + '" height="' + H + '" rx="1.5"/>';
    s += '<rect class="db-court__surface" x="' + x0 + '" y="' + y0 + '" width="36" height="78"/>';
    s += '<g class="db-court__lines">';
    s += '<rect x="' + x0 + '" y="' + y0 + '" width="36" height="78" fill="none"/>';
    s += '<line x1="' + (x0 + 4.5) + '" y1="' + y0 + '" x2="' + (x0 + 4.5) + '" y2="' + (y0 + 78) + '"/>';
    s += '<line x1="' + (x0 + 31.5) + '" y1="' + y0 + '" x2="' + (x0 + 31.5) + '" y2="' + (y0 + 78) + '"/>';
    s += '<line x1="' + (x0 + 4.5) + '" y1="' + (y0 + 18) + '" x2="' + (x0 + 31.5) + '" y2="' + (y0 + 18) + '"/>';
    s += '<line x1="' + (x0 + 4.5) + '" y1="' + (y0 + 60) + '" x2="' + (x0 + 31.5) + '" y2="' + (y0 + 60) + '"/>';
    s += '<line x1="' + (x0 + 18) + '" y1="' + (y0 + 18) + '" x2="' + (x0 + 18) + '" y2="' + (y0 + 60) + '"/>';
    s += '<line x1="' + (x0 + 18) + '" y1="' + y0 + '" x2="' + (x0 + 18) + '" y2="' + (y0 + 1) + '"/>';
    s += '<line x1="' + (x0 + 18) + '" y1="' + (y0 + 77) + '" x2="' + (x0 + 18) + '" y2="' + (y0 + 78) + '"/>';
    s += '</g>';
    s += '<line class="db-court__net" x1="' + (x0 - 3) + '" y1="' + (y0 + 39) + '" x2="' + (x0 + 39) + '" y2="' + (y0 + 39) + '"/>';
    s += '<circle class="db-court__post" cx="' + (x0 - 3) + '" cy="' + (y0 + 39) + '" r="0.9"/><circle class="db-court__post" cx="' + (x0 + 39) + '" cy="' + (y0 + 39) + '" r="0.9"/>';
    if (o.state === 'live') s += '<circle class="db-court__ball" cx="' + (x0 + 25) + '" cy="' + (y0 + 66) + '" r="2.4"/>';
    return s + '</svg>';
  }

  /* ---------- KPIs ---------- */
  function renderKpis(ctx) {
    var box = $('[data-db-kpis]'); if (!box) return;
    var w = ctx.week, c = ctx.camps, p = ctx.programs, m = ctx.members, r = ctx.revenue;
    var campReg = 0, campCap = 0, campWeeks = 0;
    c.lines.forEach(function (L) { campReg += L.reg; campCap += L.cap; campWeeks += L.weeks.length; });
    var progReg = p.reduce(function (s, x) { return s + x.reg; }, 0);
    var first = w.days[0], last = w.days[w.days.length - 1];
    var k = [
      ['#courts', 'Dome, this week', pct(w.booked, w.slots) + '%', n(w.booked) + ' of ' + n(w.slots) + ' court hours booked, ' + F.day(first.iso) + ' to ' + F.day(last.iso)],
      ['#camps', 'Summer Camps 2026', pct(campReg, campCap) + '%', n(campReg) + ' of ' + n(campCap) + ' seats over ' + campWeeks + ' camp weeks'],
      ['#programs', 'Registrations', n(progReg), 'Six programs, Fall 2025 to now'],
      ['#renewals', 'Indoor members 2026/27', n(m.active), n(m.renewed) + ' of ' + n(m.outdoorCount) + ' outdoor households renewed, ' + n(m.due) + ' due'],
      ['#revenue', 'Revenue, 2026 to date', moneyShort(r.total), 'Net of refunds, CAD, ' + money(r.total)]
    ];
    box.innerHTML = k.map(function (x) {
      return '<a class="pn-kpi db-kpi" href="' + x[0] + '"><span class="pn-kpi__label">' + esc(x[1]) + '</span><span class="pn-kpi__value">' + esc(x[2]) + '</span><span class="pn-kpi__note">' + esc(x[3]) + '</span></a>';
    }).join('');
  }

  /* ---------- Court usage heatmap ---------- */
  var courtMode = 'indoor';
  try { var savedMode = localStorage.getItem('tptc-panel-dashboard-courts'); if (savedMode === 'outdoor') courtMode = 'outdoor'; } catch (e) { /* per-viewer convenience only */ }

  function heatLevel(share) { return share <= 0 ? 0 : Math.min(4, Math.ceil(share * 4 - 1e-9)); }

  function heatModel(ctx) {
    var cols = [], rows = [], cells = {};
    if (courtMode === 'indoor') {
      var w = ctx.week;
      for (var h = 6; h <= 22; h++) rows.push({ h: h, label: hourLabel(h) });
      w.days.forEach(function (day, ci) {
        cols.push({ head: DOW[day.date.getDay()], sub: MON[day.date.getMonth()] + ' ' + day.date.getDate(), today: day.iso === todayIso(), weekend: day.weekend, iso: day.iso });
        rows.forEach(function (row, ri) {
          var s = day.weekend ? row.h * 60 : row.h * 60 + 30, c = day.cells[s];
          if (!c) return;
          var live = day.iso === todayIso() && D.clock.nowMin >= s && D.clock.nowMin < s + 60;
          var band = D.feeBands.filter(function (b) { return b.id === c.band; })[0] || {};
          cells[ci + '|' + ri] = {
            level: c.courts, live: live && c.courts > 0, now: live, data: c,
            v: c.courts + ' of 4 courts booked',
            l: F.day(day.iso) + ', ' + F.range(s, 1) + '\n' + (band.name || '') + ', ' + money(band.fee || 0) + ' an hour, HST included' + (live ? '\nIn play now (demo clock)' : ''),
            aria: F.day(day.iso) + ' ' + F.time(s) + ': ' + c.courts + ' of 4 courts booked, ' + (band.name || '')
          };
        });
      });
    } else {
      var o = outdoorSeason();
      for (var h2 = 7; h2 <= 22; h2++) rows.push({ h: h2, label: hourLabel(h2) });
      [1, 2, 3, 4, 5, 6, 0].forEach(function (dow, ci) {
        cols.push({ head: DOW[dow], sub: dow === 0 || dow === 6 ? 'weekend' : 'weekday', today: false, weekend: dow === 0 || dow === 6 });
        rows.forEach(function (row, ri) {
          var g = o.grid[dow + '|' + row.h * 60];
          if (!g) { cells[ci + '|' + ri] = { level: -1, aria: DOW[dow] + ' ' + hourLabel(row.h) + ': organized tennis, not bookable', v: 'Not bookable', l: DOW[dow] + 's, ' + F.range(row.h * 60, 1) + '\nOrganized tennis has priority' }; return; }
          var share = g.slots ? g.booked / g.slots : 0;
          cells[ci + '|' + ri] = {
            level: heatLevel(share), data: g,
            v: pct(g.booked, g.slots) + '% of court hours booked',
            l: DOW[dow] + 's, ' + F.range(row.h * 60, 1) + '\n' + n(g.booked) + ' of ' + n(g.slots) + ' court hours over ' + plural(g.days, 'bookable day'),
            aria: DOW[dow] + ' ' + hourLabel(row.h) + ': ' + pct(g.booked, g.slots) + ' percent booked'
          };
        });
      });
    }
    return { cols: cols, rows: rows, cells: cells };
  }

  function heatSvg(model, width) {
    var labelW = 46, headH = 42, rowH = width < 520 ? 24 : 22, nc = model.cols.length, nr = model.rows.length;
    var colW = Math.max(30, (width - labelW) / nc), W = Math.round(labelW + colW * nc), H = headH + rowH * nr + 2;
    var title = courtMode === 'indoor' ? 'Courts booked by start time, this week in the dome' : 'Share of bookable court hours booked, outdoor 2026, by weekday and hour';
    var s = '<svg class="db-heat" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + esc(title + '. Arrow keys move between hours and days; Enter opens the hour.') + '">';
    model.cols.forEach(function (c, ci) {
      var cx = labelW + colW * ci + colW / 2;
      s += '<text class="db-axis db-axis--head' + (c.today ? ' is-today' : '') + '" x="' + cx + '" y="16" text-anchor="middle">' + esc(c.head) + '</text>';
      s += '<text class="db-axis db-axis--sub" x="' + cx + '" y="31" text-anchor="middle">' + esc(c.today ? 'Today' : c.sub) + '</text>';
    });
    model.rows.forEach(function (r, ri) {
      if (ri % 2 && rowH < 24) return;
      s += '<text class="db-axis" x="' + (labelW - 8) + '" y="' + (headH + rowH * ri + rowH / 2 + 4) + '" text-anchor="end">' + esc(r.label) + '</text>';
    });
    var first = true;
    model.rows.forEach(function (r, ri) {
      model.cols.forEach(function (c, ci) {
        var cell = model.cells[ci + '|' + ri]; if (!cell) return;
        var x = labelW + colW * ci + 1, y = headH + rowH * ri + 1, w = colW - 2, h = rowH - 2;
        var cls = cell.level < 0 ? 'db-heat__cell is-off' : 'db-heat__cell db-heat-' + cell.level;
        if (cell.now) cls += ' is-now';
        s += '<rect class="' + cls + '"' + attr({ x: x, y: y, width: w, height: h, rx: 2, role: 'button', tabindex: first ? 0 : -1, 'aria-label': cell.aria, 'data-cell': ci + '|' + ri, 'data-tip-v': cell.v, 'data-tip-l': cell.l }) + '/>';
        if (cell.live) s += '<circle class="db-heat__ball" cx="' + (x + w - 7) + '" cy="' + (y + h / 2) + '" r="4" aria-hidden="true"/>';
        first = false;
      });
    });
    if (courtMode === 'indoor') {
      /* weekdays turn to prime time at 6:30pm: one hairline across the weekday columns */
      var pr = -1; model.rows.forEach(function (r, i) { if (r.h === 18) pr = i; });
      model.cols.forEach(function (c, ci) {
        if (c.weekend || pr < 0) return;
        var y = headH + rowH * pr;
        s += '<line class="db-heat__band" x1="' + (labelW + colW * ci) + '" y1="' + y + '" x2="' + (labelW + colW * (ci + 1)) + '" y2="' + y + '"/>';
      });
    }
    return s + '</svg>';
  }

  function heatLegend() {
    var steps = courtMode === 'indoor'
      ? [['0', 'None'], ['1', '1 court'], ['2', '2'], ['3', '3'], ['4', 'All 4']]
      : [['0', '0%'], ['1', 'to 25%'], ['2', 'to 50%'], ['3', 'to 75%'], ['4', 'to 100%']];
    var s = '<div class="db-legend" aria-hidden="true"><span class="db-legend__title">' + (courtMode === 'indoor' ? 'Courts booked' : 'Booked, of bookable hours') + '</span>';
    steps.forEach(function (st) { s += '<span class="db-legend__item"><span class="db-swatch db-heat-' + st[0] + '"></span>' + esc(st[1]) + '</span>'; });
    if (courtMode === 'indoor') s += '<span class="db-legend__item"><span class="db-legend__line"></span>Prime from 6:30pm on weekdays</span><span class="db-legend__item"><span class="live-dot db-legend__dot"></span>In play now</span>';
    else s += '<span class="db-legend__item"><span class="db-swatch is-off"></span>Organized tennis, not bookable</span>';
    return s + '</div>';
  }

  function heatNote() {
    if (courtMode === 'indoor') return 'The dome books weekdays on the half hour (6:30am to 11:30pm) and weekends on the hour (7am to 11pm); each row is the hour a booking starts in. Members book 7 days ahead from 7:30am, so this week is the members’ whole window.';
    return 'Outdoor bookings ran inside the club’s published windows from May 1 to Sep 30 (approximate dates); outside them organized tennis had the courts. Each cell is the season’s share of bookable court hours that members booked.';
  }

  /* shell.whoCan has no entry for members.remind and falls back to 'Administrator'; the roles table says Front desk or Administrator (request logged) */
  function remindWho() { var w = UI.whoCan('members.remind'); return w === 'Administrator' ? 'Front desk or Administrator' : w; }
  function kindLabel(b) {
    if (b.fromPublicFlow) return 'Public site booking';
    if (b.type === 'league') return /round robin/i.test(b.title || '') ? 'Round robin' : 'League';
    return ({ member: 'Member', 'non-member': 'Walk-in', lesson: 'Lesson', hold: 'Hold', 'public': 'Public courts' })[b.type] || 'Booked';
  }
  function renderNow(ctx) {
    var box = $('[data-db-now]'); if (!box) return;
    if (courtMode === 'outdoor') {
      var o = outdoorSeason(), max = 0;
      [1, 2, 3, 4].forEach(function (c) { max = Math.max(max, o.byCourt[c] || 0); });
      box.innerHTML = '<h3 class="db-card__h">Court by court, outdoor 2026</h3><ul class="db-courtrow">' + [1, 2, 3, 4].map(function (c) {
        return '<li>' + courtSvg({ state: 'booked', w: 40 }) + '<span class="db-courtrow__name">Court ' + c + '</span><span class="db-courtrow__val pn-num">' + n(o.byCourt[c]) + ' h</span></li>';
      }).join('') + '</ul><p class="pn-muted db-small">' + n(o.total) + ' member court hours played; ' + plural(o.noShow, 'no-show') + ' and ' + plural(o.late, 'late cancel') + ' count toward the 7-day suspension.</p>';
      return;
    }
    var occ = occupancy(todayIso()), nm = D.clock.nowMin, d = today();
    var starts = D.indoorStarts(d), slot = null;
    starts.forEach(function (s) { if (nm >= s && nm < s + 60) slot = s; });
    var open = slot != null, inPlay = 0;
    var items = [1, 2, 3, 4].map(function (c) {
      var b = open && occ[slot] ? occ[slot].courts[c] : null;
      var state = !open ? 'closed' : b ? 'live' : 'free';
      if (b) inPlay++;
      var what = !open ? 'Dome closed' : b ? kindLabel(b) : 'Free';
      var until = b ? 'to ' + F.time(b.start + (b.hours || 1) * 60) : (open ? 'this hour' : '');
      return '<li class="db-now__court is-' + state + '">' + courtSvg({ state: state, w: 40 }) + '<span class="db-courtrow__name">Court ' + c + '</span><span class="db-courtrow__val">' + esc(what) + '</span><span class="pn-sub">' + esc(until) + '</span></li>';
    }).join('');
    var head = open ? (inPlay ? '<span class="live-dot" aria-hidden="true"></span>' + inPlay + ' of 4 in play now' : 'All four free this hour') : 'The dome is closed now';
    box.innerHTML = '<h3 class="db-card__h">' + head + '</h3><p class="pn-muted db-small">' + esc(F.day(todayIso())) + ', ' + esc(F.time(nm)) + (D.clock.shifted ? ' (demo clock)' : '') + (open ? ', the ' + esc(F.time(slot)) + ' hour' : '') + '</p><ul class="db-courtrow">' + items + '</ul>' +
      '<a class="pn-btn pn-btn--quiet pn-btn--sm db-card__go" href="' + esc(UI.link('bookings', 'date=' + todayIso())) + '">Open today in Bookings</a>';
  }

  function hbars(rows, opts) {
    /* single-series horizontal bars: label above, bar, value at the tip; rows [{label, sub, value, max, text, tipV, tipL}] */
    opts = opts || {};
    return '<ul class="db-hbars">' + rows.map(function (r) {
      var w = r.max ? Math.max(r.value > 0 ? 1.5 : 0, r.value / r.max * 100) : 0;
      return '<li class="db-hbar"' + (r.key ? ' data-key="' + esc(r.key) + '"' : '') + '><span class="db-hbar__label">' + esc(r.label) + (r.sub ? '<span class="pn-sub">' + r.sub + '</span>' : '') + '</span>' +
        '<span class="db-hbar__track"' + attr({ 'data-tip-v': r.tipV || r.text, 'data-tip-l': r.tipL || r.label }) + '><span class="db-hbar__fill" style="width:' + w.toFixed(2) + '%"></span></span>' +
        '<span class="db-hbar__val pn-num">' + esc(r.text) + '</span></li>';
    }).join('') + '</ul>';
  }

  function renderBands(ctx) {
    var box = $('[data-db-bands]'); if (!box) return;
    if (courtMode === 'outdoor') {
      var o = outdoorSeason(), by = {};
      Object.keys(o.grid).forEach(function (k) { var g = o.grid[k]; var b = by[g.dow] || (by[g.dow] = { b: 0, s: 0 }); b.b += g.booked; b.s += g.slots; });
      box.innerHTML = '<h3 class="db-card__h">By day of the week</h3>' + hbars([1, 2, 3, 4, 5, 6, 0].map(function (dw) {
        var x = by[dw] || { b: 0, s: 0 };
        return { label: DOW[dw], value: pct(x.b, x.s), max: 100, text: pct(x.b, x.s) + '%', tipV: pct(x.b, x.s) + '% booked', tipL: n(x.b) + ' of ' + n(x.s) + ' bookable court hours, ' + DOW[dw] + 's' };
      })) + '<p class="pn-muted db-small">Members’ outdoor court time is part of the membership; no court fee is charged.</p>';
      return;
    }
    var w = ctx.week;
    box.innerHTML = '<h3 class="db-card__h">By fee band, this week</h3>' + hbars(D.feeBands.map(function (b) {
      var x = w.bands[b.id] || { b: 0, s: 0, fee: 0 };
      return { label: b.name, sub: esc(b.when) + ', ' + esc(money(b.fee)) + ' an hour', value: pct(x.b, x.s), max: 100, text: pct(x.b, x.s) + '%', tipV: pct(x.b, x.s) + '% of court hours booked', tipL: n(x.b) + ' of ' + n(x.s) + ' court hours\nCourt fees ' + money(x.fee) + ', HST included (' + money(D.hstIn(x.fee)) + ')' };
    })) + '<p class="pn-muted db-small">Court fees include HST.</p>';
  }

  function tableView(el, summary, head, rows, label) {
    if (!el) return;
    var open = el.open;
    el.innerHTML = '<summary class="db-tableview__sum">' + UI.icon('chevron', 'icon--16') + '<span>' + esc(summary) + '</span></summary>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="' + esc(label) + '"><table class="pn-table db-table"><thead><tr>' +
      head.map(function (h, i) { return '<th scope="col"' + (h.num ? ' class="is-num"' : '') + '>' + esc(h.t || h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { var num = head[i] && head[i].num; return (i === 0 ? '<th scope="row">' : '<td' + (num ? ' class="is-num"' : '') + '>') + (c && c.html != null ? c.html : esc(c)) + (i === 0 ? '</th>' : '</td>'); }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
    el.open = open;
  }

  var heatModelCache = null;
  function renderCourts(ctx) {
    var box = $('[data-db-heat]'); if (!box) return;
    $$('[data-db-season]').forEach(function (t) {
      var on = t.getAttribute('data-db-season') === courtMode;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      if (on) $('[data-db-court-panel]').setAttribute('aria-labelledby', t.id);
    });
    var model = heatModel(ctx); heatModelCache = model;
    var width = box.clientWidth || 640;
    var focusKey = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-cell');
    box.innerHTML = heatSvg(model, width) + heatLegend() + '<p class="pn-note db-small">' + UI.icon('clock', 'icon--16') + '<span>' + esc(heatNote()) + '</span></p>';
    if (focusKey) { var f = box.querySelector('[data-cell="' + focusKey + '"]'); if (f) { $$('[data-cell]', box).forEach(function (c) { c.setAttribute('tabindex', '-1'); }); f.setAttribute('tabindex', '0'); f.focus(); } }
    renderNow(ctx); renderBands(ctx);
    var sum = $('[data-db-courts-sum]');
    if (courtMode === 'indoor') {
      if (sum) sum.textContent = n(ctx.week.booked) + ' of ' + n(ctx.week.slots) + ' court hours booked across the four courts, ' + pct(ctx.week.booked, ctx.week.slots) + '%.';
      tableView($('[data-db-heat-table]'), 'Table view: courts booked by start time, this week', [{ t: 'Starts' }].concat(ctx.week.days.map(function (d) { return { t: F.day(d.iso), num: true }; })),
        model.rows.map(function (r) {
          return [r.label + ' hour'].concat(ctx.week.days.map(function (d) { var s = d.weekend ? r.h * 60 : r.h * 60 + 30, c = d.cells[s]; return c ? c.courts + ' of 4 (' + F.time(s) + ')' : 'closed'; }));
        }), 'Courts booked by start time, this week');
    } else {
      var o = outdoorSeason();
      if (sum) sum.textContent = n(o.total) + ' member court hours played of ' + n(o.bookable) + ' bookable, ' + pct(o.total, o.bookable) + '%.';
      tableView($('[data-db-heat-table]'), 'Table view: share of bookable court hours booked, outdoor 2026', [{ t: 'Hour' }].concat(model.cols.map(function (c) { return { t: c.head, num: true }; })),
        model.rows.map(function (r, ri) {
          return [r.label].concat(model.cols.map(function (c, ci) { var x = model.cells[ci + '|' + ri]; return !x || x.level < 0 ? 'not bookable' : pct(x.data.booked, x.data.slots) + '%'; }));
        }), 'Outdoor 2026 court usage by weekday and hour');
    }
  }

  function openCell(key) {
    var cell = heatModelCache && heatModelCache.cells[key]; if (!cell) return;
    if (cell.level < 0) { UI.toast('Organized tennis has the outdoor courts at that hour; members could not book it.'); return; }
    var body, title, kicker = courtMode === 'indoor' ? 'Court usage, this week' : 'Court usage, outdoor 2026';
    if (courtMode === 'indoor') {
      var c = cell.data, d = F.parse(c.date);
      title = F.day(c.date) + ', ' + F.time(c.start);
      var band = D.feeBands.filter(function (b) { return b.id === c.band; })[0] || {};
      body = '<p class="db-sheet__lede">' + esc(c.courts + ' of 4 courts booked. ' + (band.name || '') + ', ' + money(band.fee || 0) + ' an hour, HST included.') + '</p><ul class="db-sheetcourts">' + [1, 2, 3, 4].map(function (k) {
        var b = c.cell && c.cell.courts[k];
        var who = b ? (b.personId ? D.personName(b.personId) : '') : '';
        var line = b ? (b.title || 'Booked') + (who ? ', ' + who : '') : 'Free';
        var meta = b ? F.range(b.start, b.hours || 1) + (b.total ? ', ' + money(b.total) : '') + (b.fromPublicFlow ? ', from the public site' : '') : (D.hourState(d, c.start, k) === 'public' ? 'Public courts' : 'Bookable');
        return '<li>' + courtSvg({ state: b ? (cell.now ? 'live' : 'booked') : 'free', w: 46 }) + '<span><strong>Court ' + k + '</strong><span class="pn-sub">' + esc(line) + '</span><span class="pn-sub">' + esc(meta) + '</span></span></li>';
      }).join('') + '</ul><p class="pn-note">' + UI.icon('alert', 'icon--16') + '<span>Names are sample data. Staff do not book courts for members; the desk books walk-ins, holds and lessons in Bookings.</span></p>';
      UI.sheet.open({ kicker: kicker, title: title, body: body,
        foot: '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button><a class="pn-btn pn-btn--ink" href="' + esc(UI.link('bookings', 'date=' + c.date)) + '" autofocus>Open ' + esc(F.day(c.date)) + ' in Bookings</a>' });
    } else {
      var g = cell.data;
      title = DOW[g.dow] + 's, ' + F.range(g.start, 1);
      body = '<p class="db-sheet__lede">' + esc(pct(g.booked, g.slots) + '% of bookable court hours were booked at this hour over the outdoor 2026 season.') + '</p>' +
        '<dl class="pn-dl"><div><dt>Bookable days</dt><dd>' + n(g.days) + '</dd></div><div><dt>Court hours bookable</dt><dd>' + n(g.slots) + '</dd></div><div><dt>Court hours booked</dt><dd>' + n(g.booked) + '</dd></div><div><dt>Average courts in use</dt><dd>' + (g.days ? (g.booked / g.days).toFixed(1) : '0') + ' of 4</dd></div></dl>' +
        '<p class="pn-note">' + UI.icon('alert', 'icon--16') + '<span>The season’s windows changed by month (9am to 3pm on weekdays in May, June and September); days outside a window are not counted.</span></p>';
      UI.sheet.open({ kicker: kicker, title: title, body: body, foot: '<button class="pn-btn pn-btn--ink" type="button" data-sheet-close autofocus>Close</button>' });
    }
  }

  function heatKeys(e) {
    var t = e.target; if (!t.getAttribute || !t.getAttribute('data-cell')) return;
    var parts = t.getAttribute('data-cell').split('|'), ci = +parts[0], ri = +parts[1];
    var nc = heatModelCache.cols.length, nr = heatModelCache.rows.length, k = e.key, target = null;
    function find(c, r, dc, dr) { while (c >= 0 && c < nc && r >= 0 && r < nr) { var el = t.ownerSVGElement.querySelector('[data-cell="' + c + '|' + r + '"]'); if (el) return el; c += dc; r += dr; } return null; }
    if (k === 'ArrowRight') target = find(ci + 1, ri, 1, 0);
    else if (k === 'ArrowLeft') target = find(ci - 1, ri, -1, 0);
    else if (k === 'ArrowDown') target = find(ci, ri + 1, 0, 1);
    else if (k === 'ArrowUp') target = find(ci, ri - 1, 0, -1);
    else if (k === 'Home') target = find(0, ri, 1, 0);
    else if (k === 'End') target = find(nc - 1, ri, -1, 0);
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); tipHide(); openCell(t.getAttribute('data-cell')); return; }
    else return;
    e.preventDefault();
    if (target) { t.setAttribute('tabindex', '-1'); target.setAttribute('tabindex', '0'); target.focus(); }
  }

  /* ---------- Camps: one strip per camp, the same twelve weeks across ---------- */
  function colPath(x, y, w, h) {
    /* a column with 4px rounded data end, square at the baseline */
    var r = Math.min(4, w / 2, h);
    if (h <= 0) return '';
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }
  function shortDate(iso) { var d = F.parse(iso); return MON[d.getMonth()] + ' ' + d.getDate(); }

  function campStrip(L, weekStarts, width, li) {
    var padL = 0, padR = 0, top = 8, plotH = 64, axisH = 22, W = Math.max(240, width), H = top + plotH + axisH;
    var slot = (W - padL - padR) / weekStarts.length, bw = Math.min(24, slot - 4);
    var byStart = {}; L.weeks.forEach(function (w) { byStart[w.s.start] = w; });
    var s = '<svg class="db-strip" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + esc(L.line.name + ', ' + L.line.where + ': seats filled by week. Arrow keys move between weeks; Enter opens the week.') + '">';
    s += '<line class="db-cap" x1="0" y1="' + top + '" x2="' + W + '" y2="' + top + '"/>';
    s += '<line class="db-base" x1="0" y1="' + (top + plotH) + '" x2="' + W + '" y2="' + (top + plotH) + '"/>';
    var first = true, narrow = slot < 34;
    weekStarts.forEach(function (ws, i) {
      var cx = padL + slot * i + slot / 2, w = byStart[ws];
      if (!narrow || i % 3 === 0) s += '<text class="db-axis" x="' + cx + '" y="' + (top + plotH + 16) + '" text-anchor="middle">' + esc(shortDate(ws)) + '</text>';
      if (!w) return;
      var cap = w.st.capacity || 1, h = Math.max(2, plotH * Math.min(1, w.st.registered / cap)), x = cx - bw / 2, y = top + plotH - h;
      var label = 'Week ' + w.s.week + ', ' + shortDate(w.s.start) + ' to ' + shortDate(w.s.end) + ': ' + w.st.registered + ' of ' + cap + ' seats' + (w.st.full ? ', full' : '');
      s += '<g class="db-col' + (w.st.full ? ' is-full' : '') + '"' + attr({ role: 'button', tabindex: first ? 0 : -1, 'aria-label': label, 'data-camp': w.s.id, 'data-li': li, 'data-wi': i, 'data-tip-v': w.st.registered + ' of ' + cap + ' seats' + (w.st.full ? ', full' : ''), 'data-tip-l': L.line.name + ', ' + L.line.where + '\nWeek ' + w.s.week + ', ' + shortDate(w.s.start) + ' to ' + shortDate(w.s.end) + (w.st.waitlist ? '\n' + w.st.waitlist + ' waiting' : '') }) + '>' +
        '<rect class="db-col__hit" x="' + (cx - slot / 2) + '" y="' + top + '" width="' + slot + '" height="' + plotH + '"/>' +
        '<path class="db-col__bar" d="' + colPath(x, y, bw, h) + '"/></g>';
      first = false;
    });
    return s + '</svg>';
  }

  function renderCamps(ctx) {
    var box = $('[data-db-camps]'); if (!box) return;
    var c = ctx.camps, width = (box.clientWidth || 640);
    var full = 0, weeks = 0, reg = 0, cap = 0;
    c.lines.forEach(function (L) { full += L.full; weeks += L.weeks.length; reg += L.reg; cap += L.cap; });
    var sum = $('[data-db-camps-sum]'); if (sum) sum.textContent = full + ' of ' + weeks + ' camp weeks ran full; ' + n(reg) + ' of ' + n(cap) + ' seats, ' + pct(reg, cap) + '%.';
    var focusCamp = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-camp');
    var html = '<div class="db-legend" aria-hidden="true"><span class="db-legend__item"><span class="db-swatch db-swatch--full"></span>Week ran full</span><span class="db-legend__item"><span class="db-swatch db-swatch--part"></span>Seats left</span><span class="db-legend__item"><span class="db-legend__line db-legend__line--cap"></span>Capacity (sample)</span></div>';
    html += '<ol class="db-camps">' + c.lines.map(function (L, li) {
      var stripW = width >= 760 ? width - 280 : width;
      return '<li class="db-camp"><div class="db-camp__words"><p class="db-camp__name">' + esc(L.line.name) + '</p><p class="pn-sub">' + esc(L.line.where + ', ' + L.ages) + '</p>' +
        '<p class="db-camp__fig"><span class="pn-money">' + pct(L.reg, L.cap) + '%</span> <span class="pn-muted">' + n(L.reg) + ' of ' + n(L.cap) + ' seats, ' + L.full + ' of ' + L.weeks.length + ' weeks full</span></p>' + UI.chip(L.status) + '</div>' +
        '<div class="db-camp__chart">' + campStrip(L, c.weekStarts, stripW, li) + '</div></li>';
    }).join('') + '</ol>';
    c.draft.forEach(function (s) {
      var gaps = (s.gaps || []).length ? s.gaps.join(', ') : 'Winter Break 2026/27 camp dates and prices';
      html += '<div class="db-camp db-camp--next"><div class="db-camp__words"><p class="db-camp__name">' + esc(s.title) + '</p><p class="pn-sub">' + esc((s.location || '') + (s.ageBand ? ', ' + s.ageBand : '')) + '</p></div><div class="db-camp__chart db-camp__slot">' + UI.confirmSlot(gaps) + '<p class="pn-muted db-small">Seats and fill appear here once the club publishes the camp.</p></div></div>';
    });
    box.innerHTML = html;
    if (focusCamp) { var f = box.querySelector('[data-camp="' + focusCamp + '"]'); if (f) { $$('[data-camp]', f.ownerSVGElement).forEach(function (x) { x.setAttribute('tabindex', '-1'); }); f.setAttribute('tabindex', '0'); f.focus(); } }
    tableView($('[data-db-camps-table]'), 'Table view: seats by camp and week', [{ t: 'Week of' }].concat(c.lines.map(function (L) { return { t: L.line.name + ', ' + L.line.where, num: true }; })),
      c.weekStarts.map(function (ws) {
        return [shortDate(ws)].concat(c.lines.map(function (L) { var w = L.weeks.filter(function (x) { return x.s.start === ws; })[0]; return w ? w.st.registered + ' of ' + w.st.capacity + (w.st.full ? ', full' : '') : 'no camp'; }));
      }), 'Seats by camp and week');
  }

  /* the club's three camp price tiers in the order they open (camps page: Feb 16 to 23, Feb 24 to Apr 30, May 1 onwards) */
  function tierRank(t) { t = String(t).toUpperCase(); return /SUPER/.test(t) ? 0 : /EARLY/.test(t) ? 1 : /REGULAR/.test(t) ? 2 : 3; }
  function tierName(t) { return ['Super early bird, Feb 16 to 23', 'Early bird, Feb 24 to Apr 30', 'Regular, from May 1'][tierRank(t)] || String(t); }
  function openCamp(id) {
    var s = D.sessions.get(id); if (!s) return;
    var st = D.sessionStats(id), regs = D.registrations.list({ sessionId: id });
    var conf = regs.filter(function (r) { return r.status === 'confirmed'; }), refd = regs.filter(function (r) { return r.status === 'refunded'; });
    var opts = {}, tiers = {}, collected = 0;
    conf.forEach(function (r) { opts[r.optionLabel || r.option || 'Option not recorded'] = (opts[r.optionLabel || r.option || 'Option not recorded'] || 0) + 1; tiers[r.tier || 'Tier not recorded'] = (tiers[r.tier || 'Tier not recorded'] || 0) + 1; collected += r.total || 0; });
    var body = '<dl class="pn-dl"><div><dt>Where</dt><dd>' + esc(s.location) + '</dd></div><div><dt>Ages</dt><dd>' + esc(s.ageBand) + '</dd></div><div><dt>Dates</dt><dd>' + esc(F.day(s.start) + ' to ' + F.day(s.end)) + '</dd></div>' +
      '<div><dt>Seats</dt><dd>' + st.registered + ' of ' + st.capacity + (st.full ? ', full' : '') + ' <span class="pn-sub">Capacity is sample data</span></dd></div><div><dt>Waiting</dt><dd>' + (st.waitlist || 0) + '</dd></div><div><dt>Refunded</dt><dd>' + refd.length + '</dd></div></dl>' +
      '<h3 class="db-sheet__h">By option</h3>' + hbars(Object.keys(opts).map(function (k) { return { label: k, value: opts[k], max: st.capacity || conf.length, text: String(opts[k]) }; })) +
      '<h3 class="db-sheet__h">By price tier</h3>' + hbars(Object.keys(tiers).sort(function (x, y) { return tierRank(x) - tierRank(y); }).map(function (k) { return { label: tierName(k), value: tiers[k], max: conf.length, text: String(tiers[k]) }; })) +
      '<p class="db-sheet__total"><span>Collected for this week</span><span class="pn-money">' + esc(money(collected)) + '</span></p>' +
      '<p class="pn-note">' + UI.icon('alert', 'icon--16') + '<span>No HST added: ' + UI.confirmSlot('Whether HST is included in camp prices') + '</span></p>';
    UI.sheet.open({ kicker: 'Summer Camps 2026, week ' + s.week, title: s.title.replace(/, week \d+$/, '') + ', ' + shortDate(s.start).replace(' ', '\u00a0'), body: body,
      foot: '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button><a class="pn-btn pn-btn--ink" href="' + esc(UI.link('programs', 'tab=camps&session=' + id)) + '" autofocus>Open in Programs</a>' });
  }

  function stripKeys(e) {
    var t = e.target.closest && e.target.closest('[data-camp]'); if (!t) return;
    var k = e.key;
    if (k === 'Enter' || k === ' ') { e.preventDefault(); tipHide(); openCamp(t.getAttribute('data-camp')); return; }
    var all = $$('[data-camp]', t.ownerSVGElement), i = all.indexOf(t), j = -1;
    if (k === 'ArrowRight') j = Math.min(all.length - 1, i + 1); else if (k === 'ArrowLeft') j = Math.max(0, i - 1);
    else if (k === 'Home') j = 0; else if (k === 'End') j = all.length - 1; else return;
    e.preventDefault(); t.setAttribute('tabindex', '-1'); all[j].setAttribute('tabindex', '0'); all[j].focus();
  }

  /* ---------- Registrations within programs ---------- */
  function renderPrograms(ctx) {
    var box = $('[data-db-programs]'); if (!box) return;
    var P = ctx.programs, max = 0, tot = 0;
    P.forEach(function (x) { max = Math.max(max, x.reg); tot += x.reg; });
    var sum = $('[data-db-prog-sum]'); if (sum) sum.textContent = n(tot) + ' registrations over the terms since Fall 2025. Choose a program for its terms.';
    box.innerHTML = '<ul class="db-hbars db-hbars--rows">' + P.map(function (x, i) {
      var fill = pct(x.reg, x.cap), w = max ? Math.max(1.5, x.reg / max * 100) : 0;
      var bits = [plural(x.terms.length - x.pending.length, 'term'), fill + '% of seats filled'];
      if (x.wait) bits.push(n(x.wait) + ' waiting');
      return '<li><button type="button" class="db-prow" data-prog="' + i + '"' + attr({ 'data-tip-v': n(x.reg) + ' registrations', 'data-tip-l': x.p.id + '\n' + n(x.reg) + ' of ' + n(x.cap) + ' seats, ' + fill + '%' + (x.wait ? '\n' + x.wait + ' waiting' : '') }) + '>' +
        '<span class="db-hbar__label">' + esc(x.p.id) + '<span class="pn-sub">' + esc(x.p.note + '. ' + bits.join(', ')) + (x.pending.length ? '. Next term: dates to confirm' : '') + '</span></span>' +
        '<span class="db-hbar__track"><span class="db-hbar__fill" style="width:' + w.toFixed(2) + '%"></span></span>' +
        '<span class="db-hbar__val pn-num">' + n(x.reg) + '</span>' + UI.icon('chevron', 'icon--16 db-prow__go') + '</button></li>';
    }).join('') + '</ul>';
    var rows = [];
    P.forEach(function (x) { x.terms.forEach(function (t) { rows.push([x.p.id, t.name, t.status === 'draft' ? { html: UI.confirmSlot(Object.keys(t.gaps).join(', ') || 'Term dates') } : n(t.reg), t.status === 'draft' ? '' : n(t.cap), t.status === 'draft' ? '' : pct(t.reg, t.cap) + '%', n(t.wait)]); }); });
    tableView($('[data-db-prog-table]'), 'Table view: registrations by program and term', [{ t: 'Program' }, { t: 'Term' }, { t: 'Registered', num: true }, { t: 'Seats (sample)', num: true }, { t: 'Filled', num: true }, { t: 'Waiting', num: true }], rows, 'Registrations by program and term');
  }

  function openProgram(i) {
    var x = programStats()[i]; if (!x) return;
    var maxCap = 0; x.terms.forEach(function (t) { maxCap = Math.max(maxCap, t.cap, t.reg); });
    var body = '<p class="db-sheet__lede">' + esc(x.p.note + '. ' + n(x.reg) + ' registrations, ' + pct(x.reg, x.cap) + '% of seats filled.') + '</p>' +
      '<h3 class="db-sheet__h">Term by term</h3>' + hbars(x.terms.filter(function (t) { return t.status !== 'draft'; }).map(function (t) {
        return { label: t.name, sub: esc(plural(t.sessions, 'class', 'classes') + (t.start ? ', from ' + F.day(t.start) : '')), value: t.reg, max: maxCap, text: t.reg + ' of ' + t.cap, tipV: t.reg + ' of ' + t.cap + ' seats', tipL: t.name + (t.wait ? '\n' + t.wait + ' waiting' : '') };
      }));
    x.pending.forEach(function (t) {
      body += '<div class="db-pending"><p><strong>' + esc(t.name) + '</strong> ' + UI.chip('draft') + '</p><p>' + UI.confirmSlot(Object.keys(t.gaps).join(', ') || 'Term dates and prices') + '</p><p class="pn-muted db-small">' + plural(t.sessions, 'class', 'classes') + ' drafted; registrations open once the club publishes the term.</p></div>';
    });
    body += '<p class="pn-note">' + UI.icon('alert', 'icon--16') + '<span>Seat counts are sample capacities; class names, ages, levels and terms are the club’s own.</span></p>';
    UI.sheet.open({ kicker: 'Registrations within programs', title: x.p.id, body: body, wide: true,
      foot: '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button><a class="pn-btn pn-btn--ink" href="' + esc(UI.link('programs', 'tab=' + (PROGRAM_TAB[x.p.id] || 'junior') + '&program=' + encodeURIComponent(x.p.id))) + '" autofocus>Open in Programs</a>' });
  }

  /* ---------- Renewals: the indoor 2026/27 roll since registration opened ---------- */
  var lineState = { idx: -1 };
  function niceMax(v) { var steps = [10, 20, 40, 60, 80, 100, 120, 160, 200, 240, 300, 400, 500]; for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i]; return Math.ceil(v / 100) * 100; }

  function lineSvg(m, width) {
    var W = Math.max(280, width), padL = 34, padR = 92, top = 26, plotH = 180, axisH = 24;
    var S = m.series, N = S.length, maxV = niceMax(Math.max(m.outdoorCount, S.length ? S[N - 1].total : 0));
    var X = function (i) { return padL + (W - padL - padR) * (N > 1 ? i / (N - 1) : 0); };
    /* reminder batch labels, placed from the right: a label that would run into a later batch's
       rule or label moves up a row, so no rule ever crosses a label (review fix, 390px) */
    var marks = [], placed = [];
    Object.keys(m.reminders).sort().reverse().forEach(function (iso) {
      var i = -1; S.forEach(function (p, k) { if (p.iso === iso) i = k; }); if (i < 0) return;
      var q = (m.remindersQueued || {})[iso] || 0, label = m.reminders[iso] + (q === m.reminders[iso] ? ' queued' : ' reminders');
      var end = X(i) + 4 + label.length * 6.2, row = 0;
      while (placed.some(function (o) { return o.row >= row && o.x < end + 6; })) row++;
      placed.push({ x: X(i), row: row }); marks.push({ i: i, label: label, row: row });
    });
    var rows = marks.reduce(function (r, k) { return Math.max(r, k.row); }, 0);
    top += rows * 16;
    var H = top + plotH + axisH;
    var Y = function (v) { return top + plotH - plotH * v / maxV; };
    var s = '<svg class="db-line" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">';
    [0, 0.5, 1].forEach(function (f) { var v = Math.round(maxV * f), y = Y(v); s += '<line class="' + (f === 0 ? 'db-base' : 'db-grid') + '" x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"/><text class="db-axis" x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + v + '</text>'; });
    /* the outdoor 2026 roll as the target line */
    var ty = Y(m.outdoorCount);
    s += '<line class="db-target" x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty + '"/><text class="db-axis db-axis--end" x="' + (W - padR + 6) + '" y="' + (ty + 4) + '">' + m.outdoorCount + ' outdoor</text>';
    S.forEach(function (p, i) {
      if (p.d.getDate() === 1) s += '<text class="db-axis" x="' + X(i) + '" y="' + (top + plotH + 17) + '" text-anchor="' + (i === 0 ? 'start' : 'middle') + '">' + MON[p.d.getMonth()] + ' 1</text>';
    });
    /* reminder batches, as hairlines */
    marks.forEach(function (k) {
      var ly = top - 10 - k.row * 16;
      s += '<line class="db-mark-rule" x1="' + X(k.i) + '" y1="' + (ly + 4) + '" x2="' + X(k.i) + '" y2="' + (top + plotH) + '"/><text class="db-axis db-axis--note" x="' + (X(k.i) + 4) + '" y="' + ly + '">' + esc(k.label) + '</text>';
    });
    var path = function (key) { return S.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p[key]).toFixed(1); }).join(''); };
    s += '<path class="db-line__ret" d="' + path('ret') + '"/><path class="db-line__tot" d="' + path('total') + '"/>';
    var last = S[N - 1] || { total: 0, ret: 0 };
    var yT = Y(last.total), yR = Y(last.ret); if (Math.abs(yT - yR) < 14) yR = yT + 14;
    s += '<circle class="db-line__dot" cx="' + X(N - 1) + '" cy="' + Y(last.total) + '" r="4"/><circle class="db-line__dot db-line__dot--ret" cx="' + X(N - 1) + '" cy="' + Y(last.ret) + '" r="4"/>';
    s += '<text class="db-endlabel" x="' + (X(N - 1) + 8) + '" y="' + (yT + 4) + '">' + last.total + ' members</text><text class="db-endlabel db-endlabel--muted" x="' + (X(N - 1) + 8) + '" y="' + (yR + 4) + '">' + last.ret + ' renewing</text>';
    s += '<line class="db-cross" x1="0" x2="0" y1="' + top + '" y2="' + (top + plotH) + '" visibility="hidden"/>';
    s += '<rect class="db-line__hit" x="' + padL + '" y="' + top + '" width="' + (W - padL - padR) + '" height="' + plotH + '"/>';
    lineState.geo = { X: X, N: N, padL: padL, padR: padR, W: W };
    return s + '</svg>';
  }

  function renderMembers(ctx) {
    var box = $('[data-db-members]'); if (!box) return;
    var m = ctx.members, width = box.clientWidth || 640;
    var acts = $('[data-db-mem-actions]');
    if (acts) {
      var can = UI.can('members.remind');
      acts.innerHTML = '<a class="pn-btn pn-btn--quiet pn-btn--sm" href="' + esc(UI.link('members', 'view=renewals')) + '">Renewals due (' + n(m.due) + ')</a>' +
        '<button class="pn-btn pn-btn--ink pn-btn--sm" type="button" data-db-remind' + (can ? '' : ' aria-disabled="true" title="' + esc(remindWho()) + ' only"') + '>Queue renewal reminders</button>';
    }
    var lineW = width >= 900 ? Math.round(width * 0.6) : width;
    var last = m.series[m.series.length - 1] || { total: 0, ret: 0 };
    var rate = pct(m.renewed, m.outdoorCount);
    var html = '<div class="db-mem__grid"><div class="db-mem__chart">' +
      '<div class="db-legend" aria-hidden="true"><span class="db-legend__item"><span class="db-key db-key--tot"></span>Indoor members (households)</span><span class="db-legend__item"><span class="db-key db-key--ret"></span>Of them, renewing from outdoor 2026</span><span class="db-legend__item"><span class="db-key db-key--target"></span>Outdoor 2026 households</span></div>' +
      '<div class="db-linebox" tabindex="0" role="group" data-db-line aria-label="' + esc('Indoor 2026/27 memberships by day since registration opened on ' + F.day(m.opened) + ': ' + last.total + ' households now, ' + last.ret + ' renewing. Left and right arrows read each day.') + '">' + lineSvg(m, lineW) + '</div>' +
      '<p class="sr-only" aria-live="polite" data-db-line-live></p></div>' +
      '<div class="db-mem__side"><div class="db-score" role="group" aria-label="' + esc('Renewals: ' + m.renewed + ' of ' + m.outdoorCount + ' outdoor households, ' + rate + ' percent') + '">' +
      '<p class="db-score__label">Renewed from outdoor 2026</p><p class="db-score__value"><span class="pn-money">' + n(m.renewed) + '</span><span class="db-score__of"> of ' + n(m.outdoorCount) + '</span></p>' +
      '<div class="pn-meter" role="img" aria-label="' + esc(rate + '% renewed') + '"><span class="pn-meter__fill" style="width:' + rate + '%"></span></div>' +
      '<dl class="pn-dl db-score__dl"><div><dt>New to the club this season</dt><dd>' + n(m.newCount) + '</dd></div><div><dt>Renewals due</dt><dd>' + n(m.due) + '</dd></div><div><dt>Indoor waitlist</dt><dd>' + n(m.waiting) + ' waiting</dd></div><div><dt>Refunded</dt><dd>' + n(m.refunded) + '</dd></div></dl>' +
      '<p class="pn-muted db-small">Registration opened ' + esc(F.day(m.opened)) + '. Returning outdoor members take $' + (D.content.membership.indoor.returning_amount || 25) + ' off (not Intercounty).</p></div></div></div>';
    html += '<div class="pn-table-wrap db-cats" tabindex="0" role="region" aria-label="Indoor 2026/27 memberships by category"><table class="pn-table"><thead><tr><th scope="col">Category</th><th scope="col" class="is-num">Resident</th><th scope="col" class="is-num">Non-resident</th><th scope="col" class="is-num">Households</th><th scope="col" class="is-num">Collected</th></tr></thead><tbody>' +
      m.cats.map(function (k) {
        if (!k) return '';
        return '<tr><th scope="row">' + esc(k.c.label) + '<span class="pn-sub">' + esc(k.c.note) + '</span></th><td class="is-num pn-money">' + esc(money(k.c.resident)) + '</td><td class="is-num pn-money">' + esc(money(k.c.nonResident)) + '</td><td class="is-num">' + n(k.r + k.nr) + '<span class="pn-sub">' + n(k.r) + ' resident, ' + n(k.nr) + ' non-resident</span></td><td class="is-num pn-money">' + esc(money(k.total)) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="pn-muted db-small">Prices are the club’s 2026/27 indoor rates before HST; resident rates include the 15% Vaughan discount. Collected amounts include 13% HST and the returning discount.</p>';
    box.innerHTML = html;
    var weekly = m.series.filter(function (p, i) { return p.d.getDay() === 1 || i === m.series.length - 1; });
    tableView($('[data-db-mem-table]'), 'Table view: indoor memberships week by week', [{ t: 'Date' }, { t: 'Indoor members', num: true }, { t: 'Renewing', num: true }, { t: 'New', num: true }],
      weekly.map(function (p) { return [F.day(p.iso), n(p.total), n(p.ret), n(p.total - p.ret)]; }), 'Indoor memberships week by week');
  }

  function lineAt(i) {
    var m = currentCtx && currentCtx.members, g = lineState.geo; if (!m || !g) return;
    var box = $('[data-db-line]'); if (!box) return;
    i = Math.max(0, Math.min(m.series.length - 1, i)); lineState.idx = i;
    var p = m.series[i], x = g.X(i), cross = box.querySelector('.db-cross');
    if (cross) { cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible'); }
    box.setAttribute('data-tip-v', p.total + ' indoor members');
    box.setAttribute('data-tip-l', F.day(p.iso) + '\n' + p.ret + ' renewing, ' + (p.total - p.ret) + ' new');
    var live = $('[data-db-line-live]'); if (live) live.textContent = F.day(p.iso) + ': ' + p.total + ' members, ' + p.ret + ' renewing.';
  }
  function linePointer(e) {
    var box = e.currentTarget, g = lineState.geo; if (!g) return;
    var svg = box.querySelector('svg'), r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (g.W / r.width);
    var i = Math.round((x - g.padL) / ((g.W - g.padL - g.padR) / Math.max(1, g.N - 1)));
    lineAt(i); tipShow(box, e);
  }

  /* ---------- Revenue by line ---------- */
  function renderRevenue(ctx) {
    var box = $('[data-db-revenue]'); if (!box) return;
    var r = ctx.revenue, max = 0, width = box.clientWidth || 640;
    r.lines.forEach(function (l) { max = Math.max(max, l.net); });
    var sum = $('[data-db-rev-sum]'); if (sum) sum.textContent = money(r.total) + ' net of refunds, January to ' + F.day(todayIso()) + '.';
    var bars = hbars(r.lines.map(function (l) {
      return { label: l.L.name, sub: esc(l.L.tax + ', ' + plural(l.count, 'payment') + (l.refunded ? ', ' + money(l.refunded) + ' refunded' : '')), value: l.net, max: max, text: moneyShort(l.net), tipV: money(l.net), tipL: l.L.name + ', net of refunds\n' + (l.hst ? 'HST ' + money(l.hst) + (l.L.id === 'court' ? ' inside the fees' : ' added') : 'No HST added') };
    }));
    var colW = width >= 900 ? Math.round(width * 0.48) : width;
    box.innerHTML = '<div class="db-rev"><div class="db-rev__bars"><h3 class="db-card__h">By line, net of refunds</h3>' + bars +
      '<ul class="db-rev__gaps"><li><strong>Leagues and round robins</strong><span class="pn-sub">' + n(currentCtx.programs.filter(function (x) { return x.p.id === 'Leagues' || x.p.id === 'Round Robins'; }).reduce(function (s, x) { return s + x.reg; }, 0)) + ' registered at the published fees; the demo holds no payment records for them yet.</span></li>' +
      '<li><strong>Group lessons and High Performance</strong><span class="pn-sub">' + UI.confirmSlot('Group lesson and High Performance prices') + '</span></li></ul></div>' +
      '<div class="db-rev__months"><h3 class="db-card__h">By month</h3><div class="db-monthbox">' + monthSvg(r.months, colW) + '</div><p class="pn-muted db-small">' + esc(MON[today().getMonth()] + ' is to date, in the lighter step. Camp registration opened Feb 16.' + (function () { var z = r.months.filter(function (m) { return m.none; }).map(function (m) { return MON[F.parse(m.key + '-01').getMonth()]; }); return z.length ? ' ' + z.join(' and ') + ': no payment records in the sample data.' : ''; })()) + '</p></div></div>';
    tableView($('[data-db-rev-table]'), 'Table view: revenue by line and by month', [{ t: 'Line' }, { t: 'Tax' }, { t: 'Payments', num: true }, { t: 'Collected', num: true }, { t: 'Refunded', num: true }, { t: 'Net', num: true }, { t: 'HST in net', num: true }],
      r.lines.map(function (l) { return [l.L.name, l.L.tax, n(l.count), money(l.gross), money(l.refunded), money(l.net), l.hst ? money(l.hst) : 'none added']; })
        .concat(r.months.map(function (mo) { var d = F.parse(mo.key + '-01'); return [MON[d.getMonth()] + ' 2026', 'all lines', '', '', '', mo.none ? 'no records' : money(mo.net), '']; })), 'Revenue by line and by month');
  }

  function monthSvg(months, width) {
    var W = Math.max(260, width), padL = 44, top = 22, plotH = 150, axisH = 22, H = top + plotH + axisH;
    var max = 0; months.forEach(function (m) { max = Math.max(max, m.net); });
    var nice = Math.ceil(max / 20000) * 20000 || 1, slot = (W - padL) / Math.max(1, months.length), bw = Math.min(24, slot - 6);
    var s = '<svg class="db-months" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Net revenue by month, 2026. Arrow keys move between months.">';
    [0, 0.5, 1].forEach(function (f) { var y = top + plotH - plotH * f; s += '<line class="' + (f ? 'db-grid' : 'db-base') + '" x1="' + padL + '" y1="' + y + '" x2="' + W + '" y2="' + y + '"/><text class="db-axis" x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + (f ? '$' + Math.round(nice * f / 1000) + 'K' : '0') + '</text>'; });
    var maxI = -1; months.forEach(function (m, i) { if (m.net === max) maxI = i; });
    months.forEach(function (m, i) {
      var d = F.parse(m.key + '-01'), cx = padL + slot * i + slot / 2, h = Math.max(m.net > 0 ? 2 : 0, plotH * m.net / nice), cur = i === months.length - 1 && m.key === todayIso().slice(0, 7);
      var lines = m.none ? 'No payment records in the sample data' : Object.keys(m.by).map(function (k) { var L = LINES.filter(function (x) { return x.id === k; })[0]; return (L ? L.name : k) + ' ' + money(m.by[k]); }).join('\n');
      s += '<g class="db-col' + (cur ? ' is-current' : '') + '"' + attr({ role: 'img', tabindex: i === 0 ? 0 : -1, 'data-month': i, 'aria-label': MON[d.getMonth()] + ' 2026: ' + (m.none ? 'no payment records' : money(m.net)) + (cur ? ' to date' : ''), 'data-tip-v': money(m.net), 'data-tip-l': MON[d.getMonth()] + ' 2026' + (cur ? ', to date' : '') + '\n' + lines }) + '>' +
        '<rect class="db-col__hit" x="' + (cx - slot / 2) + '" y="' + top + '" width="' + slot + '" height="' + plotH + '"/>' + (m.none ? '<line class="db-col__none" x1="' + (cx - bw / 2) + '" x2="' + (cx + bw / 2) + '" y1="' + (top + plotH - 3) + '" y2="' + (top + plotH - 3) + '"/>' : '<path class="db-col__bar" d="' + colPath(cx - bw / 2, top + plotH - h, bw, h) + '"/>') + '</g>';
      s += '<text class="db-axis" x="' + cx + '" y="' + (top + plotH + 16) + '" text-anchor="middle">' + MON[d.getMonth()] + '</text>';
      if (i === maxI || cur) s += '<text class="db-endlabel" x="' + cx + '" y="' + (top + plotH - h - 6) + '" text-anchor="middle">' + esc(moneyShort(m.net)) + '</text>';
    });
    return s + '</svg>';
  }

  /* ---------- Sources ---------- */
  function renderSources() {
    var box = $('[data-db-sources]'); if (!box) return;
    var facts = [
      ['The four courts, the dome’s hours and the fee bands', '/court-bookings/ and /club-policies/'],
      ['Seasons: outdoor about May 1 to Sep 30; indoor from early October (likely Oct 12) to Apr 25', (D.seasons.map(function (s) { return s.src; }).join(' and '))],
      ['Indoor 2026/27 membership prices, resident and non-resident, $25 returning discount', '/memberships/'],
      ['Summer Camps 2026: four camps, three locations, weekly sessions and price tiers', '/camps/'],
      ['Programs, classes, ages and levels; leagues and round robins with their fees', '/programs-overview/'],
      ['Refund policies and the $' + (D.refundPolicy && D.refundPolicy.admin_fee || 50) + ' administration fee', '/club-policies/']
    ];
    box.innerHTML = '<div class="pn-grid pn-grid--2 db-src"><div><h3 class="db-card__h">The club’s own facts</h3><ul class="db-src__list">' + facts.map(function (f) { return '<li>' + esc(f[0]) + '<span class="pn-sub">From ' + esc(f[1]) + '</span></li>'; }).join('') + '</ul></div>' +
      '<div><h3 class="db-card__h">Sample data <span class="pn-sample">Sample data</span></h3><ul class="db-src__list"><li>People, households, bookings, registrations, payments, refunds and reminders are fictional, generated the same way on every load.<span class="pn-sub">No real member, coach or staff name appears; staff appear by role.</span></li><li>Seat capacities are sample numbers.<span class="pn-sub">The club sets real capacities.</span></li><li>Amounts are computed from the club’s real fees and prices in CAD, with 13% HST where the club’s prices exclude it.</li><li>' + esc(D.clock.note) + '</li></ul></div></div>';
  }

  /* ---------- Export: a CSV built in this browser from what is on screen ---------- */
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCsv() {
    var c = currentCtx; if (!c) return;
    var rows = [['Thornhill Park Tennis Club staff panel (demo). Sample data. Built ' + F.day(todayIso())], []];
    rows.push(['Court usage, this week in the dome'], ['Date', 'Start', 'Fee band', 'Courts booked of 4']);
    c.week.days.forEach(function (d) { d.starts.forEach(function (s) { var x = d.cells[s]; rows.push([d.iso, F.time(s), x.band, x.courts]); }); });
    rows.push([], ['Summer Camps 2026'], ['Camp', 'Location', 'Week', 'Week of', 'Registered', 'Capacity (sample)', 'Full']);
    c.camps.lines.forEach(function (L) { L.weeks.forEach(function (w) { rows.push([L.line.name, L.line.where, w.s.week, w.s.start, w.st.registered, w.st.capacity, w.st.full ? 'yes' : 'no']); }); });
    rows.push([], ['Registrations within programs'], ['Program', 'Term', 'Registered', 'Seats (sample)', 'Waiting']);
    c.programs.forEach(function (x) { x.terms.forEach(function (t) { rows.push([x.p.id, t.name, t.status === 'draft' ? 'club to confirm' : t.reg, t.status === 'draft' ? '' : t.cap, t.wait]); }); });
    rows.push([], ['Indoor 2026/27 memberships'], ['Outdoor 2026 households', 'Renewed', 'New', 'Renewals due', 'Indoor waitlist'], [c.members.outdoorCount, c.members.renewed, c.members.newCount, c.members.due, c.members.waiting]);
    rows.push([], ['Revenue by line, 2026 to date (CAD)'], ['Line', 'Tax', 'Payments', 'Collected', 'Refunded', 'Net', 'HST in net']);
    c.revenue.lines.forEach(function (l) { rows.push([l.L.name, l.L.tax, l.count, l.gross.toFixed(2), l.refunded.toFixed(2), l.net.toFixed(2), l.hst.toFixed(2)]); });
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    try {
      var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'tptc-dashboard-sample-' + todayIso() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      UI.toast('CSV saved to your downloads. Built in this browser from the sample data; nothing left this device.');
    } catch (e) { UI.toast('This browser blocked the download. The table views hold the same numbers.', { kind: 'warn' }); }
  }

  /* ---------- The Monday digest: what a weekly email to the board could say ---------- */
  function digestText(c) {
    var campReg = 0, campCap = 0, full = 0, weeks = 0;
    c.camps.lines.forEach(function (L) { campReg += L.reg; campCap += L.cap; full += L.full; weeks += L.weeks.length; });
    var b = c.week.bands, busiest = null;
    c.week.days.forEach(function (d) { var x = 0, s = 0; d.starts.forEach(function (st) { x += d.cells[st].courts; s += 4; }); if (!busiest || x / s > busiest.r) busiest = { d: d, r: x / s }; });
    return [
      'Thornhill Park Tennis Club, week of ' + F.day(todayIso()) + ' (sample data)',
      '',
      'Courts: ' + pct(c.week.booked, c.week.slots) + '% of court hours in the dome are booked this week (' + n(c.week.booked) + ' of ' + n(c.week.slots) + '). Prime time ' + pct(b.prime.b, b.prime.s) + '%, weekends ' + pct(b.weekend.b, b.weekend.s) + '%, regular time ' + pct(b.regular.b, b.regular.s) + '%. Busiest day: ' + F.day(busiest.d.iso) + '.',
      'Memberships: ' + n(c.members.active) + ' indoor households; ' + n(c.members.renewed) + ' of ' + n(c.members.outdoorCount) + ' outdoor households renewed (' + pct(c.members.renewed, c.members.outdoorCount) + '%), ' + n(c.members.due) + ' still due, ' + n(c.members.waiting) + ' on the indoor waitlist.',
      'Programs: leagues and round robins are full with ' + n(c.programs.filter(function (x) { return x.p.id === 'Leagues' || x.p.id === 'Round Robins'; }).reduce(function (s, x) { return s + x.wait; }, 0)) + ' waiting. Fall & Winter group lesson dates are still to confirm.',
      'Summer Camps 2026 closed at ' + pct(campReg, campCap) + '% of seats, with ' + full + ' of ' + weeks + ' camp weeks full.',
      'Revenue 2026 to date: ' + money(c.revenue.total) + ' net of refunds.'
    ].join('\n');
  }
  function openDigest() {
    var c = currentCtx; if (!c) return;
    var text = digestText(c);
    UI.sheet.open({ kicker: 'Monday digest', title: 'What the board would read', wide: true,
      body: '<p class="db-sheet__lede">A plain summary of this dashboard, the kind a live panel could email each Monday. In the demo nothing is sent.</p><pre class="db-digest" tabindex="0" aria-label="Digest text">' + esc(text) + '</pre>',
      foot: '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button><button class="pn-btn pn-btn--ink" type="button" data-db-copy autofocus>Copy the text</button>' });
    var el = UI.sheet.el(), btn = el && el.querySelector('[data-db-copy]');
    if (btn) btn.addEventListener('click', function () {
      var done = function () { UI.toast('Digest copied. Nothing was emailed.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { UI.toast('Copy was blocked; select the text and copy it yourself.', { kind: 'warn' }); });
      else UI.toast('Copy is not available here; select the text and copy it yourself.', { kind: 'warn' });
    });
  }

  /* ---------- Renewal reminders: recorded in the demo, never sent ---------- */
  function queueReminders() {
    if (!UI.can('members.remind')) { UI.toast(remindWho() + ' only. Your role can read the renewals.', { kind: 'warn' }); return; }
    var due = D.renewalsDue(); if (!due.length) { UI.toast('No renewals are due.'); return; }
    UI.confirm({ title: 'Queue reminders for ' + plural(due.length, 'household') + '?', body: '<p>The demo records a pending renewal reminder against each household that held an outdoor 2026 membership and has not renewed. No email is sent.</p>', confirm: 'Queue ' + due.length + ' reminders', cancel: 'Not now' }).then(function (yes) {
      if (!yes) return;
      var ids = [], at = new Date().toISOString();
      batching = true;
      due.forEach(function (h) {
        var r = D.reminders.add({ personId: h.primaryId, householdId: h.id, kind: 'renewal', channel: 'email', at: at, status: 'pending', demo: true }, 'Queued a renewal reminder for the ' + h.name + ' (demo, not sent)');
        if (r && r.id) ids.push(r.id);
      });
      batching = false; schedule();
      UI.toast(plural(ids.length, 'reminder') + ' queued for renewals due. Not sent in the demo.', { action: { label: 'Undo', run: function () { batching = true; ids.forEach(function (id) { D.reminders.remove(id, 'Removed a queued renewal reminder'); }); batching = false; schedule(); UI.toast('Reminders removed.'); } } });
    });
  }

  /* ---------- Render, and re-render on any change in the demo ---------- */
  var currentCtx = null, batching = false, pending = false;
  function build() {
    return { week: indoorWeek(), camps: campLines(), programs: programStats(), members: membershipStats(), revenue: revenueStats() };
  }
  function render() {
    pending = false;
    currentCtx = build();
    var asof = $('[data-db-asof]');
    if (asof) asof.innerHTML = UI.icon('clock', 'icon--16') + '<span>As of ' + esc(F.long(today())) + ', ' + esc(F.time(D.clock.nowMin)) + (D.clock.shifted ? ' on the demo clock, the likely first indoor day (club to confirm), at the real time of day.' : '.') + ' Figures recompute from the sample data on every change made in the demo.</span>';
    renderKpis(currentCtx); renderCourts(currentCtx); renderCamps(currentCtx); renderPrograms(currentCtx); renderMembers(currentCtx); renderRevenue(currentCtx); renderSources();
  }
  function schedule() {
    if (batching || pending) return;
    pending = true;
    (window.requestAnimationFrame || setTimeout)(render);
  }

  function setMode(mode, focus) {
    if (mode === courtMode) return;
    courtMode = mode;
    try { localStorage.setItem('tptc-panel-dashboard-courts', mode); } catch (e) { /* convenience only */ }
    tipHide(); renderCourts(currentCtx);
    if (focus) { var t = $('[data-db-season="' + mode + '"]'); if (t) t.focus(); }
  }

  function wire() {
    var tabs = $('[data-db-court-tabs]');
    if (tabs) {
      tabs.addEventListener('click', function (e) { var t = e.target.closest('[data-db-season]'); if (t) setMode(t.getAttribute('data-db-season')); });
      tabs.addEventListener('keydown', function (e) {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0) return;
        e.preventDefault();
        var next = e.key === 'Home' ? 'indoor' : e.key === 'End' ? 'outdoor' : (courtMode === 'indoor' ? 'outdoor' : 'indoor');
        setMode(next, true);
      });
    }
    var main = $('#main');
    main.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-cell]'))) { tipHide(); openCell(t.getAttribute('data-cell')); return; }
      if ((t = e.target.closest('[data-camp]'))) { tipHide(); openCamp(t.getAttribute('data-camp')); return; }
      if ((t = e.target.closest('[data-prog]'))) { tipHide(); openProgram(+t.getAttribute('data-prog')); return; }
      if (e.target.closest('[data-db-remind]')) { queueReminders(); return; }
      if (e.target.closest('[data-db-export]')) { exportCsv(); return; }
      if (e.target.closest('[data-db-digest]')) { openDigest(); return; }
    });
    main.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t.getAttribute && t.getAttribute('data-cell')) return heatKeys(e);
      if (t.closest && t.closest('[data-camp]')) return stripKeys(e);
      if (t.getAttribute && t.getAttribute('data-month') != null) {
        var all = $$('[data-month]', t.ownerSVGElement), i = all.indexOf(t), j = -1;
        if (e.key === 'ArrowRight') j = Math.min(all.length - 1, i + 1); else if (e.key === 'ArrowLeft') j = Math.max(0, i - 1); else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = all.length - 1; else return;
        e.preventDefault(); t.setAttribute('tabindex', '-1'); all[j].setAttribute('tabindex', '0'); all[j].focus(); return;
      }
      if (t.hasAttribute && t.hasAttribute('data-db-line')) {
        var m = currentCtx.members, idx = lineState.idx < 0 ? m.series.length - 1 : lineState.idx;
        if (e.key === 'ArrowRight') idx++; else if (e.key === 'ArrowLeft') idx--; else if (e.key === 'Home') idx = 0; else if (e.key === 'End') idx = m.series.length - 1;
        else if (e.key === 'PageUp') idx -= 7; else if (e.key === 'PageDown') idx += 7; else return;
        e.preventDefault(); lineAt(idx); tipShow(t);
      }
    });
    main.addEventListener('pointermove', function (e) { var b = e.target.closest && e.target.closest('[data-db-line]'); if (b && e.pointerType !== 'touch') linePointer({ currentTarget: b, clientX: e.clientX, clientY: e.clientY }); });
    main.addEventListener('pointerdown', function (e) { var b = e.target.closest && e.target.closest('[data-db-line]'); if (b) linePointer({ currentTarget: b, clientX: e.clientX, clientY: e.clientY }); });
    main.addEventListener('pointerleave', function () { var x = $('.db-cross'); if (x) x.setAttribute('visibility', 'hidden'); tipHide(); }, true);
    main.addEventListener('focusin', function (e) { if (e.target.hasAttribute && e.target.hasAttribute('data-db-line')) { lineAt(lineState.idx < 0 ? currentCtx.members.series.length - 1 : lineState.idx); tipShow(e.target); } });

    window.addEventListener('panel:change', function (e) {
      var col = e.detail && e.detail.collection;
      if (col === '*' || col === 'bookings') outdoorCache = null;
      schedule();
    });
    var lastW = 0, rt = null;
    function onResize() { var w = main.clientWidth; if (Math.abs(w - lastW) < 8) return; lastW = w; clearTimeout(rt); rt = setTimeout(function () { tipHide(); render(); }, 120); }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(main); else window.addEventListener('resize', onResize);
    lastW = main.clientWidth;
  }

  render();
  wire();
})();
