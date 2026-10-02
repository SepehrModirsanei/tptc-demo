/* Members and renewals: the CRM (owned by the members module agent; contract in ../PANEL.md).

   The story it tells: a membership is played season to season. On Sep 30 the outdoor season
   ends and the club changes ends into the dome for Fall & Winter; the desk's job is to see who
   crossed the net, who has not yet, and to know each household well enough to bring them over.
   Every price is the club's own (indoor 2026/27, resident and non-resident, $25 returning
   discount, 13% HST added). Every person, booking, payment and note is sample data.
   Nothing is sent and nothing is saved to a server: changes live in this browser only. */
(function () {
  'use strict';
  var D = window.PanelData, UI = window.PanelUI;
  if (!D || !UI) return;

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = UI.esc, icon = UI.icon, fmt = D.fmt, money = fmt.money;
  var TODAY = D.today(), TODAY_ISO = fmt.iso(TODAY);
  var INDOOR = 'indoor-2026', OUTDOOR = 'outdoor-2026';
  var PAGE = 40;
  var SIGNUP_URL = 'thornhillparktennisclub.ca/memberships/';
  var DESK_PHONE = '905-731-5551';
  var PREF = 'tptc-panel-members-view';

  function pref(k, v) {
    try {
      var o = JSON.parse(localStorage.getItem(PREF) || '{}');
      if (v === undefined) return o[k];
      o[k] = v; localStorage.setItem(PREF, JSON.stringify(o));
    } catch (e) { return undefined; }
  }
  function plural(n, one, many) { return n.toLocaleString('en-CA') + ' ' + (n === 1 ? one : (many || one + 's')); }
  function num(n) { return Number(n || 0).toLocaleString('en-CA'); }
  function mail(e) { return esc(e).replace('@', '@<wbr>'); }   /* break after the @, never mid-word */
  function fsa(postal) { return postal ? String(postal).slice(0, 3) : ''; }
  function seasonShort(id) { var s = D.seasons.filter(function (x) { return x.id === id; })[0]; return s ? s.short : id; }
  function catLabel(id, season) {
    var list = season === OUTDOOR ? D.outdoorCategories : D.categories;
    var c = list.filter(function (x) { return x.id === id; })[0];
    if (!c) return id ? id.charAt(0).toUpperCase() + id.slice(1) : '';
    return c.label.replace(/\s*\*.*$/, '');
  }
  var INDOOR_CAT = {}; D.categories.forEach(function (c) { INDOOR_CAT[c.id] = c; });

  /* ---------- Permissions: shown disabled with the reason, never hidden ---------- */
  var WHO = { 'members.edit': 'Front desk or Administrator', 'members.remind': 'Front desk or Administrator', 'members.notes': 'Head Pro or Administrator' };
  function whoCan(a) { return WHO[a] || UI.whoCan(a); }
  function btn(action, label, cls, attrs) {
    var ok = UI.can(action);
    return '<button type="button" class="pn-btn ' + (cls || 'pn-btn--quiet') + '" ' + (attrs || '') +
      (ok ? '' : ' aria-disabled="true" title="' + esc(whoCan(action)) + ' only" data-mb-denied="' + esc(action) + '"') + '>' +
      label + (ok ? '' : '<span class="sr-only"> (' + esc(whoCan(action)) + ' only)</span>') + '</button>';
  }
  function denied(el) {
    var a = el && el.closest('[data-mb-denied]');
    if (!a) return false;
    notify(whoCan(a.getAttribute('data-mb-denied')) + ' only. Signed in as ' + D.roleName() + '.', null, 'warn');
    return true;
  }

  /* Toasts live in the page, which a modal sheet makes inert, so an Undo there cannot be reached
     while a sheet is open (requests-panel-members 6). Inside a sheet, say it in the sheet. */
  function notify(msg, undo, kind) {
    var el = UI.sheet.el();
    if (!(el && el.open)) { UI.toast(msg, undo ? { action: { label: 'Undo', run: undo } } : kind ? { kind: kind } : undefined); return; }
    var body = $('.pn-sheet__body', el), bar = $('.mb-undo', el);
    if (!bar) { bar = document.createElement('div'); bar.className = 'mb-undo'; bar.setAttribute('role', 'status'); body.insertBefore(bar, body.firstChild); }
    bar.innerHTML = icon(kind === 'warn' ? 'alert' : 'check') + '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button" class="pn-btn pn-btn--text pn-btn--sm" data-mb-undo>Undo</button>' : '');
    if (undo) $('[data-mb-undo]', bar).addEventListener('click', function () { undo(); bar.innerHTML = icon('check') + '<span>Undone. Kept in this browser only.</span>'; });
  }

  /* ---------- Derived views over the shared data ---------- */
  function hhMemberships(hid) { return D.memberships.list({ householdId: hid }); }
  function hhSeason(hid, season) {
    return hhMemberships(hid).filter(function (m) { return m.season === season && m.status !== 'refunded'; })[0] || null;
  }
  function primaryOf(h) { return D.people.get(h.primaryId) || D.people.get(h.personIds[0]); }

  /* The indoor category a renewing household moves into: the club's own categories. Outdoor has
     Student (18 to 24) and no Senior; indoor has Senior (65 and over) and no Student. */
  function renewCategory(h, out) {
    var p = primaryOf(h), c = out ? out.category : h.kind;
    if (c === 'student') return 'adult';
    if (c === 'adult' && p && p.age >= 65) return 'senior';
    return INDOOR_CAT[c] ? c : 'adult';
  }
  function quote(cat, resident, returning) {
    return D.membershipPrice(cat, { resident: !!resident, returning: !!returning && cat !== 'intercounty' });
  }

  function personStats(pid) {
    var bk = D.bookings.list({ personId: pid });
    var courts = [0, 0, 0, 0], bands = {}, cur = { noShow: 0, late: 0 }, last = null, next = null, played = 0;
    var season = D.currentSeason().id;
    bk.forEach(function (b) {
      if (b.status === 'completed' || b.status === 'booked') { courts[b.court - 1] += 1; bands[b.band] = (bands[b.band] || 0) + 1; }
      if (b.status === 'completed') { played++; if (!last || b.date > last.date || (b.date === last.date && b.start > last.start)) last = b; }
      if (b.status === 'booked' && b.date >= TODAY_ISO && (!next || b.date < next.date || (b.date === next.date && b.start < next.start))) next = b;
      if (b.season === season && b.status === 'no-show') cur.noShow++;
      if (b.season === season && b.status === 'late-cancel') cur.late++;
    });
    var outd = { noShow: 0, late: 0 };
    bk.forEach(function (b) { if (b.season === OUTDOOR && b.status === 'no-show') outd.noShow++; if (b.season === OUTDOOR && b.status === 'late-cancel') outd.late++; });
    return { bookings: bk, courts: courts, bands: bands, current: cur, outdoor: outd, last: last, next: next, played: played };
  }

  /* ---------- Sample notes (module-local until data.js seeds people.notes; see the request log).
     Deterministic, fictional, written in the role's voice, and only about the club's real rules. */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  var SAMPLE_NOTES = null;
  function stampAt(daysBack, minute) { var d = fmt.addDays(TODAY, -daysBack); d.setHours(0, minute, 0, 0); return d.toISOString(); }
  function seedNotes() {
    SAMPLE_NOTES = {};
    D.households.all().forEach(function (h) {
      var k = hash(h.id), p = primaryOf(h); if (!p) return;
      var out = hhSeason(h.id, OUTDOOR), ind = hhSeason(h.id, INDOOR);
      var juniors = h.personIds.map(D.people.get).filter(function (x) { return x && x.role === 'junior'; });
      var list = [];
      var add = function (role, days, text) { list.push({ id: 'n-' + h.id + '-' + list.length, role: role, by: D.roleName(role), at: stampAt(days, 540 + (k % 480)), text: text, sample: true }); };
      if (k % 3 === 0 && ind && ind.returning) add('frontdesk', 6 + k % 20, 'Called to check the $25 returning discount. It applies: the household played Spring & Summer 2026.');
      if (k % 5 === 1 && !ind && out) add('frontdesk', 3 + k % 9, 'Asked whether a half-season indoor membership is possible. Explained the club does not offer partial memberships; they are for the full indoor season.');
      if (k % 4 === 2 && ind) add('frontdesk', 8 + k % 30, 'Had trouble signing up online. Walked ' + p.first + ' through it over the phone, as the club offers.');
      if (k % 7 === 3 && juniors.length) add('headpro', 12 + k % 40, 'Assessment requested for ' + juniors[0].first + ' before choosing a lesson level. Send the assessment code once a time is set.');
      if (k % 11 === 4) add('headpro', 20 + k % 50, 'Asked about High Performance. Pro National needs pre-approval; talk through the pathway first.');
      if (k % 6 === 5) add('frontdesk', 2 + k % 14, 'Wants to hear when the Fall & Winter lesson dates are published.');
      if (ind && ind.category === 'intercounty') add('admin', 25, 'Sunday Night Intercounty category pre-approved, as the club requires. No returning discount on this category.');
      var lc = D.bookings.count(function (b) { return b.personId === p.id && b.status === 'late-cancel'; });
      if (lc >= 2) add('frontdesk', 4 + k % 10, 'Reminded about the 48 hour cancellation rule after ' + lc + ' late cancellations. Three can suspend booking for 7 days.');
      if (list.length) SAMPLE_NOTES[h.id] = list;
    });
  }
  function notesFor(h) {
    if (!SAMPLE_NOTES) seedNotes();
    var own = [];
    h.personIds.forEach(function (pid) { var p = D.people.get(pid); if (p && p.notes) own = own.concat(p.notes.map(function (n) { return Object.assign({ personId: pid }, n); })); });
    var removed = {}, pins = {};
    own.forEach(function (n) { if (n.hides) removed[n.hides] = 1; if (n.pins) pins[n.pins] = n.pinned; });
    return own.filter(function (n) { return !n.hides && !n.pins && !removed[n.id]; }).concat((SAMPLE_NOTES[h.id] || []).filter(function (n) { return !removed[n.id]; }))
      .map(function (n) { return n.id in pins ? Object.assign({}, n, { pinned: pins[n.id] }) : n; })
      .sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.at < b.at ? 1 : -1); });
  }

  /* ---------- Reminders: the record each draft leaves (status draft, never sent) ---------- */
  function remindersFor(hid) {
    return D.reminders.list({ householdId: hid }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }

  /* ---------- At a glance ---------- */
  function seasonFacts() {
    var hh = D.households.all(), out = [], ind = [], crossed = [], due = D.renewalsDue();
    hh.forEach(function (h) {
      var o = hhSeason(h.id, OUTDOOR), i = hhSeason(h.id, INDOOR);
      if (o) out.push(h); if (i && i.status === 'active') ind.push(h);
      if (o && i && i.status === 'active') crossed.push(h);
    });
    var wl = D.waitlists.list({ list: 'membership-indoor-2026', status: ['waiting', 'offered'] });
    return { out: out, ind: ind, crossed: crossed, due: due, waitlist: wl };
  }
  function renderKpis() {
    var f = seasonFacts();
    var act = D.memberships.list({ season: INDOOR, status: 'active' });
    var people = act.reduce(function (n, m) { return n + m.personIds.length; }, 0);
    var fees = act.reduce(function (n, m) { return n + m.total; }, 0), pre = act.reduce(function (n, m) { return n + m.subtotal; }, 0);
    var worth = f.due.reduce(function (n, h) { var q = quote(renewCategory(h, hhSeason(h.id, OUTDOOR)), h.resident, true); return n + q.total; }, 0);
    var W = waitPlaces(), onWait = f.due.filter(function (h) { return W[h.id]; }).length;
    var pct = f.out.length ? Math.round(f.crossed.length / f.out.length * 100) : 0;
    var k = [
      ['Indoor memberships', num(act.length), plural(people, 'person', 'people') + ' covered, Fall & Winter 2026/27'],
      ['Indoor membership fees', '$' + Math.round(fees).toLocaleString('en-CA'), money(fees) + ' with HST; ' + money(pre) + ' before 13% HST'],
      ['Renewals due', num(f.due.length), 'Worth about $' + Math.round(worth).toLocaleString('en-CA') + ' with HST, at returning prices' + (onWait ? '; ' + onWait + ' already on the waitlist' : '')],
      ['Renewed from outdoor', pct + '%', f.crossed.length + ' of ' + f.out.length + ' Spring & Summer 2026 households'],
      ['Indoor waitlist', num(f.waitlist.length), 'Households waiting. 2026/27 capacity not published']
    ];
    $('[data-mb-kpis]').innerHTML = k.map(function (x) {
      return '<div class="pn-kpi"><p class="pn-kpi__label">' + esc(x[0]) + '</p><p class="pn-kpi__value pn-num">' + esc(x[1]) + '</p><p class="pn-kpi__note">' + esc(x[2]) + '</p></div>';
    }).join('');
  }

  /* Change of ends: one ball per household either side of the red net between the seasons.
     Filled balls crossed (outdoor 2026 and indoor 2026/27); hollow balls on the outdoor end have
     not renewed yet; hollow balls on the indoor end are new to the club this season. */
  function renderLedger() {
    var f = seasonFacts(), o = D.seasons[0], i = D.seasons[1];
    var crossedIds = {}; f.crossed.forEach(function (h) { crossedIds[h.id] = 1; });
    var balls = function (list, hollowWhen) {
      return list.slice().sort(function (a, b) { return (hollowWhen(a) ? 1 : 0) - (hollowWhen(b) ? 1 : 0); }).map(function (h) {
        return '<span class="mb-ball' + (hollowWhen(h) ? ' mb-ball--open' : '') + '"></span>';
      }).join('');
    };
    var notCrossed = function (h) { return !crossedIds[h.id]; };
    var fresh = f.ind.length - f.crossed.length;
    $('[data-mb-ledger]').innerHTML =
      '<div class="mb-ends__court" role="img" aria-label="' + esc(f.out.length + ' outdoor 2026 households, ' + f.crossed.length + ' of them renewed for indoor 2026/27 and ' + f.due.length + ' not yet. ' + f.ind.length + ' indoor households, ' + fresh + ' new this season.') + '">' +
        '<div class="mb-ends__side">' +
          '<p class="mb-ends__name">' + esc(o.name) + '</p><p class="mb-ends__dates">May 1 to Sep 30, approximately</p>' +
          '<div class="mb-ends__balls mb-ends__balls--out">' + balls(f.out, notCrossed) + '</div>' +
        '</div>' +
        '<div class="mb-ends__net" aria-hidden="true"><span class="mb-ends__post"></span><span class="mb-ends__cord"></span><span class="mb-ends__post"></span></div>' +
        '<div class="mb-ends__side">' +
          '<p class="mb-ends__name">' + esc(i.name) + '</p><p class="mb-ends__dates">Oct 12, likely, to Apr 25, 2027 ' + UI.confirmSlot('Indoor start date') + '</p>' +
          '<div class="mb-ends__balls">' + balls(f.ind, notCrossed) + '</div>' +
        '</div>' +
      '</div>' +
      '<dl class="mb-ends__key">' +
        '<div><dt><span class="mb-ball"></span>Crossed the net</dt><dd class="pn-num">' + f.crossed.length + '</dd></div>' +
        '<div><dt><span class="mb-ball mb-ball--open"></span>Outdoor, not renewed yet</dt><dd class="pn-num">' + f.due.length + ' <button type="button" class="pn-btn pn-btn--text pn-btn--sm" data-mb-goto="renewals">See renewals due</button></dd></div>' +
        '<div><dt><span class="mb-ball mb-ball--open"></span>New to the club indoors</dt><dd class="pn-num">' + fresh + '</dd></div>' +
      '</dl>';
  }

  /* ---------- Tabs (WAI-ARIA: arrows, Home, End; automatic activation) ---------- */
  var VIEWS = ['list', 'renewals', 'waitlist'];
  var view = 'list';
  function setView(v, focus) {
    if (VIEWS.indexOf(v) < 0) v = 'list';
    view = v; pref('view', v);
    $$('[data-mb-tabs] [role="tab"]').forEach(function (t) {
      var on = t.id === 'mb-tab-' + v;
      t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $$('[data-mb-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-mb-panel') !== v; });
    renderView();
  }
  function bindTabs() {
    var tabs = $$('[data-mb-tabs] [role="tab"]');
    tabs.forEach(function (t, n) {
      t.addEventListener('click', function () { setView(t.id.replace('mb-tab-', '')); });
      t.addEventListener('keydown', function (e) {
        var to = null;
        if (e.key === 'ArrowRight') to = (n + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') to = (n - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = tabs.length - 1;
        if (to == null) return;
        e.preventDefault(); setView(tabs[to].id.replace('mb-tab-', ''), true);
      });
    });
  }
  function renderCounts() {
    var f = seasonFacts();
    $('[data-mb-count="list"]').textContent = num(D.people.count());
    $('[data-mb-count="renewals"]').textContent = num(f.due.length);
    $('[data-mb-count="waitlist"]').textContent = num(f.waitlist.length);
  }
  function renderView() {
    if (view === 'list') renderList(); else if (view === 'renewals') renderRenewals(); else renderWaitlist();
  }

  /* ---------- Members: the list, with search and the four filters ---------- */
  var F = { q: '', cat: 'all', res: 'all', season: 'any', status: 'all', sort: 'name', dir: 1, shown: PAGE };
  (function () { var saved = pref('filters'); if (saved) ['cat', 'res', 'season', 'status', 'sort', 'dir'].forEach(function (k) { if (saved[k] != null) F[k] = saved[k]; }); })();
  var lastPlayed = null;
  function playedIndex() {
    if (lastPlayed) return lastPlayed;
    lastPlayed = {};
    D.bookings.all().forEach(function (b) {
      if (!b.personId || b.status !== 'completed') return;
      var l = lastPlayed[b.personId];
      if (!l || b.date > l.date || (b.date === l.date && b.start > l.start)) lastPlayed[b.personId] = b;
    });
    return lastPlayed;
  }
  function rows() {
    var lp = playedIndex();
    return D.people.all().map(function (p) {
      var m = D.member(p.id), h = m.household || {};
      var ind = m.current && m.current.status !== 'refunded' ? m.current : null;
      return { p: p, h: h, status: m.status, ind: ind, refunded: m.current && m.current.status === 'refunded' ? m.current : null, out: m.previous, last: lp[p.id] || null };
    });
  }
  function filtered() {
    var q = F.q.trim().toLowerCase(), digits = q.replace(/\D/g, '');
    return rows().filter(function (r) {
      if (F.status !== 'all' && r.status !== F.status) return false;
      if (F.res !== 'all' && (!!r.h.resident) !== (F.res === 'resident')) return false;
      if (F.season === 'indoor' && !r.ind) return false;
      if (F.season === 'outdoor' && !r.out) return false;
      if (F.season === 'none' && (r.ind || r.out)) return false;
      if (F.cat !== 'all') {
        var cats = F.season === 'indoor' ? [r.ind] : F.season === 'outdoor' ? [r.out] : [r.ind, r.out];
        if (!cats.some(function (m) { return m && m.category === F.cat; })) return false;
      }
      if (q) {
        var hay = (r.p.name + ' ' + (r.h.name || '') + ' ' + (r.p.email || '') + ' ' + (r.p.city || '')).toLowerCase();
        var ph = String(r.p.phone || '').replace(/\D/g, '');
        if (hay.indexOf(q) < 0 && !(digits.length >= 3 && ph.indexOf(digits) > -1)) return false;
      }
      return true;
    }).sort(function (a, b) {
      var x, y;
      if (F.sort === 'last') { x = a.last ? a.last.date + String(a.last.start).padStart(4, '0') : ''; y = b.last ? b.last.date + String(b.last.start).padStart(4, '0') : ''; }
      else if (F.sort === 'household') { x = a.h.surname + a.h.id; y = b.h.surname + b.h.id; }
      else { x = a.p.last + ' ' + a.p.first; y = b.p.last + ' ' + b.p.first; }
      return (x < y ? -1 : x > y ? 1 : 0) * F.dir;
    });
  }
  function seg(name, label, opts, cur) {
    /* A visible label, like the Category and Season selects beside it */
    return '<div class="mb-filter mb-filter--seg"><span class="mb-filter__k" id="mb-k-' + name + '">' + esc(label) + '</span>' +
      '<div class="pn-seg" role="group" aria-labelledby="mb-k-' + name + '">' + opts.map(function (o) {
      return '<button type="button" data-mb-f="' + name + '" data-v="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div></div>';
  }
  function select(name, label, opts, cur) {
    return '<label class="mb-filter"><span class="mb-filter__k">' + esc(label) + '</span><select class="pn-select" data-mb-f="' + name + '">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select></label>';
  }
  function memCell(m, season) {
    if (!m) return '<span class="pn-muted">None</span>';
    return esc(catLabel(m.category, season)) + '<span class="pn-sub">' + (m.resident ? 'Vaughan resident' : 'Non-resident') + (m.returning ? ', returning' : '') + '</span>';
  }
  function renderList() {
    var box = $('[data-mb-panel="list"]');
    var cats = [['all', 'All categories']].concat(D.categories.map(function (c) { return [c.id, c.label === 'Sunday Night Intercounty' ? 'Intercounty' : c.label]; })).concat([['student', 'Student (outdoor only)']]);
    if (!$('[data-mb-listbody]', box)) {
      box.innerHTML =
        '<div class="pn-toolbar mb-toolbar">' +
          '<label class="pn-search pn-toolbar__grow"><span class="sr-only">Search members</span>' + icon('search') +
            '<input class="pn-input" type="search" placeholder="Name, household, email or phone" data-mb-q autocomplete="off"></label>' +
          select('cat', 'Category', cats, F.cat) +
          select('season', 'Season', [['any', 'Any season'], ['indoor', 'Indoor 2026/27'], ['outdoor', 'Outdoor 2026'], ['none', 'No membership']], F.season) +
        '</div>' +
        '<div class="pn-toolbar mb-toolbar">' +
          seg('status', 'Status', [['all', 'All'], ['member', 'Member'], ['renewal-due', 'Renewal due'], ['waitlist', 'Waitlist'], ['contact', 'Contact']], F.status) +
          seg('res', 'Residency', [['all', 'Everyone'], ['resident', 'Vaughan resident'], ['non', 'Non-resident']], F.res) +
          '<button type="button" class="pn-btn pn-btn--text" data-mb-clear>Clear filters</button>' +
          '<p class="pn-toolbar__count" aria-live="polite" data-mb-listcount></p>' +
        '</div>' +
        '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="People">' +
          '<table class="pn-table mb-table"><thead><tr>' +
            '<th scope="col" data-sort="name"><button class="pn-table__sort" type="button" data-mb-sort="name">Name</button></th>' +
            '<th scope="col" data-sort="household"><button class="pn-table__sort" type="button" data-mb-sort="household">Household</button></th>' +
            '<th scope="col">Status</th><th scope="col">Indoor 2026/27</th><th scope="col">Outdoor 2026</th>' +
            '<th scope="col" data-sort="last"><button class="pn-table__sort" type="button" data-mb-sort="last">Last on court</button></th>' +
            '<th scope="col">Contact</th>' +
          '</tr></thead><tbody data-mb-listbody></tbody></table></div>' +
        '<div class="mb-more" data-mb-more></div>';
      $('[data-mb-q]', box).value = F.q;
    }
    $$('th[data-sort]', box).forEach(function (th) {
      var k = th.getAttribute('data-sort');
      if (k === F.sort) th.setAttribute('aria-sort', F.dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
    });
    var list = filtered(), part = list.slice(0, F.shown);
    var hhs = {}; list.forEach(function (r) { hhs[r.h.id] = 1; });
    $('[data-mb-listcount]', box).textContent = plural(list.length, 'person', 'people') + ' in ' + plural(Object.keys(hhs).length, 'household');
    $('[data-mb-listbody]', box).innerHTML = part.length ? part.map(function (r) {
      var p = r.p, last = r.last;
      return '<tr data-mb-person="' + p.id + '">' +
        '<td><button type="button" class="pn-rowlink" data-mb-open="' + p.id + '">' + esc(p.name) + '</button><span class="pn-sub">' + (p.age != null ? 'Age ' + p.age + ', ' : '') + esc(p.role) + (p.primary ? ', primary contact' : '') + '</span></td>' +
        '<td>' + esc(String(r.h.name || '').replace(/ household$/, '')) + '<span class="pn-sub">' + esc(r.h.city || '') + ' ' + esc(fsa(r.h.postal)) + '</span></td>' +
        '<td>' + UI.chip(r.status) + (r.refunded ? '<span class="pn-sub">Indoor refunded</span>' : '') + '</td>' +
        '<td>' + memCell(r.ind, INDOOR) + '</td>' +
        '<td>' + memCell(r.out, OUTDOOR) + '</td>' +
        '<td class="pn-nowrap">' + (last ? esc(fmt.day(last.date)) + '<span class="pn-sub">Court ' + last.court + ', ' + esc(fmt.time(last.start)) + '</span>' : '<span class="pn-muted">Not on record</span>') + '</td>' +
        '<td class="mb-contact">' + (p.email ? mail(p.email) : '<span class="pn-muted">Through the household</span>') + (p.phone ? '<span class="pn-sub pn-num">' + esc(p.phone) + '</span>' : '') + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="7"><div class="pn-empty"><p class="pn-empty__title">No one matches these filters</p><p>Try another category or season, or clear the filters.</p></div></td></tr>';
    var more = $('[data-mb-more]', box);
    more.innerHTML = list.length > part.length ? '<button type="button" class="pn-btn pn-btn--quiet" data-mb-showmore>Show ' + Math.min(PAGE, list.length - part.length) + ' more of ' + num(list.length - part.length) + '</button>' : '';
  }
  function bindList() {
    var box = $('[data-mb-panel="list"]');
    var saveF = function () { pref('filters', { cat: F.cat, res: F.res, season: F.season, status: F.status, sort: F.sort, dir: F.dir }); };
    box.addEventListener('input', function (e) {
      if (e.target.matches('[data-mb-q]')) { F.q = e.target.value; F.shown = PAGE; renderList(); }
    });
    box.addEventListener('change', function (e) {
      var s = e.target.closest('select[data-mb-f]'); if (!s) return;
      F[s.getAttribute('data-mb-f')] = s.value; F.shown = PAGE; saveF(); renderList();
    });
    box.addEventListener('click', function (e) {
      var t = e.target;
      var f = t.closest('button[data-mb-f]');
      if (f) {
        F[f.getAttribute('data-mb-f')] = f.getAttribute('data-v'); F.shown = PAGE; saveF();
        $$('button[data-mb-f="' + f.getAttribute('data-mb-f') + '"]', box).forEach(function (b) { b.setAttribute('aria-pressed', String(b === f)); });
        renderList(); return;
      }
      var s = t.closest('[data-mb-sort]');
      if (s) { var k = s.getAttribute('data-mb-sort'); F.dir = F.sort === k ? -F.dir : (k === 'last' ? -1 : 1); F.sort = k; saveF(); renderList(); return; }
      if (t.closest('[data-mb-clear]')) {
        F.q = ''; F.cat = 'all'; F.res = 'all'; F.season = 'any'; F.status = 'all'; F.shown = PAGE; saveF();
        box.innerHTML = ''; renderList(); $('[data-mb-q]', box).focus(); UI.toast('Filters cleared. Showing everyone.'); return;
      }
      if (t.closest('[data-mb-showmore]')) {
        var before = F.shown; F.shown += PAGE; renderList();
        var next = $$('[data-mb-open]', box)[before]; if (next) next.focus(); return;
      }
      var o = t.closest('[data-mb-open]') || (t.closest('tr[data-mb-person]') && !t.closest('a,button') ? t.closest('tr[data-mb-person]') : null);
      if (o) openProfile(o.getAttribute('data-mb-open') || o.getAttribute('data-mb-person'), o.matches('button') ? o : $('[data-mb-open]', o));
    });
  }

  /* ---------- The court, drawn true: 78 x 36 ft doubles court in feet, portrait. Singles
     sidelines 4.5 ft in, service lines 21 ft from the net, the centre service line, 4 in centre
     marks, and the net in club red running 3 ft past each doubles sideline to its posts. ---------- */
  function courtSvg(share, label) {
    var a = (0.03 + 0.2 * share).toFixed(3);
    return '<svg class="cplan mb-court" viewBox="-5 -3 46 84" role="img" aria-label="' + esc(label) + '">' +
      '<rect class="mb-court__fill" x="0" y="0" width="36" height="78" style="fill-opacity:' + a + '"/>' +
      '<g class="cplan__lines"><rect x="0" y="0" width="36" height="78"/>' +
        '<path d="M4.5 0V78M31.5 0V78M4.5 18H31.5M4.5 60H31.5M18 18V60M18 0V0.75M18 78V77.25"/></g>' +
      '<line class="cplan__net" x1="-3" y1="39" x2="39" y2="39"/>' +
      '<circle class="mb-court__post" cx="-3" cy="39" r="0.9"/><circle class="mb-court__post" cx="39" cy="39" r="0.9"/>' +
    '</svg>';
  }
  function courtsPlayed(st) {
    var total = st.courts.reduce(function (a, b) { return a + b; }, 0);
    var max = Math.max.apply(null, st.courts.concat([1]));
    return '<ol class="mb-courts">' + D.courts.map(function (c, n) {
      var v = st.courts[n];
      return '<li class="mb-courts__c' + (v === max && total ? ' is-most' : '') + '">' + courtSvg(total ? v / max : 0, c.name + ': ' + plural(v, 'booking')) +
        '<span class="mb-courts__name">' + esc(c.name) + '</span><span class="mb-courts__n pn-num">' + plural(v, 'booking') + '</span></li>';
    }).join('') + '</ol>';
  }
  var BAND_NAME = { regular: 'Regular, weekdays 6:30am to 6:30pm', prime: 'Prime, weeknights to 11:30pm', weekend: 'Weekend, 7am to 11pm', outdoor: 'Outdoor booking windows' };
  function strikes(n, what) {
    var marks = [0, 1, 2].map(function (i) { return '<span class="mb-strike' + (i < n ? ' is-on' : '') + '"></span>'; }).join('');
    return '<div class="mb-standing__row"><span class="mb-standing__k">' + esc(what) + '</span><span class="mb-strikes" aria-hidden="true">' + marks + '</span><span class="pn-num">' + Math.min(n, 99) + ' of 3</span></div>';
  }

  /* ---------- Profile: one wide sheet, seven tabs ---------- */
  var PTABS = [['overview', 'Overview'], ['household', 'Household'], ['memberships', 'Memberships'], ['bookings', 'Bookings'], ['programs', 'Programs'], ['payments', 'Payments'], ['notes', 'Notes']];
  var prof = { id: null, tab: 'overview', back: null, bookAll: false };
  function setParam(k, v) {
    try {
      var u = new URL(location.href);
      if (v) u.searchParams.set(k, v); else u.searchParams.delete(k);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* file:// in an old browser: the address stays as it is */ }
  }
  function priceBuild(m, label) {
    var rows = [['Fee', money(m.base != null ? m.base : m.subtotal)]];
    if (m.discount) rows.push(['Returning discount', '-' + money(m.discount)]);
    rows.push(['Before HST', money(m.subtotal)], ['HST 13%', money(m.hst)], ['Total', money(m.total)]);
    return '<table class="mb-price" aria-label="' + esc(label) + '"><tbody>' + rows.map(function (r, i) {
      return '<tr' + (i === rows.length - 1 ? ' class="is-total"' : '') + '><th scope="row">' + esc(r[0]) + '</th><td class="pn-money">' + esc(r[1]) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function thisSeasonCard(mem, h) {
    var cur = mem.current, out = hhSeason(h.id, OUTDOOR);
    if (cur && cur.status !== 'refunded') {
      return '<div class="pn-card mb-card"><p class="pn-kicker">Fall &amp; Winter 2026/27</p>' +
        '<p class="mb-card__title">' + esc(catLabel(cur.category, INDOOR)) + ', ' + (cur.resident ? 'Vaughan resident' : 'non-resident') + '</p>' +
        '<p class="pn-muted">' + UI.chip(cur.status) + ' Registered ' + esc(fmt.stamp(cur.registeredAt)) + (cur.preApproved ? ', pre-approved' : '') + '</p>' +
        priceBuild(cur, 'Indoor membership price') +
        (cur.paymentId ? '<p><a class="inline-link" href="' + UI.link('payments', 'pay=' + cur.paymentId) + '">Payment ' + esc(cur.paymentId) + '</a></p>' : '') + '</div>';
    }
    var cat = renewCategory(h, out), q = quote(cat, h.resident, !!out);
    return '<div class="pn-card pn-card--alt mb-card"><p class="pn-kicker">Fall &amp; Winter 2026/27</p>' +
      '<p class="mb-card__title">' + (cur ? 'Indoor membership refunded' : out ? 'Not renewed yet' : 'No membership') + '</p>' +
      '<p class="pn-muted">If they join: ' + esc(catLabel(cat, INDOOR)) + ', ' + (h.resident ? 'Vaughan resident' : 'non-resident') + (out && cat !== 'intercounty' ? ', with the $25 returning discount' : '') + '. Sign-up is online only.</p>' +
      priceBuild(q, 'Indoor membership quote') + '</div>';
  }
  function overview(p, mem, h) {
    var st = personStats(p.id), bands = Object.keys(st.bands).sort(function (a, b) { return st.bands[b] - st.bands[a]; });
    var contact = [
      ['Email', p.email ? mail(p.email) : '<span class="pn-muted">None of their own; reach the household</span>'],
      ['Phone', p.phone ? '<span class="pn-num">' + esc(p.phone) + '</span>' : '<span class="pn-muted">None of their own</span>'],
      ['Lives in', esc(p.city || h.city || '') + ' ' + esc(fsa(h.postal))],
      ['Residency', h.resident ? 'Vaughan resident: resident prices' : 'Non-resident prices'],
      ['Born', p.born ? p.born + ', age ' + p.age + ' (' + esc(p.role) + ')' : '<span class="pn-muted">Not on record</span>'],
      ['Rating', p.rating ? esc(p.rating) : '<span class="pn-muted">Not rated</span>'],
      ['Club news', p.marketing ? 'Opted in' : 'Opted out']
    ];
    return '<div class="mb-ov">' +
      '<dl class="pn-dl mb-ov__contact">' + contact.map(function (c) { return '<div><dt>' + c[0] + '</dt><dd>' + c[1] + '</dd></div>'; }).join('') + '</dl>' +
      thisSeasonCard(mem, h) +
      '<section class="mb-ov__court" aria-labelledby="mb-oc-h"><h3 class="pn-h3" id="mb-oc-h">On court</h3>' +
        (st.bookings.length ? courtsPlayed(st) +
          '<dl class="pn-dl"><div><dt>Last played</dt><dd>' + (st.last ? esc(fmt.day(st.last.date)) + ', ' + esc(fmt.range(st.last.start, st.last.hours)) + ', Court ' + st.last.court : 'Not on record') + '</dd></div>' +
          '<div><dt>Next booking</dt><dd>' + (st.next ? esc(fmt.day(st.next.date)) + ', ' + esc(fmt.range(st.next.start, st.next.hours)) + ', Court ' + st.next.court : 'None booked') + '</dd></div>' +
          '<div><dt>Usually plays</dt><dd>' + (bands.length ? esc(BAND_NAME[bands[0]] || bands[0]) : 'Not on record') + '</dd></div></dl>'
          : '<p class="pn-muted">No court bookings on record. Members book their own courts online; the desk does not book for members.</p>') +
        '<div class="mb-standing"><p class="pn-h3">Booking standing, ' + esc(D.currentSeason().short) + '</p>' +
          strikes(st.current.noShow, 'No-shows') + strikes(st.current.late, 'Late cancels, under 48 hours') +
          '<p class="pn-help">Three of either and the club may suspend booking for 7 days. Outdoor 2026: ' + plural(st.outdoor.noShow, 'no-show') + ', ' + plural(st.outdoor.late, 'late cancel') + '.</p></div>' +
      '</section></div>';
  }

  function household(p, mem, h) {
    var people = h.personIds.map(function (id) { return D.people.get(id); }).filter(Boolean);
    return '<dl class="pn-dl"><div><dt>Household</dt><dd>' + esc(h.name) + ', ' + esc(h.kind) + '</dd></div>' +
      '<div><dt>Lives in</dt><dd>' + esc(h.city) + ' ' + esc(fsa(h.postal)) + (h.resident ? ', Vaughan resident' : ', non-resident') + '</dd></div></dl>' +
      '<ul class="mb-people">' + people.map(function (x) {
        var s = D.member(x.id).status, me = x.id === p.id;
        return '<li class="mb-people__p' + (me ? ' is-me' : '') + '"><div><p class="mb-people__name">' + esc(x.name) + (x.primary ? ' <span class="pn-sub mb-inline">Primary contact</span>' : '') + '</p>' +
          '<p class="pn-sub">' + (x.age != null ? 'Age ' + x.age + ', ' : '') + esc(x.role) + (x.email ? ', ' + mail(x.email) : '') + '</p></div>' +
          '<div class="pn-row">' + UI.chip(s) + (me ? '<span class="pn-muted mb-here">Open now</span>' : '<button type="button" class="pn-btn pn-btn--quiet pn-btn--sm" data-mb-switch="' + x.id + '">Open ' + esc(x.first) + '</button>') + '</div></li>';
      }).join('') + '</ul>';
  }
  function memberships(p, mem, h) {
    var ms = hhMemberships(h.id).sort(function (a, b) { return a.registeredAt < b.registeredAt ? 1 : -1; });
    var rem = remindersFor(h.id);
    return '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Membership history"><table class="pn-table"><thead><tr>' +
      '<th scope="col">Season</th><th scope="col">Category</th><th scope="col" class="is-num">Before HST</th><th scope="col" class="is-num">HST</th><th scope="col" class="is-num">Total</th><th scope="col">Status</th></tr></thead><tbody>' +
      (ms.length ? ms.map(function (m) {
        return '<tr><td class="pn-nowrap">' + esc(seasonShort(m.season)) + '<span class="pn-sub">' + esc(fmt.date(new Date(m.registeredAt))) + '</span></td>' +
          '<td>' + esc(catLabel(m.category, m.season)) + '<span class="pn-sub">' + (m.resident ? 'Vaughan resident' : 'Non-resident') + (m.discount ? ', $25 returning discount' : '') + '</span></td>' +
          '<td class="is-num pn-money">' + money(m.subtotal) + '</td><td class="is-num pn-money">' + money(m.hst) + '</td><td class="is-num pn-money">' + money(m.total) + '</td>' +
          '<td>' + UI.chip(m.status) + (m.paymentId ? '<span class="pn-sub"><a class="inline-link" href="' + UI.link('payments', 'pay=' + m.paymentId) + '">' + esc(m.paymentId) + '</a></span>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="is-muted">No memberships on record.</td></tr>') +
      '</tbody></table></div>' +
      '<p class="pn-note">' + icon('alert') + '<span>Memberships are only for the full indoor season; the club offers no partial memberships. Fees exclude HST, so 13% is added.</span></p>' +
      '<h3 class="pn-h3 mb-gap">Renewal reminders</h3>' +
      (rem.length ? '<ul class="mb-rem">' + rem.map(function (r) {
        return '<li><span class="mb-stamp">' + esc(fmt.stamp(r.at)) + '</span> ' + esc(r.channel === 'sms' ? 'Text message' : 'Email') + ' to ' + esc(D.personName(r.personId)) + ' ' +
          (r.status === 'sent' ? UI.chip('completed', 'Sent') : UI.chip('draft', 'Draft, not sent')) + '</li>';
      }).join('') + '</ul>' : '<p class="pn-muted">No reminders on record.</p>');
  }
  function bookings(p) {
    var st = personStats(p.id), list = st.bookings.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.start - a.start; });
    var part = prof.bookAll ? list : list.slice(0, 12);
    if (!list.length) return '<div class="pn-empty"><p class="pn-empty__title">No court bookings on record</p><p>Members book their own courts online, up to 7 days ahead from 7:30am. Staff do not book courts for members.</p></div>';
    return '<p class="pn-muted">' + plural(st.played, 'match', 'matches') + ' played, ' + plural(list.length, 'booking') + ' in all. Court fees include HST.</p>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Court bookings"><table class="pn-table"><thead><tr>' +
      '<th scope="col">Day</th><th scope="col">Time</th><th scope="col">Court</th><th scope="col">Players</th><th scope="col" class="is-num">Paid</th><th scope="col">Status</th></tr></thead><tbody>' +
      part.map(function (b) {
        return '<tr><td class="pn-nowrap"><a href="' + UI.link('bookings', 'date=' + b.date) + '">' + esc(fmt.day(b.date)) + '</a><span class="pn-sub">' + esc(seasonShort(b.season)) + '</span></td>' +
          '<td class="pn-nowrap">' + esc(fmt.range(b.start, b.hours)) + '<span class="pn-sub">' + esc(b.band === 'outdoor' ? 'Outdoor window' : b.band.charAt(0).toUpperCase() + b.band.slice(1) + ' band') + '</span></td>' +
          '<td>Court ' + b.court + '</td><td class="pn-num">' + (b.players || '') + (b.guests ? '<span class="pn-sub">' + plural(b.guests, 'guest') + ' at $10</span>' : '') + '</td>' +
          '<td class="is-num pn-money">' + (b.total ? money(b.total) : '<span class="pn-muted">In membership</span>') + '</td><td>' + UI.chip(b.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (list.length > part.length ? '<p class="mb-more"><button type="button" class="pn-btn pn-btn--quiet" data-mb-allbookings>Show all ' + list.length + ' bookings</button></p>' : '');
  }
  function programs(p, mem, h) {
    var regs = D.registrations.list({ householdId: h.id }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    if (!regs.length) return '<div class="pn-empty"><p class="pn-empty__title">No programs or camps on record</p><p>Lessons, camps and leagues this household registers for appear here.</p></div>';
    return '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Programs and camps"><table class="pn-table"><thead><tr>' +
      '<th scope="col">Program</th><th scope="col">Who</th><th scope="col">Term</th><th scope="col" class="is-num">Price</th><th scope="col">Status</th></tr></thead><tbody>' +
      regs.map(function (r) {
        var s = D.sessions.get(r.sessionId) || {};
        /* League fees are per week or per event (the club's own units); say so, with the tax treatment */
        var unit = s.kind === 'league' ? (s.priceUnit === 'week' ? ' a week' : s.priceUnit === 'event' ? ' an event' : '') : '';
        var tax = r.hst ? 'HST added' : s.kind === 'camp' || s.hstIncluded == null ? 'HST not stated' : s.hstIncluded ? 'HST included' : '';
        var price = r.total != null ? '<span class="pn-money">' + money(r.total) + '</span>' + esc(unit) + '<span class="pn-sub">' + tax + '</span>' :
          UI.confirmSlot(s.kind === 'hp' ? 'High Performance price' : s.kind === 'league' ? 'League fee' : 'Group lesson price');
        return '<tr><td><a href="' + UI.link('programs', 'session=' + r.sessionId) + '">' + esc(s.title || r.sessionId) + '</a><span class="pn-sub">' + esc(s.program || '') + (r.optionLabel ? ', ' + esc(r.optionLabel) : '') + '</span></td>' +
          '<td>' + esc(D.personName(r.personId)) + '</td><td>' + esc(s.term || '') + '</td><td class="is-num">' + price + '</td>' +
          '<td>' + UI.chip(r.status) + (r.approval ? '<span class="pn-sub">Pro National: ' + esc(r.approval) + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function payments(p, mem, h) {
    var pays = D.payments.list({ householdId: h.id }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    if (!pays.length) return '<div class="pn-empty"><p class="pn-empty__title">No payments on record</p><p>Payments appear here as records. Nothing is charged from this panel.</p></div>';
    var total = pays.reduce(function (n, x) { return n + (x.total || 0) - (x.refunded || 0); }, 0);
    var tax = function (x) { return x.hstIncluded === true ? 'HST ' + money(x.hst || D.hstIn(x.total)) + ' included' : x.hstIncluded === false ? money(x.hst) + ' HST added' : 'HST not stated'; };
    return '<p class="pn-muted">' + plural(pays.length, 'payment') + ', ' + money(total) + ' net of refunds. Records only: card details are never shown or entered here.</p>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Payments"><table class="pn-table"><thead><tr>' +
      '<th scope="col">Date</th><th scope="col">For</th><th scope="col">Method</th><th scope="col" class="is-num">Amount</th><th scope="col">Status</th></tr></thead><tbody>' +
      pays.map(function (x) {
        return '<tr><td class="pn-nowrap"><a href="' + UI.link('payments', 'pay=' + x.id) + '">' + esc(fmt.date(new Date(x.at))) + '</a><span class="pn-sub">' + esc(x.id) + '</span></td>' +
          '<td>' + esc(x.description || x.kind) + '</td><td class="pn-nowrap">' + esc(x.method) + ' ' + esc(x.last4 ? 'ending ' + x.last4 : '') + '</td>' +
          '<td class="is-num pn-money">' + money(x.total) + '<span class="pn-sub">' + esc(tax(x)) + '</span></td><td>' + UI.chip(x.status) + (x.refunded ? '<span class="pn-sub">' + money(x.refunded) + ' back</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------- Notes: staff only, kept in this browser; plus the demo's activity for the household ---------- */
  function writeNotes(h, entry, text) {
    var p = primaryOf(h), before = (p.notes || []).slice();
    D.people.update(p.id, { notes: before.concat([entry]) }, text);
    return function undo() { D.people.update(p.id, { notes: before }, 'Undid: ' + text); };
  }
  function notes(p, mem, h) {
    var list = notesFor(h), may = UI.can('members.notes');
    var ids = {}; h.personIds.forEach(function (x) { ids[x] = 1; }); ids[h.id] = 1;
    hhMemberships(h.id).concat(D.reminders.list({ householdId: h.id }), D.waitlists.list({ householdId: h.id })).forEach(function (r) { ids[r.id] = 1; });
    var act = D.activity().filter(function (a) { return a.ref && ids[a.ref.id]; }).slice(0, 12);
    return '<form class="pn-form mb-noteform" data-mb-noteform novalidate>' +
        '<div class="pn-field"><label class="pn-label" for="mb-note-text">New note about the ' + esc(h.name) + '</label>' +
        '<textarea class="pn-textarea" id="mb-note-text" rows="3" maxlength="600" aria-describedby="mb-note-help"' + (may ? '' : ' disabled') + '></textarea>' +
        '<p class="pn-help" id="mb-note-help">' + (may ? 'Staff only; members never see notes. Kept in this browser only.' : 'Notes are written by the ' + esc(whoCan('members.notes')) + '. Signed in as ' + esc(D.roleName()) + '.') + '</p></div>' +
        '<div class="pn-row mb-noteform__foot"><label class="pn-check"><input type="checkbox" data-mb-pin' + (may ? '' : ' disabled') + '> Pin to the top</label>' +
        btn('members.notes', 'Add note', 'pn-btn--ink', 'data-mb-addnote') + '</div>' +
      '</form>' +
      '<h3 class="pn-h3 mb-gap">Notes <span class="pn-muted">' + list.length + '</span></h3>' +
      (list.length ? '<ol class="mb-notes">' + list.map(function (n) {
        return '<li class="mb-note' + (n.pinned ? ' is-pinned' : '') + '"><p class="mb-note__meta"><span class="mb-note__by">' + esc(n.by) + '</span> <span class="mb-stamp">' + esc(fmt.stamp(n.at)) + '</span>' +
          (n.pinned ? ' <span class="chip pn-chip">Pinned</span>' : '') + (n.sample ? ' <span class="pn-sample">Sample</span>' : '') + '</p>' +
          '<p class="mb-note__text">' + esc(n.text) + '</p>' +
          '<p class="pn-row mb-note__acts">' + btn('members.notes', n.pinned ? 'Unpin' : 'Pin', 'pn-btn--text pn-btn--sm', 'data-mb-notepin="' + n.id + '"' + (n.pinned ? ' data-on' : '')) +
          btn('members.notes', 'Remove', 'pn-btn--text pn-btn--sm', 'data-mb-notedel="' + n.id + '"') + '</p></li>';
      }).join('') + '</ol>' : '<p class="pn-muted">No notes yet.</p>') +
      '<h3 class="pn-h3 mb-gap">In this demo</h3>' +
      (act.length ? '<ol class="mb-act">' + act.map(function (a) { return '<li><span class="mb-stamp">' + esc(fmt.stamp(a.at)) + '</span> <span class="mb-note__by">' + esc(a.by) + '</span> ' + esc(a.text) + '</li>'; }).join('') + '</ol>'
        : '<p class="pn-muted">Nothing changed for this household in this browser yet.</p>');
  }

  /* ---------- The profile sheet ---------- */
  var RENDER = { overview: overview, household: household, memberships: memberships, bookings: bookings, programs: programs, payments: payments, notes: notes };
  function profileBody(p, mem, h) {
    return '<div class="mb-prof__head"><p class="pn-row">' + UI.chip(mem.status) + (mem.status !== 'waitlist' && waitPlaces()[h.id] ? ' ' + UI.chip('waitlist', 'On the waitlist, place ' + waitPlaces()[h.id].place) : '') + ' <span>' + esc(h.name) + ', ' + plural(h.personIds.length, 'person', 'people') + '</span> <span class="pn-sample">Sample data</span></p></div>' +
      '<div class="pn-tabs mb-ptabs" role="tablist" aria-label="Profile sections">' + PTABS.map(function (t) {
        var on = t[0] === prof.tab;
        return '<button type="button" role="tab" id="mb-pt-' + t[0] + '" aria-controls="mb-pp" aria-selected="' + on + '"' + (on ? '' : ' tabindex="-1"') + ' data-mb-ptab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="mb-pp" id="mb-pp" role="tabpanel" aria-labelledby="mb-pt-' + prof.tab + '" tabindex="0" data-mb-pp></div>';
  }
  function profileFoot(mem) {
    return '<button type="button" class="pn-btn pn-btn--quiet" data-sheet-close>Close</button>' +
      btn('members.edit', 'Edit contact', 'pn-btn--quiet', 'data-mb-edit') +
      btn('members.remind', mem.status === 'renewal-due' && !waitPlaces()[mem.household.id] ? 'Draft a renewal reminder' : 'Draft an email', 'pn-btn--ink', 'data-mb-draft');
  }
  function renderTab() {
    var el = UI.sheet.el(), pp = el && $('[data-mb-pp]', el); if (!pp || !prof.id) return;
    var mem = D.member(prof.id); if (!mem) return;
    pp.setAttribute('aria-labelledby', 'mb-pt-' + prof.tab);
    pp.innerHTML = RENDER[prof.tab](mem.person, mem, mem.household);
  }
  function setPTab(t, focus) {
    prof.tab = t;
    var el = UI.sheet.el();
    $$('[data-mb-ptab]', el).forEach(function (b) { var on = b.getAttribute('data-mb-ptab') === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    renderTab();
  }
  /* Whatever sheet a profile led to, closing it returns focus to the row it was opened from */
  function closedFrom(pid) {
    prof.id = null; setParam('person', null);
    var b = prof.back && document.body.contains(prof.back) ? prof.back : $('[data-mb-open="' + pid + '"]');
    if (b) setTimeout(function () { b.focus(); }, 0);
  }
  function openProfile(pid, back, tab) {
    var mem = D.member(pid);
    if (!mem) { UI.toast('No member ' + pid + ' in the sample data.', { kind: 'warn' }); return; }
    var keep = prof.id === pid ? prof.tab : 'overview';
    prof.id = pid; prof.tab = tab || keep; prof.bookAll = false;
    if (back) prof.back = back;
    setParam('person', pid);
    var el = UI.sheet.open({ kicker: 'Member profile', title: mem.person.name, wide: true, body: profileBody(mem.person, mem, mem.household), foot: profileFoot(mem),
      onClose: function () { closedFrom(pid); } });
    el.classList.add('mb-sheet');
    renderTab();
    var cur = $('[data-mb-ptab][aria-selected="true"]', el); if (cur) cur.focus();
    if (!el.__mb) { el.__mb = 1; bindSheet(el); }
  }

  function bindSheet(el) {
    el.addEventListener('click', function (e) {
      var t = e.target; if (!prof.id) return;
      if (denied(t)) { e.preventDefault(); return; }
      var pt = t.closest('[data-mb-ptab]'); if (pt) { setPTab(pt.getAttribute('data-mb-ptab')); return; }
      var sw = t.closest('[data-mb-switch]'); if (sw) { openProfile(sw.getAttribute('data-mb-switch'), null, prof.tab); return; }
      if (t.closest('[data-mb-allbookings]')) { prof.bookAll = true; renderTab(); var w = $('[data-mb-pp] .pn-table-wrap', el); if (w) w.focus(); return; }
      if (t.closest('[data-mb-edit]')) { editContact(prof.id); return; }
      if (t.closest('[data-mb-draft]')) { var m = D.member(prof.id); draftSheet([m.household.id], { from: prof.id, renewal: m.status === 'renewal-due' && !waitPlaces()[m.household.id] }); return; }
      var mem = D.member(prof.id), h = mem.household;
      if (t.closest('[data-mb-addnote]')) { e.preventDefault(); addNote(h); return; }
      var pin = t.closest('[data-mb-notepin]');
      if (pin) {
        var on = !pin.hasAttribute('data-on'), id = pin.getAttribute('data-mb-notepin');
        var undo = writeNotes(h, { pins: id, pinned: on }, (on ? 'Pinned' : 'Unpinned') + ' a note for the ' + h.name);
        notify(on ? 'Note pinned. Kept in this browser only.' : 'Note unpinned.', undo);
        return;
      }
      var del = t.closest('[data-mb-notedel]');
      if (del) {
        var nid = del.getAttribute('data-mb-notedel');
        UI.confirm({ title: 'Remove this note?', body: '<p>It goes from this household\'s record in this browser. You can undo straight after.</p>', confirm: 'Remove note', cancel: 'Keep it', danger: true }).then(function (yes) {
          if (!yes) return;
          var undo = writeNotes(h, { hides: nid }, 'Removed a note for the ' + h.name);
          notify('Note removed. Kept in this browser only.', undo);
          var ta = $('#mb-note-text', el); if (ta) ta.focus();
        });
      }
    });
    el.addEventListener('keydown', function (e) {
      var pt = e.target.closest && e.target.closest('[data-mb-ptab]'); if (!pt) return;
      var i = PTABS.map(function (x) { return x[0]; }).indexOf(pt.getAttribute('data-mb-ptab')), to = null;
      if (e.key === 'ArrowRight') to = (i + 1) % PTABS.length; else if (e.key === 'ArrowLeft') to = (i - 1 + PTABS.length) % PTABS.length;
      else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = PTABS.length - 1;
      if (to == null) return;
      e.preventDefault(); setPTab(PTABS[to][0], true);
    });
    el.addEventListener('submit', function (e) { if (e.target.matches('[data-mb-noteform]')) { e.preventDefault(); if (UI.can('members.notes')) addNote(D.member(prof.id).household); } });
  }
  function addNote(h) {
    var el = UI.sheet.el(), ta = $('#mb-note-text', el), help = $('#mb-note-help', el);
    var text = (ta.value || '').trim();
    var old = $('.pn-error', ta.parentNode); if (old) old.remove();
    if (!text) {
      ta.setAttribute('aria-invalid', 'true'); ta.setAttribute('aria-describedby', 'mb-note-err mb-note-help');
      help.insertAdjacentHTML('beforebegin', '<p class="pn-error" id="mb-note-err">' + icon('alert') + 'Write the note first</p>');
      ta.focus(); return;
    }
    var pinned = !!$('[data-mb-pin]', el).checked;
    var undo = writeNotes(h, { id: 'n-demo-' + Date.now().toString(36), at: new Date(D.clock.now).toISOString(), role: D.role(), by: D.roleName(), text: text, pinned: pinned }, 'Added a note for the ' + h.name);
    notify('Note added to the ' + h.name + '. Kept in this browser only.', undo);
    var nt = $('#mb-note-text', el); if (nt) nt.focus();
  }

  /* ---------- Edit contact details: a record change, kept in this browser ---------- */
  function editContact(pid) {
    var p = D.people.get(pid);
    var body = '<form class="pn-form" data-mb-cform novalidate>' +
      '<p class="pn-muted">Changes stay in this browser. A real panel would also email the member to confirm a new address.</p>' +
      '<div class="pn-field"><label class="pn-label" for="mb-c-email">Email</label><input class="pn-input" id="mb-c-email" type="email" autocomplete="off" value="' + esc(p.email || '') + '"></div>' +
      '<div class="pn-field"><label class="pn-label" for="mb-c-phone">Phone</label><input class="pn-input" id="mb-c-phone" type="tel" autocomplete="off" inputmode="tel" value="' + esc(p.phone || '') + '"><p class="pn-help">10 digits, for example 905-555-0123</p></div>' +
      '<label class="pn-check"><input type="checkbox" id="mb-c-news"' + (p.marketing ? ' checked' : '') + '> Club news by email (marketing opt-in)</label>' +
      '</form>';
    var el = UI.sheet.open({ kicker: 'Edit contact', title: p.name, body: body,
      foot: '<button type="button" class="pn-btn pn-btn--quiet" data-mb-cback>Back to profile</button><button type="button" class="pn-btn pn-btn--ink" data-mb-csave>Save changes</button>',
      onClose: function () { closedFrom(pid); } });
    var back = function () { openProfile(pid, null, prof.tab); };
    $('[data-mb-cback]', el).addEventListener('click', back);
    var save = function (e) {
      if (e) e.preventDefault();
      $$('.pn-error', el).forEach(function (x) { x.remove(); });
      var em = $('#mb-c-email', el), ph = $('#mb-c-phone', el), bad = null;
      [em, ph].forEach(function (x) { x.removeAttribute('aria-invalid'); x.removeAttribute('aria-describedby'); });
      var digits = ph.value.replace(/\D/g, '');
      if (em.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value)) bad = [em, 'Enter an email like name@example.com'];
      else if (ph.value && digits.length !== 10) bad = [ph, 'Enter a 10 digit phone number'];
      if (bad) {
        bad[0].setAttribute('aria-invalid', 'true'); bad[0].setAttribute('aria-describedby', bad[0].id + '-err');
        bad[0].insertAdjacentHTML('afterend', '<p class="pn-error" id="' + bad[0].id + '-err">' + icon('alert') + esc(bad[1]) + '</p>');
        bad[0].focus(); return;
      }
      var phone = digits ? digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6) : null;
      var before = { email: p.email, phone: p.phone, marketing: p.marketing };
      D.people.update(pid, { email: em.value.trim() || null, phone: phone, marketing: $('#mb-c-news', el).checked }, 'Contact details updated for ' + p.name);
      back();
      notify('Contact details updated for ' + p.name + '. Kept in this browser only.', function () { D.people.update(pid, before, 'Undid a contact change for ' + p.name); });
    };
    $('[data-mb-csave]', el).addEventListener('click', save);
    $('[data-mb-cform]', el).addEventListener('submit', save);
  }

  /* ---------- Renewals due: outdoor 2026 households with no indoor 2026/27 membership ---------- */
  var R = { filter: 'all', sort: 'last', sel: {} };
  function hhLast(h) {
    var lp = playedIndex(), best = null;
    h.personIds.forEach(function (id) { var b = lp[id]; if (b && (!best || b.date > best.date)) best = b; });
    return best;
  }
  /* Households already on the indoor waitlist are reached from there, not with a renewal reminder
     (a "sign up online" email to someone waiting for a spot contradicts the waitlist). */
  function waitPlaces() {
    var m = {};
    D.waitlists.list({ list: 'membership-indoor-2026', status: ['waiting', 'offered'] })
      .sort(function (a, b) { return (a.position || 99) - (b.position || 99) || (a.addedAt < b.addedAt ? -1 : 1); })
      .forEach(function (w, i) { m[w.householdId] = { w: w, place: i + 1 }; });
    return m;
  }
  function renewalRows() {
    var W = waitPlaces();
    return D.renewalsDue().map(function (h) {
      var out = hhSeason(h.id, OUTDOOR), cat = renewCategory(h, out), q = quote(cat, h.resident, true);
      var rem = remindersFor(h.id), sent = rem.filter(function (r) { return r.status === 'sent'; }), drafts = rem.filter(function (r) { return r.status === 'draft'; });
      return { h: h, p: primaryOf(h), out: out, cat: cat, q: q, sent: sent, drafts: drafts, last: hhLast(h), wait: W[h.id] || null };
    });
  }
  function renderRenewals() {
    var box = $('[data-mb-panel="renewals"]');
    var all = renewalRows();
    var list = all.filter(function (r) {
      return R.filter === 'all' || (R.filter === 'none' && !r.sent.length) || (R.filter === 'once' && r.sent.length === 1) || (R.filter === 'more' && r.sent.length > 1);
    }).sort(function (a, b) {
      if (R.sort === 'value') return b.q.total - a.q.total;
      if (R.sort === 'name') return a.h.surname < b.h.surname ? -1 : 1;
      var x = a.last ? a.last.date : '', y = b.last ? b.last.date : ''; return x < y ? 1 : x > y ? -1 : 0;
    });
    Object.keys(R.sel).forEach(function (id) { if (!all.some(function (r) { return r.h.id === id && !r.wait; })) delete R.sel[id]; });
    var waiting = all.filter(function (r) { return r.wait; }).length, pickable = list.filter(function (r) { return !r.wait; });
    var nSel = Object.keys(R.sel).length, worth = list.reduce(function (n, r) { return n + r.q.total; }, 0);
    var allOn = pickable.length && pickable.every(function (r) { return R.sel[r.h.id]; });
    box.innerHTML =
      '<div class="mb-lead"><p>These households played <strong>Spring &amp; Summer 2026</strong> and have not joined for <strong>Fall &amp; Winter 2026/27</strong>. Each keeps the club\'s <strong>$25 returning discount</strong> (not on Sunday Night Intercounty). Between them: <strong class="pn-money">' + money(worth) + '</strong> with HST.' +
        (waiting ? (waiting === 1 ? ' One is' : ' ' + (['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][waiting - 2] || num(waiting)) + ' are') + ' already on the indoor waitlist: offer them a spot from there, not a reminder.' : '') + '</p>' +
      '<p class="pn-muted">Sign-up is online only, so the desk reminds and helps; it never registers for them. Registration opened Aug 1, 2026. Whether the indoor season is now full: ' + UI.confirmSlot('Indoor 2026/27 capacity') + '</p></div>' +
      '<div class="pn-toolbar">' + seg('rf', 'Reminded', [['all', 'All'], ['none', 'Not reminded'], ['once', 'Reminded once'], ['more', 'Twice or more']], R.filter) +
        select('rs', 'Order', [['last', 'Most recent on court'], ['value', 'Highest fee'], ['name', 'Household A to Z']], R.sort) +
        '<p class="pn-toolbar__count" aria-live="polite">' + plural(list.length, 'household') + '</p></div>' +
      '<div class="mb-bulk" data-mb-bulk>' +
        '<p class="mb-bulk__n" aria-live="polite">' + (nSel ? plural(nSel, 'household') + ' selected' : 'Select households to draft reminders') + '</p>' +
        btn('members.remind', 'Draft reminders' + (nSel ? ' for ' + nSel : ''), 'pn-btn--ink', 'data-mb-bulkdraft' + (nSel ? '' : ' disabled')) +
        (nSel ? '<button type="button" class="pn-btn pn-btn--text" data-mb-selnone>Clear selection</button>' : '') + '</div>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Renewals due"><table class="pn-table mb-table"><thead><tr>' +
        '<th scope="col" class="is-tight"><label class="mb-tick"><input type="checkbox" data-mb-selall' + (allOn ? ' checked' : '') + '><span class="sr-only">Select all shown</span></label></th>' +
        '<th scope="col">Household</th><th scope="col">Outdoor 2026</th><th scope="col">Indoor 2026/27</th><th scope="col" class="is-num">Price with HST</th><th scope="col">Reminders</th><th scope="col">Last on court</th>' +
      '</tr></thead><tbody>' +
      (list.length ? list.map(function (r) {
        var h = r.h, p = r.p, lastSent = r.sent[0];
        var tick = r.wait
          ? '<label class="mb-tick"><input type="checkbox" disabled aria-describedby="mb-w-' + h.id + '"><span class="sr-only">The ' + esc(h.name) + ' cannot be selected</span></label>'
          : '<label class="mb-tick"><input type="checkbox" data-mb-sel="' + h.id + '"' + (R.sel[h.id] ? ' checked' : '') + '><span class="sr-only">Select the ' + esc(h.name) + '</span></label>';
        return '<tr' + (R.sel[h.id] ? ' class="is-selected"' : '') + '><td class="is-tight">' + tick + '</td>' +
          '<td><button type="button" class="pn-rowlink" data-mb-open="' + p.id + '">' + esc(h.name) + '</button><span class="pn-sub">' + esc(p.name) + (p.phone ? ', ' + esc(p.phone) : ', no phone on file') + '</span>' +
            (r.wait ? '<span class="pn-sub mb-onwait" id="mb-w-' + h.id + '">' + UI.chip('waitlist', 'On the waitlist, place ' + r.wait.place) + ' <button type="button" class="pn-btn pn-btn--text pn-btn--sm" data-mb-gowait>Offer from the waitlist</button></span>' : '') + '</td>' +
          '<td>' + esc(catLabel(r.out.category, OUTDOOR)) + '<span class="pn-sub">' + money(r.out.total) + ' paid</span></td>' +
          '<td>' + esc(catLabel(r.cat, INDOOR)) + '<span class="pn-sub">' + (h.resident ? 'Vaughan resident' : 'Non-resident') + (r.q.discount ? ', $25 off' : ', no discount') + '</span></td>' +
          '<td class="is-num pn-money">' + money(r.q.total) + '<span class="pn-sub">' + money(r.q.subtotal) + ' + ' + money(r.q.hst) + ' HST</span></td>' +
          '<td>' + (r.sent.length ? plural(r.sent.length, 'email') + ' sent<span class="pn-sub">Last ' + esc(fmt.date(new Date(lastSent.at))) + '</span>' : '<span class="pn-muted">None yet</span>') +
            (r.drafts.length ? '<span class="pn-sub">' + plural(r.drafts.length, 'draft') + ', not sent</span>' : '') + '</td>' +
          '<td class="pn-nowrap">' + (r.last ? esc(fmt.day(r.last.date)) + '<span class="pn-sub">' + esc(seasonShort(r.last.season)) + '</span>' : '<span class="pn-muted">Not on record</span>') + '</td></tr>';
      }).join('') : '<tr><td colspan="7"><div class="pn-empty"><p class="pn-empty__title">Nobody in this group</p><p>Every household here has been reminded, or there are no renewals due.</p></div></td></tr>') +
      '</tbody></table></div>';
  }
  function bindRenewals() {
    var box = $('[data-mb-panel="renewals"]');
    box.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('select[data-mb-f="rs"]')) { R.sort = t.value; renderRenewals(); $('select[data-mb-f="rs"]', box).focus(); return; }
      if (t.matches('[data-mb-sel]')) { var id = t.getAttribute('data-mb-sel'); if (t.checked) R.sel[id] = 1; else delete R.sel[id]; renderRenewals(); var x = $('[data-mb-sel="' + id + '"]', box); if (x) x.focus(); return; }
      if (t.matches('[data-mb-selall]')) {
        $$('[data-mb-sel]', box).forEach(function (c) { var id = c.getAttribute('data-mb-sel'); if (t.checked) R.sel[id] = 1; else delete R.sel[id]; });
        renderRenewals(); $('[data-mb-selall]', box).focus();
      }
    });
    box.addEventListener('click', function (e) {
      var t = e.target;
      if (denied(t)) return;
      var f = t.closest('button[data-mb-f="rf"]'); if (f) { R.filter = f.getAttribute('data-v'); renderRenewals(); $('button[data-mb-f="rf"][data-v="' + R.filter + '"]', box).focus(); return; }
      if (t.closest('[data-mb-gowait]')) { setView('waitlist', true); return; }
      if (t.closest('[data-mb-selnone]')) { R.sel = {}; renderRenewals(); $('[data-mb-selall]', box).focus(); UI.toast('Selection cleared.'); return; }
      if (t.closest('[data-mb-bulkdraft]')) { var ids = Object.keys(R.sel); if (ids.length) draftSheet(ids, { renewal: true, back: t.closest('button') }); return; }
      var o = t.closest('[data-mb-open]'); if (o) openProfile(o.getAttribute('data-mb-open'), o);
    });
  }

  /* ---------- Drafts: email and text message, merged per household, saved as drafts, never sent ---------- */
  var TPL = {
    renewal: {
      subject: 'Your Fall & Winter 2026/27 indoor membership',
      email: 'Hi {first},\n\nThank you for playing with us this Spring & Summer. Fall & Winter indoor membership runs from early October 2026 to April 25, 2027.\n\nYour price for the season:\n{price}\n\nMemberships are for the full indoor season and space is limited. Sign-up is online only: {link}\nIf signing up online gives you any trouble, call us at {desk} and we will walk you through it.\n\nThornhill Park Tennis Club\nFront desk',
      sms: 'Thornhill Park TC: Hi {first}, your Fall & Winter 2026/27 indoor membership is waiting. {smsprice} Sign up online: {link}'
    },
    message: {
      subject: 'Thornhill Park Tennis Club',
      email: 'Hi {first},\n\n\n\nThornhill Park Tennis Club\nFront desk, {desk}',
      sms: 'Thornhill Park TC: Hi {first}, '
    }
  };
  function merge(tpl, r) {
    var q = r.q, cat = catLabel(r.cat, INDOOR) + ', ' + (r.h.resident ? 'Vaughan resident' : 'non-resident');
    var price = q.discount ? cat + ': ' + money(q.base) + ' less the $25 returning discount = ' + money(q.subtotal) + ', plus HST ' + money(q.hst) + ', total ' + money(q.total) + '.'
      : cat + ': ' + money(q.subtotal) + ', plus HST ' + money(q.hst) + ', total ' + money(q.total) + ' (no returning discount on this category).';
    var smsprice = q.discount ? 'With your $25 returning discount it is ' + money(q.total) + ' with HST.' : 'It is ' + money(q.total) + ' with HST.';
    var v = { first: r.p.first, last: r.p.last, household: r.h.name, category: cat, price: price, smsprice: smsprice, total: money(q.total), link: SIGNUP_URL, desk: DESK_PHONE };
    return tpl.replace(/\{(\w+)\}/g, function (m, k) { return k in v ? v[k] : m; });
  }
  /* SMS length: GSM-7 is 160 characters, 153 per part when split; anything outside it (curly
     quotes, accents) switches the message to 70, 67 per part. */
  var GSM = /^[A-Za-z0-9 @$\n\r_!"#%&'()*+,\-.\/:;<=>?£¥èéùìòÇØøÅåÄÖÑÜ§¿äöñüà]*$/;
  function smsParts(s) {
    var gsm = GSM.test(s), n = s.length, one = gsm ? 160 : 70, many = gsm ? 153 : 67;
    return { n: n, parts: n <= one ? 1 : Math.ceil(n / many), gsm: gsm };
  }
  function draftRow(hid) {
    var h = D.households.get(hid), out = hhSeason(hid, OUTDOOR), cat = renewCategory(h, out);
    return { h: h, p: primaryOf(h), cat: cat, q: quote(cat, h.resident, !!out) };
  }
  function draftSheet(hids, opts) {
    opts = opts || {};
    var kind = opts.renewal ? 'renewal' : 'message', T = TPL[kind];
    var rows = hids.map(draftRow), cur = 0;
    if (opts.from) rows[0].p = D.people.get(opts.from).email ? D.people.get(opts.from) : rows[0].p;
    var noPhone = rows.filter(function (r) { return !r.p.phone; }).length, noNews = rows.filter(function (r) { return !r.p.marketing; }).length;
    var body =
      '<p class="pn-note">' + icon('mail') + '<span>Drafts only. Nothing is sent from the demo; each draft is kept in this browser and shows on the household\'s record.</span></p>' +
      '<fieldset class="mb-fs"><legend class="pn-label">Channels</legend><div class="pn-row">' +
        '<label class="pn-check"><input type="checkbox" data-mb-ch="email" checked> Email</label>' +
        '<label class="pn-check"><input type="checkbox" data-mb-ch="sms"' + (kind === 'renewal' ? ' checked' : '') + '> Text message' + (noPhone ? ' <span class="pn-muted">(' + noPhone + ' without a phone get email only)</span>' : '') + '</label></div></fieldset>' +
      (rows.length > 1 ? '<div class="pn-field"><label class="pn-label" for="mb-d-who">Preview for</label><select class="pn-select" id="mb-d-who">' + rows.map(function (r, i) { return '<option value="' + i + '">' + esc(r.h.name + ', ' + r.p.name) + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="mb-preview"><p class="pn-kicker">Email preview</p><p class="mb-preview__to" data-mb-pv-to></p><p class="mb-preview__subj" data-mb-pv-subj></p><div class="mb-preview__body" data-mb-pv-email></div></div>' +
      '<div class="mb-preview mb-preview--sms"><p class="pn-kicker">Text preview</p><p class="mb-bubble" data-mb-pv-sms></p><p class="pn-help" id="mb-d-count" aria-live="polite" data-mb-count-sms></p></div>' +
      '<details class="mb-edit"' + (kind === 'message' ? ' open' : '') + '><summary>' + (kind === 'message' ? 'Write the message' : 'Edit the wording') + '</summary><div class="mb-edit__body">' +
        '<div class="pn-field"><label class="pn-label" for="mb-d-subj">Email subject</label><input class="pn-input" id="mb-d-subj" value="' + esc(T.subject) + '"></div>' +
        '<div class="pn-field"><label class="pn-label" for="mb-d-email">Email template</label><textarea class="pn-textarea mb-tpl" id="mb-d-email" rows="9" aria-describedby="mb-d-fields">' + esc(T.email) + '</textarea>' +
          '<p class="pn-help" id="mb-d-fields">Filled for each household: {first}, {household}, {category}, {price}, {total}, {link}, {desk}.</p></div>' +
        '<div class="pn-field"><label class="pn-label" for="mb-d-sms">Text message template</label><textarea class="pn-textarea mb-tpl" id="mb-d-sms" rows="3" aria-describedby="mb-d-count">' + esc(T.sms) + '</textarea></div>' +
      '</div></details>' +
      (noNews ? '<p class="pn-note">' + icon('alert') + '<span>' + plural(noNews, 'contact') + ' opted out of club news. Whether a renewal reminder counts as club news is the club\'s call: ' + UI.confirmSlot('Reminder policy for opted-out members') + '</span></p>' : '');
    var el = UI.sheet.open({ kicker: kind === 'renewal' ? 'Renewal reminder' : 'Message', title: rows.length > 1 ? plural(rows.length, 'household') : rows[0].h.name, body: body, wide: true,
      foot: '<button type="button" class="pn-btn pn-btn--quiet" data-mb-dback>' + (opts.from ? 'Back to profile' : 'Cancel') + '</button><button type="button" class="pn-btn pn-btn--ink" data-mb-dsave>Save drafts</button>',
      onClose: function () { if (opts.from) { closedFrom(opts.from); return; } prof.id = null; if (opts.back && document.body.contains(opts.back)) setTimeout(function () { opts.back.focus(); }, 0); } });
    var ch = function () { return $$('[data-mb-ch]', el).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-mb-ch'); }); };
    var count = function () {
      var c = ch(), n = rows.reduce(function (a, r) { return a + (c.indexOf('email') > -1 && r.p.email ? 1 : 0) + (c.indexOf('sms') > -1 && r.p.phone ? 1 : 0); }, 0);
      $('[data-mb-dsave]', el).textContent = n ? 'Save ' + plural(n, 'draft') + ', not sent' : 'Choose a channel';
      $('[data-mb-dsave]', el).disabled = !n;
      return n;
    };
    var preview = function () {
      var r = rows[cur], sms = merge($('#mb-d-sms', el).value, r), parts = smsParts(sms);
      $('[data-mb-pv-to]', el).textContent = 'To: ' + r.p.name + ' <' + (r.p.email || 'no email on file') + '>';
      $('[data-mb-pv-subj]', el).textContent = merge($('#mb-d-subj', el).value, r);
      $('[data-mb-pv-email]', el).textContent = merge($('#mb-d-email', el).value, r);
      $('[data-mb-pv-sms]', el).textContent = r.p.phone ? sms : 'No phone on file: this household gets the email only.';
      $('[data-mb-count-sms]', el).textContent = parts.n + ' characters, ' + plural(parts.parts, 'text message part') + (parts.gsm ? '' : '. A special character makes each part 70 characters') + ' for ' + r.p.first + '.';
      count();
    };
    el.addEventListener('input', function (e) { if (e.target.closest('.mb-tpl, #mb-d-subj')) preview(); });
    $$('[data-mb-ch]', el).forEach(function (c) { c.addEventListener('change', count); });
    var who = $('#mb-d-who', el); if (who) who.addEventListener('change', function () { cur = +who.value; preview(); });
    $('[data-mb-dback]', el).addEventListener('click', function () { if (opts.from) openProfile(opts.from, null, prof.tab); else UI.sheet.close(); });
    $('[data-mb-dsave]', el).addEventListener('click', function () {
      var c = ch(), added = [], at = new Date(D.clock.now).toISOString();
      rows.forEach(function (r) {
        c.forEach(function (channel) {
          if ((channel === 'email' && !r.p.email) || (channel === 'sms' && !r.p.phone)) return;
          var rec = D.reminders.add({ personId: r.p.id, householdId: r.h.id, kind: kind, channel: channel, status: 'draft', at: at,
            subject: channel === 'email' ? merge($('#mb-d-subj', el).value, r) : null, body: merge($('#mb-d-' + channel, el).value, r) }, null);
          added.push(rec.id);
        });
      });
      if (!added.length) return;
      D.log('Drafted ' + plural(added.length, kind === 'renewal' ? 'renewal reminder' : 'message') + ' for ' + (rows.length > 1 ? plural(rows.length, 'household') : 'the ' + rows[0].h.name) + ', not sent', { type: 'reminders', id: added[0] });
      var back = opts.back;
      if (opts.renewal && !opts.from) { R.sel = {}; renderRenewals(); back = $('[data-mb-selall]') || back; }
      if (opts.from) openProfile(opts.from, null, 'memberships'); else UI.sheet.close();
      if (back && document.body.contains(back)) back.focus();
      notify(plural(added.length, 'draft') + ' saved in this browser. Nothing was sent.', function () { added.forEach(function (id) { D.reminders.remove(id); }); D.log('Removed ' + plural(added.length, 'draft'), null); });
    });
    preview();
    var f = kind === 'message' ? $('#mb-d-email', el) : $('[data-mb-ch="email"]', el);
    if (f) { f.focus(); if (kind === 'message') { var at = f.value.indexOf('\n\n\n') + 2; f.setSelectionRange(at, at); } }
  }

  /* ---------- The indoor membership waitlist ---------- */
  function renderWaitlist() {
    var box = $('[data-mb-panel="waitlist"]');
    var list = D.waitlists.list({ list: 'membership-indoor-2026', status: ['waiting', 'offered'] }).sort(function (a, b) { return (a.position || 99) - (b.position || 99) || (a.addedAt < b.addedAt ? -1 : 1); });
    var closed = D.waitlists.count({ list: 'membership-indoor-2026', status: 'closed' });
    box.innerHTML =
      '<div class="mb-lead"><p>The club\'s own words: <q>Membership space is limited and spots are filling up fast. We close indoor membership soon once we reach capacity.</q> When it closes, people join this list from the Memberships page.</p>' +
      '<p class="pn-muted">Whether Fall &amp; Winter 2026/27 is full today is not published: ' + UI.confirmSlot('Indoor 2026/27 capacity and status') + '</p></div>' +
      (list.length ? '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Indoor membership waitlist"><table class="pn-table mb-table"><thead><tr>' +
        '<th scope="col" class="is-num">Place</th><th scope="col">Household</th><th scope="col">Waiting since</th><th scope="col">Would join as</th><th scope="col" class="is-num">Price with HST</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
        list.map(function (w, i) {
          var h = D.households.get(w.householdId), p = D.people.get(w.personId) || primaryOf(h), r = draftRow(h.id);
          var days = Math.max(0, Math.round((TODAY - new Date(w.addedAt)) / 864e5));
          return '<tr><td class="is-num pn-num">' + (i + 1) + '</td>' +
            '<td><button type="button" class="pn-rowlink" data-mb-open="' + p.id + '">' + esc(h.name) + '</button><span class="pn-sub">' + esc(p.name) + (p.email ? ', ' + mail(p.email) : '') + '</span></td>' +
            '<td class="pn-nowrap">' + esc(fmt.date(new Date(w.addedAt))) + '<span class="pn-sub">' + plural(days, 'day') + '</span></td>' +
            '<td>' + esc(catLabel(r.cat, INDOOR)) + '<span class="pn-sub">' + (h.resident ? 'Vaughan resident' : 'Non-resident') + (r.q.discount ? ', returning, $25 off' : '') + '</span></td>' +
            '<td class="is-num pn-money">' + money(r.q.total) + '</td>' +
            '<td>' + UI.chip(w.status) + (w.offeredAt ? '<span class="pn-sub">' + esc(fmt.stamp(w.offeredAt)) + '</span>' : '') + '</td>' +
            '<td class="pn-nowrap"><span class="pn-row">' + (w.status === 'waiting' ? btn('members.edit', 'Offer a spot', 'pn-btn--quiet pn-btn--sm', 'data-mb-offer="' + w.id + '"') : '') +
              btn('members.edit', 'Remove', 'pn-btn--text pn-btn--sm', 'data-mb-wlremove="' + w.id + '" aria-label="Remove the ' + esc(h.name) + ' from the waitlist"') + '</span></td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="pn-empty"><p class="pn-empty__title">Nobody is waiting</p><p>When indoor membership closes, households who join the waitlist appear here in order.</p></div>') +
      (closed ? '<p class="pn-muted mb-gap">' + plural(closed, 'household') + ' taken off the list in this browser.</p>' : '');
  }
  function bindWaitlist() {
    var box = $('[data-mb-panel="waitlist"]');
    box.addEventListener('click', function (e) {
      var t = e.target; if (denied(t)) return;
      var o = t.closest('[data-mb-open]'); if (o) { openProfile(o.getAttribute('data-mb-open'), o); return; }
      var off = t.closest('[data-mb-offer]');
      if (off) {
        var w = D.waitlists.get(off.getAttribute('data-mb-offer')), h = D.households.get(w.householdId), r = draftRow(h.id);
        UI.confirm({ title: 'Offer the ' + h.name + ' a spot?', body: '<p>' + esc(catLabel(r.cat, INDOOR)) + ', ' + (h.resident ? 'Vaughan resident' : 'non-resident') + ': ' + money(r.q.total) + ' with HST. They sign up online themselves.</p><p>The offer email is saved as a draft. Nothing is sent from the demo.</p>', confirm: 'Offer a spot', cancel: 'Not yet' }).then(function (yes) {
          if (!yes) return;
          var at = new Date(D.clock.now).toISOString();
          D.waitlists.update(w.id, { status: 'offered', offeredAt: at }, 'Offered an indoor membership spot to the ' + h.name);
          var rem = D.reminders.add({ personId: r.p.id, householdId: h.id, kind: 'offer', channel: 'email', status: 'draft', at: at, subject: 'A spot for you: Fall & Winter 2026/27 indoor membership',
            body: merge('Hi {first},\n\nA Fall & Winter 2026/27 indoor membership spot is open for your household.\n\n{price}\n\nSign-up is online only: {link}\nQuestions? Call us at {desk}.\n\nThornhill Park Tennis Club\nFront desk', r) }, null);
          UI.toast('Spot offered to the ' + h.name + '. Offer email saved as a draft, not sent.', { action: { label: 'Undo', run: function () { D.reminders.remove(rem.id); D.waitlists.update(w.id, { status: 'waiting', offeredAt: null }, 'Withdrew the offer to the ' + h.name); } } });
          var nx = $('[data-mb-offer]', box) || $('[data-mb-tabs] [aria-selected="true"]'); if (nx) nx.focus();
        });
        return;
      }
      var rm = t.closest('[data-mb-wlremove]');
      if (rm) {
        var w2 = D.waitlists.get(rm.getAttribute('data-mb-wlremove')), h2 = D.households.get(w2.householdId);
        UI.confirm({ title: 'Take the ' + h2.name + ' off the waitlist?', body: '<p>Everyone behind them moves up one place. You can undo straight after.</p>', confirm: 'Remove from waitlist', cancel: 'Keep them', danger: true }).then(function (yes) {
          if (!yes) return;
          var prev = w2.status;
          D.waitlists.update(w2.id, { status: 'closed' }, 'Took the ' + h2.name + ' off the indoor waitlist');
          UI.toast('The ' + h2.name + ' is off the waitlist. Kept in this browser only.', { action: { label: 'Undo', run: function () { D.waitlists.update(w2.id, { status: prev }, 'Put the ' + h2.name + ' back on the indoor waitlist'); } } });
          var nx = $('[data-mb-wlremove]', box) || $('[data-mb-tabs] [aria-selected="true"]'); if (nx) nx.focus();
        });
      }
    });
  }

  /* ---------- Phone help: the club's sign-up is online only, so the desk quotes and guides ---------- */
  function signupSheet(back) {
    var s = { cat: 'adult', res: true, ret: false };
    var body =
      '<p class="pn-muted">The club\'s rule: <q>Sign-up is only online.</q> If someone has trouble, staff walk them through it over the phone. Use this to quote the right price while they sign up themselves.</p>' +
      '<form class="pn-form" data-mb-sform novalidate>' +
        '<div class="pn-field"><label class="pn-label" for="mb-s-cat">Category</label><select class="pn-select" id="mb-s-cat" autofocus>' +
          D.categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.label + ', ' + c.note) + '</option>'; }).join('') + '</select></div>' +
        '<fieldset class="mb-fs"><legend class="pn-label">Residency</legend><div class="pn-seg" role="group" aria-label="Residency">' +
          '<button type="button" data-mb-sres="1" aria-pressed="true">Vaughan resident</button><button type="button" data-mb-sres="0" aria-pressed="false">Non-resident</button></div>' +
          '<p class="pn-help">Vaughan resident prices include the club\'s 15% discount.</p></fieldset>' +
        '<label class="pn-check"><input type="checkbox" id="mb-s-ret"> Played Spring &amp; Summer 2026 (the $25 returning discount)</label>' +
        '<div data-mb-squote></div>' +
        '<div class="pn-form__row pn-form__row--2">' +
          '<div class="pn-field"><label class="pn-label" for="mb-s-name">Their name (optional)</label><input class="pn-input" id="mb-s-name" autocomplete="off"></div>' +
          '<div class="pn-field"><label class="pn-label" for="mb-s-email">Email for the sign-up link</label><input class="pn-input" id="mb-s-email" type="email" autocomplete="off"><p class="pn-help">Saved as a draft, not sent</p></div>' +
        '</div>' +
      '</form>';
    var el = UI.sheet.open({ kicker: 'Phone help', title: 'Fall & Winter 2026/27 membership', body: body,
      foot: '<button type="button" class="pn-btn pn-btn--quiet" data-sheet-close>Close</button><button type="button" class="pn-btn pn-btn--ink" data-mb-ssave>Save the link email as a draft</button>',
      onClose: function () { if (back && document.body.contains(back)) setTimeout(function () { back.focus(); }, 0); } });
    var draw = function () {
      var q = quote(s.cat, s.res, s.ret), ic = s.cat === 'intercounty';
      $('#mb-s-ret', el).disabled = ic;
      $('[data-mb-squote]', el).innerHTML = priceBuild(q, 'Quote') +
        (ic ? '<p class="pn-note">' + icon('alert') + '<span>Sunday Night Intercounty: matches only, must be pre-approved, no discount.</span></p>' : '') +
        '<p class="pn-help">Fees exclude HST; 13% is added. Memberships cover the full indoor season only, to April 25, 2027.</p>';
    };
    $('#mb-s-cat', el).addEventListener('change', function (e) { s.cat = e.target.value; draw(); });
    $('#mb-s-ret', el).addEventListener('change', function (e) { s.ret = e.target.checked; draw(); });
    $$('[data-mb-sres]', el).forEach(function (b) {
      b.addEventListener('click', function () { s.res = b.getAttribute('data-mb-sres') === '1'; $$('[data-mb-sres]', el).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); draw(); });
    });
    var save = function (e) {
      if (e) e.preventDefault();
      var em = $('#mb-s-email', el), old = $('.pn-error', el); if (old) old.remove();
      em.removeAttribute('aria-invalid');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim())) {
        em.setAttribute('aria-invalid', 'true'); em.setAttribute('aria-describedby', 'mb-s-err');
        em.insertAdjacentHTML('afterend', '<p class="pn-error" id="mb-s-err">' + icon('alert') + 'Enter the email the link goes to</p>'); em.focus(); return;
      }
      var q = quote(s.cat, s.res, s.ret), name = $('#mb-s-name', el).value.trim();
      var rec = D.reminders.add({ personId: null, householdId: null, to: em.value.trim(), kind: 'signup', channel: 'email', status: 'draft', at: new Date(D.clock.now).toISOString(),
        subject: 'Signing up for Fall & Winter 2026/27', body: 'Hi' + (name ? ' ' + name.split(' ')[0] : '') + ',\n\nHere is the link to sign up online: ' + SIGNUP_URL + '\n' + catLabel(s.cat, INDOOR) + ', ' + (s.res ? 'Vaughan resident' : 'non-resident') + ': ' + money(q.subtotal) + ' plus HST ' + money(q.hst) + ', total ' + money(q.total) + '.\n\nThornhill Park Tennis Club\nFront desk, ' + DESK_PHONE }, null);
      D.log('Drafted a sign-up link email for ' + (name || em.value.trim()) + ', not sent', { type: 'reminders', id: rec.id });
      UI.sheet.close();
      UI.toast('Sign-up link email saved as a draft. Nothing was sent.', { action: { label: 'Undo', run: function () { D.reminders.remove(rec.id, 'Removed a sign-up link draft'); } } });
    };
    $('[data-mb-ssave]', el).addEventListener('click', save);
    $('[data-mb-sform]', el).addEventListener('submit', save);
    draw();
  }

  /* ---------- Export: the list on screen as a CSV file, made in the browser ---------- */
  function csv(rows) { return rows.map(function (r) { return r.map(function (c) { c = c == null ? '' : String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n'); }
  function exportList() {
    var out, name;
    if (view === 'renewals') {
      out = [['Household', 'Primary contact', 'Email', 'Phone', 'Outdoor 2026', 'Indoor 2026/27', 'Resident', 'Before HST', 'HST', 'Total', 'Reminders sent']].concat(renewalRows().map(function (r) {
        return [r.h.name, r.p.name, r.p.email, r.p.phone, catLabel(r.out.category, OUTDOOR), catLabel(r.cat, INDOOR), r.h.resident ? 'Vaughan' : 'No', r.q.subtotal.toFixed(2), r.q.hst.toFixed(2), r.q.total.toFixed(2), r.sent.length];
      }));
      name = 'renewals-due';
    } else if (view === 'waitlist') {
      out = [['Household', 'Contact', 'Email', 'Added', 'Status']].concat(D.waitlists.list({ list: 'membership-indoor-2026', status: ['waiting', 'offered'] }).map(function (w) {
        var p = D.people.get(w.personId) || {}; return [D.households.get(w.householdId).name, p.name, p.email, w.addedAt.slice(0, 10), w.status];
      }));
      name = 'indoor-waitlist';
    } else {
      out = [['Name', 'Household', 'Status', 'Indoor 2026/27', 'Outdoor 2026', 'Resident', 'Email', 'Phone', 'Last on court']].concat(filtered().map(function (r) {
        return [r.p.name, r.h.name, UI.statusLabel(r.status), r.ind ? catLabel(r.ind.category, INDOOR) : '', r.out ? catLabel(r.out.category, OUTDOOR) : '', r.h.resident ? 'Vaughan' : 'No', r.p.email, r.p.phone, r.last ? r.last.date : ''];
      }));
      name = 'members';
    }
    out.unshift(['SAMPLE DATA: fictional people from the TPTC staff panel demo']);
    try {
      var blob = new Blob(['﻿' + csv(out)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'tptc-' + name + '-sample-' + TODAY_ISO + '.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      UI.toast('Downloaded ' + plural(out.length - 2, 'row') + ' of sample data as a CSV file. Nothing left this browser.');
    } catch (e) { UI.toast('This browser blocked the download. Nothing was exported.', { kind: 'warn' }); }
  }

  /* ---------- Start ---------- */
  function renderAll() {
    renderKpis(); renderLedger(); renderCounts(); renderView();
    if (prof.id && UI.sheet.el() && UI.sheet.el().open && $('[data-mb-pp]', UI.sheet.el())) renderTab();
  }
  function init() {
    $('[data-mb-foot]').innerHTML = icon('alert') + '<span>Sample data: every person, household, booking, payment and note here is made up. Prices, seasons and rules are the club\'s own. Nothing is sent or saved to a server; changes stay in this browser until Reset demo.</span>';
    bindTabs(); bindList(); bindRenewals(); bindWaitlist();
    $('[data-mb-signup]').addEventListener('click', function (e) { signupSheet(e.currentTarget); });
    $('[data-mb-export]').addEventListener('click', exportList);
    document.querySelector('[data-mb-ledger]').addEventListener('click', function (e) { if (e.target.closest('[data-mb-goto]')) { setView('renewals', true); } });
    var qs = new URLSearchParams(location.search);
    var v = qs.get('view') || pref('view') || 'list';
    renderKpis(); renderLedger(); renderCounts(); setView(v);
    var pid = qs.get('person'); if (pid) openProfile(pid, null, qs.get('tab') || 'overview');
    window.addEventListener('panel:change', function (e) {
      var c = e.detail && e.detail.collection;
      if (c === 'bookings' || c === '*') lastPlayed = null;
      if (c === '*') { R.sel = {}; SAMPLE_NOTES = null; }
      renderAll();
    });
  }
  init();
})();
