/* Programs, camps and seats (owned by the programs module agent; contract in ../PANEL.md).
   Sessions, capacity, rosters, waitlists with promote, Pro National pre-approval, attendance.
   Dates, ages, levels, locations and prices are the club's own (D.content, D.sessions); every
   person, seat count and mark is sample data. Nothing is saved to a server and nothing is charged:
   changes go through the PanelData overlay in this browser, so Reset demo undoes them. */
(function () {
  'use strict';
  var D = window.PanelData, UI = window.PanelUI;
  if (!D || !UI) return;

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = UI.esc, icon = UI.icon, fmt = D.fmt, C = D.content;
  var TODAY = D.today(), T = fmt.iso(TODAY);
  var KEY = 'tptc-panel-programs-';
  function keep(k, v) { try { if (v == null) return localStorage.getItem(KEY + k); localStorage.setItem(KEY + k, v); } catch (e) { return null; } return null; }
  function say(msg) { var l = $('[data-pg-live]'); if (l) { l.textContent = ''; setTimeout(function () { l.textContent = msg; }, 30); } }

  /* ---------- The club's facts this module needs that facts.js does not carry (sources named) ---------- */
  var FACTS = {
    /* /camps/: "North Thornhill Session 1 starts week of: June 29th - July 3rd, 2026 (July 1st Holiday - no class)";
       the Garnet Williams camps say the same. data.js builds North Thornhill from Jun 15 (request 1), so weeks
       before Jun 29 are not shown here. */
    ntFirst: '2026-06-29',
    canadaDay: '2026-07-01',
    holidayAt: ['North Thornhill Community Centre', 'Garnet Williams Community Centre'],
    /* /high-performance-program/ pathway, ball and court per step */
    hp: [
      { name: 'Little Champs', who: 'Ages 6-9', court: 'three', ball: '3/4 court, orange ball or green dot ball', goal: 'Looking to compete or competing in OTA tournaments at U9 or U10 events' },
      { name: 'Transition Tour', who: 'Ages 10-15', court: 'full', ball: 'Full court, regular ball', goal: 'Competing in Provincial events such as Future Stars and Rookies' },
      { name: 'Pro National', who: 'Provincial and national level players only', court: null, ball: null, goal: 'Highest level of training we offer. Pre-approval by the Head Pro.' }
    ],
    /* /programs-and-lessons/: progressive training, the court grows with the child */
    stage: { 'Ages 4-6': ['half', 'Half court'], 'Ages 7-9': ['three', '3/4 court'], 'Ages 10-13': ['full', 'Full court'], 'Ages 14-17': ['full', 'Full court'], Adults: ['full', 'Full court'] },
    lessonPolicy: (C.programs && C.programs.lesson_cancellation) || ''
  };
  var GLOSS = '<span class="pg-gloss"><dfn>OTA</dfn>: the Ontario Tennis Association. <dfn>U9, U10</dfn>: under 9 and under 10 age groups. <dfn>Orange and green dot balls</dfn> are slower, lower-bouncing balls used before the regular yellow ball.</span>';

  /* ---------- Roles: a disabled action always says who can take it ---------- */
  var WHO = { 'programs.approve': 'Head Pro or Administrator', 'programs.edit': 'Head Pro or Administrator', 'bookings.lesson': 'Head Pro or Administrator',
    'programs.register': 'Front desk, Head Pro or Administrator', 'programs.waitlist': 'Front desk, Head Pro or Administrator', 'payments.refund': 'Administrator' };
  function who(action) { return (WHO[action] || UI.whoCan(action)) + ' only'; }
  /* A button that a role cannot press stays visible, disabled, with its reason */
  function btn(label, attrs, o) {
    o = o || {};
    var off = o.action && !UI.can(o.action) ? who(o.action) : o.off || '';
    var cls = o.cls || 'pn-btn--quiet pn-btn--sm';
    return '<button type="button" class="' + (/^pn-iconbtn/.test(cls) ? cls : 'pn-btn ' + cls) + '" ' + attrs +
      (off ? ' aria-disabled="true" title="' + esc(off) + '" data-pg-why="' + esc(off) + '"' : '') +
      (o.label ? ' aria-label="' + esc(o.label) + '"' : '') + '>' + (o.icon ? icon(o.icon) : '') + esc(label) + '</button>';
  }
  /* aria-disabled buttons explain themselves instead of acting */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-pg-why]');
    if (b) {
      e.stopImmediatePropagation(); e.preventDefault();
      var sh = UI.sheet.el();
      if (sh && sh.open && sh.contains(b) && open) { lastAct = { msg: b.getAttribute('data-pg-why') + '.' }; refreshSheet(); return; }
      UI.toast(b.getAttribute('data-pg-why') + '. ' + (b.getAttribute('data-pg-more') || 'Sign in as another role to try it.'), { kind: 'warn' });
    }
  }, true);

  /* ---------- Court drawings at true proportion (78 x 36 ft, the net in club red with its posts) ----------
     The same geometry as the site's court plans (logs/programs-gen/gen.py): singles sidelines 4.5 ft in,
     service lines 21 ft from the net, posts 3 ft outside the doubles sidelines. Smaller courts keep the
     full court's ratio, the club's words: half court 39 x 18, three-quarter 58.5 x 27. */
  var SCALE = { half: 0.5, three: 0.75, full: 1 };
  function court(stage, o) {
    o = o || {};
    var k = SCALE[stage] || 1, aw = 78 * k, ah = 36 * k, ax = (78 - aw) / 2, ay = (36 - ah) / 2;
    var people = (o.people || []).map(function (p) {
      if (p.kind === 'basket') return '<rect class="who__basket" x="' + (p.x - 1.2) + '" y="' + (p.y - 1.2) + '" width="2.4" height="2.4"/>';
      return '<circle class="who' + (p.kind === 'coach' ? ' who--coach' : '') + '" cx="' + p.x + '" cy="' + p.y + '" r="1.6"/>';
    }).join('');
    return '<svg class="cplan pg-court' + (o.cls ? ' ' + o.cls : '') + '" viewBox="-4 -4.5 86 45" aria-hidden="true" focusable="false">' +
      '<g class="cplan__lines"><rect x="0" y="0" width="78" height="36"/><path d="M0 4.5H78M0 31.5H78M18 4.5V31.5M60 4.5V31.5M18 18H60M0 18H0.6M78 18H77.4"/></g>' +
      (stage ? '<rect class="cplan__area" x="' + ax + '" y="' + ay + '" width="' + aw + '" height="' + ah + '"/>' : '') +
      '<line class="cplan__net" x1="39" y1="-3" x2="39" y2="39"/><circle class="pg-post" cx="39" cy="-3" r="0.9"/><circle class="pg-post" cx="39" cy="39" r="0.9"/>' +
      people + '</svg>';
  }

  /* ---------- Small helpers ---------- */
  function person(id) { return D.people.get(id) || { id: id, name: D.personName(id) || 'Someone', age: null }; }
  function ageOn(p, iso) { return p.born ? (+String(iso || T).slice(0, 4)) - p.born : p.age; }
  function memberHref(pid) { return UI.link('members', 'person=' + encodeURIComponent(pid)); }
  function personCell(pid, extra) {
    var p = person(pid);
    return '<a class="pg-person" href="' + esc(memberHref(pid)) + '">' + esc(p.name) + '</a>' +
      '<span class="pn-sub">' + (p.age != null ? 'Age ' + p.age + ', ' : '') + esc(p.city || '') + (extra ? ', ' + extra : '') + '</span>';
  }
  function dayRange(s) {
    if (!s.start || !s.end) return null;
    var a = fmt.parse(s.start), b = fmt.parse(s.end);
    return fmt.day(s.start) + ' to ' + fmt.day(s.end) + (b.getFullYear() !== TODAY.getFullYear() || a.getFullYear() !== b.getFullYear() ? ', ' + b.getFullYear() : '');
  }
  function gapOf(s, word) {
    var g = (s.gaps || []).filter(function (x) { return x.toLowerCase().indexOf(word) > -1; })[0];
    return g ? UI.confirmSlot(g) : UI.confirmSlot(word);
  }
  /* A league's own fee line on /programs-overview/ (data.js keeps only the number): "$45+HST per session" */
  function squash(t) { return String(t || '').toLowerCase().replace(/[\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function leagueFact(s) {
    var items = Array.isArray(C.leagues) ? C.leagues : (C.leagues && C.leagues.items) || [];
    return items.filter(function (l) { return squash(l.name) === squash(s.title); })[0] || null;
  }
  /* Club ranges read "7:30 - 11:30pm"; the panel writes ranges with a plain hyphen. The spring start date is not the indoor one. */
  function tidyDays(t) { return String(t || '').replace(/\s*\(Season starts [^)]*\)/, '').replace(/(\d)\s*(am|pm)\b/g, '$1$2').replace(/\s+-\s+/g, '-').replace(/\s{2,}/g, ' ').trim(); }
  function priceText(s) {
    if (s.price == null) return gapOf(s, 'price');
    var fee = s.kind === 'league' ? (leagueFact(s) || {}).fee || '' : '';
    var u = /per session/i.test(fee) ? 'session' : s.priceUnit;
    var unit = u ? (u === 'event' ? ' an event' : ' a ' + u) : '';
    var hst = /\+\s*HST/i.test(fee) ? false : s.hstIncluded;
    var tax = hst === true ? 'HST included' : hst === false ? '+ HST' : 'HST not stated';
    return '<span class="pn-money">' + fmt.money(s.price) + '</span>' + esc(unit) + ' <span class="pn-sub pg-inline">' + tax + '</span>';
  }
  function statusChip(s) {
    if (s.status === 'finished' && s.end) return UI.chip('finished', 'Ended ' + fmt.day(s.end));
    if (s.status === 'running') return UI.chip('running', 'Running, ends ' + fmt.day(s.end));
    if (s.status === 'upcoming') return UI.chip('upcoming', 'Starts ' + fmt.day(s.start));
    return UI.chip(s.status);
  }

  /* Seats: registered, held by an offer, open, waiting. Capacity is sample data. */
  function seats(s) {
    var regs = D.registrations.list({ sessionId: s.id, status: 'confirmed' });
    var wl = D.waitlists.list({ sessionId: s.id, list: 'session' });
    var waiting = wl.filter(function (w) { return w.status === 'waiting'; }).sort(byPos);
    var offered = wl.filter(function (w) { return w.status === 'offered'; });
    var cap = s.capacity;
    var open = cap == null ? null : Math.max(0, cap - regs.length - offered.length);
    return { regs: regs, waiting: waiting, offered: offered, cap: cap, open: open, n: regs.length, full: cap != null && open === 0 };
  }
  /* First come, first served: the line is the order people were added (data.js positions follow its fill order, not addedAt) */
  function byPos(a, b) { return String(a.addedAt).localeCompare(String(b.addedAt)); }
  function meter(n, cap, label) {
    if (cap == null) return '';
    var pct = cap ? Math.min(100, Math.round(n / cap * 1000) / 10) : 0;
    return '<div class="pn-meter pg-meter" role="img" aria-label="' + esc(label || (n + ' of ' + cap + ' seats taken')) + '"><span class="pn-meter__fill" style="width: ' + pct + '%"></span></div>';
  }
  function seatLine(s, st) {
    if (s.status === 'draft' && !st.n) return 'Registration not open';
    if (st.cap == null) return st.n + ' registered';
    var parts = [st.n + ' of ' + st.cap];
    if (st.offered.length) parts.push(st.offered.length + ' offered');
    if (s.status === 'finished') parts.push('ended');
    else parts.push(st.open ? st.open + ' open' : 'full');
    if (st.waiting.length) parts.push(st.waiting.length + ' waiting');
    return parts.join(', ');
  }

  /* Sessions this module shows: data.js minus the North Thornhill weeks the club does not publish */
  function shown(s) { return !(s.campId === 'rec-nt' && s.start < FACTS.ntFirst); }
  function sessionsOf(filter) { return D.sessions.list(filter).filter(shown); }

  /* ---------- State, remembered per viewer ---------- */
  var TABS = ['junior', 'adult', 'hp', 'private', 'camps', 'leagues'];
  var q = new URLSearchParams(location.search);
  var state = {
    tab: TABS.indexOf(q.get('tab')) > -1 ? q.get('tab') : (TABS.indexOf(keep('tab')) > -1 ? keep('tab') : 'junior'),
    term: keep('term') || 'gl-sumfall-2026',
    camp: keep('camp') || 'camps-summer-2026'
  };

  /* ---------- At a glance ---------- */
  function lessonsThisWeek() {
    var end = fmt.iso(fmt.addDays(TODAY, 6));
    return D.bookings.list(function (b) { return b.type === 'lesson' && b.date >= T && b.date <= end && b.status !== 'cancelled'; })
      .sort(function (a, b) { return a.date.localeCompare(b.date) || a.start - b.start || a.court - b.court; });
  }
  function renderKpis() {
    var live = sessionsOf(function (s) { return s.status !== 'finished'; });
    var waiting = 0, offered = 0, fullOpen = 0;
    live.forEach(function (s) { var st = seats(s); waiting += st.waiting.length; offered += st.offered.length; if (st.full && s.status === 'open') fullOpen++; });
    var pending = D.registrations.count({ approval: 'pending', status: 'confirmed' });
    var les = lessonsThisWeek(), fees = les.reduce(function (t, b) { return t + (b.lessonFee || 0); }, 0);
    var camps = sessionsOf({ termId: 'camps-summer-2026' }), cw = 0, cc = 0;
    camps.forEach(function (s) { var st = seats(s); cw += st.n; cc += st.cap || 0; });
    var k = [
      ['Waiting for a seat', waiting, (offered ? offered + ' seat' + (offered > 1 ? 's' : '') + ' offered. ' : '') + fullOpen + ' open programs are full'],
      ['Pro National pre-approval', pending, pending ? 'Waiting for the Head Pro' : 'Nobody waiting for the Head Pro'],
      ['Private lessons this week', les.length, fmt.day(T) + ' to ' + fmt.day(fmt.addDays(TODAY, 6)) + ', ' + fmt.money(fees) + ' + HST'],
      ['Summer Camps 2026', cw.toLocaleString('en-CA'), 'camper weeks of ' + cc.toLocaleString('en-CA') + ' seats, ' + camps.length + ' weeks at 3 locations']
    ];
    $('[data-pg-kpis]').innerHTML = k.map(function (x) {
      return '<div class="pn-kpi"><p class="pn-kpi__label">' + esc(x[0]) + '</p><p class="pn-kpi__value pn-num">' + esc(x[1]) + '</p><p class="pn-kpi__note">' + esc(x[2]) + '</p></div>';
    }).join('');
  }

  /* ---------- Tabs (WAI-ARIA: arrows, Home, End; the selection follows focus) ---------- */
  var tabBar = $('[data-pg-tabs]');
  function selectTab(id, focus) {
    state.tab = id; keep('tab', id);
    $$('[role="tab"]', tabBar).forEach(function (t) {
      var on = t.id === 'pg-tab-' + id;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $$('[data-pg-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-pg-panel') !== id; });
    renderTab();
  }
  tabBar.addEventListener('click', function (e) { var t = e.target.closest('[role="tab"]'); if (t) selectTab(t.id.replace('pg-tab-', ''), true); });
  tabBar.addEventListener('keydown', function (e) {
    var i = TABS.indexOf(state.tab), n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length; else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
    if (n != null) { e.preventDefault(); selectTab(TABS[n], true); }
  });
  function panel(id) { return $('[data-pg-panel="' + id + '"]'); }
  function renderTab() {
    var fn = { junior: renderJunior, adult: renderAdult, hp: renderHP, 'private': renderPrivate, camps: renderCamps, leagues: renderLeagues }[state.tab];
    var el = panel(state.tab), f = document.activeElement, keyOf = f && el.contains(f) && f.getAttribute('data-pg-key');
    el.innerHTML = fn();
    if (keyOf) { var back = $('[data-pg-key="' + keyOf + '"]', el); if (back) back.focus(); }
  }

  /* ---------- Group lessons: Junior by age band and level, Adult by level ---------- */
  function groupTerms() {
    var seen = {}, out = [];
    D.sessions.list({ kind: 'group' }).forEach(function (s) { if (!seen[s.termId]) { seen[s.termId] = 1; out.push({ id: s.termId, label: s.term, s: s }); } });
    return out.reverse();
  }
  function termSelect(scope) {
    return '<div class="pn-field pg-termpick"><label class="pn-label" for="pg-term-' + scope + '">Term</label>' +
      '<select class="pn-select" id="pg-term-' + scope + '" data-pg-term data-pg-key="term-' + scope + '">' +
      groupTerms().map(function (t) {
        var when = t.s.start ? ', ' + fmt.day(t.s.start).slice(4) + ' to ' + fmt.day(t.s.end).slice(4) : t.s.status === 'draft' ? ', dates to confirm' : '';
        return '<option value="' + t.id + '"' + (t.id === state.term ? ' selected' : '') + '>' + esc(t.label + when) + '</option>';
      }).join('') + '</select></div>';
  }
  function termFacts(list) {
    var s = list[0];
    if (!s) return '';
    var locs = {};
    list.forEach(function (x) { locs[x.location] = 1; });
    return '<dl class="pn-dl pg-facts">' +
      '<div><dt>Status</dt><dd>' + statusChip(s) + '</dd></div>' +
      '<div><dt>Dates</dt><dd>' + (dayRange(s) ? esc(dayRange(s)) : gapOf(s, 'dates')) + '</dd></div>' +
      '<div><dt>Registration opened</dt><dd>' + (s.registrationOpens ? esc(fmt.day(s.registrationOpens) + (s.registrationOpens.slice(0, 4) !== '2026' ? ', ' + s.registrationOpens.slice(0, 4) : '')) : UI.confirmSlot('Registration opening')) + '</dd></div>' +
      '<div><dt>Days and times</dt><dd>' + gapOf(s, 'days and times') + '</dd></div>' +
      '<div><dt>Price</dt><dd>' + priceText(s) + '</dd></div>' +
      '<div><dt>Where</dt><dd>' + (locs['Club to confirm'] ? UI.confirmSlot(s.kind === 'hp' ? 'High Performance location' : 'Class locations') : esc(Object.keys(locs).join(', ')) + (s.status !== 'draft' && !/Dome/.test(s.location) ? ' <span class="pn-sub pg-inline">Class locations are sample data</span>' : '')) + '</dd></div>' +
      '</dl>';
  }
  var COLS = ['Beginner', 'Intermediate', 'Advanced'];
  function col(level) { return /^Beginner/.test(level) ? 0 : /^Intermediate/.test(level) ? 1 : 2; }
  function cellLine(s, st) {
    if (s.status === 'finished') return st.full ? 'Full to the last class' : (st.cap - st.n) + ' seat' + (st.cap - st.n > 1 ? 's' : '') + ' left empty';
    return seatLine(s, st).replace(/^\d+ of \d+, /, '');
  }
  function cell(s) {
    var st = seats(s), draft = s.status === 'draft';
    var label = s.title + ', ' + s.term + ': ' + seatLine(s, st) + '. Open the class.';
    return '<button type="button" class="pg-cell' + (st.full && !draft ? ' is-full' : '') + (draft ? ' is-draft' : '') + '" data-pg-open="' + s.id + '" data-pg-key="cell-' + s.id + '" aria-label="' + esc(label) + '">' +
      '<span class="pg-cell__level">' + esc(s.level) + '</span>' +
      (draft ? '<span class="pg-cell__seats pn-num">' + (st.cap != null ? st.cap + ' seats' : '') + '</span><span class="pg-cell__line">' + esc(st.waiting.length ? st.waiting.length + ' on the interest list' : 'Interest list only') + '</span>'
        : '<span class="pg-cell__seats pn-num">' + st.n + '<span class="pg-cell__of">/' + st.cap + '</span></span>' + meter(st.n, st.cap) +
          '<span class="pg-cell__line">' + esc(cellLine(s, st)) + '</span>') +
      (s.status !== 'draft' && !/Dome/.test(s.location) ? '<span class="pg-cell__where">' + esc(s.location) + '</span>' : '') +
      '</button>';
  }
  function bandRow(band, list) {
    var stg = FACTS.stage[band] || ['full', 'Full court'];
    var byCol = [null, null, null];
    list.forEach(function (s) { byCol[col(s.level)] = s; });
    return '<div class="pg-band" role="group" aria-label="' + esc(band) + '">' +
      '<div class="pg-band__label">' + court(stg[0], { cls: 'pg-court--band' }) +
      '<p class="pg-band__name">' + esc(band) + '</p><p class="pg-band__stage">' + esc(stg[1]) + (band === 'Ages 7-9' ? ', the club\'s "most important stage"' : '') + '</p></div>' +
      byCol.map(function (s, i) {
        return s ? cell(s) : '<div class="pg-cell pg-cell--none"><span class="pg-cell__level">' + COLS[i] + '</span><span class="pg-cell__line">Not offered for ' + esc(band.toLowerCase()) + '</span></div>';
      }).join('') + '</div>';
  }
  function groupPanel(who) {
    var list = sessionsOf({ kind: 'group', termId: state.term }).filter(function (s) { return who === 'adult' ? s.ageBand === 'Adults' : s.ageBand !== 'Adults'; });
    var bands = who === 'adult' ? ['Adults'] : ['Ages 4-6', 'Ages 7-9', 'Ages 10-13', 'Ages 14-17'];
    var tot = { n: 0, cap: 0, w: 0 };
    list.forEach(function (s) { var st = seats(s); tot.n += st.n; tot.cap += st.cap || 0; tot.w += st.waiting.length; });
    var draft = list[0] && list[0].status === 'draft';
    return '<div class="pn-toolbar pg-bar">' + termSelect(who) +
      '<p class="pn-toolbar__count" aria-live="polite">' + list.length + ' classes, ' + (draft ? 'registration not open yet' : tot.n + ' of ' + tot.cap + ' seats') + (tot.w ? ', ' + tot.w + ' waiting' : '') + '</p></div>' +
      termFacts(list) +
      (draft ? '<p class="pn-note">' + icon('alert') + '<span>The club has not published this term\'s dates, prices or class times. Seats are drawn from last term\'s sample capacity; the desk can keep an interest list until registration opens.</span></p>' : '') +
      '<div class="pg-matrix pg-matrix--' + who + '">' +
      '<div class="pg-matrix__head" aria-hidden="true"><span>' + (who === 'adult' ? 'Adults' : 'Age band, court') + '</span>' + COLS.map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div>' +
      bands.map(function (b) { return bandRow(b, list.filter(function (s) { return s.ageBand === b; })); }).join('') + '</div>' +
      '<p class="pg-foot">Capacities, rosters and waitlists are sample data. Levels, age bands, terms and locations are the club\'s own (<span class="pn-nowrap">/programs-and-lessons/</span>).</p>';
  }
  function renderJunior() { return groupPanel('junior'); }
  function renderAdult() { return groupPanel('adult'); }
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-pg-term]')) { state.term = e.target.value; keep('term', state.term); renderTab(); say('Showing ' + e.target.selectedOptions[0].text); }
  });

  /* ---------- High Performance: the pathway and Pro National pre-approval ---------- */
  function approvalChip(r) {
    if (r.approval === 'approved') return UI.chip('approved');
    if (r.approval === 'declined') return UI.chip('ended', 'Not approved');
    return UI.chip('pending', 'Pre-approval pending');
  }
  function renderHP() {
    var list = sessionsOf({ kind: 'hp' });
    var s0 = list[0];
    var steps = FACTS.hp.map(function (f, i) {
      var s = list.filter(function (x) { return x.title === f.name; })[0];
      var st = s ? seats(s) : null;
      var pend = s && s.needsApproval ? st.regs.filter(function (r) { return r.approval === 'pending'; }).length : 0;
      return '<li class="pg-step">' +
        '<p class="pg-step__n pn-num">Step ' + (i + 1) + '</p>' +
        '<h3 class="pg-step__name">' + esc(f.name) + '</h3>' +
        '<p class="pg-step__who">' + esc(f.who) + '</p>' +
        court(f.court, { cls: 'pg-court--step' + (f.court ? '' : ' pg-court--bare') }) +
        '<p class="pg-step__ball">' + (f.ball ? esc(f.ball) : '<span class="pn-muted">Ball and court not stated by the club</span>') + '</p>' +
        '<p class="pg-step__goal">' + esc(f.goal) + '</p>' +
        (st ? '<div class="pg-step__seats"><p><strong>' + st.n + '</strong> of ' + st.cap + ' seats, Fall Outdoor 2026</p>' + meter(st.n, st.cap) +
          (pend ? '<p class="pg-step__pend">' + UI.chip('pending', pend + ' waiting for pre-approval') + '</p>' : '') +
          btn('Open the roster', 'data-pg-open="' + s.id + '" data-pg-key="hp-' + s.id + '"', { label: 'Open the ' + f.name + ' roster' }) + '</div>' : '') +
        '</li>';
    }).join('');
    var pn = list.filter(function (s) { return s.needsApproval; })[0];
    var regs = pn ? D.registrations.list({ sessionId: pn.id, status: 'confirmed' }).sort(function (a, b) {
      var o = { pending: 0, declined: 1, approved: 2 }; return (o[a.approval] - o[b.approval]) || a.createdAt.localeCompare(b.createdAt);
    }) : [];
    var rows = regs.map(function (r) {
      var acts = r.approval === 'pending'
        ? btn('Approve', 'data-pg-approve="' + r.id + '" data-pg-key="ap-' + r.id + '"', { action: 'programs.approve', cls: 'pn-btn--ink pn-btn--sm', label: 'Pre-approve ' + person(r.personId).name }) +
          btn('Not yet', 'data-pg-decline="' + r.id + '" data-pg-key="de-' + r.id + '"', { action: 'programs.approve', label: 'Do not approve ' + person(r.personId).name + ' yet' })
        : btn('Undo', 'data-pg-unapprove="' + r.id + '" data-pg-key="un-' + r.id + '"', { action: 'programs.approve', cls: 'pn-btn--text pn-btn--sm', label: 'Set ' + person(r.personId).name + ' back to pending' });
      return '<tr><td>' + personCell(r.personId) + '</td><td class="is-tight">' + esc(fmt.stamp(r.createdAt)) + '</td><td>' + approvalChip(r) + '</td><td class="pg-acts">' + acts + '</td></tr>';
    }).join('');
    return termFacts([s0].concat([])) +
      '<p class="pn-note">' + icon('alert') + '<span>The next High Performance session is not published: ' + UI.confirmSlot('Fall & Winter 2026/27 High Performance dates and price') + '</span></p>' +
      '<ol class="pg-path" aria-label="The High Performance pathway">' + steps + '</ol>' +
      '<p class="pg-foot">Ball, court and goals as the club publishes them on /high-performance-program/. ' + GLOSS + '</p>' +
      '<section class="pn-section pg-sub" aria-labelledby="pg-approve-h"><div class="pn-section__head"><h3 class="pn-h2" id="pg-approve-h">Pro National pre-approval</h3>' +
      '<p class="pn-muted">The club\'s rule: you must be pre-approved by the Head Pro to register for the Pro-National Program, after an assessment. ' + (UI.can('programs.approve') ? 'Approving here sends nothing in the demo.' : 'You can see the queue; the Head Pro decides.') + '</p></div>' +
      (rows ? '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Pro National pre-approval"><table class="pn-table"><thead><tr><th scope="col">Player</th><th scope="col">Registered</th><th scope="col">Pre-approval</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="pn-empty"><p class="pn-empty__title">Nobody is waiting for pre-approval</p></div>') + '</section>';
  }
  function setApproval(id, value, text) {
    var r = D.registrations.get(id); if (!r) return;
    var before = r.approval;
    D.registrations.update(id, { approval: value }, text.replace('{name}', person(r.personId).name));
    UI.toast(text.replace('{name}', person(r.personId).name) + '. No email is sent in the demo.', { action: { label: 'Undo', run: function () { D.registrations.update(id, { approval: before }, 'Undid a pre-approval decision for ' + person(r.personId).name); } } });
  }

  /* ---------- Private lessons: the club's rates and this week's lessons on court ---------- */
  function renderPrivate() {
    var rates = (C.programs && C.programs['private']) || [];
    var cards = rates.map(function (r) {
      var semi = /Semi/.test(r.kind), hst = D.hstOn(r.price);
      var plan = court('full', { cls: 'pg-court--plan', people: [{ kind: 'coach', x: 72, y: 18 }, { kind: 'basket', x: 74.5, y: 23 }].concat(semi ? [{ x: 6, y: 11 }, { x: 6, y: 25 }] : [{ x: 6, y: 18 }]) });
      return '<article class="pn-card pg-rate"><p class="pn-kicker">' + esc(r.kind) + ' lesson</p>' + plan +
        '<p class="pg-rate__plan">' + (semi ? 'Two players across the net from the coach' : 'One player across the net from the coach') + '</p>' +
        '<p class="pg-rate__price"><span class="pn-sub pg-inline">From</span> <span class="pn-money">' + fmt.money(r.price) + '</span> <span class="pn-sub pg-inline">an hour + HST</span></p>' +
        '<dl class="pn-dl"><div><dt>Lesson</dt><dd class="pn-money">' + fmt.money(r.price) + '</dd></div><div><dt>HST 13%</dt><dd class="pn-money">' + fmt.money(hst) + '</dd></div><div><dt>Total</dt><dd class="pn-money">' + fmt.money(r.price + hst) + '</dd></div></dl>' +
        '<p class="pg-foot">"' + esc(r.text) + '" /private-lessons/</p></article>';
    }).join('');
    var les = lessonsThisWeek();
    var rows = les.map(function (b) {
      var semi = /Semi/i.test(b.title), hst = D.hstOn(b.lessonFee);
      return '<tr><td class="is-tight">' + esc(fmt.day(b.date)) + '</td><td class="is-tight">' + esc(fmt.time(b.start)) + '</td><td class="is-tight"><a href="' + esc(UI.link('bookings', 'date=' + b.date)) + '" aria-label="Court ' + b.court + ', ' + esc(fmt.day(b.date) + ' ' + fmt.time(b.start)) + ', on the court sheet in Bookings">Court ' + b.court + '</a></td>' +
        '<td>' + (semi ? 'Semi-private' : 'Private') + '<span class="pn-sub">Head Pro, 1 hour</span></td><td>' + personCell(b.personId, semi ? 'and a partner' : '') + '</td>' +
        '<td class="is-num pn-money">' + fmt.money(b.lessonFee) + '</td><td class="is-num pn-money">' + fmt.money(hst) + '</td><td class="is-num pn-money">' + fmt.money(b.total) + '</td>' +
        '<td>' + UI.chip(b.status) + '</td></tr>';
    }).join('');
    var gap = 'How a private lesson is booked, which coach you get, and whether court fees are extra';
    var book = UI.can('bookings.lesson')
      ? '<a class="pn-btn pn-btn--ink" href="' + esc(UI.link('bookings', 'show=lesson&new=lesson')) + '">' + icon('calendar') + 'Book a lesson in Bookings</a>'
      : btn('Book a lesson in Bookings', 'data-pg-lesson', { action: 'bookings.lesson', cls: 'pn-btn--quiet', icon: 'calendar' });
    return '<div class="pg-split"><div class="pn-grid pn-grid--2 pg-rates">' + cards + '</div>' +
      '<div class="pg-aside"><h3 class="pn-h3">Not published by the club</h3><p>' + UI.confirmSlot(gap) + '</p>' +
      '<h3 class="pn-h3">Cancellation, the club\'s policy</h3><p class="pg-quote">' + esc(tidyPolicy(FACTS.lessonPolicy)) + '</p></div></div>' +
      '<section class="pn-section pg-sub" aria-labelledby="pg-les-h"><div class="pn-section__head pg-headrow"><div><h3 class="pn-h2" id="pg-les-h">Lessons on court this week</h3>' +
      '<p class="pn-muted">Read from the court sheet: lessons are booked on a court in Bookings, and each court link opens that day there. ' + esc(D.clock.shifted ? 'Demo clock: ' + fmt.day(T) + '.' : '') + '</p></div>' + book + '</div>' +
      (rows ? '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Lessons this week"><table class="pn-table"><thead><tr><th scope="col">Day</th><th scope="col">Time</th><th scope="col">Court</th><th scope="col">Lesson</th><th scope="col">Player</th><th scope="col" class="is-num">Fee</th><th scope="col" class="is-num">HST</th><th scope="col" class="is-num">Total</th><th scope="col">Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="pn-empty"><p class="pn-empty__title">No lessons on court this week</p><p>Lessons booked in Bookings appear here.</p></div>') + '</section>';
  }

  /* ---------- Camps: by season, location and week ---------- */
  var CAMP_ROWS = [
    { id: 'rec-yc', name: 'Recreational Camp', where: 'Yonge & Centre', ages: 'Ages 4-15', fmt: 'Full or half day' },
    { id: 'rec-nt', name: 'Recreational Camp', where: 'North Thornhill Community Centre', ages: 'Ages 4-15', fmt: 'Full or half day' },
    { id: 'hp-gw', name: 'High Performance Camp', where: 'Garnet Williams Community Centre', ages: 'Little Champs 5-10, Transition Tour and Pro National (Fri/Sun groups) 10-17', fmt: 'Full or half day' },
    { id: 'pn-yc', name: 'Pro National Camp', where: 'Yonge & Centre', ages: 'Mon-Thu groups, ages 9-18', fmt: 'Morning 8am to 11am or afternoon 12pm to 3pm' }
  ];
  var CAMP_SEASONS = [['camps-summer-2026', 'Summer 2026'], ['camps-winter-2026', 'Winter Break 2026/27'], ['march-2027', 'March Break 2027']];
  function renderCamps() {
    var seg = '<div class="pn-seg" role="group" aria-label="Camp season">' + CAMP_SEASONS.map(function (c) {
      return '<button type="button" aria-pressed="' + (state.camp === c[0]) + '" data-pg-camp="' + c[0] + '" data-pg-key="camp-' + c[0] + '">' + esc(c[1]) + '</button>';
    }).join('') + '</div>';
    var body = state.camp === 'camps-summer-2026' ? campsSummer() : state.camp === 'camps-winter-2026' ? campsWinter() : campsMarch();
    return '<div class="pn-toolbar pg-bar">' + seg + '</div>' + body;
  }
  function campsSummer() {
    var list = sessionsOf({ termId: 'camps-summer-2026' });
    var weeks = {};
    list.forEach(function (s) { weeks[s.start] = 1; });
    var cols = Object.keys(weeks).sort();
    var head = '<tr><th scope="col" class="pg-wk__camp">Camp and location</th>' + cols.map(function (d, i) {
      return '<th scope="col" class="pg-wk__h"><span class="pn-num">' + esc(fmt.day(d).slice(4)) + '</span><span class="pn-sub">Week ' + (i + 1) + (d === '2026-06-29' ? ', Jul 1 off*' : '') + '</span></th>';
    }).join('') + '</tr>';
    var total = { n: 0, cap: 0, w: 0 };
    var rows = CAMP_ROWS.map(function (c) {
      return '<tr><th scope="row" class="pg-wk__camp"><span class="pg-wk__name">' + esc(c.name) + '</span><span class="pn-sub">' + esc(c.where) + '</span><span class="pn-sub">' + esc(c.ages) + '</span></th>' + cols.map(function (d) {
        var s = list.filter(function (x) { return x.campId === c.id && x.start === d; })[0];
        if (!s) return '<td class="pg-wk__none"><span class="pn-sub">No camp</span></td>';
        var st = seats(s), wl = D.waitlists.count({ sessionId: s.id });
        total.n += st.n; total.cap += st.cap; total.w += wl;
        return '<td><button type="button" class="pg-wk' + (st.full ? ' is-full' : '') + '" data-pg-open="' + s.id + '" data-pg-key="wk-' + s.id + '" aria-label="' + esc(c.name + ', ' + c.where + ', week of ' + fmt.day(d) + ': ' + st.n + ' of ' + st.cap + ' campers' + (wl ? ', ' + wl + ' were turned away to the waitlist' : '')) + '">' +
          '<span class="pn-num">' + st.n + '<span class="pg-cell__of">/' + st.cap + '</span></span>' + meter(st.n, st.cap) + '</button></td>';
      }).join('') + '</tr>';
    }).join('');
    var tiers = (C.camps && C.camps.summer && C.camps.summer.tiers) || [];
    var regs = D.registrations.list(function (r) { return /^camp-/.test(r.sessionId) && r.tier; });
    /* "February 16th - February 23rd" reads "Feb 16 to Feb 23", the panel's date style */
    function tierDates(d) {
      return String(d || '').replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d+)(st|nd|rd|th)?/gi, function (m, mo, n) { return mo.charAt(0).toUpperCase() + mo.slice(1, 3).toLowerCase() + ' ' + n; })
        .replace(/\s+-\s+/g, ' to ').replace(/\bOnwards\b/i, 'onwards');
    }
    var tierRows = tiers.map(function (t) {
      var n = regs.filter(function (r) { return r.tier === t.period; }).length;
      return '<tr><th scope="row">' + esc(t.period.replace(/!/g, '').toLowerCase().replace(/^./, function (m) { return m.toUpperCase(); })) + '<span class="pn-sub">' + esc(tierDates(t.dates)) + '</span></th>' +
        t.prices.map(function (p) {
          return '<td>' + esc(p.full_day ? p.full_day + ' full, ' + p.half_day + ' half' : p.morning_8am_11am + ' morning or afternoon') + '</td>';
        }).join('') + '<td class="is-num pn-num">' + n.toLocaleString('en-CA') + '</td></tr>';
    }).join('');
    var tierHead = '<tr><th scope="col">Price tier, by the date a family registered</th>' + (tiers[0] ? tiers[0].prices : []).map(function (p) { return '<th scope="col">' + esc(p.location) + '<span class="pn-sub">' + esc(/Pro National Camp/.test(p.program) ? 'Pro National' : /HP/.test(p.program) ? 'High Performance' : 'Recreational') + '</span></th>'; }).join('') + '<th scope="col" class="is-num">Registrations</th></tr>';
    return '<dl class="pn-dl pg-facts">' +
      '<div><dt>Status</dt><dd>' + UI.chip('finished', 'Ended Sep 4') + '</dd></div>' +
      '<div><dt>Weeks</dt><dd>Weekly from Jun 15 to Sep 4, 2026; North Thornhill and Garnet Williams from Jun 29</dd></div>' +
      '<div><dt>Registration opened</dt><dd>Feb 16, 2026, 10am</dd></div>' +
      '<div><dt>Tax</dt><dd>' + UI.confirmSlot('Whether HST is included in camp prices') + '</dd></div>' +
      '<div><dt>Summer 2027</dt><dd>' + UI.confirmSlot('Summer 2027 dates, prices and registration opening') + '</dd></div></dl>' +
      '<p class="pn-toolbar__count pg-count">' + total.n.toLocaleString('en-CA') + ' camper weeks of ' + total.cap.toLocaleString('en-CA') + ' seats; ' + total.w + ' turned away to a waitlist (sample data)</p>' +
      '<div class="pn-table-wrap pg-wkwrap" tabindex="0" role="region" aria-label="Summer Camps 2026 by week"><table class="pn-table pg-wktable"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="pg-foot">* Wednesday July 1 was a holiday with no class at North Thornhill and Garnet Williams (/camps/). Open a week for its roster, waitlist and daily attendance.</p>' +
      '<section class="pn-section pg-sub" aria-labelledby="pg-tier-h"><div class="pn-section__head"><h3 class="pn-h2" id="pg-tier-h">Three price tiers, per week</h3><p class="pn-muted">The club\'s Summer 2026 prices; the registration counts are sample data.</p></div>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Summer 2026 price tiers"><table class="pn-table"><thead>' + tierHead + '</thead><tbody>' + tierRows + '</tbody></table></div></section>';
  }
  function campsWinter() {
    var s = D.sessions.get('camp-winter-2026');
    if (!s) return '';
    var st = seats(s);
    return '<div class="pn-grid pn-grid--main"><div class="pn-card"><p class="pn-kicker">' + esc(s.program) + '</p><h3 class="pg-cardtitle">' + esc(s.title) + '</h3>' +
      '<dl class="pn-dl"><div><dt>Status</dt><dd>' + UI.chip('draft') + '</dd></div><div><dt>Dates, prices, opening</dt><dd>' + UI.confirmSlot(s.gaps[0]) + '</dd></div>' +
      '<div><dt>Where</dt><dd>' + esc(s.location) + '</dd></div><div><dt>Ages</dt><dd class="pn-num">' + esc(s.ageBand) + '</dd></div>' +
      '<div><dt>Interest list</dt><dd>' + st.waiting.length + ' waiting</dd></div></dl>' +
      '<div class="pn-row pg-cardacts">' + btn('Open the interest list', 'data-pg-open="' + s.id + '" data-pg-key="open-winter"', { cls: 'pn-btn--quiet' }) +
      btn('Add someone', 'data-pg-register-for="' + s.id + '" data-pg-key="add-winter"', { action: 'programs.waitlist', cls: 'pn-btn--ink' }) + '</div></div>' +
      '<div class="pn-card pn-card--alt"><h3 class="pn-h3">Last season, for reference</h3><p class="pn-muted">Weekdays only, Dec 22 to 26 and Dec 29 to Jan 2. No camp on Christmas Day or New Year\'s Day. Registration opened Dec 8. (/camps/)</p></div></div>';
  }
  function campsMarch() {
    var mb = (C.camps && C.camps.march_break) || {};
    var progs = (mb.programs || []).map(function (p) { return '<div><dt>' + esc(p.name.toLowerCase().replace(/(^|\s)([a-z+])/g, function (m) { return m.toUpperCase(); }).replace('Utr', 'UTR')) + '</dt><dd>' + esc(p.prices) + '</dd></div>'; }).join('');
    return '<div class="pn-grid pn-grid--main"><div class="pn-card"><p class="pn-kicker">March Break Camp</p><h3 class="pg-cardtitle">March Break 2027</h3>' +
      '<p>' + UI.confirmSlot('March Break 2027 dates, prices and registration opening') + '</p>' +
      '<p class="pn-muted">No sessions exist for it yet: the club registers March Break day by day, so the desk would add one session per camp day once the dates are published.</p></div>' +
      '<div class="pn-card pn-card--alt"><h3 class="pn-h3">' + esc(mb.season || 'March Break 2026') + ', for reference</h3><p class="pn-muted">' + esc(mb.dates || '') + '</p><dl class="pn-dl">' + progs + '</dl>' +
      '<p class="pg-foot">' + '<span class="pg-gloss"><dfn>UTR</dfn>: Universal Tennis Rating, a player rating built from match results.</span> (/camps/)</p></div></div>';
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-pg-camp]');
    if (c) { state.camp = c.getAttribute('data-pg-camp'); keep('camp', state.camp); renderTab(); say('Showing ' + c.textContent); }
  });

  /* ---------- Leagues and round robins: real day, time, level and fee ---------- */
  function renderLeagues() {
    var list = sessionsOf({ kind: 'league' });
    var rows = list.map(function (s) {
      var st = seats(s);
      return '<tr><td><button type="button" class="pn-rowlink" data-pg-open="' + s.id + '" data-pg-key="lg-' + s.id + '">' + esc(s.title) + '</button><span class="pn-sub">' + esc(s.program === 'Round Robins' ? 'Round robin' : 'House league') + (s.waitlistOnly ? ', waitlist only' : '') + '</span></td>' +
        '<td>' + esc(tidyDays(s.days)) + '</td><td>' + esc(tidyDays(s.level)) + '</td><td class="pn-nowrap">' + priceText(s) + '</td>' +
        '<td class="pg-seatcell"><span>' + st.n + ' of ' + st.cap + '</span>' + meter(st.n, st.cap) + '</td><td class="is-num pn-num">' + (st.waiting.length + st.offered.length) + '</td>' +
        '<td>' + (st.offered.length ? UI.chip('offered') : st.full ? UI.chip('waitlist', 'Full') : UI.chip('open')) + '</td></tr>';
    }).join('');
    var s0 = list[0];
    return '<dl class="pn-dl pg-facts"><div><dt>Season</dt><dd>Fall & Winter 2026/27, in the Dome</dd></div><div><dt>Dates</dt><dd>' + (s0 ? gapOf(s0, 'league dates') : '') + '</dd></div>' +
      '<div><dt>Fees</dt><dd>As the club publishes them, per week or per event played. ' + 'The junior house league is the only one marked + HST. ' + UI.confirmSlot('Whether the other league fees include HST') + '</dd></div></dl>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Leagues and round robins"><table class="pn-table"><thead><tr><th scope="col">League</th><th scope="col">Day and time</th><th scope="col">Level</th><th scope="col">Fee</th><th scope="col">Seats</th><th scope="col" class="is-num">Waiting</th><th scope="col">Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="pg-foot">Days, times, levels and fees from /programs-overview/; seats and waitlists are sample data. <span class="pg-gloss"><dfn>Ratings</dfn> such as 3.0 or 4.5 describe playing level: the higher the number, the stronger the player.</span></p>';
  }

  /* ---------- Attendance: a register per class meeting ----------
     Group and High Performance terms meet weekly (the club does not publish the class day, so a
     column is a week); camps meet Monday to Friday. Marks before today that nobody has touched are
     seeded sample marks; a change is stored on the registration through PanelData. */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function meetings(s) {
    if (!s.start || !s.end) return [];
    var out = [], d = fmt.parse(s.start), end = fmt.parse(s.end), i = 0;
    if (s.kind === 'camp') {
      for (; d <= end; d = fmt.addDays(d, 1)) {
        var iso = fmt.iso(d), off = iso === FACTS.canadaDay && FACTS.holidayAt.indexOf(s.location) > -1;
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        out.push({ date: iso, top: fmt.day(iso).slice(0, 3), sub: fmt.day(iso).slice(4), off: off, future: iso > T });
      }
    } else {
      for (; d <= end; d = fmt.addDays(d, 7)) { i++; var w = fmt.iso(d); out.push({ date: w, top: 'Week ' + i, sub: 'from ' + fmt.day(w).slice(4), off: false, future: w > T }); }
    }
    return out;
  }
  var MARKS = { present: 'Present', absent: 'Absent', excused: 'Excused' };
  var NEXT = { present: 'absent', absent: 'excused', excused: 'present' };
  function mark(r, m) {
    if (m.off || m.future) return null;
    if (r.attendance && r.attendance[m.date]) return r.attendance[m.date];
    var h = hash(r.id + '|' + m.date) % 100;
    return h < 87 ? 'present' : h < 95 ? 'absent' : 'excused';
  }
  function attendancePanel(s, st) {
    var ms = meetings(s);
    if (!ms.length) return '<div class="pn-empty"><p class="pn-empty__title">No class meetings to mark yet</p><p>' + (s.kind === 'league' ? 'League nights start when the club publishes the 2026/27 dates.' : 'The dates for this session are not published, so there is no register yet.') + '</p></div>';
    if (!st.regs.length) return '<div class="pn-empty"><p class="pn-empty__title">Nobody on the roster</p></div>';
    var regs = st.regs.slice().sort(function (a, b) { return person(a.personId).last.localeCompare(person(b.personId).last); });
    var head = '<tr><th scope="col" class="pg-att__who">Player</th>' + ms.map(function (m, j) {
      var all = m.off || m.future ? '' : '<button type="button" class="pn-btn pn-btn--text pn-btn--sm pg-att__all" data-pg-allhere="' + s.id + '|' + m.date + '" data-pg-key="all-' + m.date + '" aria-label="Mark everyone present, ' + esc(m.top + ' ' + m.sub) + '">All here</button>';
      return '<th scope="col" class="pg-att__h"><span class="pn-num">' + esc(m.top) + '</span><span class="pn-sub">' + esc(m.sub) + '</span>' + all + '</th>';
    }).join('') + '<th scope="col" class="is-num">Came</th></tr>';
    var first = true;
    var body = regs.map(function (r, i) {
      var p = person(r.personId), came = 0, held = 0;
      var cells = ms.map(function (m, j) {
        if (m.off) return '<td class="pg-att__off"><span class="pn-sub">Holiday</span></td>';
        if (m.future) return '<td class="pg-att__off"><span class="pn-sub">Not yet</span></td>';
        var v = mark(r, m); held++; if (v === 'present') came++;
        var tab = first ? 0 : -1; first = false;
        return '<td><button type="button" class="pg-att pg-att--' + v + '" tabindex="' + tab + '" data-pg-att="' + r.id + '|' + m.date + '" data-pg-key="att-' + r.id + '-' + m.date + '" data-row="' + i + '" data-col="' + j + '" aria-label="' + esc(p.name + ', ' + m.top + ' ' + m.sub + ': ' + MARKS[v] + '. Press to change.') + '"><span class="pg-att__mark" aria-hidden="true"></span><span class="pg-att__txt" aria-hidden="true">' + MARKS[v].charAt(0) + '</span></button></td>';
      }).join('');
      return '<tr><th scope="row" class="pg-att__who">' + esc(p.name) + '</th>' + cells + '<td class="is-num pn-num">' + came + '/' + held + '</td></tr>';
    }).join('');
    return '<div class="pg-legend" aria-hidden="true"><span><i class="pg-att__mark pg-att--present"></i>Present</span><span><i class="pg-att__mark pg-att--absent"></i>Absent</span><span><i class="pg-att__mark pg-att--excused"></i>Excused</span></div>' +
      '<p class="pn-note">' + icon('alert') + '<span>Marks are sample data. Select a mark to change it (Present, Absent, Excused); arrow keys move around the register. Changes stay in this browser.</span></p>' +
      '<div class="pn-table-wrap pg-attwrap" tabindex="0" role="region" aria-label="Attendance register"><table class="pn-table pg-atttable" data-pg-grid><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }
  function setMark(rid, date, v, quiet) {
    var r = D.registrations.get(rid); if (!r) return;
    var a = Object.assign({}, r.attendance || {}); a[date] = v;
    D.registrations.update(rid, { attendance: a }, 'Marked ' + person(r.personId).name + ' ' + MARKS[v].toLowerCase() + ' on ' + fmt.day(date));
    if (!quiet) { lastAct = null; say(person(r.personId).name + ', ' + fmt.day(date) + ': ' + MARKS[v]); }
  }
  /* Arrow keys move through the register (a roving tab stop) */
  document.addEventListener('keydown', function (e) {
    var b = e.target.closest && e.target.closest('[data-pg-att]');
    if (!b) return;
    var dr = { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0, dc = { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0;
    if (!dr && !dc && e.key !== 'Home' && e.key !== 'End') return;
    var grid = b.closest('[data-pg-grid]'), all = $$('[data-pg-att]', grid);
    var r = +b.getAttribute('data-row'), c = +b.getAttribute('data-col'), t = null;
    if (e.key === 'Home') t = all.filter(function (x) { return +x.getAttribute('data-row') === r; })[0];
    else if (e.key === 'End') { var row = all.filter(function (x) { return +x.getAttribute('data-row') === r; }); t = row[row.length - 1]; }
    else {
      var cand = all.filter(function (x) { return dr ? +x.getAttribute('data-col') === c && (+x.getAttribute('data-row') - r) * dr > 0 : +x.getAttribute('data-row') === r && (+x.getAttribute('data-col') - c) * dc > 0; });
      cand.sort(function (x, y) { return dr ? (+x.getAttribute('data-row') - r) * dr - (+y.getAttribute('data-row') - r) * dr : (+x.getAttribute('data-col') - c) * dc - (+y.getAttribute('data-col') - c) * dc; });
      t = cand[0];
    }
    e.preventDefault();
    if (t) { all.forEach(function (x) { x.tabIndex = -1; }); t.tabIndex = 0; t.focus(); }
  });

  /* ---------- The session sheet: facts, seats, roster, waitlist, attendance, activity ---------- */
  var open = null;   /* { id, inner } while a session sheet is open */
  var INNER = [['roster', 'Roster'], ['waitlist', 'Waitlist'], ['attendance', 'Attendance'], ['activity', 'Activity']];
  function ended(s) { return s.status === 'finished'; }
  function sessionFacts(s) {
    var where = s.location === 'Club to confirm' ? UI.confirmSlot('High Performance location') : esc(s.location || '');
    return '<dl class="pn-dl pg-sfacts">' +
      '<div><dt>Status</dt><dd>' + statusChip(s) + '</dd></div>' +
      '<div><dt>Dates</dt><dd>' + (dayRange(s) ? esc(dayRange(s)) : gapOf(s, 'dates')) + '</dd></div>' +
      '<div><dt>Days and times</dt><dd>' + (s.days ? esc(tidyDays(s.days)) : s.options ? esc(s.options.map(function (o) { return o.label; }).join('; ')) : gapOf(s, 'days and times')) + '</dd></div>' +
      '<div><dt>Who</dt><dd>' + esc([s.ageBand, s.level && s.level !== s.title && s.kind !== 'group' ? s.level : null].filter(Boolean).join(', ') || 'All') + '</dd></div>' +
      '<div><dt>Where</dt><dd>' + where + '</dd></div>' +
      '<div><dt>Price</dt><dd>' + (s.kind === 'camp' && s.termId === 'camps-summer-2026' ? 'Three tiers by registration date, per week. ' + UI.confirmSlot('Whether HST is included') : priceText(s)) + '</dd></div>' +
      '<div><dt>Source</dt><dd>' + esc(s.source || '') + '</dd></div></dl>';
  }
  function seatStrip(s, st) {
    var canEdit = UI.can('programs.edit'), lock = ended(s) ? 'This session has ended' : s.status === 'draft' && st.cap == null ? 'No capacity until the club publishes the camp' : '';
    var min = st.n + st.offered.length;
    var step = st.cap == null ? '' : '<div class="pg-cap" role="group" aria-label="Capacity">' +
      btn('', 'data-pg-cap="-1" data-pg-key="cap-minus"', { cls: 'pn-iconbtn', label: 'One seat fewer', icon: 'minus', action: 'programs.edit', off: lock || (st.cap <= min ? 'Every seat is taken; withdraw someone first' : '') }) +
      '<span class="pg-cap__n pn-num">' + st.cap + ' seats</span>' +
      btn('', 'data-pg-cap="1" data-pg-key="cap-plus"', { cls: 'pn-iconbtn', label: 'One seat more', icon: 'plus', action: 'programs.edit', off: lock }) + '</div>';
    return '<div class="pg-strip">' +
      '<p class="pg-strip__big pn-num">' + st.n + (st.cap != null ? '<span class="pg-cell__of"> of ' + st.cap + '</span>' : '') + '</p>' +
      '<div class="pg-strip__words"><p>' + esc(seatLine(s, st)) + '</p>' + meter(st.n + st.offered.length, st.cap) + '<p class="pn-sub">Capacity is sample data' + (canEdit ? '' : '; the Head Pro or Administrator changes it') + '.</p></div>' + step + '</div>';
  }
  function rosterPanel(s, st) {
    var all = D.registrations.list({ sessionId: s.id }).sort(function (a, b) { return (a.status === 'confirmed' ? 0 : 1) - (b.status === 'confirmed' ? 0 : 1) || a.createdAt.localeCompare(b.createdAt); });
    if (!all.length) return '<div class="pn-empty"><p class="pn-empty__title">Nobody registered yet</p><p>' + (s.status === 'draft' ? 'Registration opens when the club publishes this session; meanwhile people wait on the interest list.' : 'Use Register someone below.') + '</p></div>';
    var camp = s.kind === 'camp', fee = camp || s.price != null, why = ended(s) ? 'This session has ended; refunds are made in Payments' : '';
    var rows = all.map(function (r) {
      var p = person(r.personId), live = r.status === 'confirmed';
      var what = camp ? esc(r.optionLabel || '') + '<span class="pn-sub">' + esc((r.tier || '').replace(/!/g, '').toLowerCase()) + '</span>' : (r.price != null ? '<span class="pn-money">' + fmt.money(r.price) + '</span>' + (r.note ? '<span class="pn-sub">' + esc(r.note) + '</span>' : '') : UI.confirmSlot('Price'));
      var price = camp && r.price != null ? '<td class="is-num pn-money">' + fmt.money(r.price) + '</td>' : camp ? '<td></td>' : '';
      return '<tr' + (live ? '' : ' class="is-muted"') + '><td>' + personCell(r.personId) + '</td><td class="is-tight">' + esc(fmt.stamp(r.createdAt)) + '</td>' + (fee ? '<td>' + what + '</td>' : '') + price +
        '<td>' + (live ? (s.needsApproval ? approvalChip(r) : UI.chip('confirmed')) : r.status === 'withdrawn' ? UI.chip('cancelled', 'Withdrawn') : UI.chip(r.status)) + '</td>' +
        '<td class="pg-acts">' + (live ? btn('Withdraw', 'data-pg-withdraw="' + r.id + '" data-pg-key="wd-' + r.id + '"', { action: 'programs.register', off: why, label: 'Withdraw ' + p.name }) : '') + '</td></tr>';
    }).join('');
    return '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Roster"><table class="pn-table"><thead><tr><th scope="col">Player</th><th scope="col">Registered</th>' + (fee ? '<th scope="col">' + (camp ? 'Option and tier' : 'Fee') + '</th>' : '') + (camp ? '<th scope="col" class="is-num">Paid</th>' : '') + '<th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function waitPanel(s, st) {
    var list = D.waitlists.list({ sessionId: s.id, list: 'session' }).sort(function (a, b) {
      var o = { offered: 0, waiting: 1, closed: 2 }; return (o[a.status] - o[b.status]) || byPos(a, b);
    });
    if (!list.length) return '<div class="pn-empty"><p class="pn-empty__title">Nobody is waiting</p><p>When every seat is taken, Register someone adds them here instead.</p></div>';
    var lock = ended(s) ? 'This session has ended' : s.status === 'draft' ? 'Registration has not opened: the dates are club to confirm' : '';
    var noSeat = 'Every seat is taken. Withdraw a registration or add a seat first';
    var n = 0;
    var rows = list.map(function (w) {
      var p = person(w.personId), acts = '';
      if (w.status === 'offered') {
        acts = btn('Promote', 'data-pg-promote="' + w.id + '" data-pg-key="pr-' + w.id + '"', { action: 'programs.waitlist', cls: 'pn-btn--ink pn-btn--sm', off: lock, label: 'Promote ' + p.name + ' to the roster' }) +
          btn('Release', 'data-pg-release="' + w.id + '" data-pg-key="rl-' + w.id + '"', { action: 'programs.waitlist', off: lock, label: 'Release the seat offered to ' + p.name });
      } else if (w.status === 'waiting') {
        acts = btn('Promote', 'data-pg-promote="' + w.id + '" data-pg-key="pr-' + w.id + '"', { action: 'programs.waitlist', cls: 'pn-btn--ink pn-btn--sm', off: lock || (st.open ? '' : noSeat), label: 'Promote ' + p.name + ' to the roster' }) +
          btn('Offer seat', 'data-pg-offer="' + w.id + '" data-pg-key="of-' + w.id + '"', { action: 'programs.waitlist', off: lock || (st.open ? '' : noSeat), label: 'Offer a seat to ' + p.name }) +
          btn('Remove', 'data-pg-unwait="' + w.id + '" data-pg-key="rm-' + w.id + '"', { action: 'programs.waitlist', cls: 'pn-btn--text pn-btn--sm', off: ended(s) ? 'This session has ended' : '', label: 'Remove ' + p.name + ' from the waitlist' });
      }
      var pos = w.status === 'closed' ? '' : String(++n);
      var chip = w.status === 'closed' ? UI.chip('ended', w.outcome === 'promoted' ? 'Promoted' : w.outcome === 'removed' ? 'Removed' : 'Closed') : UI.chip(w.status);
      return '<tr' + (w.status === 'closed' ? ' class="is-muted"' : '') + '><td class="is-num pn-num">' + pos + '</td><td>' + personCell(w.personId) + '</td><td class="is-tight">' + esc(fmt.stamp(w.addedAt)) + '</td><td>' + chip + '</td><td class="pg-acts">' + acts + '</td></tr>';
    }).join('');
    return (lock ? '<p class="pn-note">' + icon('alert') + '<span>' + esc(lock) + (ended(s) ? '. The list is kept as history.' : '.') + '</span></p>' : st.open ? '<p class="pn-note">' + icon('check') + '<span>' + st.open + ' seat' + (st.open > 1 ? 's' : '') + ' open: promote the first in line, or offer the seat and promote when they say yes.</span></p>' : '') +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Waitlist"><table class="pn-table"><thead><tr><th scope="col" class="is-num">#</th><th scope="col">Player</th><th scope="col">Added</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function activityPanel(s) {
    var refs = {}; refs[s.id] = 1;
    D.registrations.list({ sessionId: s.id }).forEach(function (r) { refs[r.id] = 1; });
    D.waitlists.list({ sessionId: s.id }).forEach(function (w) { refs[w.id] = 1; });
    var list = D.activity().filter(function (a) { return a.ref && refs[a.ref.id]; }).slice(0, 30);
    if (!list.length) return '<div class="pn-empty"><p class="pn-empty__title">Nothing changed in the demo yet</p><p>Registrations, promotions, approvals and attendance you change here are listed, newest first.</p></div>';
    return '<ol class="pg-log">' + list.map(function (a) { return '<li><p>' + esc(a.text) + '</p><p class="pn-sub">' + esc(fmt.stamp(a.at) + ', ' + (a.by || a.role || '')) + '</p></li>'; }).join('') + '</ol>';
  }

  function sessionBody(s) {
    var st = seats(s), inner = open.inner;
    var counts = { roster: st.n, waitlist: st.waiting.length + st.offered.length };
    var tabs = '<div class="pn-tabs pg-itabs" role="tablist" aria-label="Session">' + INNER.map(function (t) {
      var on = t[0] === inner;
      return '<button type="button" role="tab" id="pg-it-' + t[0] + '" aria-controls="pg-ip" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-pg-inner="' + t[0] + '" data-pg-key="inner-' + t[0] + '">' + t[1] + (counts[t[0]] != null ? ' <span class="pn-num pg-itabs__n">' + counts[t[0]] + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    var fn = { roster: rosterPanel, waitlist: waitPanel, attendance: attendancePanel, activity: activityPanel }[inner];
    return '<p class="pg-sheet-sample"><span class="pn-sample">Sample data</span> Session facts are the club\'s; people, seats and marks are made up. Nothing is saved to a server.</p>' +
      actBar() + sessionFacts(s) + seatStrip(s, st) + tabs + '<div class="pg-ip" role="tabpanel" id="pg-ip" aria-labelledby="pg-it-' + inner + '" tabindex="-1">' + fn(s, st) + '</div>';
  }
  function footFor(s) {
    var st = seats(s);
    var label = s.status === 'draft' ? 'Add to the interest list' : st.open || ended(s) ? 'Register someone' : 'Add to the waitlist';
    return '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button>' +
      btn(label, 'data-pg-register-for="' + s.id + '" data-pg-key="foot-reg"', { cls: 'pn-btn--ink', action: s.status === 'draft' || !st.open ? 'programs.waitlist' : 'programs.register', off: ended(s) ? 'This session has ended' : '' });
  }
  function setUrl(params) {
    try {
      var u = new URL(location.href);
      ['session', 'tab'].forEach(function (k) { u.searchParams.delete(k); });
      Object.keys(params || {}).forEach(function (k) { if (params[k]) u.searchParams.set(k, params[k]); });
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
    } catch (e) { /* file:// in some browsers */ }
  }
  /* The page re-renders on every change, so focus returns to the opener by its key, not the old node */
  function opener() {
    var a = document.activeElement, sh = UI.sheet.el();
    if (!a || a === document.body || (sh && sh.contains(a))) return null;
    return { el: a, key: a.getAttribute('data-pg-key') };
  }
  function giveBack(o, id) {
    var t = o && o.key ? $('#main [data-pg-key="' + o.key + '"]') : null;
    t = t || (o && document.contains(o.el) ? o.el : null);
    /* Opened from a link (?session=): return to that session's own control, else to main */
    t = t || (id ? $('#main [data-pg-open="' + id + '"]') : null) || $('#main');
    if (t) t.focus();
  }
  var lastOpener = null;
  function openSession(id, inner) {
    var s = D.sessions.get(id);
    if (!s || !shown(s)) { UI.toast('That session is not in the sample data.', { kind: 'warn' }); return; }
    var from = opener() || lastOpener; lastOpener = from;
    if (!open || open.id !== id) lastAct = null;
    open = { id: id, inner: inner || 'roster' };
    UI.sheet.open({
      kicker: s.program + ', ' + s.term, title: s.title.replace(/, week \d+$/, ', week of ' + (s.start ? fmt.day(s.start).slice(4) : '')), wide: true,
      body: sessionBody(s), foot: footFor(s),
      onClose: function () { open = null; lastAct = null; setUrl({}); setTimeout(function () { if (!UI.sheet.el().open) { giveBack(from, id); lastOpener = null; } }, 0); }
    });
    var t = $('#pg-it-' + open.inner, UI.sheet.el()); if (t) t.focus();
    setUrl({ session: id });
  }
  function refreshSheet() {
    if (!open) return;
    var el = UI.sheet.el(), s = D.sessions.get(open.id);
    if (!el || !el.open || !s) return;
    var f = document.activeElement, key = f && el.contains(f) && f.getAttribute('data-pg-key');
    var body = $('.pn-sheet__body', el), top = body.scrollTop;
    body.innerHTML = sessionBody(s);
    var foot = $('.pn-sheet__foot', el);
    if (foot) { foot.innerHTML = footFor(s); $$('[data-sheet-close]', foot).forEach(function (x) { x.addEventListener('click', function () { UI.sheet.close(); }); }); }
    body.scrollTop = top;
    var back = key && $('[data-pg-key="' + key + '"]', el);
    if (back) {
      if (back.hasAttribute('data-pg-att')) { $$('[data-pg-att]', el).forEach(function (x) { x.tabIndex = -1; }); back.tabIndex = 0; }
      back.focus();
    } else if (key) {
      /* The control that acted is gone (a withdrawn row, a promoted line): go to the bar that says what happened */
      var t = lastAct ? ($('[data-pg-act]', el) || $('.pg-act', el)) : $('#pg-it-' + open.inner, el);
      if (t) t.focus();
    }
  }
  function selectInner(id) {
    open.inner = id; refreshSheet();
    var t = $('#pg-it-' + id, UI.sheet.el()); if (t) t.focus();
  }
  document.addEventListener('keydown', function (e) {
    var t = e.target.closest && e.target.closest('[data-pg-inner]');
    if (!t || !open) return;
    var ids = INNER.map(function (x) { return x[0]; }), i = ids.indexOf(open.inner), n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % ids.length; else if (e.key === 'ArrowLeft') n = (i + ids.length - 1) % ids.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = ids.length - 1;
    if (n != null) { e.preventDefault(); selectInner(ids[n]); }
  });

  /* ---------- Actions: every one gives honest feedback and can be undone ---------- */
  /* A toast behind a modal sheet cannot be pressed (the page is inert), so while the sheet is open
     the same message and its action also sit at the top of the sheet. */
  var lastAct = null;
  function tell(msg, label, run) {
    /* Inside the sheet the bar is the only copy: a toast under the modal would outlive it with a stale action */
    if (open) {
      lastAct = run ? { msg: msg, label: label, run: run } : { msg: msg }; refreshSheet(); say(msg);
      /* If the control that acted is gone, focus has fallen back to a tab or out of the sheet: show the bar instead */
      var el = UI.sheet.el(), a = document.activeElement;
      if (el && (!el.contains(a) || a.hasAttribute('data-pg-inner'))) { var t = $('[data-pg-act]', el) || $('.pg-act', el); if (t) t.focus(); }
      return;
    }
    UI.toast(msg, run ? { action: { label: label, run: function () { lastAct = null; run(); } } } : undefined);
  }
  /* An action offered earlier may be stale by the time it is pressed: check the record first */
  function stale(ok, msg) { if (ok) return false; tell(msg || 'That has changed since; nothing was done.'); return true; }
  function actBar() {
    if (!lastAct) return '';
    return '<div class="pg-act" tabindex="-1"><p>' + icon('check') + '<span>' + esc(lastAct.msg) + '</span></p>' +
      (lastAct.run ? '<button type="button" class="pn-btn pn-btn--quiet pn-btn--sm" data-pg-act data-pg-key="act">' + esc(lastAct.label) + '</button>' : '') + '</div>';
  }
  function nowIso() { var d = new Date(D.clock.now); return d.toISOString(); }
  function regFor(s, pid, extra) {
    var p = person(pid);
    return Object.assign({ sessionId: s.id, personId: pid, householdId: p.householdId, createdAt: nowIso(), status: 'confirmed', option: null,
      price: s.price, hst: 0, total: s.price, paymentId: null, sample: true, source: 'front-desk' },
      s.needsApproval ? { approval: 'pending' } : {}, s.kind === 'league' && s.price != null ? { note: 'Fee charged per ' + s.priceUnit + ' played' } : {}, extra || {});
  }
  function promote(wid) {
    var w = D.waitlists.get(wid), s = w && D.sessions.get(w.sessionId);
    if (!s) return;
    var p = person(w.personId), before = w.status;
    if (stale((before === 'offered' || (before === 'waiting' && seats(s).open > 0)), before === 'waiting' ? 'Every seat is taken now; nobody was promoted.' : p.name + ' is no longer on the waitlist.')) return;
    var reg = D.registrations.add(regFor(s, w.personId, { source: 'waitlist' }), 'Promoted ' + p.name + ' from the waitlist to ' + s.title);
    D.waitlists.update(wid, { status: 'closed', outcome: 'promoted' }, 'Closed ' + p.name + '\'s waitlist place: promoted');
    tell(p.name + ' is on the roster' + (s.needsApproval ? ', pending the Head Pro\'s pre-approval' : '') + '. Nothing is charged and no email is sent in the demo.', 'Undo', function () {
      if (stale((D.waitlists.get(wid) || {}).outcome === 'promoted', 'That place has changed since; nothing was undone.')) return;
      D.registrations.remove(reg && reg.id ? reg.id : reg, 'Undid the promotion of ' + p.name);
      D.waitlists.update(wid, { status: before, outcome: null }, p.name + ' is back on the waitlist');
    });
  }
  function offer(wid) {
    var w = D.waitlists.get(wid); if (!w) return;
    var p = person(w.personId), s = D.sessions.get(w.sessionId);
    if (stale(w.status === 'waiting' && seats(s).open > 0, w.status === 'waiting' ? 'Every seat is taken now; nothing was offered.' : p.name + ' is no longer waiting; nothing was offered.')) return;
    D.waitlists.update(wid, { status: 'offered', offeredAt: nowIso() }, 'Offered a seat to ' + p.name);
    tell('Seat held for ' + p.name + '. Promote them when they say yes. No email is sent in the demo.', 'Undo', function () {
      if (stale((D.waitlists.get(wid) || {}).status === 'offered', p.name + ' has been promoted or released since; nothing was undone.')) return;
      D.waitlists.update(wid, { status: 'waiting' }, 'Withdrew the seat offered to ' + p.name);
    });
  }
  function release(wid) {
    var w = D.waitlists.get(wid), p = person(w.personId);
    D.waitlists.update(wid, { status: 'waiting' }, 'Released the seat offered to ' + p.name);
    tell('Seat released. ' + p.name + ' keeps their place in line.');
  }
  function unwait(wid) {
    var w = D.waitlists.get(wid), p = person(w.personId), before = w.status;
    UI.confirm({ title: 'Remove ' + p.name + ' from the waitlist?', body: '<p>They lose their place in line. Nothing is sent to them in the demo.</p>', confirm: 'Remove', cancel: 'Keep them', danger: true }).then(function (yes) {
      if (!yes) return;
      D.waitlists.update(wid, { status: 'closed', outcome: 'removed' }, 'Removed ' + p.name + ' from the waitlist');
      tell(p.name + ' removed from the waitlist.', 'Undo', function () { D.waitlists.update(wid, { status: before, outcome: null }, p.name + ' is back on the waitlist'); });
    });
  }
  /* The club's refund policy that applies to this session (/club-policies/, via D.refundPolicy). Leagues have none published. */
  function tidyPolicy(t) { return String(t || '').replace(/:(?=\S)/g, ': ').replace(/\.(?=[A-Z])/g, '. '); }
  function policyFor(s) {
    var R = D.refundPolicy || {};
    if (s.kind === 'league') return 'none published for leagues and round robins. ' + UI.confirmSlot('League refund policy');
    var t = s.kind === 'camp' ? (s.termId === 'camps-summer-2026' ? R.summer_camp : R.winter_and_march_break_camp) : (R.lessons || FACTS.lessonPolicy);
    return esc(tidyPolicy(t));
  }
  function withdraw(rid) {
    var r = D.registrations.get(rid), s = D.sessions.get(r.sessionId), p = person(r.personId);
    var policy = policyFor(s);
    UI.confirm({ title: 'Withdraw ' + p.name + '?', body: '<p>Their seat opens for the waitlist.</p><p><strong>The club\'s refund policy:</strong> ' + policy + '</p><p>Refunds are made in Payments by the Administrator. Nothing is refunded or charged here.</p>', confirm: 'Withdraw', cancel: 'Keep them', danger: true }).then(function (yes) {
      if (!yes) return;
      D.registrations.update(rid, { status: 'withdrawn' }, 'Withdrew ' + p.name + ' from ' + s.title);
      var next = seats(s).waiting[0];
      tell(p.name + ' withdrawn. A seat is open' + (next ? '; ' + person(next.personId).name + ' is first in line.' : '.'), next ? 'Offer it to ' + person(next.personId).first : 'Undo', next ? function () { offer(next.id); } : function () { if (stale((D.registrations.get(rid) || {}).status === 'withdrawn' && seats(s).open > 0, 'The seat has been filled since; ' + p.name + ' stays withdrawn.')) return; D.registrations.update(rid, { status: 'confirmed' }, 'Undid the withdrawal of ' + p.name); });
    });
  }
  function capacity(delta) {
    var s = D.sessions.get(open.id), st = seats(s), n = st.cap + delta;
    if (n < st.n + st.offered.length || n < 1) return;
    D.sessions.update(s.id, { capacity: n }, 'Capacity of ' + s.title + ' (' + s.term + ') set to ' + n);
    say('Capacity ' + n + ' seats');
  }

  /* ---------- Register someone: a seat, the waitlist or the interest list, never a payment field ---------- */
  function openable(s) { return s.status !== 'finished' && shown(s); }
  function ageBounds(s) { var m = /Ages (\d+)-(\d+)/.exec(s.ageBand || ''); return m ? [+m[1], +m[2]] : s.ageBand === 'Adults' || s.level === 'Ages 18+' ? [18, 120] : null; }
  function outcome(s, p) {
    var st = seats(s), out = { ok: true, kind: 'register', lines: [] };
    if (!s) return { ok: false, err: 'Choose a session' };
    if (!p) return { ok: false, err: 'Choose a person' };
    if (D.registrations.count({ sessionId: s.id, personId: p.id, status: 'confirmed' })) return { ok: false, err: p.name + ' is already on this roster' };
    if (D.waitlists.list({ sessionId: s.id, personId: p.id }).some(function (w) { return w.status !== 'closed'; })) return { ok: false, err: p.name + ' is already waiting for this session' };
    var b = ageBounds(s), age = ageOn(p, s.start || T);
    if (b && age != null && (age < b[0] || age > b[1])) return { ok: false, err: p.name + ' is ' + age + '; this session is for ' + (b[0] >= 18 ? 'adults' : 'ages ' + b[0] + '-' + b[1]) };
    if (s.kind === 'league' && /^Junior/.test(s.title) && p.role !== 'junior') return { ok: false, err: 'This league is for juniors' };
    if (s.status === 'draft') { out.kind = 'interest'; out.lines.push('Registration has not opened: the club has not published the dates. ' + p.first + ' goes on the interest list at #' + (st.waiting.length + 1) + '.'); }
    else if (!st.open) { out.kind = 'waitlist'; out.lines.push('Every seat is taken (' + st.n + ' of ' + st.cap + '). ' + p.first + ' goes on the waitlist at #' + (st.waiting.length + 1) + '.'); }
    else out.lines.push('Seat ' + (st.n + 1) + ' of ' + st.cap + ' is open.');
    if (s.waitlistOnly && out.kind === 'register') { out.kind = 'waitlist'; out.lines = ['The club runs this league from a waitlist. ' + p.first + ' goes on it at #' + (st.waiting.length + 1) + '.']; }
    if (s.needsApproval && out.kind === 'register') out.lines.push('Pro National: the registration waits for the Head Pro\'s pre-approval.');
    return out;
  }
  var reg = null;   /* { sessionId, personId, query } while the register sheet is open */
  function sessionOptions(sel) {
    var groups = {};
    D.sessions.list(openable).forEach(function (s) { var g = s.program + ', ' + s.term; (groups[g] = groups[g] || []).push(s); });
    return '<option value="">Choose a session</option>' + Object.keys(groups).map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (s) { return '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.title + ' (' + seatLine(s, seats(s)) + ')') + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  }
  function matches(qs) {
    qs = (qs || '').trim().toLowerCase();
    if (qs.length < 2) return [];
    var digits = qs.replace(/\D/g, '');
    return D.people.list(function (p) { return p.name.toLowerCase().indexOf(qs) > -1 || (p.email || '').indexOf(qs) > -1 || (digits.length > 2 && (p.phone || '').replace(/\D/g, '').indexOf(digits) > -1); }).slice(0, 6);
  }
  function regParts() {
    var s = D.sessions.get(reg.sessionId), p = reg.personId ? person(reg.personId) : null;
    var found = matches(reg.query);
    var res = found.length ? '<div class="pg-pick" role="radiogroup" aria-label="People found">' + found.map(function (x) {
      return '<label class="pg-pick__row"><input type="radio" name="pg-person" value="' + x.id + '"' + (x.id === reg.personId ? ' checked' : '') + ' data-pg-key="pick-' + x.id + '"><span><strong>' + esc(x.name) + '</strong><span class="pn-sub">' + esc(['Age ' + x.age, x.city, x.email].filter(Boolean).join(', ')) + '</span></span></label>';
    }).join('') + '</div>' : reg.query && reg.query.trim().length > 1 ? '<p class="pn-muted">Nobody in the sample data matches "' + esc(reg.query) + '".</p>' : '<p class="pn-help">Type two letters of a name, an email or a phone number.</p>';
    var o = s && p ? outcome(s, p) : null;
    var check = !s ? '' : '<div class="pn-card pn-card--alt pg-check">' +
      (o && !o.ok ? '<p class="pn-error" id="pg-reg-err">' + icon('alert') + esc(o.err) + '</p>' : o ? o.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') : '<p class="pn-muted">' + esc(s.title + ': ' + seatLine(s, seats(s))) + '</p>') +
      '<dl class="pn-dl"><div><dt>Price</dt><dd>' + priceText(s) + '</dd></div><div><dt>Payment</dt><dd>Taken in Payments when the seat is confirmed. Nothing is charged in the demo.</dd></div></dl></div>';
    return { res: res, check: check, bad: o && !o.ok };
  }
  function regBody() {
    var x = regParts();
    return '<p class="pg-sheet-sample"><span class="pn-sample">Sample data</span> People are made up; nothing is saved to a server or sent.</p>' +
      '<form class="pn-form" data-pg-regform novalidate>' +
      '<div class="pn-field"><label class="pn-label" for="pg-reg-s">Session</label><select class="pn-select" id="pg-reg-s" data-pg-key="reg-s">' + sessionOptions(reg.sessionId) + '</select>' +
      '<p class="pn-help">Sessions that have ended are not listed. Group lessons and the Winter Break camp take an interest list until the club publishes their dates.</p></div>' +
      '<div class="pn-field"><label class="pn-label" for="pg-reg-q">Person</label><label class="pn-search"><span class="sr-only">Search people</span>' + icon('search') +
      '<input class="pn-input" id="pg-reg-q" type="search" autocomplete="off" placeholder="Name, email or phone" value="' + esc(reg.query || '') + '" data-pg-key="reg-q"' + (x.bad ? ' aria-invalid="true" aria-describedby="pg-reg-err"' : '') + '></label>' +
      '<div data-pg-reg-res>' + x.res + '</div></div>' +
      '<div data-pg-reg-chk aria-live="polite">' + x.check + '</div></form>';
  }
  function regFoot() {
    var s = D.sessions.get(reg.sessionId), p = reg.personId ? person(reg.personId) : null, o = s && p ? outcome(s, p) : null;
    var label = o && o.ok ? { register: 'Register', waitlist: 'Add to the waitlist', interest: 'Add to the interest list' }[o.kind] : 'Register';
    return '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Cancel</button>' +
      btn(label, 'data-pg-reg-submit data-pg-key="reg-go"', { cls: 'pn-btn--ink', action: o && o.kind !== 'register' ? 'programs.waitlist' : 'programs.register' });
  }
  function openRegister(sessionId) {
    var from = opener() || lastOpener; lastOpener = from;
    reg = { sessionId: sessionId || '', personId: null, query: '' };
    var back = open && open.id;
    open = null;
    UI.sheet.open({ kicker: 'Programs', title: 'Register someone', body: regBody(), foot: regFoot(),
      onClose: function (v) { reg = null; if (v !== 'done' && back) { setTimeout(function () { openSession(back); }, 0); } else setTimeout(function () { if (!UI.sheet.el().open) { giveBack(from, id); lastOpener = null; } }, 0); } });
    var f = $(sessionId ? '#pg-reg-q' : '#pg-reg-s', UI.sheet.el()); if (f) f.focus();
  }
  function refreshReg(full) {
    var el = UI.sheet.el(); if (!reg || !el) return;
    var f = document.activeElement, key = f && el.contains(f) && f.getAttribute('data-pg-key');
    var res = $('[data-pg-reg-res]', el), chk = $('[data-pg-reg-chk]', el), q = $('#pg-reg-q', el);
    if (full || !res || !chk) { $('.pn-sheet__body', el).innerHTML = regBody(); }
    else {
      var x = regParts();
      res.innerHTML = x.res; chk.innerHTML = x.check;
      if (x.bad) { q.setAttribute('aria-invalid', 'true'); q.setAttribute('aria-describedby', 'pg-reg-err'); } else { q.removeAttribute('aria-invalid'); q.removeAttribute('aria-describedby'); }
    }
    var foot = $('.pn-sheet__foot', el);
    foot.innerHTML = regFoot();
    $$('[data-sheet-close]', foot).forEach(function (x) { x.addEventListener('click', function () { UI.sheet.close(); }); });
    var back = key && $('[data-pg-key="' + key + '"]', el);
    if (back && back !== document.activeElement) back.focus();
  }
  function submitReg() {
    var s = D.sessions.get(reg.sessionId), p = reg.personId ? person(reg.personId) : null;
    var o = s && p ? outcome(s, p) : { ok: false, err: !s ? 'Choose a session' : 'Choose a person' };
    if (!o.ok) { refreshReg(); UI.toast(o.err, { kind: 'warn' }); var f = $(!s ? '#pg-reg-s' : '#pg-reg-q', UI.sheet.el()); if (f) f.focus(); return; }
    var sid = s.id;
    if (o.kind === 'register') {
      var r = D.registrations.add(regFor(s, p.id), 'Registered ' + p.name + ' for ' + s.title + ' (' + s.term + ')');
      UI.sheet.close('done');
      UI.toast(p.name + ' registered for ' + s.title + '. Nothing is charged in the demo.', { action: { label: 'Undo', run: function () { D.registrations.remove(r.id, 'Undid the registration of ' + p.name); } } });
    } else {
      var pos = seats(s).waiting.length + 1;
      var w = D.waitlists.add({ list: 'session', sessionId: s.id, personId: p.id, householdId: p.householdId, addedAt: nowIso(), status: 'waiting', position: D.waitlists.list({ sessionId: s.id }).reduce(function (m, x) { return Math.max(m, x.position || 0); }, 0) + 1 },
        'Added ' + p.name + ' to the ' + (o.kind === 'interest' ? 'interest list' : 'waitlist') + ' for ' + s.title + ' (' + s.term + ')');
      UI.sheet.close('done');
      UI.toast(p.name + ' is #' + pos + ' on the ' + (o.kind === 'interest' ? 'interest list' : 'waitlist') + '. No email is sent in the demo.', { action: { label: 'Undo', run: function () { D.waitlists.remove(w.id, 'Undid adding ' + p.name + ' to the waitlist'); } } });
    }
    setTimeout(function () { openSession(sid, o.kind === 'register' ? 'roster' : 'waitlist'); }, 0);
  }

  /* ---------- One click handler for the page and the sheet ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('button, a');
    if (!t || t.hasAttribute('data-pg-why')) return;
    var a = function (n) { return t.getAttribute(n); };
    if (t.matches('[data-pg-register]')) { openRegister(''); return; }
    if (t.matches('[data-pg-register-for]')) { openRegister(a('data-pg-register-for')); return; }
    if (t.matches('[data-pg-open]')) { openSession(a('data-pg-open')); return; }
    if (t.matches('[data-pg-inner]')) { selectInner(a('data-pg-inner')); return; }
    if (t.matches('[data-pg-approve]')) { setApproval(a('data-pg-approve'), 'approved', 'Pre-approved {name} for Pro National'); return; }
    if (t.matches('[data-pg-decline]')) { setApproval(a('data-pg-decline'), 'declined', 'Did not pre-approve {name} for Pro National yet'); return; }
    if (t.matches('[data-pg-unapprove]')) { setApproval(a('data-pg-unapprove'), 'pending', 'Set {name} back to pending pre-approval'); return; }
    if (t.matches('[data-pg-promote]')) { promote(a('data-pg-promote')); return; }
    if (t.matches('[data-pg-offer]')) { offer(a('data-pg-offer')); return; }
    if (t.matches('[data-pg-release]')) { release(a('data-pg-release')); return; }
    if (t.matches('[data-pg-unwait]')) { unwait(a('data-pg-unwait')); return; }
    if (t.matches('[data-pg-withdraw]')) { withdraw(a('data-pg-withdraw')); return; }
    if (t.matches('[data-pg-cap]')) { capacity(+a('data-pg-cap')); return; }
    if (t.matches('[data-pg-reg-submit]')) { submitReg(); return; }
    if (t.matches('[data-pg-act]')) { var la = lastAct; lastAct = null; if (la && la.run) la.run(); refreshSheet(); var it = $('#pg-it-' + (open && open.inner), UI.sheet.el()); if (it) it.focus(); return; }
    if (t.matches('[data-pg-att]')) {
      var k = a('data-pg-att').split('|'), r = D.registrations.get(k[0]);
      var m = meetings(D.sessions.get(r.sessionId)).filter(function (x) { return x.date === k[1]; })[0];
      setMark(k[0], k[1], NEXT[mark(r, m)] || 'present');
      return;
    }
    if (t.matches('[data-pg-allhere]')) {
      var q2 = a('data-pg-allhere').split('|'), s = D.sessions.get(q2[0]);
      var regs = seats(s).regs;
      regs.forEach(function (r) { setMark(r.id, q2[1], 'present', true); });
      tell('Everyone marked present on ' + fmt.day(q2[1]) + '. Saved in this browser only.');
      return;
    }
  });
  document.addEventListener('input', function (e) {
    if (reg && e.target.id === 'pg-reg-q') { reg.query = e.target.value; var f = matches(reg.query); if (reg.personId && !f.some(function (x) { return x.id === reg.personId; })) reg.personId = null; if (f.length === 1) reg.personId = f[0].id; refreshReg(); }
  });
  document.addEventListener('change', function (e) {
    if (!reg) return;
    if (e.target.id === 'pg-reg-s') { reg.sessionId = e.target.value; refreshReg(); }
    else if (e.target.name === 'pg-person') { reg.personId = e.target.value; refreshReg(); }
  });
  document.addEventListener('submit', function (e) { if (e.target.matches('[data-pg-regform]')) { e.preventDefault(); submitReg(); } });

  /* ---------- Start, and re-render on every change (here, in another module, or Reset demo) ---------- */
  function renderAll() { renderKpis(); renderTab(); }
  window.addEventListener('panel:change', function (e) {
    renderAll();
    if (open) refreshSheet();
    if (reg) refreshReg(true);
    if (e.detail && e.detail.collection === '*') say('Demo reset');
  });
  selectTab(state.tab, false);
  renderKpis();
  var deep = q.get('session');
  if (deep) {
    var ds = D.sessions.get(deep);
    if (ds && shown(ds)) {
      var tabFor = ds.kind === 'group' ? (ds.ageBand === 'Adults' ? 'adult' : 'junior') : ds.kind === 'hp' ? 'hp' : ds.kind === 'camp' ? 'camps' : 'leagues';
      if (ds.kind === 'group') { state.term = ds.termId; }
      if (ds.kind === 'camp') { state.camp = ds.termId; }
      selectTab(tabFor, false);
      openSession(deep, q.get('view') || 'roster');
    }
  }
})();
