/* Payments module (owned by the payments module agent). Contract: ../PANEL.md.
   Story: the club's money, kept like a scorebook. Every row is a record, never an input: what was
   paid, the HST in it (added, included or not stated, as the club prices it), what is still to
   settle under the club's booking rules, and refunds under the club's own policies with the $50
   administration fee. Failed and disputed payments and payouts are derived here from the sample
   records (see logs/requests-panel-payments.md 2), so nothing is invented beyond the dataset. */
(function () {
  'use strict';
  var D = window.PanelData, UI = window.PanelUI;
  if (!D || !UI) return;
  var esc = UI.esc, money = D.fmt.money, $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var NOW = D.clock.now, TODAY = D.today(), POLICY = D.refundPolicy, FEE = POLICY.admin_fee;
  var KIND = { membership: 'Membership', court: 'Court fee', lesson: 'Private lesson', camp: 'Summer camp' };
  var SEASON = { 'outdoor-2026': 'Spring & Summer 2026', 'indoor-2026': 'Fall & Winter 2026/27', 'camps-summer-2026': 'Summer Camps 2026' };
  var state = { tab: 'ledger', q: '', kind: 'all', season: 'all', status: 'all', person: null, sort: 'date', dir: -1, shown: 50, hstSeason: 'all', payShown: 14 };

  /* ---------- Small helpers ---------- */
  function fnv(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function sum(list, f) { return r2(list.reduce(function (a, x) { return a + (typeof f === 'function' ? f(x) : (x[f] || 0)); }, 0)); }
  function at(p) { return new Date(p.at || p.createdAt); }
  function dayKey(d) { return D.fmt.iso(d); }
  /* Bank holidays in 2026 that hold a payout: Good Friday, Victoria Day, Canada Day, Labour Day, Thanksgiving (Mon Oct 12) */
  var BANK_HOLIDAYS = ['2026-04-03', '2026-05-18', '2026-07-01', '2026-09-07', '2026-10-12'];
  function bankDay(x) { return x.getDay() !== 0 && x.getDay() !== 6 && BANK_HOLIDAYS.indexOf(D.fmt.iso(x)) < 0; }
  function addBizDays(d, n) { var x = new Date(d); while (n > 0) { x = D.fmt.addDays(x, 1); if (bankDay(x)) n--; } return x; }
  function bizDaysBetween(a, b) { var n = 0, x = new Date(a); x.setHours(0, 0, 0, 0); var y = new Date(b); y.setHours(0, 0, 0, 0); while (x < y) { x = D.fmt.addDays(x, 1); if (bankDay(x)) n++; } return n; }
  function daysBetween(a, b) { var x = new Date(a); x.setHours(0, 0, 0, 0); var y = new Date(b); y.setHours(0, 0, 0, 0); return Math.round((y - x) / 864e5); }
  function stamp(iso) { return D.fmt.stamp(iso); }
  function shortDay(iso) { var d = new Date(iso); return D.fmt.day(dayKey(d)); }
  function name(id) { return id ? D.personName(id) : 'Public site visitor'; }
  function household(p) { var h = p.householdId && D.households.get(p.householdId); return h ? h : null; }
  function methodLabel(p) { return p.method === 'Interac' ? 'Interac' : p.method + (p.last4 ? ' ending ' + p.last4 : ''); }
  function treatment(p) { return p.hstIncluded === true ? 'HST included' : p.hstIncluded === false ? '+ HST' : 'HST not stated'; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem('tptc-panel-payments-' + k); localStorage.setItem('tptc-panel-payments-' + k, v); } catch (e) { return null; } return null; }
  function canAct(action) { return UI.can(action); }
  /* payments.record is Front desk and Administrator; the shell's whoCan has no entry for it yet (request 4) */
  function who(action) { return action === 'payments.record' ? 'Front desk or Administrator' : UI.whoCan(action); }
  function btn(label, attrs, cls, action) {
    var dis = action && !canAct(action);
    return '<button type="button" class="pn-btn ' + (cls || 'pn-btn--quiet') + '" ' + attrs +
      (dis ? ' aria-disabled="true" title="' + esc(who(action)) + ' only" data-py-why="' + esc(who(action)) + ' only"' : '') + '>' + esc(label) +
      (dis ? '<span class="sr-only"> (' + esc(who(action)) + ' only)</span>' : '') + '</button>';
  }
  function blocked(el) {
    if (el && el.getAttribute('aria-disabled') === 'true') { UI.toast(el.getAttribute('data-py-why') + '. You are signed in as ' + D.roleName() + '.', { kind: 'warn' }); return true; }
    return false;
  }

  /* ---------- What the ledger shows: payments up to the demo clock (request 1) ---------- */
  function visible() { return D.payments.list(function (p) { return p.demo || at(p) <= NOW; }); }
  function refundsOf(pid) { return D.refunds.list({ paymentId: pid }).filter(function (r) { return r.status !== 'cancelled'; }); }
  function refundedOf(p) { return r2(Math.max(p.refunded || 0, sum(refundsOf(p.id), 'amount'))); }
  function statusOf(p) {
    if (p.status === 'failed') return 'failed';
    var r = refundedOf(p);
    if (r <= 0) return 'succeeded';
    return r >= p.total - 0.005 ? 'refunded' : 'partially_refunded';
  }
  function statusChip(p) {
    var s = statusOf(p), r = refundedOf(p);
    if (s === 'partially_refunded' && Math.abs(p.total - r - FEE) < 0.01) return UI.chip('refunded', 'Refunded, $' + FEE + ' fee kept');
    if (s === 'partially_refunded') return UI.chip('partially_refunded', 'Part refunded ' + money(r));
    return UI.chip(s);
  }
  /* Card on file: the person's latest card on a payment record, or a sample one. Never an input. */
  function cardOnFile(personId) {
    var cards = D.payments.list(function (p) { return p.personId === personId && p.last4; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    if (cards.length) return { method: cards[0].method, last4: cards[0].last4, label: cards[0].method + ' ending ' + cards[0].last4 };
    var h = fnv('card' + personId), m = h % 3 ? 'Visa' : 'Mastercard', l4 = String(1000 + (h % 9000));
    return { method: m, last4: l4, label: m + ' ending ' + l4 };
  }
  function seasonName(id) { return SEASON[id] || id || ''; }
  function personLink(id, label) {
    if (!id) return esc(label || 'Public site visitor');
    return '<a class="inline-link" href="' + esc(UI.link('members', 'person=' + id)) + '">' + esc(label || name(id)) + '</a>';
  }
  function refLink(p) {
    if (!p.ref) return '';
    if (p.ref.type === 'booking') return '<a class="inline-link" href="' + esc(UI.link('bookings', 'booking=' + p.ref.id)) + '">Open the booking</a>';
    if (p.ref.type === 'registration') return '<a class="inline-link" href="' + esc(UI.link('programs', 'registration=' + p.ref.id)) + '">Open the registration</a>';
    return '';
  }

  /* ---------- To settle: the club's rules, not a guess ----------
     "Payment at the time of booking is optional" for members; "If you have an outstanding balance
     from a previous booking, you CANNOT make additional bookings until all previous balances are
     settled"; no-shows and late cancels are charged the court fee to the card on file. */
  function endOf(b) { var d = D.fmt.parse(b.date); d.setHours(0, b.start + (b.hours || 1) * 60, 0, 0); return d; }
  function settleItems() {
    var due = [], later = [];
    D.bookings.list(function (b) { return b.season === 'indoor-2026' && (b.type === 'member' || b.type === 'non-member') && !b.paid && b.total > 0 && b.status !== 'cancelled'; })
      .forEach(function (b) {
        var played = endOf(b) <= NOW;
        var why = !played && b.status === 'booked' ? 'Booked, member chose to pay after play' : b.status === 'no-show' ? 'No-show: the court fee is charged to the card on file' :
          b.status === 'late-cancel' ? 'Cancelled under 48 hours: the court fee is charged' : 'Played, not paid at booking (optional for members)';
        (endOf(b) <= NOW || b.status === 'no-show' || b.status === 'late-cancel' ? due : later).push({ b: b, why: why });
      });
    var pb = D.publicBooking();
    if (pb && pb.done && !pb.paid && pb.total > 0) due.unshift({ b: pb, why: pb.held ? 'Non-member, held to pre-pay by phone (club policy page)' : 'Member chose to pay later on the public site', pub: true });
    due.sort(function (a, b) { return endOf(a.b) - endOf(b.b); });
    later.sort(function (a, b) { return endOf(a.b) - endOf(b.b); });
    return { due: due, later: later };
  }

  /* ---------- Failed and disputed (derived, deterministic; request 2) ---------- */
  var DECLINES = [
    ['insufficient_funds', 'Card declined: insufficient funds'],
    ['expired_card', 'Card expired'],
    ['incorrect_zip', 'Postal code did not match the card'],
    ['do_not_honor', 'Card declined by the bank (do not honour)']
  ];
  function memberCat(h) { var o = D.memberships.list({ householdId: h.id, season: 'outdoor-2026' })[0]; if (h.kind === 'senior') return 'senior'; return o ? (o.category === 'intercounty' ? 'adult' : o.category) : h.kind === 'family' || h.kind === 'couple' || h.kind === 'junior' ? h.kind : 'adult'; }
  function catLabel(id) { var c = D.categories.filter(function (x) { return x.id === id; })[0]; return c ? c.label : id; }
  var ISSUES = null;
  function issues() {
    if (ISSUES) return ISSUES;
    var list = [];
    /* 1. Renewals that failed and were never retried: households that are still "renewal due" */
    D.renewalsDue().map(function (h) { return { h: h, k: fnv('fail' + h.id) }; }).sort(function (a, b) { return a.k - b.k; }).slice(0, 3).forEach(function (x, i) {
      var h = x.h, cat = memberCat(h), price = D.membershipPrice(cat, { resident: h.resident, returning: true }), card = cardOnFile(h.primaryId), dec = DECLINES[x.k % DECLINES.length];
      var when = D.fmt.addDays(TODAY, -(2 + (x.k % 9))); when.setHours(9 + (x.k % 11), (x.k >> 3) % 60, 0, 0);
      list.push({ id: 'fail_' + h.id, type: 'failed', open: true, at: when.toISOString(), personId: h.primaryId, householdId: h.id, card: card, decline: dec,
        amount: price.total, kind: 'membership', description: 'Fall & Winter 2026/27 membership, ' + catLabel(cat) + (h.resident ? ', Vaughan resident' : ', non-resident') + ', returning',
        price: price, note: 'Still renewal due in Members: the household has no indoor 2026/27 membership.' });
    });
    /* 2. Failed first attempts that went through on a retry minutes later */
    visible().filter(function (p) { return p.last4 && p.status !== 'failed' && (p.kind === 'membership' || p.kind === 'camp') && fnv('retry' + p.id) % 41 === 0; }).slice(0, 5).forEach(function (p) {
      var k = fnv('retry' + p.id), dec = DECLINES[k % DECLINES.length], t = new Date(at(p).getTime() - (2 + k % 6) * 60000);
      list.push({ id: 'fail_' + p.id, type: 'failed', open: false, at: t.toISOString(), personId: p.personId, householdId: p.householdId, card: { label: p.method + ' ending ' + String(1000 + (k % 9000)) },
        decline: dec, amount: p.total, kind: p.kind, description: p.description, paidBy: p, note: 'Paid ' + Math.round((at(p) - t) / 60000) + ' minutes later with ' + methodLabel(p) + '.' });
    });
    /* 3. Disputes on real card payments, each answered by a real club policy */
    var cards = visible().filter(function (p) { return p.last4 && p.status !== 'failed'; });
    function pick(f, salt) { return cards.filter(f).sort(function (a, b) { return fnv(salt + a.id) - fnv(salt + b.id); })[0]; }
    var camp = pick(function (p) { return p.kind === 'camp' && !refundedOf(p); }, 'dc');
    var refd = pick(function (p) { return p.kind === 'membership' && refundedOf(p) > 0; }, 'dr');
    var memb = pick(function (p) { return p.kind === 'membership' && p.season === 'outdoor-2026' && !refundedOf(p); }, 'dm');
    [[camp, 'product_not_received', 'Product not received', 'The cardholder says the camp week was not provided.', 'summer_camp', 5],
     [refd, 'credit_not_processed', 'Credit not processed', 'The cardholder expected a full refund; ' + money(FEE) + ' was kept as the administration fee.', 'membership', 9],
     [memb, 'fraudulent', 'Unrecognized charge', 'The cardholder does not recognize "Thornhill Park Tennis Club" on the statement.', 'membership', 2]
    ].forEach(function (d) {
      var p = d[0]; if (!p) return;
      var opened = D.fmt.addDays(TODAY, -d[5]); opened.setHours(8, 15 + d[5], 0, 0);
      var amount = d[1] === 'credit_not_processed' ? FEE : p.total;
      list.push({ id: 'dp_' + p.id, type: 'dispute', open: true, at: opened.toISOString(), personId: p.personId, householdId: p.householdId, payment: p,
        reason: d[1], reasonLabel: d[2], claim: d[3], policy: d[4], amount: amount, respondBy: D.fmt.addDays(opened, 14), kind: p.kind, description: p.description });
    });
    ISSUES = list;
    return list;
  }
  function issueState(it) {
    var a = D.activity({ ref: it.id });
    var last = a.filter(function (x) { return /^\[py:/.test(x.text) || x.ref && x.ref.type === 'payments-issue'; })[0];
    if (!last) return it.open ? (it.type === 'dispute' ? 'needs' : 'open') : 'resolved';
    return last.ref && last.ref.state || 'open';
  }
  function logIssue(it, st, text) { D.log(text, { type: 'payments-issue', id: it.id, state: st }); }

  /* ---------- Payouts: what a Stripe-backed panel shows (derived; rates illustrative) ---------- */
  var RATE = 0.029, FIXED = 0.30;
  function fee(p) { return r2(p.total * RATE + FIXED); }
  function payouts() {
    var byDay = {};
    function slot(d) { var k = dayKey(d); return byDay[k] || (byDay[k] = { day: k, pays: [], refunds: [] }); }
    visible().forEach(function (p) { if (p.status !== 'failed' && p.total > 0) slot(at(p)).pays.push(p); });
    D.refunds.all().forEach(function (r) { if (new Date(r.at) <= NOW || r.demo) slot(new Date(r.at)).refunds.push(r); });
    return Object.keys(byDay).sort().reverse().map(function (k) {
      var g = byDay[k], gross = sum(g.pays, 'total'), ref = sum(g.refunds, 'amount'), fees = sum(g.pays, fee);
      var arrives = addBizDays(D.fmt.parse(k), 2);
      return { day: k, pays: g.pays, refunds: g.refunds, gross: gross, refunded: ref, fees: fees, net: r2(gross - ref - fees), arrives: arrives, paid: arrives <= TODAY };
    });
  }

  /* ---------- Figures across the top ---------- */
  function renderKpis() {
    var V = visible(), ind = V.filter(function (p) { return p.season === 'indoor-2026'; });
    var paidIn = sum(ind, 'total'), refIn = sum(ind, refundedOf), hstIn = sum(ind, function (p) { return p.total ? p.hst * (1 - refundedOf(p) / p.total) : 0; });
    var s = settleItems(), iss = issues().filter(function (i) { var st = issueState(i); return st === 'open' || st === 'needs'; });
    var k = [
      ['Fall & Winter 2026/27 taken', money(r2(paidIn - refIn)), ind.length + ' payments, less ' + money(refIn) + ' refunded'],
      ['HST in it', money(r2(hstIn)), 'Added to memberships and lessons, included in court fees'],
      ['To settle', money(sum(s.due, function (x) { return x.b.total; })), s.due.length ? s.due.length + (s.due.length === 1 ? ' balance blocks' : ' balances block') + ' new bookings' : 'Nobody is blocked from booking'],
      ['Failed or disputed', String(iss.length), iss.length ? 'Need a reply or a retry' : 'Nothing open']
    ];
    $('[data-py-kpis]').innerHTML = k.map(function (x) {
      return '<div class="pn-kpi"><p class="pn-kpi__label">' + esc(x[0]) + '</p><p class="pn-kpi__value pn-money">' + esc(x[1]) + '</p><p class="pn-kpi__note">' + esc(x[2]) + '</p></div>';
    }).join('');
    $('[data-py-asof]').innerHTML = UI.icon('clock') + '<span>Shown as of ' + esc(D.fmt.long(TODAY)) + ', ' + esc(D.fmt.time(D.clock.nowMin)) + (D.clock.shifted ? ' on the demo clock' : '') +
      '. Payments are records only: the club takes Interac, Visa and Mastercard, never cash or cheque, and no card number is ever typed here.</span>';
    var c1 = $('[data-py-count="settle"]'), c2 = $('[data-py-count="issues"]');
    if (c1) c1.textContent = s.due.length ? s.due.length : '';
    if (c2) c2.textContent = iss.length ? iss.length : '';
  }

  /* ---------- Tabs (WAI-ARIA: arrows, Home, End) ---------- */
  var TABS = ['ledger', 'settle', 'refunds', 'issues', 'payouts', 'hst'];
  function selectTab(id, focus) {
    if (TABS.indexOf(id) < 0) id = 'ledger';
    state.tab = id; store('tab', id);
    $$('[data-py-tabs] [role=tab]').forEach(function (t) {
      var on = t.id === 'py-t-' + id;
      t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $$('[data-py-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-py-panel') !== id; });
    renderPanel(id);
  }
  function wireTabs() {
    var list = $('[data-py-tabs]');
    list.addEventListener('click', function (e) { var t = e.target.closest('[role=tab]'); if (t) selectTab(t.id.replace('py-t-', '')); });
    list.addEventListener('keydown', function (e) {
      var i = TABS.indexOf(state.tab), n = null;
      if (e.key === 'ArrowRight') n = (i + 1) % TABS.length; else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
      else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
      if (n !== null) { e.preventDefault(); selectTab(TABS[n], true); }
    });
  }
  function renderPanel(id) {
    var el = $('[data-py-panel="' + id + '"]');
    ({ ledger: renderLedger, settle: renderSettle, refunds: renderRefunds, issues: renderIssues, payouts: renderPayouts, hst: renderHst })[id](el);
    tableRoles(el);
  }

  /* ---------- Ledger ---------- */
  function seg(label, key, opts) {
    return '<div class="pn-seg" role="group" aria-label="' + esc(label) + '">' + opts.map(function (o) {
      return '<button type="button" data-py-seg="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (state[key] === o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function ledgerRows() {
    var q = state.q.trim().toLowerCase(), pp = state.person && D.people.get(state.person), personHousehold = pp ? pp.householdId : null;
    var rows = visible().filter(function (p) {
      if (state.kind !== 'all' && p.kind !== state.kind) return false;
      if (state.season !== 'all' && p.season !== state.season) return false;
      if (state.person && p.personId !== state.person && p.householdId !== state.person && p.householdId !== personHousehold) return false;
      var s = statusOf(p);
      if (state.status === 'succeeded' && s !== 'succeeded') return false;
      if (state.status === 'refunded' && s === 'succeeded') return false;
      if (q) {
        var hay = (p.id + ' ' + name(p.personId) + ' ' + p.description + ' ' + methodLabel(p) + ' ' + money(p.total) + ' ' + p.total.toFixed(2)).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var dir = state.dir, key = state.sort;
    rows.sort(function (a, b) {
      var x = key === 'total' ? a.total - b.total : key === 'payer' ? name(a.personId).localeCompare(name(b.personId)) : at(a) - at(b);
      return x * dir;
    });
    return rows;
  }
  function th(label, key, num) {
    var on = state.sort === key;
    return '<th scope="col"' + (num ? ' class="is-num"' : '') + (on ? ' aria-sort="' + (state.dir < 0 ? 'descending' : 'ascending') + '"' : '') +
      '><button class="pn-table__sort" type="button" data-py-sort="' + key + '">' + esc(label) + '</button></th>';
  }
  function renderLedger(el) {
    var focusQ = document.activeElement && document.activeElement.matches && document.activeElement.matches('[data-py-q]');
    var caret = focusQ ? document.activeElement.selectionStart : null;
    var rows = ledgerRows(), shown = rows.slice(0, state.shown);
    var tot = sum(rows, 'total'), hst = sum(rows, 'hst');
    var person = state.person ? (D.people.get(state.person) ? name(state.person) : (D.households.get(state.person) || {}).name) : null;
    el.innerHTML =
      '<div class="pn-toolbar py-toolbar">' +
        '<label class="pn-search pn-toolbar__grow"><span class="sr-only">Search payments</span>' + UI.icon('search') +
          '<input class="pn-input" type="search" data-py-q placeholder="Name, payment ID, last 4 digits or amount" value="' + esc(state.q) + '"></label>' +
        seg('Kind', 'kind', [['all', 'All'], ['court', 'Courts'], ['lesson', 'Lessons'], ['membership', 'Memberships'], ['camp', 'Camps']]) +
        '<label class="py-inline"><span class="sr-only">Season</span><select class="pn-select" data-py-season>' +
          [['all', 'All seasons'], ['indoor-2026', SEASON['indoor-2026']], ['outdoor-2026', SEASON['outdoor-2026']], ['camps-summer-2026', SEASON['camps-summer-2026']]].map(function (o) {
            return '<option value="' + o[0] + '"' + (state.season === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
          }).join('') + '</select></label>' +
        seg('Status', 'status', [['all', 'Any status'], ['succeeded', 'Paid'], ['refunded', 'Refunded']]) +
        '<p class="pn-toolbar__count" aria-live="polite">' + rows.length.toLocaleString('en-CA') + ' payments, ' + esc(money(tot)) + ' with ' + esc(money(hst)) + ' HST</p>' +
      '</div>' +
      (person ? '<p class="py-filter">Showing payments for <strong>' + esc(person) + '</strong>' + (D.people.get(state.person) ? ' and their household' : '') + ' <button type="button" class="pn-btn pn-btn--text pn-btn--sm" data-py-clear-person>Show everyone</button></p>' : '') +
      (rows.length ? '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Payments ledger">' +
        '<table class="pn-table py-ledger py-stack"><caption class="sr-only">Payments, newest first. Sample data.</caption><thead><tr>' +
        th('Date', 'date') + th('Payer', 'payer') + '<th scope="col">For</th><th scope="col">Method</th>' +
        '<th scope="col" class="is-num">HST</th>' + th('Total', 'total', true) + '<th scope="col">Status</th></tr></thead><tbody>' +
        shown.map(function (p) {
          return '<tr><td class="is-tight pn-num pn-nowrap">' + esc(shortDay(p.at)) + '<span class="pn-sub">' + esc(D.fmt.time(at(p).getHours() * 60 + at(p).getMinutes())) + '</span></td>' +
            '<td><button class="pn-rowlink" type="button" data-py-open="' + esc(p.id) + '">' + esc(name(p.personId)) + '</button><span class="pn-sub pn-num">' + esc(p.id) + '</span></td>' +
            '<td class="py-for">' + esc(KIND[p.kind] || p.kind) + '<span class="pn-sub">' + esc(p.description) + '</span></td>' +
            '<td class="pn-nowrap">' + esc(methodLabel(p)) + '</td>' +
            '<td class="is-num pn-money py-r py-r3" data-label="HST">' + (p.hstIncluded === null ? '<span class="pn-muted">Not stated</span>' : esc(money(p.hst))) + '<span class="pn-sub">' + esc(treatment(p)) + '</span></td>' +
            '<td class="is-num pn-money py-r py-r1">' + esc(money(p.total)) + '</td><td class="py-r py-r2">' + statusChip(p) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (rows.length > shown.length ? '<div class="py-more"><button type="button" class="pn-btn pn-btn--quiet" data-py-more>Show 50 more</button><span class="pn-muted">' + shown.length + ' of ' + rows.length.toLocaleString('en-CA') + '</span></div>' : '')
      : '<div class="pn-empty"><p class="pn-empty__title">No payments match</p><p>Clear the search or choose another kind or season.</p><button type="button" class="pn-btn pn-btn--text" data-py-reset-filters>Clear filters</button></div>') +
      '<p class="pn-note">' + UI.icon('alert') + '<span>Group lessons and High Performance programs have no sample payments: their prices are not published. ' + UI.confirmSlot('Group lesson and High Performance prices') + '</span></p>';
    if (focusQ) { var i = $('[data-py-q]', el); i.focus(); try { i.setSelectionRange(caret, caret); } catch (e) { /* type=search */ } }
  }

  /* ---------- A court at true proportion: 78 x 36 ft, singles 27 ft, service lines 21 ft from
     the net, the net in club red running 3 ft past each doubles sideline to its posts. The four
     courts side by side under the dome; the one paid for is filled. ---------- */
  function courtPlan(court) {
    var g = '';
    for (var i = 0; i < 4; i++) {
      var x = 6 + i * 50, y = 4, on = i + 1 === court;
      g += '<g' + (on ? ' class="py-cplan__on"' : '') + '>' +
        (on ? '<rect class="cplan__area" x="' + x + '" y="' + y + '" width="36" height="78"/>' : '') +
        '<g class="cplan__lines"><rect x="' + x + '" y="' + y + '" width="36" height="78"/>' +
        '<line x1="' + (x + 4.5) + '" y1="' + y + '" x2="' + (x + 4.5) + '" y2="' + (y + 78) + '"/><line x1="' + (x + 31.5) + '" y1="' + y + '" x2="' + (x + 31.5) + '" y2="' + (y + 78) + '"/>' +
        '<line x1="' + (x + 4.5) + '" y1="' + (y + 18) + '" x2="' + (x + 31.5) + '" y2="' + (y + 18) + '"/><line x1="' + (x + 4.5) + '" y1="' + (y + 60) + '" x2="' + (x + 31.5) + '" y2="' + (y + 60) + '"/>' +
        '<line x1="' + (x + 18) + '" y1="' + (y + 18) + '" x2="' + (x + 18) + '" y2="' + (y + 60) + '"/>' +
        '<line x1="' + (x + 18) + '" y1="' + y + '" x2="' + (x + 18) + '" y2="' + (y + 1) + '"/><line x1="' + (x + 18) + '" y1="' + (y + 77) + '" x2="' + (x + 18) + '" y2="' + (y + 78) + '"/></g>' +
        '<line class="cplan__net" x1="' + (x - 3) + '" y1="' + (y + 39) + '" x2="' + (x + 39) + '" y2="' + (y + 39) + '"/>' +
        '<text class="py-cplan__label" x="' + (x + 18) + '" y="' + (y + 92) + '" text-anchor="middle">Court ' + (i + 1) + '</text></g>';
    }
    return '<figure class="py-plan"><svg class="cplan py-cplan" viewBox="0 0 198 100" role="img" aria-label="The four courts; Court ' + court + ' is the one paid for">' + g + '</svg>' +
      '<figcaption class="pn-muted">Four courts at true 78 by 36 ft proportion. Court ' + court + ' is filled.</figcaption></figure>';
  }
  function bandLine(b) {
    var fb = D.feeBands.filter(function (x) { return x.id === b.band; })[0];
    return fb ? esc(fb.name) + ', ' + esc(fb.when.charAt(0).toLowerCase() + fb.when.slice(1)) + ', ' + money(fb.fee) + ' an hour, HST included' : '';
  }
  function hstExplain(p) {
    if (p.hstIncluded === true) return 'HST is included in court fees (the club\'s fee table): ' + money(p.total) + ' holds ' + money(p.hst) + ' of HST, 13/113 of the price.';
    if (p.hstIncluded === false) return '13% Ontario HST added to ' + money(p.subtotal) + ', as the club prices ' + (p.kind === 'membership' ? 'memberships ("Add HST to fees listed above")' : 'lessons ("$100+HST per hour")') + '.';
    return 'The camp page does not say whether its prices include HST, so none is added or split out here. ' + UI.confirmSlot('Whether camp prices include HST');
  }

  /* ---------- One payment, as a side sheet ---------- */
  function openPayment(id) {
    var p = D.payments.get(id);
    if (!p) { UI.toast('No payment ' + id + ' in the sample data.', { kind: 'warn' }); return; }
    var refs = refundsOf(p.id), refd = refundedOf(p), h = household(p), b = p.ref && p.ref.type === 'booking' ? D.bookings.get(p.ref.id) : null;
    var acts = D.activity({ ref: p.id }).slice(0, 6);
    var body =
      '<div class="py-sheet-status">' + statusChip(p) + '<span class="pn-sample">Sample data</span></div>' +
      '<dl class="pn-dl py-dl">' +
        '<div><dt>Payment ID</dt><dd class="pn-num">' + esc(p.id) + '</dd></div>' +
        '<div><dt>Paid</dt><dd>' + esc(stamp(p.at)) + '</dd></div>' +
        '<div><dt>Payer</dt><dd>' + personLink(p.personId) + (h ? '<span class="pn-sub">' + esc(h.name) + ', ' + (h.resident ? 'Vaughan resident' : 'non-resident') + '</span>' : '') + '</dd></div>' +
        '<div><dt>For</dt><dd>' + esc(p.description) + (refLink(p) ? '<span class="pn-sub">' + refLink(p) + '</span>' : '') + '</dd></div>' +
        '<div><dt>Season</dt><dd>' + esc(seasonName(p.season)) + '</dd></div>' +
        '<div><dt>Method</dt><dd>' + esc(methodLabel(p)) + '<span class="pn-sub">A record from the processor. Card numbers are never typed or shown here.</span></dd></div>' +
      '</dl>' +
      '<div class="py-sum" role="group" aria-label="Amounts">' +
        '<p><span>Before HST</span><span class="pn-money">' + (p.hstIncluded === null ? 'Not stated' : esc(money(p.subtotal))) + '</span></p>' +
        '<p><span>HST' + (p.hstIncluded === true ? ', included in the price' : p.hstIncluded === false ? ', 13% added' : '') + '</span><span class="pn-money">' + (p.hstIncluded === null ? 'Not stated' : esc(money(p.hst))) + '</span></p>' +
        '<p class="py-sum__total"><span>Paid</span><span class="pn-money">' + esc(money(p.total)) + '</span></p>' +
        (refd ? '<p><span>Refunded</span><span class="pn-money">' + esc(money(-refd)) + '</span></p><p class="py-sum__total"><span>Kept by the club</span><span class="pn-money">' + esc(money(r2(p.total - refd))) + '</span></p>' : '') +
      '</div>' +
      '<p class="pn-help py-explain">' + hstExplain(p) + '</p>' +
      (b ? '<div class="py-booking"><h3 class="pn-h3">' + esc(D.courts[b.court - 1].name + ', ' + D.fmt.day(b.date) + ', ' + D.fmt.range(b.start, b.hours)) + '</h3>' +
        '<p class="pn-muted">' + (b.type === 'lesson' ? 'A lesson on court, priced by the hour plus HST; no court fee is charged on top' : bandLine(b)) + (b.extra ? '. Plus ' + money(b.extra) + ' in player or guest fees at ' + money(D.playerFee) + ' each.' : '.') + '</p>' + courtPlan(b.court) + '</div>' : '') +
      (refs.length ? '<h3 class="pn-h3">Refunds</h3><ul class="py-list">' + refs.map(function (r) {
        return '<li><span class="pn-money">' + esc(money(r.amount)) + '</span> on ' + esc(stamp(r.at)) + ' by ' + esc(r.by) + '<span class="pn-sub">' + esc(r.reason) + (r.adminFee ? ', ' + money(r.adminFee) + ' administration fee kept' : '') + '</span></li>';
      }).join('') + '</ul>' : '') +
      (acts.length ? '<h3 class="pn-h3">In this demo</h3><ul class="py-list">' + acts.map(function (a) { return '<li>' + esc(a.text) + '<span class="pn-sub">' + esc(a.by) + ', ' + esc(stamp(a.at)) + '</span></li>'; }).join('') + '</ul>' : '');
    var canRefund = canAct('payments.refund'), left = r2(p.total - refd);
    var foot = '<button class="pn-btn pn-btn--quiet" type="button" data-py-receipt>Email receipt</button>' +
      (left > 0 ? (canRefund ? '<button class="pn-btn pn-btn--ink" type="button" data-py-refund>Refund</button>'
        : '<button class="pn-btn pn-btn--quiet" type="button" data-py-flag>Flag for the Administrator</button>' + btn('Refund', 'data-py-refund', 'pn-btn--ink', 'payments.refund')) : '');
    var el = UI.sheet.open({ kicker: KIND[p.kind] + ' payment', title: money(p.total) + ' from ' + name(p.personId), body: body, foot: foot, wide: true });
    var r = $('[data-py-refund]', el); if (r) r.addEventListener('click', function () { if (!blocked(r)) openRefund(p.id); });
    var f = $('[data-py-flag]', el); if (f) f.addEventListener('click', function () {
      D.log('Flagged ' + p.id + ' for the Administrator to review for a refund', { type: 'payments', id: p.id });
      UI.toast('Flagged for the Administrator. It shows in this payment\'s activity; nothing is sent.'); openPayment(p.id);
    });
    $('[data-py-receipt]', el).addEventListener('click', function () {
      var who = D.people.get(p.personId);
      UI.toast('Receipt not sent: this is a demo.' + (who && who.email ? ' It would go to ' + who.email + '.' : ''));
    });
    try { history.replaceState(null, '', location.pathname + '?pay=' + encodeURIComponent(p.id)); } catch (e) { /* file:// */ }
    el.addEventListener('close', function once() { el.removeEventListener('close', once); try { history.replaceState(null, '', location.pathname + (state.tab !== 'ledger' ? '?tab=' + state.tab : '')); } catch (e) { /* file:// */ } });
  }

  /* ---------- Refunds under the club's own policies ---------- */
  function nowIso() { var d = new Date(TODAY), r = new Date(); d.setHours(r.getHours(), r.getMinutes(), r.getSeconds(), 0); return d.toISOString(); }
  function policyFor(p) {
    var left = r2(p.total - refundedOf(p)), less = r2(Math.max(0, left - FEE));
    if (p.kind === 'membership') {
      var days = daysBetween(at(p), TODAY), met = days <= 7;
      return { key: 'membership', text: POLICY.membership, met: met, label: 'Not satisfied within the first 7 days', amount: less,
        why: met ? 'Bought ' + days + (days === 1 ? ' day' : ' days') + ' ago: inside the 7 days.' : 'Bought ' + days + ' days ago: the policy allows refunds only within 7 days.' };
    }
    if (p.kind === 'camp') {
      var reg = p.ref && D.registrations.get(p.ref.id), s = reg && D.sessions.get(reg.sessionId), start = s && s.start ? D.fmt.parse(s.start) : null;
      var dd = start ? daysBetween(TODAY, start) : null;
      return { key: 'summer_camp', text: POLICY.summer_camp, met: dd !== null && dd >= 21, notice: true, label: 'Written notice 3 weeks or more before the camp week', amount: less,
        why: dd === null ? 'The camp week date is not on the record.' : dd < 0 ? 'The week of ' + D.fmt.date(start) + ' has already run: no refund after the week starts.' : dd >= 21 ? 'The week starts in ' + dd + ' days: notice is in time.' : 'The week starts in ' + dd + ' days: under the 3 weeks the policy needs.' };
    }
    if (p.kind === 'lesson') {
      var b = p.ref && D.bookings.get(p.ref.id), ld = b ? D.fmt.parse(b.date) : null, bd = ld ? bizDaysBetween(TODAY, ld) : null, past = ld && endOf(b) <= NOW;
      return { key: 'lessons', text: POLICY.lessons, met: !!ld && !past && bd >= 7, notice: true, label: 'Written notice 7 business days or more before the lesson', amount: less,
        cancel: { label: 'The club cancelled the lesson (full refund)', amount: left },
        why: !ld ? 'The lesson date is not on the record.' : past ? 'The lesson has been given: no refund after it starts.' : 'The lesson is ' + bd + ' business ' + (bd === 1 ? 'day' : 'days') + ' away: ' + (bd >= 7 ? 'notice is in time.' : 'under the 7 business days the policy needs.') };
    }
    return { key: 'court', text: 'Once the court has been reserved and paid for, there are no refunds or rescheduling!', met: false, label: null, amount: 0,
      why: 'Court fees are not refundable under the club\'s booking rules. Only a club decision can return one.' };
  }
  function openRefund(id) {
    var p = D.payments.get(id); if (!p) return;
    if (!canAct('payments.refund')) { UI.toast(UI.whoCan('payments.refund') + ' only. You are signed in as ' + D.roleName() + '.', { kind: 'warn' }); return; }
    var pol = policyFor(p), left = r2(p.total - refundedOf(p));
    var opts = [];
    if (pol.label) opts.push(['policy', pol.label + (pol.met ? ', less ' + money(FEE) : ' (not met)'), pol.amount, !pol.met]);
    if (pol.cancel) opts.push(['cancel', pol.cancel.label, pol.cancel.amount, false]);
    opts.push(['club', 'Club decision, outside the published policy', left, false]);
    var first = opts.filter(function (o) { return !o[3]; })[0];
    var body =
      '<div class="py-policy ' + (pol.met ? 'is-met' : 'is-not') + '"><p class="pn-kicker">The club\'s policy, word for word</p><blockquote class="py-quote">' + esc(pol.text) + '</blockquote>' +
        '<p class="py-verdict">' + UI.icon(pol.met ? 'check' : 'alert') + '<span><strong>' + (pol.met ? 'Policy met. ' : 'Policy not met. ') + '</strong>' + esc(pol.why) + '</span></p>' +
        '<p class="pn-help">Source: the club\'s policies page (' + esc(POLICY.source) + ').</p></div>' +
      '<form class="pn-form py-refund" novalidate>' +
        '<fieldset class="py-reasons"><legend class="pn-label">Reason</legend>' + opts.map(function (o, i) {
          return '<label class="pn-check"><input type="radio" name="py-reason" value="' + o[0] + '"' + (o === first ? ' checked' : '') + (o[3] ? ' disabled' : '') + '> ' + esc(o[1]) + '</label>';
        }).join('') + '</fieldset>' +
        (pol.notice ? '<label class="pn-check" data-py-notice-wrap><input type="checkbox" data-py-notice> Written notice received by the Director and Assistant Director, as the policy asks</label>' : '') +
        '<div class="pn-form__row pn-form__row--2">' +
          '<div class="pn-field"><label class="pn-label" for="py-amt">Refund amount (CAD)</label><input class="pn-input" id="py-amt" inputmode="decimal" autocomplete="off" data-py-amt aria-describedby="py-amt-help"><p class="pn-help" id="py-amt-help">Up to ' + esc(money(left)) + ' is left on this payment.</p></div>' +
          '<div class="pn-field"><span class="pn-label">Back to</span><p class="py-static">' + esc(methodLabel(p)) + '</p><p class="pn-help">The original method. Nothing moves in the demo.</p></div>' +
        '</div>' +
        '<div class="pn-field"><label class="pn-label" for="py-note">Note for the record</label><textarea class="pn-textarea" id="py-note" data-py-note rows="3" aria-describedby="py-note-help"></textarea><p class="pn-help" id="py-note-help">Required for a club decision outside the policy.</p></div>' +
        '<div class="py-sum" data-py-breakdown aria-live="polite"></div>' +
        '<div data-py-errors></div>' +
      '</form>';
    var el = UI.sheet.open({ kicker: 'Refund, ' + KIND[p.kind].toLowerCase(), title: money(p.total) + ' from ' + name(p.personId), body: body, wide: true,
      foot: '<button class="pn-btn pn-btn--quiet" type="button" data-py-back>Back to the payment</button><button class="pn-btn pn-btn--ink" type="button" data-py-go>Review refund</button>' });
    var amt = $('[data-py-amt]', el), note = $('[data-py-note]', el);
    function reason() { var r = $('input[name=py-reason]:checked', el); return r ? r.value : null; }
    function opt() { var r = reason(); return opts.filter(function (o) { return o[0] === r; })[0]; }
    function sync(setAmt) {
      var o = opt(); if (!o) return;
      if (setAmt) amt.value = o[2].toFixed(2);
      amt.readOnly = o[0] !== 'club';
      var a = parseFloat(amt.value) || 0, hstPart = p.total && p.hstIncluded !== null ? r2(a * p.hst / p.total) : null;
      $('[data-py-breakdown]', el).innerHTML =
        '<p><span>Paid</span><span class="pn-money">' + esc(money(p.total)) + '</span></p>' +
        (refundedOf(p) ? '<p><span>Already refunded</span><span class="pn-money">' + esc(money(-refundedOf(p))) + '</span></p>' : '') +
        (o[0] === 'policy' ? '<p><span>Administration fee kept</span><span class="pn-money">' + esc(money(-Math.min(FEE, left))) + '</span></p>' : '') +
        '<p class="py-sum__total"><span>Refund</span><span class="pn-money">' + esc(money(a)) + '</span></p>' +
        '<p><span>HST inside the refund</span><span class="pn-money">' + (hstPart === null ? 'Not stated' : esc(money(hstPart))) + '</span></p>' +
        (o[0] === 'policy' ? '<p class="py-sum__note">Whether HST applies to the ' + money(FEE) + ' fee is not stated. ' + UI.confirmSlot('HST on the administration fee') + '</p>' : '');
    }
    $$('input[name=py-reason]', el).forEach(function (r) { r.addEventListener('change', function () { sync(true); }); });
    amt.addEventListener('input', function () { sync(false); });
    sync(true);
    $('[data-py-back]', el).addEventListener('click', function () { openPayment(p.id); });
    $('[data-py-go]', el).addEventListener('click', function () {
      var o = opt(), a = r2(parseFloat(amt.value)), errs = [], box = $('[data-py-errors]', el);
      [amt, note].forEach(function (x) { x.removeAttribute('aria-invalid'); x.setAttribute('aria-describedby', x === amt ? 'py-amt-help' : 'py-note-help'); });
      if (!o) errs.push([null, 'Choose a reason']);
      if (!(a > 0) || a > left + 0.001) { errs.push([amt, 'Enter an amount between $0.01 and ' + money(left)]); amt.setAttribute('aria-invalid', 'true'); }
      if (o && o[0] === 'club' && note.value.trim().length < 8) { errs.push([note, 'Say why the club is refunding outside its policy']); note.setAttribute('aria-invalid', 'true'); }
      var nb = $('[data-py-notice]', el);
      if (o && o[0] === 'policy' && nb && !nb.checked) errs.push([nb, 'Confirm the written notice was received']);
      box.innerHTML = errs.map(function (e, i) { return '<p class="pn-error" id="py-err-' + i + '">' + UI.icon('alert') + esc(e[1]) + '</p>'; }).join('');
      errs.forEach(function (e, i) { if (e[0] && e[0].id) e[0].setAttribute('aria-describedby', (e[0] === amt ? 'py-amt-help' : 'py-note-help') + ' py-err-' + i); });
      if (errs.length) { if (errs[0][0]) errs[0][0].focus(); return; }
      var label = o[0] === 'policy' ? pol.label : o[1];
      UI.confirm({ title: 'Refund ' + money(a) + ' to ' + name(p.personId) + '?', danger: true, confirm: 'Refund ' + money(a), cancel: 'Go back',
        body: '<p>' + esc(label) + '. Back to ' + esc(methodLabel(p)) + '.</p><p>In the demo the refund is recorded in this browser only. Nothing is sent to a card or bank.</p>' })
        .then(function (yes) { if (yes) doRefund(p, a, o[0], label, pol, note.value.trim()); else amt.focus(); });
    });
  }
  function doRefund(p, a, kind, label, pol, noteText) {
    var before = { status: p.status, refunded: p.refunded || 0 }, total = r2(refundedOf(p) + a);
    var re = D.refunds.add({ paymentId: p.id, at: nowIso(), amount: a, adminFee: kind === 'policy' ? FEE : 0, reason: label + (noteText ? ': ' + noteText : ''), policy: kind === 'club' ? 'club_decision' : pol.key, by: D.roleName(), status: 'succeeded' });
    D.payments.update(p.id, { refunded: total, status: total >= p.total - 0.005 ? 'refunded' : 'partially_refunded' }, 'Refunded ' + money(a) + ' to ' + name(p.personId) + ' (' + label + ')');
    var linked = null;
    if (p.kind === 'membership') { linked = D.memberships.list({ paymentId: p.id })[0]; if (linked) D.memberships.update(linked.id, { status: 'refunded' }, 'Membership refunded with ' + p.id); }
    if (p.kind === 'camp' && p.ref) { linked = D.registrations.get(p.ref.id); if (linked) D.registrations.update(linked.id, { status: 'refunded' }, 'Camp registration refunded with ' + p.id); }
    var prev = linked ? { col: p.kind === 'membership' ? D.memberships : D.registrations, id: linked.id, status: linked.status } : null;
    UI.sheet.close();
    UI.toast('Refund of ' + money(a) + ' recorded for ' + name(p.personId) + '. Nothing was sent to a card.', { action: { label: 'Undo', run: function () {
      D.refunds.remove(re.id); D.payments.update(p.id, before, 'Undid the refund of ' + money(a));
      if (prev) prev.col.update(prev.id, { status: prev.status });
      UI.toast('Refund undone.');
    } } });
  }

  /* On a phone, .py-stack tables lay each row out as two ruled columns (payments.css). Explicit
     roles keep them a table for screen readers once the display changes. */
  function tableRoles(el) {
    [].forEach.call(el.querySelectorAll('table.py-stack'), function (t) {
      t.setAttribute('role', 'table');
      [].forEach.call(t.querySelectorAll('thead, tbody'), function (g) { g.setAttribute('role', 'rowgroup'); });
      [].forEach.call(t.querySelectorAll('tr'), function (r) { r.setAttribute('role', 'row'); });
      [].forEach.call(t.querySelectorAll('th'), function (c) { c.setAttribute('role', 'columnheader'); });
      [].forEach.call(t.querySelectorAll('td'), function (c) { c.setAttribute('role', 'cell'); });
    });
  }

  /* ---------- To settle ---------- */
  function bookingWho(b) { return b.fromPublicFlow ? b.name : name(b.personId); }
  function renderSettle(el) {
    var s = settleItems();
    function rows(list, due) {
      return list.map(function (x) {
        var b = x.b, payers = b.type === 'member' ? (b.guests || 0) : (b.players || 0);
        return '<tr><td class="is-tight pn-nowrap">' + esc(D.fmt.day(b.date)) + '<span class="pn-sub">' + esc(D.fmt.range(b.start, b.hours || 1)) + '</span></td>' +
          '<td>' + (b.personId ? personLink(b.personId) : esc(bookingWho(b))) + '<span class="pn-sub">' + esc(b.type === 'member' ? 'Member' : 'Non-member') + (x.pub ? ', public site booking (this tab)' : '') + '</span></td>' +
          '<td>' + esc(D.courts[b.court - 1].name) + '<span class="pn-sub">' + esc((D.feeBands.filter(function (f) { return f.id === b.band; })[0] || {}).name || '') + (payers ? ', ' + payers + ' x ' + money(D.playerFee) : '') + '</span></td>' +
          (due ? '<td class="py-why">' + esc(x.why) + '</td>' : '') +
          '<td class="is-num pn-money py-r py-r1">' + esc(money(b.total)) + '<span class="pn-sub">HST ' + esc(money(D.hstIn(b.total))) + ' incl.</span></td>' +
          '<td class="py-r py-r2">' + (due ? UI.chip('due') : UI.chip('booked', 'Pays after play')) + '</td>' +
          '<td class="is-tight py-r py-r3">' + btn(due ? 'Settle' : 'Take now', 'data-py-settle="' + esc(b.id) + '"', 'pn-btn--quiet pn-btn--sm', 'payments.record') + '</td></tr>';
      }).join('');
    }
    function head(due) { return '<thead><tr><th scope="col">Court time</th><th scope="col">Who</th><th scope="col">Court</th>' + (due ? '<th scope="col">Why</th>' : '') + '<th scope="col" class="is-num">Amount</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>'; }
    el.innerHTML =
      '<div class="pn-section__head"><h3 class="pn-h2">Balances to settle</h3><p class="pn-muted">"If you have an outstanding balance from a previous booking, you CANNOT make additional bookings until all previous balances are settled." No-shows and cancels under 48 hours are charged the court fee to the card on file.</p></div>' +
      (s.due.length ? '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Balances to settle"><table class="pn-table py-settle py-stack"><caption class="sr-only">Balances to settle now. Sample data.</caption>' + head(true) + '<tbody>' + rows(s.due, true) + '</tbody></table></div>'
        : '<div class="pn-empty"><p class="pn-empty__title">Every balance is settled</p><p>Nobody is blocked from booking. Members who chose to pay later appear here once their court time has been played.</p></div>') +
      '<div class="pn-section__head py-gap"><h3 class="pn-h2">Booked, paying after play</h3><p class="pn-muted">Members may skip payment at booking ("Payment at the time of booking is optional"). These become balances once the hour is played; a member at the desk can pay ahead. ' + s.later.length + ' bookings, ' + esc(money(sum(s.later, function (x) { return x.b.total; }))) + '.</p></div>' +
      (s.later.length ? '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Booked, paying after play"><table class="pn-table py-settle py-stack"><caption class="sr-only">Unpaid upcoming member bookings. Sample data.</caption>' + head(false) + '<tbody>' + rows(s.later.slice(0, 30), false) + '</tbody></table></div>' +
        (s.later.length > 30 ? '<p class="pn-muted py-more">The next 30 of ' + s.later.length + ' are shown, soonest first.</p>' : '') : '<p class="pn-muted">None.</p>');
  }
  function openSettle(bid) {
    var b = D.bookings.get(bid) || (D.publicBooking() && D.publicBooking().id === bid ? D.publicBooking() : null);
    if (!b) return;
    var card = b.personId ? cardOnFile(b.personId) : null;
    var body = '<dl class="pn-dl py-dl"><div><dt>Court time</dt><dd>' + esc(D.courts[b.court - 1].name + ', ' + D.fmt.day(b.date) + ', ' + D.fmt.range(b.start, b.hours || 1)) + '</dd></div>' +
      '<div><dt>Who</dt><dd>' + esc(bookingWho(b)) + '</dd></div><div><dt>Fee</dt><dd>' + bandLine(b) + (b.extra ? ', plus ' + esc(money(b.extra)) + ' player or guest fees' : '') + '</dd></div></dl>' +
      '<div class="py-sum"><p><span>Court fee</span><span class="pn-money">' + esc(money(b.courtFee)) + '</span></p>' + (b.extra ? '<p><span>Player and guest fees</span><span class="pn-money">' + esc(money(b.extra)) + '</span></p>' : '') +
      '<p class="py-sum__total"><span>To settle</span><span class="pn-money">' + esc(money(b.total)) + '</span></p><p><span>HST inside</span><span class="pn-money">' + esc(money(D.hstIn(b.total))) + '</span></p></div>' +
      '<form class="pn-form" novalidate><fieldset class="py-reasons"><legend class="pn-label">How it is paid</legend>' +
      (card ? '<label class="pn-check"><input type="radio" name="py-how" value="card" checked> Charge the card on file, ' + esc(card.label) + ' (sample record)</label>' : '') +
      '<label class="pn-check"><input type="radio" name="py-how" value="interac"' + (card ? '' : ' checked') + '> Interac at the front desk</label>' +
      '<label class="pn-check"><input type="radio" name="py-how" value="phone"> Card by phone, entered by the payer on the processor\'s own page</label></fieldset>' +
      '<p class="pn-help">No card number, expiry or code is typed into this panel. Cash and cheques are not accepted (club policy).</p></form>' + courtPlan(b.court);
    var el = UI.sheet.open({ kicker: endOf(b) > NOW && b.status === 'booked' ? 'Pay ahead, before play' : 'Settle a balance', title: money(b.total) + ' for ' + bookingWho(b), body: body,
      foot: '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Not now</button><button class="pn-btn pn-btn--ink" type="button" data-py-settle-go>Record payment</button>' });
    $('[data-py-settle-go]', el).addEventListener('click', function () {
      var how = ($('input[name=py-how]:checked', el) || {}).value || 'interac';
      var m = how === 'card' ? card.method : how === 'interac' ? 'Interac' : 'Visa', l4 = how === 'card' ? card.last4 : null;
      var pay = D.payments.add({ at: nowIso(), personId: b.personId || null, householdId: b.personId ? D.people.get(b.personId).householdId : null, kind: 'court', season: b.season,
        ref: { type: 'booking', id: b.id }, description: b.title + ', ' + D.courts[b.court - 1].name + ', ' + D.fmt.day(b.date) + ', ' + D.fmt.range(b.start, b.hours || 1),
        subtotal: r2(b.total - D.hstIn(b.total)), hst: D.hstIn(b.total), total: b.total, hstIncluded: true, method: how === 'phone' ? 'Card by phone' : m, last4: l4, status: 'succeeded', refunded: 0, currency: 'CAD' });
      D.bookings.update(b.id, { paid: true, paymentId: pay.id }, 'Balance of ' + money(b.total) + ' settled (' + (how === 'card' ? 'card on file' : how === 'interac' ? 'Interac at the desk' : 'card by phone') + ')');
      UI.sheet.close();
      UI.toast('Payment recorded for ' + bookingWho(b) + '. Nothing was charged in the demo.', { action: { label: 'Undo', run: function () {
        D.payments.remove(pay.id); D.bookings.update(b.id, { paid: false, paymentId: null }, 'Undid the settled balance'); UI.toast('Payment record removed. The balance is back to settle.');
      } } });
    });
  }

  /* ---------- Refunds: the club's policies, then the record ---------- */
  var POLICY_NAMES = { membership: 'Membership', lessons: 'Lessons (groups and privates)', summer_camp: 'Summer camp', winter_and_march_break_camp: 'Winter Holiday and March Break camps' };
  function renderRefunds(el) {
    var R = D.refunds.all().filter(function (r) { return r.demo || new Date(r.at) <= NOW; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    var kept = sum(R, 'adminFee');
    el.innerHTML =
      '<div class="pn-section__head"><h3 class="pn-h2">The club\'s refund policies</h3><p class="pn-muted">Word for word from the club\'s policies page. A ' + esc(money(FEE)) + ' administration fee applies to every refund under them. Court fees are not refundable once reserved and paid.</p></div>' +
      '<div class="py-policies">' + Object.keys(POLICY_NAMES).map(function (k) {
        return '<details class="py-pol"><summary><span class="pn-h3">' + esc(POLICY_NAMES[k]) + '</span><span class="pn-muted">' + esc(k === 'membership' ? 'Within 7 days of buying' : k === 'lessons' ? '7 business days notice' : k === 'summer_camp' ? '3 weeks notice' : '1 week notice') + ', less ' + esc(money(FEE)) + '</span></summary><p>' + esc(POLICY[k]) + '</p></details>';
      }).join('') + '<details class="py-pol"><summary><span class="pn-h3">Court bookings</span><span class="pn-muted">No refunds once paid</span></summary><p>Once the court has been reserved and paid for, there are no refunds or rescheduling! The Friday public hours lottery payment is non-refundable.</p></details></div>' +
      '<div class="pn-section__head py-gap"><h3 class="pn-h2">Refunds given</h3><p class="pn-muted">' + R.length + ' refunds, ' + esc(money(sum(R, 'amount'))) + ' returned, ' + esc(money(kept)) + ' kept in administration fees.</p></div>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Refunds given"><table class="pn-table py-stack"><caption class="sr-only">Refunds, newest first. Sample data.</caption><thead><tr><th scope="col">Date</th><th scope="col">Payer</th><th scope="col">Policy and reason</th><th scope="col">By</th><th scope="col" class="is-num">Fee kept</th><th scope="col" class="is-num">Refunded</th></tr></thead><tbody>' +
      R.map(function (r) {
        var p = D.payments.get(r.paymentId) || {};
        return '<tr><td class="is-tight pn-nowrap">' + esc(shortDay(r.at)) + '</td><td><button class="pn-rowlink" type="button" data-py-open="' + esc(r.paymentId) + '">' + esc(name(p.personId)) + '</button><span class="pn-sub">' + esc(KIND[p.kind] || '') + ', ' + esc(r.paymentId) + '</span></td>' +
          '<td>' + esc(POLICY_NAMES[r.policy] || (r.policy === 'club_decision' ? 'Club decision' : r.policy)) + '<span class="pn-sub">' + esc(r.reason) + '</span></td><td>' + esc(r.by) + '</td>' +
          '<td class="is-num pn-money py-r py-r2" data-label="Fee kept">' + esc(money(r.adminFee || 0)) + '</td><td class="is-num pn-money py-r py-r1" data-label="Refunded">' + esc(money(r.amount)) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="pn-note">' + UI.icon('alert') + '<span>To refund, open a payment in the Ledger. ' + (canAct('payments.refund') ? 'The policy is checked against its dates first.' : 'Refunds are ' + esc(UI.whoCan('payments.refund')) + ' only; you can flag a payment for them.') + '</span></p>';
  }

  /* ---------- Failed and disputed ---------- */
  function issueChip(it) {
    var st = issueState(it);
    if (it.type === 'dispute') return st === 'needs' ? UI.chip('due', 'Needs response') : st === 'submitted' ? UI.chip('pending', 'Evidence sent') : st === 'accepted' ? UI.chip('ended', 'Accepted') : UI.chip('due', 'Needs response');
    return st === 'resolved' ? UI.chip('succeeded', 'Paid on retry') : st === 'link' ? UI.chip('pending', 'Link sent') : UI.chip('failed');
  }
  function renderIssues(el) {
    var L = issues(), F = L.filter(function (x) { return x.type === 'failed'; }), Dp = L.filter(function (x) { return x.type === 'dispute'; });
    /* The desk's order: disputes by the date the answer is due, soonest first; failures still open first, then newest first */
    Dp.sort(function (a, b) { var na = issueState(a) === 'needs' ? 0 : 1, nb = issueState(b) === 'needs' ? 0 : 1; return na - nb || a.respondBy - b.respondBy; });
    F.sort(function (a, b) { var ra = issueState(a) === 'resolved' ? 1 : 0, rb = issueState(b) === 'resolved' ? 1 : 0; return ra - rb || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0); });
    function row(it) {
      return '<tr><td class="is-tight pn-nowrap">' + esc(shortDay(it.at)) + '</td><td><button class="pn-rowlink" type="button" data-py-issue="' + esc(it.id) + '">' + esc(name(it.personId)) + '</button><span class="pn-sub">' + esc(it.card ? it.card.label : methodLabel(it.payment)) + '</span></td>' +
        '<td>' + esc(it.type === 'dispute' ? it.reasonLabel : it.decline[1]) + '<span class="pn-sub">' + esc(it.description) + '</span></td>' +
        '<td class="is-num pn-money py-r py-r1">' + esc(money(it.amount)) + '</td><td class="py-r py-r2">' + issueChip(it) + (it.type === 'dispute' && issueState(it) === 'needs' ? '<span class="pn-sub">Respond by ' + esc(D.fmt.day(dayKey(it.respondBy))) + '</span>' : '') + '</td></tr>';
    }
    var head = '<thead><tr><th scope="col">Date</th><th scope="col">Payer</th><th scope="col">What happened</th><th scope="col" class="is-num">Amount</th><th scope="col">Status</th></tr></thead>';
    el.innerHTML =
      '<div class="pn-section__head"><h3 class="pn-h2">Disputes</h3><p class="pn-muted">A cardholder asked their bank to reverse a payment. The processor holds the amount until the club answers with evidence; each answer here rests on a real club policy.</p></div>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Disputes"><table class="pn-table py-stack"><caption class="sr-only">Disputed payments. Sample data.</caption>' + head + '<tbody>' + Dp.map(row).join('') + '</tbody></table></div>' +
      '<div class="pn-section__head py-gap"><h3 class="pn-h2">Failed payments</h3><p class="pn-muted">Declined attempts. Three renewals never went through, so those households are still renewal due in Members; the rest paid on a retry.</p></div>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Failed payments"><table class="pn-table py-stack"><caption class="sr-only">Failed payment attempts. Sample data.</caption>' + head + '<tbody>' + F.map(row).join('') + '</tbody></table></div>' +
      '<p class="pn-note">' + UI.icon('alert') + '<span>Failures and disputes are derived from the sample records for this demo; decline wording follows a Stripe-style panel. ' + UI.confirmSlot('Dispute fee and response window with the club\'s processor') + '</span></p>';
  }
  function openIssue(iid) {
    var it = issues().filter(function (x) { return x.id === iid; })[0]; if (!it) return;
    var st = issueState(it), body, foot;
    if (it.type === 'dispute') {
      var p = it.payment, pol = POLICY[it.policy] || '';
      var ev = [['Receipt ' + p.id + ', ' + stamp(p.at) + ', ' + methodLabel(p), true],
        [it.reason === 'product_not_received' ? 'The camp registration record, confirmed, with the week and option' : it.reason === 'credit_not_processed' ? 'The refund record: ' + money(r2(p.total - FEE)) + ' returned, ' + money(FEE) + ' administration fee kept' : 'The membership record and the household\'s sign-in history', true],
        ['The club\'s policy, as published: "' + (pol.length > 170 ? pol.slice(0, pol.lastIndexOf(' ', 170)) + ' ..."' : pol + '"'), true],
        ['A note that "Thornhill Park Tennis Club" is the name on statements', it.reason === 'fraudulent']];
      body = '<div class="py-sheet-status">' + issueChip(it) + '<span class="pn-sample">Sample data</span></div>' +
        '<dl class="pn-dl py-dl"><div><dt>Reason</dt><dd>' + esc(it.reasonLabel) + '<span class="pn-sub">' + esc(it.claim) + '</span></dd></div>' +
        '<div><dt>Payment</dt><dd><button type="button" class="pn-btn pn-btn--text pn-btn--sm" data-py-open="' + esc(p.id) + '">' + esc(p.id) + ', ' + esc(money(p.total)) + '</button><span class="pn-sub">' + esc(p.description) + '</span></dd></div>' +
        '<div><dt>Disputed</dt><dd class="pn-money">' + esc(money(it.amount)) + '</dd></div><div><dt>Opened</dt><dd>' + esc(stamp(it.at)) + '</dd></div>' +
        '<div><dt>Respond by</dt><dd>' + esc(D.fmt.long(it.respondBy)) + ' (sample)</dd></div></dl>' +
        '<fieldset class="py-reasons py-evidence"' + (st !== 'needs' ? ' disabled' : '') + '><legend class="pn-label">Evidence to send, gathered from the records</legend>' + ev.map(function (e, i) {
          return '<label class="pn-check"><input type="checkbox" data-py-ev' + (e[1] ? ' checked' : '') + '> ' + esc(e[0]) + '</label>';
        }).join('') + '</fieldset>';
      foot = st === 'needs' ? btn('Accept the dispute', 'data-py-accept', 'pn-btn--quiet', 'payments.refund') + btn('Send evidence', 'data-py-submit', 'pn-btn--ink', 'payments.refund')
        : '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button>';
    } else {
      body = '<div class="py-sheet-status">' + issueChip(it) + '<span class="pn-sample">Sample data</span></div><dl class="pn-dl py-dl">' +
        '<div><dt>Attempt</dt><dd>' + esc(stamp(it.at)) + ', ' + esc(it.card.label) + '</dd></div><div><dt>Declined</dt><dd>' + esc(it.decline[1]) + '<span class="pn-sub pn-num">' + esc(it.decline[0]) + '</span></dd></div>' +
        '<div><dt>For</dt><dd>' + esc(it.description) + '</dd></div><div><dt>Amount</dt><dd class="pn-money">' + esc(money(it.amount)) + (it.price ? '<span class="pn-sub">' + esc(money(it.price.subtotal)) + ' after the ' + esc(money(it.price.discount)) + ' returning discount, plus ' + esc(money(it.price.hst)) + ' HST</span>' : '') + '</dd></div>' +
        '<div><dt>Payer</dt><dd>' + personLink(it.personId) + '</dd></div></dl><p class="pn-note">' + UI.icon('alert') + '<span>' + esc(it.note) + '</span></p>';
      foot = it.paidBy ? '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button><button class="pn-btn pn-btn--ink" type="button" data-py-open="' + esc(it.paidBy.id) + '">Open the payment</button>'
        : '<a class="pn-btn pn-btn--quiet" href="' + esc(UI.link('members', 'person=' + it.personId)) + '">Open in Members</a>' + btn(st === 'link' ? 'Send the link again' : 'Send a payment link', 'data-py-link', 'pn-btn--ink', 'payments.record');
    }
    var el = UI.sheet.open({ kicker: it.type === 'dispute' ? 'Dispute' : 'Failed payment', title: money(it.amount) + ', ' + name(it.personId), body: body, foot: foot, wide: it.type === 'dispute' });
    $$('[data-py-open]', el).forEach(function (b) { b.addEventListener('click', function () { openPayment(b.getAttribute('data-py-open')); }); });
    var sub = $('[data-py-submit]', el), acc = $('[data-py-accept]', el), lk = $('[data-py-link]', el);
    if (sub) sub.addEventListener('click', function () {
      if (blocked(sub)) return;
      var n = $$('[data-py-ev]:checked', el).length;
      if (!n) { UI.toast('Choose at least one piece of evidence.', { kind: 'warn' }); return; }
      logIssue(it, 'submitted', 'Sent ' + n + ' pieces of evidence for the ' + it.reasonLabel.toLowerCase() + ' dispute on ' + it.payment.id + ' (demo: not sent)');
      UI.sheet.close(); UI.toast('Evidence marked as sent. In the demo nothing goes to the processor.');
    });
    if (acc) acc.addEventListener('click', function () {
      if (blocked(acc)) return;
      UI.confirm({ title: 'Accept this dispute?', body: '<p>The club gives up ' + esc(money(it.amount)) + ' to the cardholder. In the demo nothing moves.</p>', confirm: 'Accept dispute', cancel: 'Keep it open', danger: true })
        .then(function (y) { if (y) { logIssue(it, 'accepted', 'Accepted the dispute on ' + it.payment.id + ' (' + money(it.amount) + ')'); UI.sheet.close(); UI.toast('Dispute accepted in the demo. Nothing moved.'); } });
    });
    if (lk) lk.addEventListener('click', function () {
      if (blocked(lk)) return;
      var who = D.people.get(it.personId);
      logIssue(it, 'link', 'Sent a payment link for ' + it.description + ' (demo: not sent)');
      UI.sheet.close(); UI.toast('Payment link not sent: demo.' + (who && who.email ? ' It would go to ' + who.email + '.' : ''));
    });
  }

  /* ---------- Payouts ---------- */
  function renderPayouts(el) {
    var P = payouts(), shown = P.slice(0, state.payShown), transit = P.filter(function (x) { return !x.paid; });
    var last30 = P.filter(function (x) { return daysBetween(D.fmt.parse(x.day), TODAY) <= 30; });
    el.innerHTML =
      '<div class="pn-section__head"><h3 class="pn-h2">Payouts to the club\'s bank</h3><p class="pn-muted">The way a Stripe-backed panel groups money: each day\'s payments, less that day\'s refunds and the processor\'s fees, paid out two business days later. Weekends and bank holidays do not count' + (D.fmt.iso(TODAY) === '2026-10-12' ? ': today is Thanksgiving Monday, so nothing lands until Tuesday.' : '.') + '</p></div>' +
      '<div class="pn-kpis py-kpis-sm">' +
        '<div class="pn-kpi"><p class="pn-kpi__label">In transit</p><p class="pn-kpi__value pn-money">' + esc(money(sum(transit, 'net'))) + '</p><p class="pn-kpi__note">' + transit.length + (transit.length === 1 ? ' payout' : ' payouts') + ' on the way</p></div>' +
        '<div class="pn-kpi"><p class="pn-kpi__label">Paid out, last 30 days</p><p class="pn-kpi__value pn-money">' + esc(money(sum(last30.filter(function (x) { return x.paid; }), 'net'))) + '</p><p class="pn-kpi__note">After ' + esc(money(sum(last30, 'fees'))) + ' in fees</p></div>' +
        '<div class="pn-kpi"><p class="pn-kpi__label">Bank account</p><p class="pn-kpi__value py-kpi-text">Club account</p><p class="pn-kpi__note">Connected in the processor, never here</p></div>' +
      '</div>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="Payouts"><table class="pn-table py-stack"><caption class="sr-only">Payouts, newest first. Sample data; fees illustrative.</caption><thead><tr>' +
        '<th scope="col">Arrives</th><th scope="col">Payments from</th><th scope="col" class="is-num">Gross</th><th scope="col" class="is-num">Refunds</th><th scope="col" class="is-num">Fees</th><th scope="col" class="is-num">Net</th><th scope="col">Status</th></tr></thead><tbody>' +
      shown.map(function (x) {
        return '<tr><td class="is-tight pn-nowrap">' + esc(D.fmt.day(dayKey(x.arrives))) + '</td><td><button class="pn-rowlink" type="button" data-py-payout="' + x.day + '">' + esc(D.fmt.day(x.day)) + '</button><span class="pn-sub">' + x.pays.length + (x.pays.length === 1 ? ' payment' : ' payments') + (x.refunds.length ? ', ' + x.refunds.length + ' refunded' : '') + '</span></td>' +
          '<td class="is-num pn-money py-b" data-label="Gross">' + esc(money(x.gross)) + '</td><td class="is-num pn-money py-b" data-label="Refunds">' + (x.refunded ? esc(money(-x.refunded)) : '<span class="pn-muted">None</span>') + '</td>' +
          '<td class="is-num pn-money py-b" data-label="Fees">' + esc(money(-x.fees)) + '</td><td class="is-num pn-money py-r py-r1" data-label="Net"><strong>' + esc(money(x.net)) + '</strong></td>' +
          '<td class="py-r py-r2">' + (x.paid ? (x.net < 0 ? UI.chip('ended', 'Debited') : UI.chip('succeeded', 'Paid out')) : UI.chip('pending', 'In transit')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (P.length > shown.length ? '<div class="py-more"><button type="button" class="pn-btn pn-btn--quiet" data-py-paymore>Show 14 more days</button><span class="pn-muted">' + shown.length + ' of ' + P.length + ' payouts</span></div>' : '') +
      '<p class="pn-note">' + UI.icon('alert') + '<span>Fees use an illustrative card rate of 2.9% plus 30 cents a payment. The club\'s processor, its rates for Interac, Visa and Mastercard and its payout schedule are not chosen yet. ' + UI.confirmSlot('Processor, rates and payout schedule') + '</span></p>';
  }
  function openPayout(day) {
    var x = payouts().filter(function (y) { return y.day === day; })[0]; if (!x) return;
    var body = '<div class="py-sheet-status">' + (x.paid ? UI.chip('succeeded', 'Paid out') : UI.chip('pending', 'In transit')) + '<span class="pn-sample">Sample data</span></div>' +
      '<div class="py-sum"><p><span>' + x.pays.length + ' payments</span><span class="pn-money">' + esc(money(x.gross)) + '</span></p><p><span>Refunds</span><span class="pn-money">' + esc(money(-x.refunded)) + '</span></p>' +
      '<p><span>Fees (illustrative)</span><span class="pn-money">' + esc(money(-x.fees)) + '</span></p><p class="py-sum__total"><span>To the club\'s bank, ' + esc(D.fmt.day(dayKey(x.arrives))) + '</span><span class="pn-money">' + esc(money(x.net)) + '</span></p></div>' +
      '<h3 class="pn-h3">Payments in it</h3><ul class="py-list">' + x.pays.slice(0, 40).map(function (p) {
        return '<li><button type="button" class="pn-btn pn-btn--text pn-btn--sm" data-py-open="' + esc(p.id) + '">' + esc(name(p.personId)) + ', ' + esc(money(p.total)) + '</button><span class="pn-sub">' + esc(KIND[p.kind]) + ', ' + esc(methodLabel(p)) + '</span></li>';
      }).join('') + '</ul>' + (x.pays.length > 40 ? '<p class="pn-muted">And ' + (x.pays.length - 40) + ' more in the Ledger.</p>' : '');
    var el = UI.sheet.open({ kicker: 'Payout', title: money(x.net) + ' from ' + D.fmt.day(x.day), body: body, foot: '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button>' });
    $$('[data-py-open]', el).forEach(function (b) { b.addEventListener('click', function () { openPayment(b.getAttribute('data-py-open')); }); });
  }

  /* ---------- HST by treatment ---------- */
  function netHst(p) { return p.total ? r2(p.hst * (1 - refundedOf(p) / p.total)) : 0; }
  function bandBar() {
    var a = 360, z = 1440, w = function (s, e) { return ((e - s) / (z - a) * 100).toFixed(2) + '%'; }, l = function (s) { return ((s - a) / (z - a) * 100).toFixed(2) + '%'; };
    var B = {}; D.feeBands.forEach(function (b) { B[b.id] = b; });
    function seg(s, e, id) { return '<span class="py-band py-band--' + id + '" style="left:' + l(s) + ';width:' + w(s, e) + '"><span>' + money(B[id].fee) + '</span></span>'; }
    return '<div class="py-bands" role="img" aria-label="Court fee bands: weekdays ' + esc(money(B.regular.fee)) + ' an hour from 6:30am to 6:30pm, holding ' + esc(money(D.hstIn(B.regular.fee))) + ' HST, and ' + esc(money(B.prime.fee)) + ' from 6:30pm to 11:30pm, holding ' + esc(money(D.hstIn(B.prime.fee))) + '; weekends ' + esc(money(B.weekend.fee)) + ' from 7am to 11pm.">' +
      '<div class="py-bands__row"><span class="py-bands__k">Weekdays</span><span class="py-bands__track">' + seg(390, 1110, 'regular') + seg(1110, 1410, 'prime') + '</span></div>' +
      '<div class="py-bands__row"><span class="py-bands__k">Weekends</span><span class="py-bands__track">' + seg(420, 1380, 'weekend') + '</span></div>' +
      '<div class="py-bands__row py-bands__axis" aria-hidden="true"><span class="py-bands__k"></span><span class="py-bands__track"><span style="left:0">6am</span><span style="left:' + l(720) + '">Noon</span><span style="left:' + l(1080) + '">6pm</span><span style="left:100%">Midnight</span></span></div>' +
      '<p class="pn-help">' + esc(money(B.regular.fee)) + ' holds ' + esc(money(D.hstIn(B.regular.fee))) + ' HST; ' + esc(money(B.prime.fee)) + ' holds ' + esc(money(D.hstIn(B.prime.fee))) + '. Non-members and guests add ' + esc(money(D.playerFee)) + ' a player.</p></div>';
  }
  function renderHst(el) {
    var V = visible().filter(function (p) { return state.hstSeason === 'all' || p.season === state.hstSeason; });
    var add = V.filter(function (p) { return p.hstIncluded === false; }), inc = V.filter(function (p) { return p.hstIncluded === true; }), ns = V.filter(function (p) { return p.hstIncluded === null; });
    var ex = D.membershipPrice('adult', { resident: true, returning: true });
    function card(title, list, words, rule) {
      return '<div class="pn-card py-hstcard"><p class="pn-kicker">' + esc(rule) + '</p><h3 class="pn-h3">' + esc(title) + '</h3>' +
        '<p class="pn-kpi__value pn-money">' + (list === ns ? 'Not stated' : esc(money(sum(list, netHst)))) + '</p>' +
        '<p class="pn-muted">' + list.length + ' payments, ' + esc(money(sum(list, function (p) { return p.total - refundedOf(p); }))) + ' kept after refunds.</p><p class="pn-help">' + words + '</p></div>';
    }
    var months = {};
    V.forEach(function (p) { var d = at(p), k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); var m = months[k] || (months[k] = { add: 0, inc: 0, ns: 0, n: 0 }); m.n++;
      if (p.hstIncluded === false) m.add += netHst(p); else if (p.hstIncluded === true) m.inc += netHst(p); else m.ns += p.total - refundedOf(p); });
    var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    el.innerHTML =
      '<div class="pn-toolbar">' + seg('Season', 'hstSeason', [['all', 'All'], ['indoor-2026', 'Fall & Winter 2026/27'], ['outdoor-2026', 'Spring & Summer 2026'], ['camps-summer-2026', 'Summer Camps 2026']]) +
        '<p class="pn-toolbar__count" aria-live="polite">' + V.length + ' payments</p></div>' +
      '<div class="pn-grid pn-grid--3 py-hstgrid">' +
        card('Added on top', add, 'Memberships and private lessons are priced before tax: "Add HST to fees listed above"; "$100+HST per hour". An adult resident renewing pays ' + esc(money(ex.base)) + ' less the ' + esc(money(ex.discount)) + ' returning discount, ' + esc(money(ex.subtotal)) + ', plus ' + esc(money(ex.hst)) + ' HST: ' + esc(money(ex.total)) + '.', '13% added') +
        card('Inside the price', inc, '"HST is included in these fees." The court fee is the price; the HST is 13/113 of it.', 'Included') +
        card('Camps', ns, 'The camp page does not say whether its prices include HST, so the panel neither adds nor splits it. ' + UI.confirmSlot('Whether camp prices include HST'), 'Not stated') +
      '</div>' +
      '<div class="pn-section__head py-gap"><h3 class="pn-h2">Court fees by the hour</h3><p class="pn-muted">The club\'s three fee bands for the indoor season, HST included.</p></div>' + bandBar() +
      '<div class="pn-section__head py-gap"><h3 class="pn-h2">HST by month</h3><p class="pn-muted">Net of refunds, by the month the payment was taken. For the club\'s accountant; filing is outside this panel.</p></div>' +
      '<div class="pn-table-wrap" tabindex="0" role="region" aria-label="HST by month"><table class="pn-table"><caption class="sr-only">HST by month. Sample data.</caption><thead><tr><th scope="col">Month</th><th scope="col" class="is-num">Payments</th><th scope="col" class="is-num">HST added</th><th scope="col" class="is-num">HST included</th><th scope="col" class="is-num">HST total</th><th scope="col" class="is-num">Camps, HST not stated</th></tr></thead><tbody>' +
      monthKeys(months).map(function (k) {
        var m = months[k] || { add: 0, inc: 0, ns: 0, n: 0 };
        return '<tr><td>' + MN[+k.slice(5) - 1] + ' ' + k.slice(0, 4) + '</td><td class="is-num pn-num">' + m.n + '</td><td class="is-num pn-money">' + esc(money(r2(m.add))) + '</td><td class="is-num pn-money">' + esc(money(r2(m.inc))) + '</td>' +
          '<td class="is-num pn-money"><strong>' + esc(money(r2(m.add + m.inc))) + '</strong></td><td class="is-num pn-money">' + (m.ns ? esc(money(r2(m.ns))) : '<span class="pn-muted">None</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function monthKeys(months) {
    var ks = Object.keys(months).sort(); if (!ks.length) return ks;
    var out = [], y = +ks[0].slice(0, 4), m = +ks[0].slice(5), last = ks[ks.length - 1];
    for (var guard = 0; guard < 120; guard++) { var k = y + '-' + ('0' + m).slice(-2); out.push(k); if (k >= last) break; m++; if (m > 12) { m = 1; y++; } }
    return out.reverse();
  }

  /* ---------- Header actions ---------- */
  function recordPayment(btnEl) {
    if (!canAct('payments.record')) { UI.toast(who('payments.record') + ' only. You are signed in as ' + D.roleName() + '.', { kind: 'warn' }); return; }
    var s = settleItems();
    if (!s.due.length) { UI.toast('No balances to settle. Members pay online when they book; memberships and camps are paid at registration.'); return; }
    var body = '<p class="pn-muted">Payments are recorded against something owed: a played court hour, a no-show or a late cancel. Choose one.</p><ul class="py-list">' + s.due.map(function (x) {
      return '<li><button type="button" class="pn-btn pn-btn--text pn-btn--sm" data-py-settle="' + esc(x.b.id) + '">' + esc(bookingWho(x.b)) + ', ' + esc(money(x.b.total)) + '</button><span class="pn-sub">' + esc(D.courts[x.b.court - 1].name + ', ' + D.fmt.day(x.b.date) + ', ' + D.fmt.range(x.b.start, x.b.hours || 1)) + '. ' + esc(x.why) + '</span></li>';
    }).join('') + '</ul>';
    var el = UI.sheet.open({ kicker: 'Record a payment', title: s.due.length + (s.due.length === 1 ? ' balance' : ' balances') + ' to settle', body: body, foot: '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Close</button>' });
    $$('[data-py-settle]', el).forEach(function (b) { b.addEventListener('click', function () { openSettle(b.getAttribute('data-py-settle')); }); });
  }
  function exportCsv() {
    var rows = ledgerRows(), q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [['payment_id', 'paid_at', 'payer', 'kind', 'season', 'description', 'method', 'subtotal', 'hst', 'hst_treatment', 'total', 'refunded', 'status', 'currency', 'sample'].join(',')];
    rows.forEach(function (p) { lines.push([p.id, p.at, name(p.personId), p.kind, p.season, p.description, methodLabel(p), p.hstIncluded === null ? '' : p.subtotal, p.hstIncluded === null ? '' : p.hst, treatment(p), p.total, refundedOf(p), statusOf(p), 'CAD', 'yes'].map(q).join(',')); });
    try {
      var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'tptc-payments-sample-' + D.fmt.iso(TODAY) + '.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      UI.toast(rows.length.toLocaleString('en-CA') + ' payments saved as a CSV on this computer. Sample data, marked as such in every row.');
    } catch (e) { UI.toast('This browser could not save the file.', { kind: 'warn' }); }
  }

  /* ---------- Events: one delegated listener for the workspace ---------- */
  function wire() {
    var work = $('.py-work');
    work.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-py-open')) openPayment(t.getAttribute('data-py-open'));
      else if (t.hasAttribute('data-py-issue')) openIssue(t.getAttribute('data-py-issue'));
      else if (t.hasAttribute('data-py-payout')) openPayout(t.getAttribute('data-py-payout'));
      else if (t.hasAttribute('data-py-settle')) { if (!blocked(t)) openSettle(t.getAttribute('data-py-settle')); }
      else if (t.hasAttribute('data-py-seg')) { state[t.getAttribute('data-py-seg')] = t.getAttribute('data-v'); state.shown = 50; renderPanel(state.tab); var nb = $('[data-py-seg="' + t.getAttribute('data-py-seg') + '"][data-v="' + t.getAttribute('data-v') + '"]'); if (nb) nb.focus(); }
      else if (t.hasAttribute('data-py-sort')) { var k = t.getAttribute('data-py-sort'); state.dir = state.sort === k ? -state.dir : (k === 'payer' ? 1 : -1); state.sort = k; renderPanel('ledger'); var sb = $('[data-py-sort="' + k + '"]'); if (sb) sb.focus(); }
      else if (t.hasAttribute('data-py-more')) { var n = state.shown; state.shown += 50; renderPanel('ledger'); var rl = $$('.py-ledger tbody .pn-rowlink')[n]; if (rl) rl.focus(); }
      else if (t.hasAttribute('data-py-paymore')) { var m = state.payShown; state.payShown += 14; renderPanel('payouts'); var pl = $$('[data-py-payout]')[m]; if (pl) pl.focus(); }
      else if (t.hasAttribute('data-py-clear-person')) { state.person = null; renderPanel('ledger'); $('[data-py-q]').focus(); }
      else if (t.hasAttribute('data-py-reset-filters')) { state.q = ''; state.kind = 'all'; state.season = 'all'; state.status = 'all'; state.person = null; renderPanel('ledger'); $('[data-py-q]').focus(); }
    });
    var deb = null;
    work.addEventListener('input', function (e) {
      if (!e.target.matches('[data-py-q]')) return;
      clearTimeout(deb); deb = setTimeout(function () { state.q = e.target.value; state.shown = 50; renderPanel('ledger'); }, 160);
    });
    work.addEventListener('change', function (e) { if (e.target.matches('[data-py-season]')) { state.season = e.target.value; state.shown = 50; renderPanel('ledger'); var s = $('[data-py-season]'); if (s) s.focus(); } });
    var rec = $('[data-py-record]');
    if (!canAct('payments.record')) { rec.setAttribute('aria-disabled', 'true'); rec.title = who('payments.record') + ' only'; rec.insertAdjacentHTML('beforeend', '<span class="sr-only"> (' + esc(who('payments.record')) + ' only)</span>'); }
    rec.addEventListener('click', function () { recordPayment(rec); });
    $('[data-py-export]').addEventListener('click', exportCsv);
    window.addEventListener('panel:change', function (e) {
      if (e.detail && e.detail.collection === '*') ISSUES = null;
      renderKpis(); renderPanel(state.tab);
    });
  }

  /* ---------- Start: ?pay=, ?tab=, ?person= (or household=) ---------- */
  function init() {
    var qs = {}; location.search.replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var x = kv.split('='); qs[decodeURIComponent(x[0])] = decodeURIComponent(x[1] || ''); });
    if (qs.person || qs.household) state.person = qs.person || qs.household;
    var tab = qs.tab || (qs.pay || state.person ? 'ledger' : store('tab')) || 'ledger';
    wireTabs(); wire(); renderKpis(); selectTab(tab);
    if (qs.pay) openPayment(qs.pay);
  }
  init();
})();
