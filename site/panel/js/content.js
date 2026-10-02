/* Content module (panel/content/): the club's news posts, the Home page's "What's happening"
   cards and the two seasons' dates, each edited beside a live preview drawn with the public
   site's own markup (.hnext/.hrow, .hlead, the season ledger) and its own CSS.
   Edits go through PanelData (localStorage overlay); nothing leaves the browser and the public
   site is not changed. Administrator edits; Front desk and Head Pro read and preview.
   The story it tells: the site's words follow the club year. The ledger is drawn at true
   day-proportion, and the lead card knows when its session has ended. */
(function () {
  'use strict';
  var D = window.PanelData, UI = window.PanelUI;
  if (!D || !UI) return;
  var C = D.content || {}, esc = UI.esc, icon = UI.icon;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var CAN = UI.can('content.edit');
  var WHO = UI.whoCan ? UI.whoCan('content.edit') : 'Administrator';
  var SITE = '../../';                 /* the public site from panel/content/ */
  var ASSETS = '../../../assets/';
  var TODAY = D.today();
  var TODAY_ISO = D.fmt.iso(TODAY);
  var YEAR0 = '2026-05-01', YEAR1 = '2027-05-01';   /* the club year the ledger draws, May 1 to April 30 */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* The public site's pages a post or card may point to */
  var PAGES = [
    ['', 'No link'], ['membership/', 'Membership'], ['court-bookings/', 'Court Bookings'], ['programs/', 'Programs'],
    ['programs/junior/', 'Junior Recreational'], ['programs/adult/', 'Adult Programs'], ['programs/high-performance/', 'High Performance'],
    ['programs/private-lessons/', 'Private Lessons'], ['programs/camps/', 'Camps'], ['programs/camps/summer/', 'Summer Camps'],
    ['programs/camps/march-break/', 'March Break Camps'], ['programs/camps/holiday/', 'Holiday Camps'],
    ['leagues-events/', 'Leagues & Events'], ['register/', 'Register'], ['contact/', 'Contact']
  ];
  var LIMITS = { title: 120, body: 320, headline: 70, text: 180, linkLabel: 32, when: 60, confirmWhat: 60 };

  /* ---------- The club's version of every item ----------
     Rebuilt from js/facts.js exactly as data.js builds the records, plus the words the demo Home
     page sets for each card (site/index.html, section 5). Restoring an item writes these back. */
  var BASE = {}, ORDER = [], RAW = {};
  /* The club's excerpts lost their paragraph breaks in the crawl ("10 AM!We are", "Centre
     ClubThis outdoor"). Put the space back; the words stay the club's. */
  function tidy(t) { return String(t || '').replace(/([!?.])([A-Z])/g, '$1 $2').replace(/([a-z])([A-Z][a-z])/g, '$1. $2'); }
  (C.news || []).forEach(function (n, i) {
    var id = 'news-' + (i + 1);
    RAW[id] = n.excerpt || '';
    BASE[id] = { id: id, type: 'news', title: n.title, body: tidy(n.excerpt), status: 'published', listingDate: n.listing_date, updatedAt: n.modified, note: n.status, source: n.source };
  });
  (C.whats_happening || []).forEach(function (c, i) {
    var id = 'card-' + (i + 1);
    BASE[id] = { id: id, type: 'card', title: c.card, body: c.fact || '', gap: c.gap || null, status: c.fact ? 'published' : 'draft', note: c.status || null, updatedAt: '2026-09-30', source: c.source || null };
  });
  (D.seasons || []).forEach(function (s) {
    var id = 'season-' + s.id;
    BASE[id] = { id: id, type: 'season', title: s.name, start: s.start, end: s.end, startToConfirm: !!s.start_to_confirm, approx: !!s.approx, body: s.source, status: 'published', updatedAt: '2026-09-30', source: s.src };
  });
  ORDER = Object.keys(BASE);

  var NEWS_LINKS = {
    'news-1': ['programs/', 'See the programs'], 'news-2': ['membership/', 'Become a member'], 'news-3': ['programs/', 'See the programs'],
    'news-4': ['programs/', 'See the programs'], 'news-5': ['programs/camps/summer/', 'See Summer Camps'], 'news-6': ['leagues-events/', 'See Leagues & Events']
  };
  var CARD_WORDS = {
    'card-2': { placement: 'lead', order: 1, headline: 'High Performance, Fall Outdoor', text: 'The outdoor session for Little Champs, Transition Tour and Pro National players.',
      whenMode: 'dates', when: 'Aug 24 to Oct 8, 2026', liveStart: '2026-08-24', liveEnd: '2026-10-08', confirmWhat: '', linkLabel: 'See the pathway', link: 'programs/high-performance/', shown: true },
    'card-3': { placement: 'row', order: 2, headline: 'Indoor membership', text: 'Fall & Winter Indoor 2026/27. Registration opened August 1, 2026.',
      whenMode: 'dates', when: 'Early October 2026 to April 25, 2027', liveStart: '', liveEnd: '', confirmWhat: '', linkLabel: 'Become a member', link: 'membership/', shown: true },
    'card-1': { placement: 'row', order: 3, headline: 'Indoor programs', text: 'Group lessons move under the dome for the fall and winter.',
      whenMode: 'confirm', when: '', liveStart: '', liveEnd: '', confirmWhat: 'Session dates and registration opening', linkLabel: 'Junior Recreational', link: 'programs/junior/', shown: true },
    'card-4': { placement: 'row', order: 4, headline: 'Holiday Camp', text: 'Over the winter break. Last season it ran Dec 22, 2025 to Jan 2, 2026.',
      whenMode: 'confirm', when: '', liveStart: '', liveEnd: '', confirmWhat: 'Holiday Camp dates', linkLabel: 'See Holiday Camps', link: 'programs/camps/holiday/', shown: true }
  };
  var KEYS = {
    news: ['title', 'body', 'posted', 'status', 'link', 'linkLabel'],
    card: ['headline', 'text', 'placement', 'order', 'whenMode', 'when', 'confirmWhat', 'liveStart', 'liveEnd', 'linkLabel', 'link', 'shown'],
    season: ['title', 'start', 'end', 'approx', 'startToConfirm']
  };
  function defaults(id) {
    var b = BASE[id]; if (!b) return null;
    var o = Object.assign({}, b);
    if (b.type === 'news') { var l = NEWS_LINKS[id] || ['', '']; o.posted = String(b.updatedAt || '').slice(0, 10); o.link = l[0]; o.linkLabel = l[1]; }
    if (b.type === 'card') Object.assign(o, CARD_WORDS[id] || {});
    return o;
  }
  /* The record as the editor sees it: the club's words under whatever this browser changed */
  function eff(rec) {
    if (!rec) return null;
    var e = Object.assign({}, defaults(rec.id) || {}, rec);
    if (RAW[e.id] !== undefined && e.body === RAW[e.id]) e.body = BASE[e.id].body;
    return e;
  }
  function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b); }
  function isEdited(id) {
    var cur = D.contentItems.get(id), def = defaults(id);
    if (!def) return !!cur;            /* written in this demo */
    if (!cur) return true;             /* removed in this demo */
    var e = eff(cur);
    return KEYS[def.type].some(function (k) { return !same(e[k], def[k]); });
  }
  function items(type) { return D.contentItems.list({ type: type }).map(eff); }
  function removedBase(type) { return ORDER.filter(function (id) { return BASE[id].type === type && !D.contentItems.get(id); }); }

  /* ---------- Dates and words ---------- */
  function parse(iso) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function md(iso, year) { var d = parse(iso); return d ? MON[d.getMonth()] + ' ' + d.getDate() + (year ? ', ' + d.getFullYear() : '') : ''; }
  function days(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function addDay(iso, n) { var d = parse(iso); d.setDate(d.getDate() + n); return D.fmt.iso(d); }
  /* Figures in the site's lining numerals, as the site sets them (.num) */
  function numify(s) {
    return esc(s).replace(/(&#?\w+;)|(\d[\d,.:/]*\d|\d)/g, function (m, ent, n) { return ent || '<span class="num">' + n + '</span>'; });
  }
  function live(start, end) {
    if (!start || !end) return null;
    if (TODAY_ISO < start) return { state: 'upcoming', label: 'Starts ' + md(start) };
    if (TODAY_ISO > end) return { state: 'finished', label: 'Ended ' + md(end) };
    return { state: 'running', label: 'Running now' };
  }
  function clockWords() { return D.clock && D.clock.shifted ? D.fmt.day(TODAY) + ' (demo clock)' : D.fmt.day(TODAY); }
  function pageName(href) { for (var i = 0; i < PAGES.length; i++) if (PAGES[i][0] === href) return PAGES[i][1]; return href; }
  function quoteTitle(s) { s = String(s || 'Untitled'); return '“' + (s.length > 60 ? s.slice(0, 57) + '...' : s) + '”'; }
  function itemName(rec) { return rec.type === 'card' ? (rec.headline || rec.title) : rec.title || 'Untitled post'; }

  /* ---------- The site's own markup (site/index.html section 5, build.py ledger()) ---------- */
  function linkHtml(href, label) {
    if (!href || !label) return '';
    return '<a class="link" href="' + esc(SITE + href) + '"><span class="link__text">' + esc(label) + '</span>' + icon('arrow') + '</a>';
  }
  function confirmHtml(what, tight) {
    return tight ? '<span class="confirm confirm--tight"><span class="confirm__tag">To confirm</span><span class="confirm__what">' + esc(what) + '</span></span>' : UI.confirmSlot(what || 'Dates');
  }
  function whenHtml(r) {
    if (r.whenMode === 'confirm') return '<p class="hrow__when">' + confirmHtml(r.confirmWhat) + '</p>';
    return '<p class="hrow__when num">' + esc(r.when) + '</p>';
  }
  function hrowHtml(r, mark, when) {
    var hidden = r.shown === false || r.status === 'draft' && r.type === 'news';
    return '<li class="hrow' + (mark ? ' ct-mark' : '') + (hidden ? ' is-hidden-card' : '') + '">' +
      (hidden ? '<span class="ct-hiddentag">' + (r.type === 'news' ? 'Draft, not on the site' : 'Hidden from Home') + '</span>' : '') +
      (when != null ? '<p class="hrow__when num">' + esc(when) + '</p>' : whenHtml(r)) +
      '<h3 class="hrow__title">' + (esc(r.type === 'news' ? r.title : r.headline) || '&nbsp;') + '</h3>' +
      (r.type === 'news' ? (r.body ? '<p class="hcard__text">' + numify(r.body) + '</p>' : '') : (r.text ? '<p class="hcard__text">' + numify(r.text) + '</p>' : '')) +
      linkHtml(r.link, r.linkLabel) + '</li>';
  }
  /* The placeholder court: a doubles court at true 23.77 x 10.97 m, as the site draws it */
  var COURT = '<svg class="ph__court" viewBox="-2.971 -4.419 29.712 19.808" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><rect class="cl-surface" x="0" y="0" width="23.770" height="10.970"/><line class="cl-y" x1="0" y1="0" x2="0" y2="10.970"/><line class="cl-y" x1="23.770" y1="0" x2="23.770" y2="10.970"/><line class="cl-x" x1="0" y1="0" x2="23.770" y2="0"/><line class="cl-x" x1="0" y1="10.970" x2="23.770" y2="10.970"/><line class="cl-x" x1="0" y1="1.370" x2="23.770" y2="1.370"/><line class="cl-x" x1="0" y1="9.600" x2="23.770" y2="9.600"/><line class="cl-y" x1="5.485" y1="1.370" x2="5.485" y2="9.600"/><line class="cl-y" x1="18.285" y1="1.370" x2="18.285" y2="9.600"/><line class="cl-x" x1="5.485" y1="5.485" x2="18.285" y2="5.485"/><line class="cl-x" x1="0" y1="5.485" x2="0.100" y2="5.485"/><line class="cl-x" x1="23.670" y1="5.485" x2="23.770" y2="5.485"/><line class="cl-y net" x1="11.885" y1="-0.914" x2="11.885" y2="11.884"/><rect class="cl-p" x="11.785" y="-1.014" width="0.2" height="0.2"/><rect class="cl-p" x="11.785" y="11.784" width="0.2" height="0.2"/></svg>';
  var imgOk = false;   /* once the photo has loaded, later previews draw it at once (no fade per keystroke) */
  function frameHtml() {
    return '<figure class="frame ' + (imgOk ? 'has-img' : 'frame--due') + '" data-slot="hp-little-champs-01" style="--ar:3 / 2;--pos:50% 96%;"><div class="frame__box"><div class="frame__inner"><div class="frame__media"><div class="frame__drift">' + COURT +
      '<img class="frame__img' + (imgOk ? ' is-loaded' : '') + '" src="' + ASSETS + 'img/hp-little-champs-01.jpg" srcset="' + SITE + 'img/hp-little-champs-01-640.webp 640w, ' + ASSETS + 'img/hp-little-champs-01.jpg 1200w" sizes="660px" alt="A young boy hitting a tennis ball with a racquet." decoding="async" data-ct-img></div>' +
      '<div class="ph"><p class="ph__label"><span class="ph__kicker">Placeholder</span><span class="ph__id">hp-little-champs-01</span><span class="ph__desc">An eight-year-old in a split-step, eyes locked on the ball, fierce focus.</span></p><span class="ph__ratio" aria-hidden="true">3:2</span></div></div></div></div>' +
      '<span class="frame__tag"><svg class="frame__tag-mark" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M0.5 0.5h9v9h-9zM5 0.5v9"/></svg>Placeholder image</span></figure>';
  }
  function hleadHtml(r, mark) {
    var lv = live(r.liveStart, r.liveEnd), chip = '';
    if (lv) chip = lv.state === 'running' ? '<span class="chip chip--live"><span class="live-dot" aria-hidden="true"></span><span>Running now</span></span>' : '<span class="chip"><span>' + esc(lv.label) + '</span></span>';
    return '<article class="hlead' + (mark ? ' ct-mark' : '') + '">' + frameHtml() + '<div class="hlead__body">' + chip +
      '<h3 class="hlead__title">' + (esc(r.headline) || '&nbsp;') + '</h3>' + (r.text ? '<p class="hcard__text">' + numify(r.text) + '</p>' : '') +
      (r.whenMode === 'confirm' ? '<p class="hcard__date">' + confirmHtml(r.confirmWhat) + '</p>' : '<p class="hcard__date num">' + esc(r.when) + '</p>') +
      linkHtml(r.link, r.linkLabel) + '</div></article>';
  }

  /* The season ledger: the club year at true day-proportion, the dome over the indoor months */
  var HP_FALL = (function () {
    var m = /Fall Outdoor Session Dates: Starting (\w+) (\d+) until (\w+) (\d+), (20\d\d)/.exec(JSON.stringify(C.programs || ''));
    if (!m) return null;
    var mi = function (n) { return ('0' + (MON.indexOf(n.slice(0, 3)) + 1)).slice(-2); };
    return { start: m[5] + '-' + mi(m[1]) + '-' + ('0' + m[2]).slice(-2), end: m[5] + '-' + mi(m[3]) + '-' + ('0' + m[4]).slice(-2) };
  })();
  var TEMP = (/([\d.]+) celsius/.exec((C.club && C.club.dome_temp) || '') || [0, '19.5'])[1];
  function phase(iso) { var d = parse(iso); return (d.getDate() <= 10 ? 'Early ' : d.getDate() <= 20 ? 'Mid ' : 'Late ') + MONTHS[d.getMonth()]; }
  function ledgerHtml(out, ind) {
    var span = days(YEAR0, YEAR1);
    function pct(iso, end) { return Math.round(100000 * (days(YEAR0, iso) + (end ? 1 : 0)) / span) / 1000; }
    var chL = pct(out.end, true), chR = pct(ind.start), dL = pct(ind.start), dR = pct(ind.end, true);
    var tx = Math.max(0, Math.min(100, pct(TODAY_ISO))), inYear = TODAY_ISO >= YEAR0 && TODAY_ISO < YEAR1;
    var cols = [], lis = [], d = parse(YEAR0);
    for (var i = 0; i < 12; i++) {
      var nx = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      cols.push(Math.round((nx - d) / 864e5) + 'fr');
      lis.push('<li><span class="ledger__m-long">' + MON[d.getMonth()] + '</span><span class="ledger__m-short">' + MONTHS[d.getMonth()][0] + '</span></li>');
      d = nx;
    }
    var sess = '', sessLegend = '';
    if (HP_FALL) {
      sess = '<span class="ledger__session" style="--l:' + pct(HP_FALL.start) + '%;--w:' + Math.round(1000 * (pct(HP_FALL.end, true) - pct(HP_FALL.start))) / 1000 + '%"><span class="ledger__session-label">High Performance, ' + md(HP_FALL.start) + ' to ' + md(HP_FALL.end) + '</span></span>';
      sessLegend = '<p class="ledger__seg ledger__seg--session"><span class="ledger__name">High Performance fall outdoor session</span> <span class="ledger__dates num">' + md(HP_FALL.start) + ' to ' + md(HP_FALL.end, true) + '</span></p>';
    }
    var change = phase(addDay(out.end, 1)) + ', the dome goes up. ' + (ind.startToConfirm
      ? 'Likely <span class="num">' + md(ind.start) + '</span>' + confirmHtml('indoor start date', true)
      : 'Indoor from <span class="num">' + md(ind.start) + '</span>');
    return '<figure class="ledger ledger--full" role="group">' +
      '<div class="ledger__sky" aria-hidden="true">' +
      '<span class="ledger__change" style="--l:' + chL + '%;--w:' + Math.round(1000 * (chR - chL)) / 1000 + '%"></span>' +
      '<span class="ledger__dome" style="--l:' + dL + '%;--w:' + Math.round(1000 * (dR - dL)) / 1000 + '%"><span class="ledger__inflate"><svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false"><path d="M0 100C0 22 16 0 50 0S100 22 100 100" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/></svg></span></span>' +
      sess + (inYear ? '<span class="ledger__today' + (tx > 60 ? ' is-late' : '') + '" style="--x:' + tx + '%"><span class="ledger__today-label"><span class="ledger__today-dot"></span>Today, <span>' + md(TODAY_ISO) + '</span></span></span>' : '') +
      '</div><ol class="ledger__months" aria-hidden="true" style="grid-template-columns:' + cols.join(' ') + '">' + lis.join('') + '</ol>' +
      '<div class="ledger__legend">' +
      '<p class="ledger__seg ledger__seg--out"><span class="ledger__name">Outdoor</span> <span class="ledger__dates num">' + (out.approx ? 'About ' : '') + md(out.start) + ' to ' + md(out.end) + '</span></p>' +
      '<p class="ledger__seg ledger__seg--change"><span class="ledger__name">Changeover</span> <span class="ledger__dates">' + change + '</span></p>' +
      '<p class="ledger__seg ledger__seg--in"><span class="ledger__name">Under the dome</span> <span class="ledger__dates num">To ' + md(ind.end, true) + ', kept at ' + esc(TEMP) + '&deg;C</span></p>' +
      sessLegend + '</div></figure>';
  }

  /* ---------- State ---------- */
  var VIEW_KEY = 'tptc-panel-content-view';
  function pref(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* private window: no memory */ } return null; }
  var TABS = { news: 'ct-tab-news', card: 'ct-tab-cards', season: 'ct-tab-seasons' };
  var TAB_OF = { news: 'news', cards: 'card', card: 'card', seasons: 'season', season: 'season' };
  var narrow = window.matchMedia ? window.matchMedia('(max-width: 759.98px)') : { matches: false };
  var state = { tab: 'news', sel: {}, draft: null, dirty: false, errors: {}, busy: false,
    view: pref(VIEW_KEY) || (narrow.matches ? 'phone' : 'desk') };
  (function fromAddress() {
    var q = {}; location.search.replace(/^\?/, '').split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
    if (TAB_OF[q.tab]) state.tab = TAB_OF[q.tab];
    var rec = q.item && D.contentItems.get(q.item);
    if (rec && TABS[rec.type]) { state.tab = rec.type; state.sel[rec.type] = rec.id; }
  })();

  function byOrder(a, b) { return (a.placement === 'lead' ? 0 : 1) - (b.placement === 'lead' ? 0 : 1) || (a.order || 99) - (b.order || 99); }
  function sorted(type) {
    var list = items(type);
    if (type === 'news') return list.sort(function (a, b) { return (b.posted || '').localeCompare(a.posted || '') || a.id.localeCompare(b.id); });
    if (type === 'card') return list.sort(byOrder);
    return list.sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });
  }
  function newPost() {
    return { id: null, type: 'news', title: '', body: '', posted: TODAY_ISO, status: 'draft', link: '', linkLabel: 'Read more' };
  }
  function selected(type) {
    var id = state.sel[type];
    if (id === '__new' && type === 'news') return id;
    if (!id || !D.contentItems.get(id)) { var first = sorted(type)[0]; id = state.sel[type] = first ? first.id : null; }
    return id;
  }
  function loadDraft() {
    var id = selected(state.tab);
    state.draft = id === '__new' ? newPost() : id ? eff(D.contentItems.get(id)) : null;
    state.dirty = false; state.errors = {};
  }
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { r[k] = o[k]; }); return r; }

  /* ---------- The list ---------- */
  function liveChip(r) {
    if (r.type === 'card') {
      if (r.shown === false) return UI.chip('ended', 'Hidden');
      if (r.whenMode === 'confirm') return UI.chip('draft');
      var lv = live(r.liveStart, r.liveEnd);
      return lv ? UI.chip(lv.state, lv.label) : UI.chip('published', 'On Home');
    }
    if (r.type === 'season') {
      if (r.start <= TODAY_ISO && TODAY_ISO <= r.end) return UI.chip('running', 'Now');
      return TODAY_ISO < r.start ? UI.chip('upcoming') : UI.chip('finished');
    }
    return r.status === 'draft' ? UI.chip('pending', 'Draft') : UI.chip('published');
  }
  function itemHtml(r, cur) {
    var meta = [];
    if (r.type === 'news') meta.push('<span>' + esc(md(r.posted, true) || 'No date') + '</span>');
    if (r.type === 'card') meta.push('<span class="ct-item__place">' + (r.placement === 'lead' ? 'Lead' : 'Row ' + Math.max(1, (r.order || 2) - 1)) + '</span>');
    if (r.type === 'season') meta.push('<span>' + esc(md(r.start) + ' to ' + md(r.end, true)) + '</span>');
    meta.push(liveChip(r));
    if (r.type === 'season' && r.startToConfirm) meta.push(UI.chip('draft', 'Start to confirm'));
    if (isEdited(r.id)) meta.push('<span class="ct-edited">' + (BASE[r.id] ? 'Edited here' : 'Written here') + '</span>');
    return '<li><button type="button" class="ct-item" data-ct-pick="' + esc(r.id) + '" aria-current="' + (cur ? 'true' : 'false') + '">' +
      '<span class="ct-item__title">' + esc(r.type === 'card' ? (r.headline || r.title) : r.title || 'Untitled post') + '</span>' +
      '<span class="ct-item__meta">' + meta.join('') + '</span></button></li>';
  }
  function listHtml(type) {
    var sel = state.sel[type], list = sorted(type), gone = removedBase(type);
    var head = { news: 'Posts, newest first', card: 'On Home, in order', season: 'The two seasons' }[type];
    var note = { news: list.length + (list.length === 1 ? ' post' : ' posts'), card: 'Lead, then what comes next', season: 'Club year May to April' }[type];
    var html = list.map(function (r) { return itemHtml(r, r.id === sel); }).join('');
    if (sel === '__new') html = '<li><button type="button" class="ct-item" data-ct-pick="__new" aria-current="true"><span class="ct-item__title">' + esc(state.draft && state.draft.title || 'New post') + '</span><span class="ct-item__meta">' + UI.chip('pending', 'Not saved yet') + '</span></button></li>' + html;
    return '<div class="ct-list"><div class="ct-colhead"><h3 class="pn-h3" id="ct-list-h">' + head + '</h3><span class="ct-colhead__note">' + note + '</span></div>' +
      '<ul class="ct-list__items" role="list" aria-labelledby="ct-list-h">' + (html || '<li class="pn-empty"><p class="pn-empty__title">Nothing here</p><p>Restore the club&rsquo;s text to bring the posts back.</p></li>') + '</ul>' +
      (gone.length ? '<p class="pn-help">' + gone.length + ' of the club&rsquo;s ' + (type === 'news' ? 'posts' : 'items') + ' removed in this browser. Restore the club&rsquo;s text brings ' + (gone.length === 1 ? 'it' : 'them') + ' back.</p>' : '') + '</div>';
  }

  /* ---------- Fields ---------- */
  function fid(k) { return 'ct-f-' + k; }
  function countText(v, lim) { var n = String(v || '').length; return n > lim ? (n - lim) + ' over ' + lim : n + ' of ' + lim; }
  function errHtml(k) { var e = state.errors[k]; return e ? '<p class="pn-error" id="' + fid(k) + '-err">' + icon('alert') + esc(e) + '</p>' : ''; }
  function described(k, help, lim) { var d = [help ? fid(k) + '-help' : '', lim ? fid(k) + '-count' : '', state.errors[k] ? fid(k) + '-err' : ''].filter(Boolean).join(' '); return d ? ' aria-describedby="' + d + '"' : ''; }
  function textField(k, label, o) {
    o = o || {};
    var v = state.draft[k] == null ? '' : state.draft[k], lim = o.limit === false ? 0 : LIMITS[k];
    var a = ' id="' + fid(k) + '" data-ct-field="' + k + '"' + described(k, o.help, lim) + (state.errors[k] ? ' aria-invalid="true"' : '') + (CAN ? '' : ' readonly') + (o.req ? ' aria-required="true"' : '');
    var ctl = o.area ? '<textarea class="pn-textarea" rows="' + (o.rows || 4) + '"' + a + '>' + esc(v) + '</textarea>'
      : '<input class="pn-input" type="' + (o.type || 'text') + '" autocomplete="off"' + (o.min ? ' min="' + o.min + '"' : '') + (o.max ? ' max="' + o.max + '"' : '') + a + ' value="' + esc(v) + '">';
    return '<div class="pn-field"><div class="ct-fieldhead"><label class="pn-label" for="' + fid(k) + '">' + esc(label) + '</label>' +
      (lim ? '<span class="ct-counter' + (String(v).length > lim ? ' is-over' : '') + '" id="' + fid(k) + '-count" data-ct-counter="' + k + '">' + countText(v, lim) + '</span>' : '') + '</div>' +
      ctl + (o.help ? '<p class="pn-help" id="' + fid(k) + '-help">' + o.help + '</p>' : '') + errHtml(k) + '</div>';
  }
  function selectField(k, label, opts, help) {
    var v = state.draft[k] == null ? '' : String(state.draft[k]);
    return '<div class="pn-field"><label class="pn-label" for="' + fid(k) + '">' + esc(label) + '</label><select class="pn-select" id="' + fid(k) + '" data-ct-field="' + k + '"' + described(k, help) + (CAN ? '' : ' disabled') + '>' +
      opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' +
      (help ? '<p class="pn-help" id="' + fid(k) + '-help">' + help + '</p>' : '') + errHtml(k) + '</div>';
  }
  function radios(k, legend, opts, help) {
    var v = String(state.draft[k]);
    return '<fieldset class="ct-fieldset"' + (help ? ' aria-describedby="' + fid(k) + '-help"' : '') + '><legend class="pn-label">' + esc(legend) + '</legend><div class="ct-radios">' +
      opts.map(function (o) { return '<label class="pn-check"><input type="radio" name="' + fid(k) + '" id="' + fid(k) + '-' + o[0] + '" value="' + esc(o[0]) + '" data-ct-field="' + k + '"' + (String(o[0]) === v ? ' checked' : '') + (CAN ? '' : ' disabled') + '> ' + esc(o[1]) + '</label>'; }).join('') +
      '</div>' + (help ? '<p class="pn-help" id="' + fid(k) + '-help">' + help + '</p>' : '') + '</fieldset>';
  }
  function checkField(k, label) {
    return '<label class="pn-check"><input type="checkbox" id="' + fid(k) + '" data-ct-field="' + k + '"' + (state.draft[k] ? ' checked' : '') + (CAN ? '' : ' disabled') + '> ' + label + '</label>';
  }

  /* ---------- The editor ---------- */
  function lockNote() {
    return CAN ? '' : '<p class="pn-note ct-edit__lock">' + icon('alert') + '<span>Read only for ' + esc(D.roleName()) + '. ' + esc(WHO) + ' edits content; you can read every item and preview it.</span></p>';
  }
  function cardOf(id) { return eff(D.contentItems.get(id)); }
  function editorNews(d, id) {
    var b = BASE[id], club = '';
    if (b) club = '<p class="ct-quote">On the club&rsquo;s current site this post is listed <b>' + esc(String(b.listingDate || 'with no date').replace(/^([A-Z][a-z]{2})\./, '$1')) + '</b> and was last changed <b>' + esc(md(b.updatedAt, true)) + '</b>.' +
      (b.note ? ' Checked against the club&rsquo;s site on Sep 30, 2026: ' + esc(b.note) : '') + (b.source ? ' Source <code>' + esc(b.source) + '</code>' : '') + '</p>';
    return textField('title', 'Headline', { req: true }) +
      textField('body', 'Summary', { area: true, rows: 4, req: true }) +
      '<div class="pn-form__row pn-form__row--2">' + textField('posted', 'Date posted', { type: 'date', limit: false, min: '2020-01-01', max: '2027-12-31' }) +
      radios('status', 'Status', [['published', 'Published'], ['draft', 'Draft']]) + '</div>' +
      '<div class="pn-form__row pn-form__row--2">' + selectField('link', 'Links to', PAGES) + textField('linkLabel', 'Link words') + '</div>' + club;
  }
  function editorCard(d, id) {
    var b = BASE[id] || {}, lead = sorted('card').filter(function (c) { return c.placement === 'lead' && c.id !== id; })[0];
    var rows = sorted('card').filter(function (c) { return c.placement !== 'lead' && c.id !== id; });
    var placeHelp = d.placement === 'lead' && lead ? 'Saving makes this the lead; ' + esc(lead.headline) + ' moves to the first row.' :
      d.placement !== 'lead' && !lead ? 'Home has no lead card while this is a row.' : '';
    var pos = [];
    for (var i = 0; i <= rows.length; i++) pos.push([i + 2, 'Row ' + (i + 1) + (i === 0 ? ', first under the lead' : '')]);
    var club = b.body ? '<p class="ct-quote">The club&rsquo;s words: &ldquo;' + esc(b.body) + '&rdquo;' + (b.source ? ' Source <code>' + esc(b.source) + '</code>' : '') + '</p>'
      : b.gap ? '<p class="ct-quote"><b>Not published by the club.</b> ' + esc(b.gap) + '</p>' : '';
    return radios('placement', 'Place on Home', [['lead', 'Lead, with the photo'], ['row', 'Row, under the lead']], placeHelp) +
      (d.placement !== 'lead' ? selectField('order', 'Position', pos) : '') +
      textField('headline', 'Headline', { req: true }) +
      textField('text', 'Text', { area: true, rows: 3 }) +
      radios('whenMode', 'When', [['dates', 'Dates'], ['confirm', 'Club to confirm']]) +
      (d.whenMode === 'confirm' ? textField('confirmWhat', 'What the club must confirm', { help: 'Shown as the site&rsquo;s Club to confirm slot, never a made-up date.' })
        : textField('when', 'Date line', { help: 'As it reads on Home, e.g. Aug 24 to Oct 8, 2026.' }) +
          (d.placement === 'lead' ? '<div class="pn-form__row pn-form__row--2">' + textField('liveStart', 'Running from', { type: 'date', limit: false, min: YEAR0, max: '2027-04-30' }) +
            textField('liveEnd', 'Running to', { type: 'date', limit: false, min: YEAR0, max: '2027-04-30' }) + '</div><p class="pn-help">Between these dates the lead&rsquo;s chip reads Running now, with the ball-yellow dot. Before, Starts; after, Ended.</p>' : '')) +
      '<div class="pn-form__row pn-form__row--2">' + selectField('link', 'Links to', PAGES) + textField('linkLabel', 'Link words') + '</div>' +
      checkField('shown', 'Show on Home') + club;
  }
  function editorSeason(d, id) {
    var b = BASE[id] || {};
    return textField('title', 'Name', { limit: false, req: true }) +
      '<div class="pn-form__row pn-form__row--2">' + textField('start', 'First day', { type: 'date', limit: false, min: YEAR0, max: '2027-04-30', req: true }) +
      textField('end', 'Last day', { type: 'date', limit: false, min: YEAR0, max: '2027-04-30', req: true }) + '</div>' +
      checkField('approx', 'Dates are approximate (the site says &ldquo;About&rdquo;)') +
      checkField('startToConfirm', 'First day still to confirm (the site marks it To confirm)') +
      (b.body ? '<p class="ct-quote">The club&rsquo;s words: &ldquo;' + esc(b.body) + '&rdquo;' + (b.source ? ' Source <code>' + esc(b.source) + '</code>' : '') + '</p>' : '') +
      '<p class="pn-note">' + icon('calendar') + '<span>This changes what the site says. Bookings, the demo clock and prices keep the club&rsquo;s published dates.</span></p>';
  }
  function editorHtml(type) {
    var d = state.draft, id = state.sel[type];
    if (!d) return '<div class="ct-edit"><div class="pn-empty"><p class="pn-empty__title">Nothing selected</p><p>Pick an item from the list.</p></div></div>';
    var isNew = id === '__new';
    var title = { news: isNew ? 'New post' : 'Edit post', card: 'Edit card', season: 'Edit season' }[type];
    var sub = type === 'card' ? (BASE[id] ? BASE[id].title : '') : type === 'season' ? d.title : '';
    var body = type === 'news' ? editorNews(d, id) : type === 'card' ? editorCard(d, id) : editorSeason(d, id);
    var deny = CAN ? '' : ' aria-disabled="true" title="' + esc(WHO) + ' only" aria-describedby="ct-deny"';
    var acts = '<button class="pn-btn pn-btn--ink" type="submit" data-ct-save' + deny + '>' + (isNew ? 'Save post' : 'Save changes') + '</button>' +
      '<button class="pn-btn pn-btn--text" type="button" data-ct-discard' + (state.dirty ? '' : ' hidden') + '>Discard changes</button>' +
      '<span class="ct-dirty" data-ct-dirty' + (state.dirty ? '' : ' hidden') + '>Unsaved changes</span><span class="ct-actions__spacer"></span>' +
      (BASE[id] && isEdited(id) ? '<button class="pn-btn pn-btn--quiet" type="button" data-ct-restore' + deny + '>Restore the club&rsquo;s version</button>' : '') +
      (type === 'news' && !isNew ? '<button class="pn-btn pn-btn--quiet" type="button" data-ct-remove' + deny + '>Remove post</button>' : '') +
      (CAN ? '' : '<span class="sr-only" id="ct-deny">' + esc(WHO) + ' only</span>');
    return '<div class="ct-edit"><div class="ct-colhead"><h3 class="pn-h3" id="ct-edit-h">' + title + '</h3><span class="ct-colhead__note">' + esc(sub) + '</span>' +
      '<a class="inline-link ct-jump" href="#ct-prev">Jump to the preview</a></div>' + lockNote() +
      '<form class="pn-form" data-ct-form novalidate aria-labelledby="ct-edit-h">' + body + '<div class="ct-actions">' + acts + '</div></form></div>';
  }

  /* ---------- The preview ---------- */
  function rowsWithDraft(d) {
    var rows = sorted('card').filter(function (c) { return c.id !== d.id && c.placement !== 'lead' && c.shown !== false; });
    if (d.placement !== 'lead') rows.splice(Math.max(0, Math.min(rows.length, (+d.order || 2) - 2)), 0, d);
    return rows;
  }
  function previewParts(type) {
    var d = state.draft;
    if (type === 'news') return { where: 'Home, What&rsquo;s happening: a news row', w: 460,
      inner: '<ul class="hnext" role="list">' + hrowHtml(d, true, md(d.posted, true)) + '</ul>',
      foot: 'The demo site has no News page yet (the club left News blank), so a post is drawn with the site&rsquo;s own What&rsquo;s happening row.' };
    if (type === 'card') {
      if (d.placement === 'lead') return { where: 'Home, What&rsquo;s happening: the lead', w: 644, inner: hleadHtml(d, true),
        foot: 'The lead keeps its photograph slot; photos are not edited in this demo. The chip is worked out on ' + esc(clockWords()) + '.' };
      return { where: 'Home, What&rsquo;s happening: what comes next', w: 460,
        inner: '<ul class="hnext" role="list">' + rowsWithDraft(d).map(function (r) { return hrowHtml(r, r.id === d.id); }).join('') + '</ul>',
        foot: 'Every row under the lead, in order; the dashed line marks the card you are editing.' };
    }
    var seasons = sorted('season').map(function (s) { return s.id === d.id ? d : s; });
    var out = seasons.filter(function (s) { return /outdoor/.test(s.id); })[0] || seasons[0], ind = seasons.filter(function (s) { return /indoor/.test(s.id); })[0] || seasons[1];
    return { where: 'Home, under What&rsquo;s happening: the season ledger', w: 1200, inner: (function (e) { return e.start || e.end; })(validate('season', d)) ? '<p class="notice">' + icon('alert') + '<span>Fix the dates to draw the ledger.</span></p>' : ledgerHtml(out, ind),
      foot: 'The club year, May 1 to April 30, at true day-proportion: the arc is the dome over the indoor months, the dashed box the changeover.' };
  }
  function stageHtml(p, fresh) {
    var w = state.view === 'phone' ? 390 : p.w + 80;
    return '<div class="ct-stage ct-stage--' + state.view + '" data-ct-stage><div class="ct-stage__canvas" data-w="' + w + '" style="width:' + w + 'px" inert aria-hidden="true">' +
      '<p class="ct-stage__where">' + p.where + '</p><div' + (fresh ? ' class="ct-fresh"' : '') + '>' + p.inner + '</div></div></div>';
  }
  function previewHtml(type) {
    if (!state.draft) return '';
    var p = previewParts(type);
    return '<div class="ct-prev" id="ct-prev" tabindex="-1" role="region" aria-labelledby="ct-prev-h"><div class="ct-prev__bar"><h3 class="pn-h3" id="ct-prev-h">Live preview</h3>' +
      '<div class="pn-seg" role="group" aria-label="Preview width"><button type="button" data-ct-view="desk" aria-pressed="' + (state.view === 'desk') + '">Desk</button><button type="button" data-ct-view="phone" aria-pressed="' + (state.view === 'phone') + '">Phone</button></div></div>' +
      '<p class="ct-prev__scale" data-ct-scale></p><div data-ct-stagebox>' + stageHtml(p, true) + '</div>' +
      '<p class="ct-prev__foot" data-ct-foot>' + p.foot + ' The public demo Home keeps the club&rsquo;s text: <a class="inline-link" href="' + SITE + 'index.html">open it</a>.</p>' +
      '<p class="sr-only">The preview repeats the fields above in the site&rsquo;s layout.</p></div>';
  }
  function fitStages(root) {
    $$('[data-ct-stage]', root).forEach(function (st) {
      var cv = st.firstElementChild, W = +cv.getAttribute('data-w'), avail = st.clientWidth || W;
      var s = Math.min(1, avail / W);
      cv.style.transform = s < 0.999 ? 'scale(' + s + ')' : '';
      st.style.height = Math.ceil(cv.offsetHeight * s) + 'px';
      var lab = $('[data-ct-scale]', st.parentNode.parentNode);
      if (lab) lab.textContent = (state.view === 'phone' ? 'A 390 px phone' : 'A desk window') + (s < 0.999 ? ', shown at ' + Math.round(s * 100) + '% of its true size' : ', at true size');
    });
  }

  /* ---------- Checks before a save ---------- */
  function validate(t, d) {
    var e = {};
    function need(k, msg) { if (!String(d[k] == null ? '' : d[k]).trim()) e[k] = msg; }
    function max(k) { if (!e[k] && LIMITS[k] && String(d[k] || '').length > LIMITS[k]) e[k] = 'Keep it to ' + LIMITS[k] + ' characters'; }
    if (t === 'news') {
      need('title', 'Write a headline'); need('body', 'Write a summary'); need('posted', 'Choose the date it was posted');
      if (d.link) need('linkLabel', 'Add the link words');
      ['title', 'body', 'linkLabel'].forEach(max);
    } else if (t === 'card') {
      need('headline', 'Write a headline');
      if (d.whenMode === 'confirm') need('confirmWhat', 'Say what the club must confirm'); else need('when', 'Write the date line');
      if (d.placement === 'lead' && d.whenMode !== 'confirm' && (d.liveStart || d.liveEnd)) {
        if (!d.liveStart) e.liveStart = 'Give both dates, or neither';
        else if (!d.liveEnd) e.liveEnd = 'Give both dates, or neither';
        else if (d.liveEnd < d.liveStart) e.liveEnd = 'Running to comes on or after Running from';
      }
      if (d.link) need('linkLabel', 'Add the link words');
      ['headline', 'text', 'when', 'confirmWhat', 'linkLabel'].forEach(max);
    } else {
      need('title', 'Name the season'); need('start', 'Choose the first day'); need('end', 'Choose the last day');
      if (!e.start && (d.start < YEAR0 || d.start > '2027-04-30')) e.start = 'Inside the club year, May 1, 2026 to Apr 30, 2027';
      if (!e.end && (d.end < YEAR0 || d.end > '2027-04-30')) e.end = 'Inside the club year, May 1, 2026 to Apr 30, 2027';
      if (!e.start && !e.end && d.end <= d.start) e.end = 'The last day comes after the first';
      var other = items('season').filter(function (s) { return s.id !== d.id; })[0];
      if (other && !e.start && !e.end) {
        if (/outdoor/.test(d.id) && d.end >= other.start) e.end = 'The outdoor season ends before the dome season starts (' + md(other.start) + ')';
        if (/indoor/.test(d.id) && d.start <= other.end) e.start = 'The dome season starts after the outdoor one ends (' + md(other.end) + ')';
      }
    }
    return e;
  }

  /* One lead, then rows in order: the other cards a save moves */
  function planCards(d) {
    var all = sorted('card').filter(function (c) { return c.id !== d.id; });
    var lead = all.filter(function (c) { return c.placement === 'lead'; })[0];
    var rows = all.filter(function (c) { return c.placement !== 'lead'; });
    var out = [];
    if (d.placement === 'lead') { if (lead) { rows.unshift(Object.assign({}, lead, { placement: 'row' })); } lead = d; }
    else rows.splice(Math.max(0, Math.min(rows.length, (+d.order || 2) - 2)), 0, d);
    var seq = (lead ? [lead] : []).concat(rows);
    seq.forEach(function (c, i) {
      var o = c.placement === 'lead' ? 1 : (lead ? i : i) + (lead ? 1 : 2);
      if (c.id === d.id) { d.order = o; return; }
      var cur = cardOf(c.id);
      if (cur.placement !== c.placement || +cur.order !== o) out.push({ id: c.id, patch: { placement: c.placement, order: o }, was: cur });
    });
    return out;
  }
  function noteFor(t, was, now) {
    var name = quoteTitle(t === 'card' ? now.headline : now.title);
    if (t === 'news') return was.status !== now.status ? (now.status === 'draft' ? 'Unpublished the post ' : 'Published the post ') + name : 'Edited the post ' + name;
    if (t === 'card') return 'Edited the Home card ' + name + (now.placement === 'lead' && was.placement !== 'lead' ? ' and made it the lead' : now.shown === false && was.shown !== false ? ' and hid it from Home' : '');
    return (was.start !== now.start || was.end !== now.end) ? 'Changed the ' + now.title + ' dates to ' + md(now.start) + ' to ' + md(now.end, true) : 'Edited the ' + now.title + ' season';
  }
  function deny() { UI.toast(WHO + ' only. You can read and preview content.', { kind: 'warn' }); }
  function write(fn) { state.busy = true; try { fn(); } finally { state.busy = false; } }
  function afterWrite(ids) { if (!state.dirty || ids.indexOf(state.sel[state.tab]) > -1) loadDraft(); render(); }

  function save(restore) {
    if (!CAN) return deny();
    var t = state.tab, id = state.sel[t], d = state.draft;
    if (!d) return;
    if (restore) { d = state.draft = Object.assign({}, defaults(id)); }
    state.errors = validate(t, d);
    var bad = Object.keys(state.errors);
    if (bad.length) {
      renderPanel();
      var f = $('[aria-invalid="true"]', panels[t]); if (f) f.focus();
      UI.toast('Fix the ' + (bad.length === 1 ? 'marked field' : bad.length + ' marked fields') + '. Nothing was saved.', { kind: 'warn' });
      return;
    }
    if (id === '__new') {
      var p0 = pick(d, KEYS.news), rec;
      write(function () { rec = D.contentItems.add(Object.assign({ type: 'news', listingDate: null, note: null, source: null }, p0), 'Wrote a news post: ' + quoteTitle(p0.title)); });
      state.sel.news = rec.id; loadDraft(); render(); focusAfter('[data-ct-save]');
      UI.toast('Post saved in this browser' + (p0.status === 'draft' ? ' as a draft' : '') + '. The public site is not changed.', { action: { label: 'Undo', run: function () {
        write(function () { D.contentItems.remove(rec.id, 'Took back the new post ' + quoteTitle(p0.title)); }); state.sel.news = null; afterWrite([rec.id]);
      } } });
      return;
    }
    var others = t === 'card' ? planCards(d) : [];
    var was = eff(D.contentItems.get(id)), patch = pick(d, KEYS[t]), before = {};
    before[id] = pick(was, KEYS[t]);
    others.forEach(function (o) { before[o.id] = pick(o.was, KEYS.card); });
    var note = restore ? 'Restored the club\'s version of ' + quoteTitle(itemName(d)) : noteFor(t, was, d);
    write(function () {
      others.forEach(function (o) { D.contentItems.update(o.id, o.patch); });
      D.contentItems.update(id, patch, note);
    });
    loadDraft(); render(); focusAfter(restore ? '[data-ct-pick="' + id + '"]' : '[data-ct-save]');
    var moved = others.filter(function (o) { return o.patch.placement === 'row' && o.was.placement === 'lead'; })[0];
    var msg = restore ? 'The club\'s version is back, in this browser.' :
      t === 'season' ? 'Season dates saved in this browser. Bookings keep the club\'s published dates.' :
      moved ? itemName(d) + ' is the lead now; ' + moved.was.headline + ' moved to the first row. Saved in this browser only.' :
      'Saved in this browser only. The public site is not changed.';
    UI.toast(msg, { action: { label: 'Undo', run: function () {
      write(function () { Object.keys(before).forEach(function (k) { D.contentItems.update(k, before[k], k === id ? 'Undid: ' + note : null); }); });
      afterWrite(Object.keys(before));
    } } });
  }

  function removePost() {
    if (!CAN) return deny();
    var id = state.sel.news, rec = D.contentItems.get(id);
    if (!rec) return;
    UI.confirm({ title: 'Remove this post?', body: '<p>' + esc(quoteTitle(rec.title)) + ' comes off the list in this browser. Undo, or Restore the club&rsquo;s text, brings it back.</p>', confirm: 'Remove post', cancel: 'Keep it', danger: true })
      .then(function (yes) {
        if (!yes) return;
        write(function () { D.contentItems.remove(id, 'Removed the post ' + quoteTitle(rec.title)); });
        state.sel.news = null; loadDraft(); render(); focusAfter('[data-ct-pick]');
        UI.toast('Post removed in this browser.', { action: { label: 'Undo', run: function () {
          write(function () { D.contentItems.add(rec, 'Put back the post ' + quoteTitle(rec.title)); });
          state.sel.news = id; afterWrite([id]);
        } } });
      });
  }
  function editedCount() { return ORDER.filter(isEdited).length + D.contentItems.list(function (r) { return !BASE[r.id]; }).length; }
  function restoreAll() {
    if (!CAN) return deny();
    var n = editedCount();
    if (!n) { UI.toast('Nothing to restore: every item reads as the club published it.'); return; }
    guard(function () {
      UI.confirm({ title: 'Restore the club\'s text?', body: '<p>' + n + (n === 1 ? ' item goes' : ' items go') + ' back to the club&rsquo;s words and dates, and posts written here are removed. Other modules keep their changes.</p>', confirm: 'Restore the club\'s text', cancel: 'Keep my edits' })
        .then(function (yes) {
          if (!yes) return;
          write(function () {
            ORDER.forEach(function (id) {
              var cur = D.contentItems.get(id), def = defaults(id);
              if (!cur) D.contentItems.add(def);
              else if (isEdited(id)) D.contentItems.update(id, pick(def, KEYS[def.type]));
            });
            D.contentItems.list(function (r) { return !BASE[r.id]; }).forEach(function (r) { D.contentItems.remove(r.id); });
            D.log('Restored the club\'s text: news, Home cards and season dates', { type: 'content', id: 'all' });
          });
          if (state.sel.news === '__new') state.sel.news = null;
          loadDraft(); render(); focusAfter('[data-ct-restore-all]');
          UI.toast('The club\'s text is back for ' + n + (n === 1 ? ' item' : ' items') + '. In this browser only.');
        });
    });
  }

  /* ---------- Render ---------- */
  var panels = {};
  Object.keys(TABS).forEach(function (t) { panels[t] = $('[data-ct-panel="' + t + '"]'); });
  function kpis() {
    var box = $('[data-ct-kpis]'); if (!box) return;
    var news = items('news'), pub = news.filter(function (n) { return n.status !== 'draft'; }).length;
    var shown = items('card').filter(function (c) { return c.shown !== false; });
    var confirmN = shown.filter(function (c) { return c.whenMode === 'confirm'; }).length;
    var ind = eff(D.contentItems.get('season-indoor-2026')), n = editedCount();
    var k = [
      ['News posts', pub, news.length - pub ? (news.length - pub) + ' in draft' : 'All published'],
      ['What\'s happening', shown.length, confirmN ? confirmN + ' with dates to confirm' : 'Every date published'],
      ['Indoor season starts', ind ? md(ind.start) : 'Removed', ind && ind.startToConfirm ? 'Likely; club to confirm' : 'Confirmed'],
      ['Edited in this browser', n, n ? 'Restore puts the club\'s text back' : 'The club\'s text, as published']
    ];
    box.innerHTML = k.map(function (x) {
      return '<div class="pn-kpi"><p class="pn-kpi__label">' + esc(x[0]) + '</p><p class="pn-kpi__value">' + esc(x[1]) + '</p><p class="pn-kpi__note">' + esc(x[2]) + '</p></div>';
    }).join('');
  }
  function logHtml() {
    var a = D.activity().filter(function (x) { return x.ref && x.ref.type === 'content'; }).slice(0, 12);
    if (!a.length) return '<div class="pn-empty"><p class="pn-empty__title">No edits yet</p><p>Saved changes appear here, newest first, with the role that made them.</p></div>';
    return '<ul class="ct-log__list" role="list">' + a.map(function (x) {
      return '<li><span class="ct-log__at">' + esc(D.fmt.stamp(x.at)) + '</span><span class="ct-log__by">' + esc(x.by) + '</span><span class="ct-log__text">' + esc(x.text) + '</span></li>';
    }).join('') + '</ul>';
  }
  function staleHtml() {
    var cards = sorted('card'), lead = cards.filter(function (c) { return c.placement === 'lead'; })[0];
    if (!lead || lead.whenMode === 'confirm') return '';
    var lv = live(lead.liveStart, lead.liveEnd);
    if (!lv || lv.state !== 'finished') return '';
    var next = cards.filter(function (c) { return c.placement !== 'lead' && c.shown !== false && c.whenMode !== 'confirm'; })[0];
    return '<div class="ct-stale">' + icon('clock') + '<p>On ' + esc(clockWords()) + ' the lead card&rsquo;s session has ended, so Home opens What&rsquo;s happening with &ldquo;Ended ' + esc(md(lead.liveEnd)) + '&rdquo;. Choose a new lead.</p>' +
      (next ? '<button class="pn-btn pn-btn--quiet pn-btn--sm" type="button" data-ct-makelead="' + esc(next.id) + '">Preview ' + esc(next.headline) + ' as the lead</button>' : '') + '</div>';
  }
  function renderPanel() {
    var t = state.tab, el = panels[t];
    el.innerHTML = (t === 'card' ? staleHtml() : '') + '<div class="ct-bench' + (t === 'season' ? ' ct-bench--wide' : '') + '">' + listHtml(t) + editorHtml(t) + previewHtml(t) + '</div>';
    wireImgs(el); fitStages(el);
  }
  function refreshPreview() {
    var el = panels[state.tab], box = $('[data-ct-stagebox]', el); if (!box || !state.draft) return;
    box.innerHTML = stageHtml(previewParts(state.tab), false);
    wireImgs(box); fitStages(el);
  }
  function wireImgs(root) {
    $$('img[data-ct-img]', root).forEach(function (img) {
      var fig = img.closest('.frame');
      function ok() { imgOk = true; img.classList.add('is-loaded'); if (fig) { fig.classList.add('has-img'); fig.classList.remove('frame--due'); } fitStages(panels[state.tab]); }
      if (img.complete && img.naturalWidth) ok(); else img.addEventListener('load', ok);
      img.addEventListener('error', function () { if (fig) fig.classList.remove('frame--due'); img.remove(); });
    });
  }
  function renderTabs() {
    Object.keys(TABS).forEach(function (t) {
      var b = document.getElementById(TABS[t]), on = t === state.tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; panels[t].hidden = !on;
      if (!on) panels[t].innerHTML = '';
    });
    $$('[data-ct-count]').forEach(function (el) { el.textContent = D.contentItems.count({ type: el.getAttribute('data-ct-count') }); });
  }
  function renderHead() {
    var note = $('[data-ct-rolenote]');
    if (note) {
      note.hidden = CAN;
      if (!CAN) note.innerHTML = icon('alert') + '<span>Signed in as ' + esc(D.roleName()) + ': you can read and preview every item. ' + esc(WHO) + ' edits content.</span>';
    }
    $$('[data-ct-new], [data-ct-restore-all]').forEach(function (b) {
      if (!CAN) { b.setAttribute('aria-disabled', 'true'); b.setAttribute('title', WHO + ' only'); }
    });
  }
  function render() { renderTabs(); kpis(); renderPanel(); var lg = $('[data-ct-log]'); if (lg) lg.innerHTML = logHtml(); }
  function focusAfter(sel) {
    var el = $(sel, panels[state.tab]) || $(sel);
    if (el) try { el.focus({ preventScroll: false }); } catch (e) { el.focus(); }
  }
  function setDirty(on) {
    state.dirty = on;
    var el = panels[state.tab];
    $$('[data-ct-dirty], [data-ct-discard]', el).forEach(function (x) { x.hidden = !on; });
  }

  /* ---------- Moving around ---------- */
  function guard(fn) {
    if (!state.dirty) return fn();
    UI.confirm({ title: 'Discard your changes?', body: '<p>The changes to ' + esc(quoteTitle(itemName(state.draft))) + ' are not saved.</p>', confirm: 'Discard changes', cancel: 'Keep editing' })
      .then(function (yes) { if (yes) { state.dirty = false; fn(); } });
  }
  function setTab(t, focusTab) {
    state.tab = t; loadDraft(); render();
    if (focusTab) document.getElementById(TABS[t]).focus();
  }
  function pickItem(id) {
    state.sel[state.tab] = id; loadDraft(); renderPanel();
    focusAfter('[data-ct-pick="' + id + '"]');
  }
  function startNew() {
    if (!CAN) return deny();
    guard(function () {
      state.tab = 'news'; state.sel.news = '__new'; loadDraft(); render();
      focusAfter('#ct-f-title');
      UI.toast('A new post, as a draft. Nothing is saved until you press Save post.');
    });
  }
  function makeLead(id) {
    guard(function () {
      state.tab = 'card'; state.sel.card = id; loadDraft();
      state.draft.placement = 'lead';
      renderPanel(); setDirty(CAN);
      focusAfter('[data-ct-save]');
      UI.toast(CAN ? 'Previewing ' + itemName(state.draft) + ' as the lead. Save changes to keep it.' : 'Previewing ' + itemName(state.draft) + ' as the lead. ' + WHO + ' can save it.');
    });
  }

  /* ---------- Events ---------- */
  var work = $('.ct-work');
  var tablist = $('.ct-work [role="tablist"]');
  var tabOrder = ['news', 'card', 'season'];
  function tabFromBtn(b) { for (var t in TABS) if (TABS[t] === b.id) return t; return null; }
  tablist.addEventListener('click', function (e) {
    var b = e.target.closest('[role="tab"]'); if (!b) return;
    var t = tabFromBtn(b); if (!t || t === state.tab) return;
    guard(function () { setTab(t, true); });
  });
  tablist.addEventListener('keydown', function (e) {
    var i = tabOrder.indexOf(state.tab), n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % 3; else if (e.key === 'ArrowLeft') n = (i + 2) % 3;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = 2;
    if (n === null) return;
    e.preventDefault();
    guard(function () { setTab(tabOrder[n], true); });
  });

  var raf = 0;
  function onField(e) {
    var f = e.target.closest('[data-ct-field]'); if (!f || !state.draft || !CAN) return;
    var k = f.getAttribute('data-ct-field');
    if (f.type === 'radio' && !f.checked) return;
    var v = f.type === 'checkbox' ? f.checked : f.value;
    if (k === 'order') v = +v;
    if (state.draft[k] === v) return;
    state.draft[k] = v;
    setDirty(true);
    if (state.errors[k]) {
      delete state.errors[k];
      f.removeAttribute('aria-invalid');
      var er = document.getElementById(fid(k) + '-err'); if (er) er.remove();
      f.setAttribute('aria-describedby', (f.getAttribute('aria-describedby') || '').replace(fid(k) + '-err', '').trim());
    }
    var c = $('[data-ct-counter="' + k + '"]', panels[state.tab]);
    if (c) { c.textContent = countText(v, LIMITS[k]); c.classList.toggle('is-over', String(v).length > LIMITS[k]); }
    if (k === 'placement' || k === 'whenMode') {
      renderPanel(); setDirty(true);
      focusAfter('#' + fid(k) + '-' + v);
      return;
    }
    if (k === 'title' && state.sel.news === '__new') { var it = $('[data-ct-pick="__new"] .ct-item__title', panels.news); if (it) it.textContent = v || 'New post'; }
    cancelAnimationFrame(raf); raf = requestAnimationFrame(refreshPreview);
  }
  work.addEventListener('input', onField);
  work.addEventListener('change', onField);
  work.addEventListener('submit', function (e) { if (e.target.closest('[data-ct-form]')) { e.preventDefault(); save(false); } });
  work.addEventListener('click', function (e) {
    var t = e.target;
    var pk = t.closest('[data-ct-pick]');
    if (pk) { var id = pk.getAttribute('data-ct-pick'); if (id !== state.sel[state.tab]) guard(function () { pickItem(id); }); return; }
    var vw = t.closest('[data-ct-view]');
    if (vw) {
      state.view = vw.getAttribute('data-ct-view'); pref(VIEW_KEY, state.view);
      $$('[data-ct-view]', panels[state.tab]).forEach(function (b) { b.setAttribute('aria-pressed', String(b === vw)); });
      refreshPreview(); return;
    }
    if (t.closest('[data-ct-discard]')) { loadDraft(); renderPanel(); focusAfter('[data-ct-save]'); UI.toast('Changes discarded. Nothing was saved.'); return; }
    if (t.closest('[data-ct-restore]')) { save(true); return; }
    if (t.closest('[data-ct-remove]')) { removePost(); return; }
    var ml = t.closest('[data-ct-makelead]');
    if (ml) { makeLead(ml.getAttribute('data-ct-makelead')); return; }
  });
  $$('[data-ct-new]').forEach(function (b) { b.addEventListener('click', startNew); });
  $$('[data-ct-restore-all]').forEach(function (b) { b.addEventListener('click', restoreAll); });

  window.addEventListener('panel:change', function (e) {
    var c = e.detail && e.detail.collection;
    if (state.busy) return;
    if (c === '*') { if (state.sel.news === '__new') state.sel.news = null; loadDraft(); render(); return; }
    if (c === 'content') { if (!state.dirty) loadDraft(); render(); }
  });
  window.addEventListener('beforeunload', function (e) { if (state.dirty && CAN) { e.preventDefault(); e.returnValue = ''; } });
  var rz = 0;
  window.addEventListener('resize', function () { cancelAnimationFrame(rz); rz = requestAnimationFrame(function () { fitStages(panels[state.tab]); }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitStages(panels[state.tab]); });

  /* ---------- Start ---------- */
  renderHead();
  loadDraft();
  render();
})();
