/* Content > News (N1a, 24 Oct 2026): the editor Level 1 item W-11 promises, on one screen.
   A post: title, summary, a cover photo (or a video with its poster), body blocks (headings, text,
   photo, gallery, video, PDF, button, quote), tags, topic, author, the program it is about, related
   posts, pin to Home and an end date (a registration post marks itself closed the day after).
   Search and sharing: the search title and description with length guides, a preview of the Google
   result and of the share card, and a short checklist that advises and never blocks.
   Publishing: draft, a preview on a phone and a desk (the public article page itself, in a frame),
   publish now or at a set time, unpublish, version history with restore and "last edited by and
   when", an Updated date only when ticked, duplicate a post.
   The posts are the club's own (TPTC_CONTENT.posts, from content/posts.json, the same file the site
   is built from). Changes are kept in this browser in localStorage 'tptc-news-v1' and the public Home
   band, News page and articles show them in this browser (site/js/news.js). Administrator edits;
   Front desk and Head Pro read and preview.
   The story: a post goes out like a match on the order of play. It is written (draft), called to a
   court at a time (scheduled), played (published) and can be taken off the board (unpublished); the
   scoresheet keeps every version. */
(function () {
  'use strict';
  var D = window.PanelData, UI = window.PanelUI, F = window.TPTC_CONTENT || {}, S = window.CTStore;
  if (!D || !UI || !F.posts || !S) return;
  var esc = UI.esc, icon = UI.icon;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var CAN = UI.can('content.edit'), WHO = UI.whoCan ? UI.whoCan('content.edit') : 'Administrator';
  var P = F.posts, TOPICS = P.topics, AUTHORS = P.authors;
  var TOPIC = {}; TOPICS.forEach(function (t) { TOPIC[t.id] = t.label; });
  var BASE = {}; P.posts.forEach(function (p) { BASE[p.id] = p; });
  var ORIGIN = 'www.thornhillparktennisclub.ca';
  var PROGRAMS = [['', 'No program'], ['junior', 'Junior Recreational'], ['adult', 'Adult Programs'], ['high-performance', 'High Performance'],
    ['private-lessons', 'Private Lessons'], ['camps', 'Camps'], ['camps-summer', 'Summer Camps'], ['camps-march-break', 'March Break Camp'],
    ['camps-holiday', 'Holiday Camps'], ['membership', 'Membership'], ['court-bookings', 'Court Bookings'], ['leagues-events', 'Leagues & Events']];
  var PROG = {}; PROGRAMS.forEach(function (p) { PROG[p[0]] = p[1]; });
  var BLOCKS = [['text', 'Text'], ['heading', 'Heading'], ['photo', 'Photo'], ['gallery', 'Gallery'], ['video', 'Video'], ['pdf', 'PDF link'], ['button', 'Button'], ['quote', 'Quote']];
  var BLOCK = {}; BLOCKS.forEach(function (b) { BLOCK[b[0]] = b[1]; });
  var LIM = { title: 110, summary: 240, seoTitle: 60, seoDesc: 155 };
  var SUFFIX = ' | TPTC';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function nice(s) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s || ''); return m ? MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : ''; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function slugify(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70); }

  /* ---------- Posts: the club's, under this browser's record ---------- */
  function store() { return S.news(); }
  function stateOf(p) { return p.state || (p.status === 'published' ? 'published' : 'draft'); }
  function full(id) {
    var n = store();
    if (n.deleted.indexOf(id) > -1) return null;
    var r = n.posts[id];
    if (BASE[id]) return Object.assign(clone(BASE[id]), r ? clone(r) : {});
    return r ? clone(r) : null;
  }
  function all() {
    var n = store(), out = [];
    P.posts.forEach(function (p) { if (n.deleted.indexOf(p.id) < 0) out.push(full(p.id)); });
    Object.keys(n.posts).forEach(function (id) { if (!BASE[id]) out.push(full(id)); });
    return out.sort(function (a, b) { return String(b.publishAt || b.published).localeCompare(String(a.publishAt || a.published)); });
  }
  function edited(id) { return !!store().posts[id]; }
  function liveNow(p) {
    var s = stateOf(p);
    return s === 'published' || (s === 'scheduled' && p.publishAt && new Date(p.publishAt) <= new Date());
  }
  function stateChip(p) {
    var s = stateOf(p);
    if (s === 'scheduled') return liveNow(p) ? UI.chip('published', 'Published ' + nice(p.publishAt)) : UI.chip('upcoming', 'Scheduled ' + D.fmt.stamp(p.publishAt));
    if (s === 'published') return UI.chip('published');
    if (s === 'unpublished') return UI.chip('ended', 'Unpublished');
    return UI.chip('pending', 'Draft');
  }
  function lastEdit(p) {
    var r = store().posts[p.id];
    if (r && r.editedAt) return 'Last edited by ' + esc(r.editedBy || 'staff') + ', ' + esc(D.fmt.stamp(r.editedAt));
    if (BASE[p.id]) return 'As the club published it, ' + esc(nice(BASE[p.id].published)) + '. Source <a class="inline-link" href="' + esc(BASE[p.id].source) + '" target="_blank" rel="noopener">the club&rsquo;s current site<span class="sr-only"> (opens in a new tab)</span></a>';
    return 'Not saved yet';
  }

  /* ---------- State ---------- */
  var st = { sel: null, draft: null, dirty: false, errors: {}, view: 'phone', q: '', showUpdated: false, schedule: '' };
  try { var v = localStorage.getItem('tptc-panel-content-preview'); if (v === 'desk' || v === 'phone') st.view = v; } catch (e) { /* default */ }
  var el = null;
  function pickFirst() { var l = all(); st.sel = l.length ? l[0].id : null; }
  function load(id) {
    st.sel = id; st.errors = {}; st.dirty = false;
    st.draft = id === '__new' ? blank() : id ? full(id) : null;
    if (st.draft) {
      st.draft.seo = st.draft.seo || {}; st.draft.cover = st.draft.cover || { media: '', alt: '', focal: '50% 50%' };
      st.draft.blocks = st.draft.blocks || []; st.draft.tags = st.draft.tags || []; st.draft.related = st.draft.related || [];
      st.showUpdated = !!st.draft.show_updated;
      st.schedule = st.draft.publishAt && stateOf(st.draft) === 'scheduled' ? local(st.draft.publishAt) : '';
    }
  }
  function local(isoStr) { var d = new Date(isoStr); return iso(d) + 'T' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function blank() {
    return { id: 'post-' + Date.now().toString(36), slug: '', title: '', summary: '', topic: 'club-life', tags: [], published: iso(new Date()), updated: null, show_updated: false,
      author: 'club', cover: { media: '', alt: '', focal: '50% 50%' }, program: '', related: [], pinned: false, ends: null, event: null,
      seo: { title: '', description: '', keyphrase: '', noindex: false }, status: 'draft', state: 'draft', publishAt: null, blocks: [{ type: 'text', text: '' }], source: null, _new: true };
  }

  /* ---------- Paths into the draft (data-nw="blocks.2.items.0.alt") ---------- */
  function getP(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setP(o, path, val) {
    var ks = path.split('.'), last = ks.pop(), t = ks.reduce(function (a, k) { if (a[k] == null) a[k] = {}; return a[k]; }, o);
    t[last] = val;
  }

  /* ---------- Fields ---------- */
  var ro = function () { return CAN ? '' : ' readonly'; }, dis = function () { return CAN ? '' : ' disabled'; };
  function cnt(v, lim) { var n = String(v || '').length; return n > lim ? (n - lim) + ' over ' + lim : n + ' of ' + lim; }
  function err(k) { return st.errors[k] ? '<p class="pn-error" id="nw-err-' + k.replace(/\./g, '-') + '">' + icon('alert') + esc(st.errors[k]) + '</p>' : ''; }
  function fid(path) { return 'nw-' + path.replace(/\./g, '-'); }
  function text(path, label, o) {
    o = o || {};
    var v = getP(st.draft, path); v = v == null ? '' : v;
    var id = fid(path), lim = o.lim, eid = st.errors[path] ? ' aria-invalid="true" aria-describedby="nw-err-' + path.replace(/\./g, '-') + (o.help ? ' ' + id + '-help' : '') + '"' : o.help ? ' aria-describedby="' + id + '-help"' : '';
    var ctl = o.area ? '<textarea class="pn-textarea" id="' + id + '" rows="' + (o.rows || 3) + '" data-nw="' + path + '"' + eid + ro() + '>' + esc(v) + '</textarea>'
      : '<input class="pn-input" id="' + id + '" type="' + (o.type || 'text') + '" autocomplete="off" data-nw="' + path + '" value="' + esc(v) + '"' + eid + ro() + (o.min ? ' min="' + o.min + '"' : '') + '>';
    return '<div class="pn-field' + (o.cls ? ' ' + o.cls : '') + '"><div class="ct-fieldhead"><label class="pn-label" for="' + id + '">' + label + (o.req ? ' <span class="nw-req">(required)</span>' : '') + '</label>' +
      (lim ? '<span class="ct-counter' + (String(v).length > lim ? ' is-over' : '') + '" data-nw-count="' + path + '" data-lim="' + lim + '">' + cnt(v, lim) + '</span>' : '') + '</div>' +
      ctl + (o.help ? '<p class="pn-help" id="' + id + '-help">' + o.help + '</p>' : '') + err(path) + '</div>';
  }
  function select(path, label, opts, o) {
    o = o || {};
    var v = String(getP(st.draft, path) == null ? '' : getP(st.draft, path)), id = fid(path);
    return '<div class="pn-field' + (o.cls ? ' ' + o.cls : '') + '"><label class="pn-label" for="' + id + '">' + label + '</label><select class="pn-select" id="' + id + '" data-nw="' + path + '"' + (o.re ? ' data-nw-re' : '') + dis() + (o.help ? ' aria-describedby="' + id + '-help"' : '') + '>' +
      opts.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === v ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>' +
      (o.help ? '<p class="pn-help" id="' + id + '-help">' + o.help + '</p>' : '') + err(path) + '</div>';
  }
  function check(path, label, help) {
    var id = fid(path);
    return '<label class="pn-check"><input type="checkbox" id="' + id + '" data-nw="' + path + '"' + (getP(st.draft, path) ? ' checked' : '') + dis() + '> ' + label + '</label>' + (help ? '<p class="pn-help">' + help + '</p>' : '');
  }
  function photos(none) {
    return [['', none || 'No photo']].concat(S.library('photo').map(function (it) { return [it.id, it.title + ' (' + S.originLabel(it).replace('&rsquo;', "'") + ')']; }));
  }
  function mediaPick(path, altPath, label, ratio, focalPath, req) {
    var id = getP(st.draft, path), it = id ? S.item(id) : null, focal = focalPath ? getP(st.draft, focalPath) : null;
    var fx = String(focal || '50% 50%').split(/\s+/);
    return '<div class="nw-media"><div class="nw-media__pic">' + S.thumb(it, ratio, focal) + '</div><div class="nw-media__fields">' +
      select(path, label, photos(), { re: true }) +
      (id ? text(altPath, 'Alt text', { req: true, help: 'What the photo shows, for someone who cannot see it.' }) : '') +
      (id && focalPath ? '<div class="pn-form__row pn-form__row--2 nw-focal"><div class="pn-field"><label class="pn-label" for="' + fid(focalPath) + '-x">Focal point across <span class="pn-num">' + parseInt(fx[0], 10) + '%</span></label><input type="range" min="0" max="100" id="' + fid(focalPath) + '-x" data-nw-focal="' + focalPath + '" data-axis="x" value="' + parseInt(fx[0], 10) + '"' + dis() + '></div>' +
        '<div class="pn-field"><label class="pn-label" for="' + fid(focalPath) + '-y">Down <span class="pn-num">' + parseInt(fx[1], 10) + '%</span></label><input type="range" min="0" max="100" id="' + fid(focalPath) + '-y" data-nw-focal="' + focalPath + '" data-axis="y" value="' + parseInt(fx[1], 10) + '"' + dis() + '></div></div>' : '') +
      '</div></div>';
  }
  function pages() { return [['@' + 'news', 'News']].concat(PROGRAMS.slice(1).map(function (p) { return ['@' + p[0], p[1]]; })); }

  /* ---------- The blocks ---------- */
  function blockHtml(b, i, n) {
    var p = 'blocks.' + i, body = '';
    if (b.type === 'heading') body = text(p + '.text', 'Heading', { help: 'A section heading (the post&rsquo;s title is the one main heading).' });
    else if (b.type === 'text') body = text(p + '.text', 'Text', { area: true, rows: 5, help: 'A blank line starts a new paragraph. Lines that start with 1. or a dash become a list. Email addresses link on their own.' });
    else if (b.type === 'photo') body = mediaPick(p + '.media', p + '.alt', 'Photo', '3x2', p + '.focal') + text(p + '.caption', 'Caption');
    else if (b.type === 'gallery') {
      var items = b.items || [];
      body = '<ol class="nw-gallery">' + items.map(function (it, k) {
        return '<li>' + mediaPick(p + '.items.' + k + '.media', p + '.items.' + k + '.alt', 'Photo ' + (k + 1), '4x3', p + '.items.' + k + '.focal') +
          '<button class="pn-btn pn-btn--text pn-btn--sm" type="button" data-nw-gdel="' + i + ':' + k + '"' + (CAN ? '' : ' aria-disabled="true"') + '>Remove photo ' + (k + 1) + '</button></li>';
      }).join('') + '</ol><button class="pn-btn pn-btn--quiet pn-btn--sm" type="button" data-nw-gadd="' + i + '"' + (CAN ? '' : ' aria-disabled="true"') + '>' + icon('plus', 'icon--16') + 'Add a photo</button>' +
        text(p + '.caption', 'Caption for the gallery');
    } else if (b.type === 'video') {
      var vids = [['', 'No video yet (the play button says so)']].concat(S.library('video').map(function (it) { return [it.id, it.title]; }));
      body = text(p + '.title', 'Title') + select(p + '.media', 'Video file', vids, { re: true, help: 'MP4 or WebM, uploaded in Photos and media; kept in this browser. No third-party player.' }) +
        mediaPick(p + '.poster', p + '.alt', 'Poster frame', '16x9', null) + text(p + '.caption', 'Caption') + text(p + '.transcript', 'Transcript or captions file address', { help: 'Every video gets captions and a transcript on the real site.' });
    } else if (b.type === 'pdf') {
      var pdfs = [['', 'Choose a PDF']].concat(S.library('pdf').map(function (it) { return [it.id, it.title + ' (' + S.originLabel(it).replace('&rsquo;', "'") + ')']; }));
      body = select(p + '.media', 'PDF from the library', pdfs, { re: true }) + text(p + '.label', 'Link words') + text(p + '.meta', 'Type and size', { help: 'Shown beside the name, e.g. PDF, 4 pages.' }) + text(p + '.note', 'Note under the link');
    } else if (b.type === 'button') {
      body = text(p + '.label', 'Button words', { help: 'Say where it goes: See Summer Camps, not Click here.' }) +
        select(p + '.href', 'Goes to', pages().concat(String(b.href || '').indexOf('http') === 0 ? [[b.href, b.href]] : []), {});
    } else if (b.type === 'quote') body = text(p + '.text', 'Quote', { area: true, rows: 2 }) + text(p + '.cite', 'Who said it');
    var dz = CAN ? '' : ' aria-disabled="true"';
    return '<li class="nw-block" data-nw-block="' + i + '"><div class="nw-block__head"><p class="nw-block__type">' + (i + 1) + '. ' + esc(BLOCK[b.type] || b.type) + '</p>' +
      '<div class="nw-block__acts"><button class="pn-iconbtn" type="button" data-nw-up="' + i + '" aria-label="Move block ' + (i + 1) + ' up"' + (i === 0 ? ' disabled' : dz) + '>' + icon('chevron', 'icon--16 nw-up') + '</button>' +
      '<button class="pn-iconbtn" type="button" data-nw-down="' + i + '" aria-label="Move block ' + (i + 1) + ' down"' + (i === n - 1 ? ' disabled' : dz) + '>' + icon('chevron', 'icon--16') + '</button>' +
      '<button class="pn-iconbtn" type="button" data-nw-del="' + i + '" aria-label="Remove block ' + (i + 1) + '"' + dz + '>' + icon('close', 'icon--16') + '</button></div></div>' + body + '</li>';
  }

  /* ---------- Search: guides, previews, the checklist ---------- */
  function seoTitle(d) { return (d.seo && d.seo.title) || d.title || ''; }
  function seoDesc(d) { return (d.seo && d.seo.description) || d.summary || ''; }
  function slugOf(d) { return d.slug || slugify(d.title) || 'new-post'; }
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 3).replace(/\s+\S*$/, '') + '...' : s; }
  function guide(len, lo, hi) { return len < lo ? 'Short: up to ' + hi + ' fits.' : len > hi ? 'Long: Google cuts it after about ' + hi + '.' : 'A good length.'; }
  function words(d) {
    var t = (d.summary || '') + ' ' + (d.blocks || []).map(function (b) { return b.type === 'text' || b.type === 'quote' || b.type === 'heading' ? b.text || '' : ''; }).join(' ');
    return (t.match(/[A-Za-z0-9$]+/g) || []).length;
  }
  function checklist(d) {
    var kp = String((d.seo && d.seo.keyphrase) || '').trim().toLowerCase(), out = [];
    var heads = (d.blocks || []).filter(function (b) { return b.type === 'heading'; });
    out.push([!!String(d.title || '').trim() && heads.every(function (h) { return String(h.text || '').trim() && h.text.trim().toLowerCase() !== String(d.title).trim().toLowerCase(); }),
      'One main heading', 'The title is the page&rsquo;s one main heading; block headings sit under it and do not repeat it.']);
    var bad = (d.blocks || []).some(function (b, i, a) { return b.type === 'heading' && (i === a.length - 1 || a[i + 1].type === 'heading'); });
    out.push([!bad, 'Headings in order', 'Each heading has words under it before the next one.']);
    var alts = [d.cover && d.cover.media ? d.cover.alt : 'x'];
    (d.blocks || []).forEach(function (b) { if (b.type === 'photo' && b.media) alts.push(b.alt); if (b.type === 'video' && b.poster) alts.push(b.alt); (b.items || []).forEach(function (it) { if (it.media) alts.push(it.alt); }); });
    var missing = alts.filter(function (a) { return !String(a || '').trim(); }).length;
    out.push([!missing, 'Alt text on every photo', missing ? missing + (missing === 1 ? ' photo has' : ' photos have') + ' no alt text.' : 'Every photo says what it shows.']);
    if (kp) {
      var first = ((d.blocks || []).filter(function (b) { return b.type === 'text'; })[0] || {}).text || '';
      var inT = seoTitle(d).toLowerCase().indexOf(kp) > -1, inO = (String(d.summary) + ' ' + first).toLowerCase().indexOf(kp) > -1, inA = slugOf(d).indexOf(slugify(kp)) > -1;
      out.push([inT && inO && inA, 'Key phrase in the title, the opening and the address', 'Title ' + (inT ? 'yes' : 'no') + ', opening ' + (inO ? 'yes' : 'no') + ', address ' + (inA ? 'yes' : 'no') + '.']);
    } else out.push([null, 'Key phrase', 'Optional: the words a parent would search for, e.g. summer camp.']);
    var toProg = !!d.program || (d.blocks || []).some(function (b) { return b.type === 'button' && /^@(?!news)/.test(b.href || ''); });
    out.push([toProg, 'A link to the program page', toProg ? 'It links to ' + esc(PROG[d.program] || 'a program page') + '.' : 'Choose the program it is about, or add a button to it.']);
    var w = words(d);
    out.push([w >= 80, 'Enough words', w + ' words. ' + (w >= 80 ? 'Enough to be found.' : 'Search engines pass over very short pages; about 80 or more helps.')]);
    var tl = (seoTitle(d) + SUFFIX).length, dl = seoDesc(d).length;
    out.push([tl >= 30 && tl <= 60, 'Search title length', tl + ' characters with ' + esc(SUFFIX.trim()) + '. ' + guide(tl, 30, 60)]);
    out.push([dl >= 70 && dl <= 155, 'Search description length', dl + ' characters. ' + guide(dl, 70, 155)]);
    return out;
  }
  function seoHtml(d) {
    var img = d.cover && d.cover.media ? S.item(d.cover.media) : null, t = seoTitle(d) + SUFFIX, ds = seoDesc(d);
    var serp = '<div class="nw-serp" aria-label="Google result preview"><p class="nw-serp__site"><span class="nw-serp__fav" aria-hidden="true"></span><span>Thornhill Park Tennis Club<br><span class="nw-serp__url">https://' + ORIGIN + ' &rsaquo; news &rsaquo; ' + esc(cut(slugOf(d), 34)) + '</span></span></p>' +
      '<p class="nw-serp__title">' + esc(cut(t, 62)) + '</p><p class="nw-serp__desc">' + (d.published ? esc(nice(d.published)) + ' &middot; ' : '') + esc(cut(ds, 158)) + '</p></div>';
    var card = function (w) {
      return '<div class="nw-share nw-share--' + w + '"><div class="nw-share__img">' + S.thumb(img, '191x100', d.cover && d.cover.focal) + '</div><div class="nw-share__body"><p class="nw-share__site">' + ORIGIN.replace('www.', '') + '</p>' +
        '<p class="nw-share__title">' + esc(cut(seoTitle(d), 80)) + '</p>' + (w === 'desk' ? '<p class="nw-share__desc">' + esc(cut(ds, 120)) + '</p>' : '') + '</div></div>';
    };
    var list = checklist(d).map(function (c) {
      return '<li class="nw-check' + (c[0] === true ? ' is-ok' : c[0] === false ? ' is-todo' : '') + '">' + icon(c[0] === true ? 'check' : 'alert', 'icon--16') + '<span><b>' + c[1] + '</b> ' + c[2] + '</span></li>';
    }).join('');
    return '<div class="nw-seo">' +
      text('seo.title', 'Search title', { lim: LIM.seoTitle, help: 'Shown as the blue line on Google. The site adds &ldquo;' + esc(SUFFIX.trim()) + '&rdquo;. Empty: the post title.' }) +
      text('seo.description', 'Search description', { area: true, rows: 2, lim: LIM.seoDesc, help: 'The line under it, and the share card&rsquo;s text. Empty: the summary.' }) +
      '<div class="pn-form__row pn-form__row--2">' + text('seo.keyphrase', 'Key phrase (optional)') + '<div class="pn-field nw-noindex">' + check('seo.noindex', 'Hide from search', 'For short notices such as a court closure.') + '</div></div>' +
      '<div class="nw-previews" data-nw-seoprev><div><p class="pn-label">Google result</p>' + serp + '</div>' +
      '<div><p class="pn-label">Share card, phone and desk</p><div class="nw-shares">' + card('phone') + card('desk') + '</div></div></div>' +
      '<div class="nw-checklist" data-nw-checklist><p class="pn-label">Search checklist <span class="pn-muted">Advice only: it never stops a post going out.</span></p><ul role="list">' + list + '</ul></div></div>';
  }

  /* ---------- The editor ---------- */
  function listHtml() {
    var q = st.q.trim().toLowerCase();
    var l = all().filter(function (p) { return !q || String(p.title).toLowerCase().indexOf(q) > -1 || (p.tags || []).join(' ').toLowerCase().indexOf(q) > -1; });
    var items = l.map(function (p) {
      var cur = p.id === st.sel, end = p.ends && p.ends < iso(new Date());
      return '<li><button type="button" class="ct-item nw-item" data-nw-pick="' + esc(p.id) + '" aria-current="' + cur + '"><span class="ct-item__title">' + esc(p.title || 'Untitled post') + '</span>' +
        '<span class="ct-item__meta"><span>' + esc(nice(p.publishAt || p.published) || 'No date') + '</span><span>' + esc(TOPIC[p.topic] || '') + '</span>' + stateChip(p) +
        (p.pinned ? '<span class="nw-flag">Pinned to Home</span>' : '') + (end ? '<span class="nw-flag">Closed</span>' : '') + (p.sample ? '<span class="nw-flag">Sample: every block</span>' : '') +
        (edited(p.id) ? '<span class="ct-edited">' + (BASE[p.id] ? 'Edited here' : 'Written here') + '</span>' : '') + '</span></button></li>';
    }).join('');
    if (st.sel === '__new') items = '<li><button type="button" class="ct-item nw-item" data-nw-pick="__new" aria-current="true"><span class="ct-item__title">' + esc(st.draft.title || 'New post') + '</span><span class="ct-item__meta">' + UI.chip('pending', 'Not saved yet') + '</span></button></li>' + items;
    return '<div class="ct-list nw-list"><div class="ct-colhead"><h3 class="pn-h3" id="nw-list-h">Posts, newest first</h3><span class="ct-colhead__note">' + all().length + ' posts</span></div>' +
      '<label class="pn-search nw-search"><span class="sr-only">Search posts</span>' + icon('search') + '<input class="pn-input" type="search" placeholder="Title or tag" data-nw-q value="' + esc(st.q) + '"></label>' +
      '<ul class="ct-list__items" role="list" aria-labelledby="nw-list-h">' + (items || '<li class="pn-empty"><p class="pn-empty__title">No post matches</p><p>Try another word.</p></li>') + '</ul></div>';
  }
  function historyHtml(d) {
    var r = store().posts[d.id], vs = (r && r.versions) || [];
    var rows = vs.slice().reverse().map(function (v, i) {
      return '<li><span class="ct-log__at">' + esc(D.fmt.stamp(v.at)) + '</span><span class="ct-log__by">' + esc(v.by) + '</span><span class="ct-log__text">' + esc(v.label) + '</span>' +
        '<button class="pn-btn pn-btn--text pn-btn--sm" type="button" data-nw-version="' + (vs.length - 1 - i) + '"' + (CAN ? '' : ' aria-disabled="true"') + '>Restore this version</button></li>';
    }).join('');
    return '<div class="nw-history"><p class="pn-label">Version history</p><p class="pn-help">' + lastEdit(d) + '</p>' +
      (rows ? '<ul class="ct-log__list nw-versions" role="list">' + rows + '</ul>' : '<p class="pn-muted">No earlier versions in this browser yet. Every save keeps the one before it.</p>') + '</div>';
  }
  function actions(d) {
    var s = stateOf(d), dz = CAN ? '' : ' aria-disabled="true" title="' + esc(WHO) + ' only"', isNew = st.sel === '__new';
    var b = [];
    if (s === 'published') b.push('<button class="pn-btn pn-btn--ink" type="button" data-nw-act="save"' + dz + '>Save changes</button>');
    else b.push('<button class="pn-btn pn-btn--quiet" type="button" data-nw-act="draft"' + dz + '>Save draft</button><button class="pn-btn pn-btn--ink" type="button" data-nw-act="publish"' + dz + '>' + (s === 'unpublished' ? 'Publish again' : 'Publish now') + '</button>');
    if (s === 'published' || s === 'scheduled') b.push('<button class="pn-btn pn-btn--danger" type="button" data-nw-act="unpublish"' + dz + '>Unpublish</button>');
    if (!isNew) b.push('<button class="pn-btn pn-btn--quiet" type="button" data-nw-act="duplicate"' + dz + '>Duplicate</button>');
    if (!isNew && BASE[d.id] && edited(d.id)) b.push('<button class="pn-btn pn-btn--text" type="button" data-nw-act="restore"' + dz + '>Restore the club&rsquo;s version</button>');
    if (!isNew && !BASE[d.id]) b.push('<button class="pn-btn pn-btn--text" type="button" data-nw-act="remove"' + dz + '>Remove post</button>');
    return '<div class="nw-publish"><div class="nw-publish__state"><p class="pn-label">Status</p><p>' + stateChip(d) + (st.dirty ? ' <span class="ct-dirty">Unsaved changes</span>' : '') + '</p></div>' +
      '<div class="pn-form__row pn-form__row--2"><div class="pn-field"><label class="pn-label" for="nw-schedule">Publish at a set time</label><div class="nw-row"><input class="pn-input" type="datetime-local" id="nw-schedule" data-nw-schedule value="' + esc(st.schedule) + '"' + ro() + '>' +
      '<button class="pn-btn pn-btn--quiet pn-btn--sm" type="button" data-nw-act="schedule"' + dz + '>Schedule</button></div>' + err('schedule') + '<p class="pn-help">It goes out at this time on its own; until then the site does not show it.</p></div>' +
      '<div class="pn-field nw-updated"><label class="pn-check"><input type="checkbox" data-nw-showupdated' + (st.showUpdated ? ' checked' : '') + dis() + '> Show an Updated date on the post</label><p class="pn-help">Only when ticked: the next save sets it to today' + (d.updated ? ' (now ' + esc(nice(d.updated)) + ')' : '') + '. Small fixes need no Updated date.</p></div></div>' +
      '<div class="nw-actions">' + b.join('') + '</div>' + historyHtml(d) + '</div>';
  }
  function editorHtml() {
    var d = st.draft;
    if (!d) return '<div class="ct-edit"><div class="pn-empty"><p class="pn-empty__title">Nothing selected</p><p>Pick a post from the list, or write a new one.</p></div></div>';
    var others = all().filter(function (p) { return p.id !== d.id; });
    var lock = CAN ? '' : '<p class="pn-note ct-edit__lock">' + icon('alert') + '<span>Read only for ' + esc(D.roleName()) + '. ' + esc(WHO) + ' writes and publishes news; you can read every post and preview it.</span></p>';
    var addr = st.sel === '__new' || !BASE[d.id] ? text('slug', 'Address', { help: 'news/<b>' + esc(slugOf(d)) + '</b>/ Empty: made from the title. On the real site an address changed after publishing redirects on its own.' }) :
      '<div class="pn-field"><p class="pn-label">Address</p><p class="nw-addr">' + ORIGIN + '/news/' + esc(d.slug) + '/</p><p class="pn-help">Fixed once published; the club&rsquo;s old address redirects here.</p></div>';
    var cover = '<div class="nw-cover">' + mediaPick('cover.media', 'cover.alt', 'Cover photo', '3x2', 'cover.focal') +
      select('cover.video', 'Or lead with a video (the cover photo is its poster)', [['', 'No video']].concat(S.library('video').map(function (it) { return [it.id, it.title]; })), {}) + '</div>';
    var rel = '<fieldset class="ct-fieldset nw-related"><legend class="pn-label">Related posts (up to 3)</legend><div class="nw-relgrid">' + others.map(function (p) {
      var on = (d.related || []).indexOf(p.id) > -1, full3 = !on && (d.related || []).length >= 3;
      return '<label class="pn-check"><input type="checkbox" data-nw-related="' + esc(p.id) + '"' + (on ? ' checked' : '') + (full3 || !CAN ? ' disabled' : '') + '> ' + esc(p.title || 'Untitled post') + '</label>';
    }).join('') + '</div></fieldset>';
    var blocks = '<ol class="nw-blocks" role="list">' + d.blocks.map(function (b, i) { return blockHtml(b, i, d.blocks.length); }).join('') + '</ol>' +
      '<div class="nw-addblock"><label class="pn-label" for="nw-addtype">Add a block</label><div class="nw-row"><select class="pn-select" id="nw-addtype" data-nw-addtype' + dis() + '>' + BLOCKS.map(function (b) { return '<option value="' + b[0] + '">' + b[1] + '</option>'; }).join('') + '</select>' +
      '<button class="pn-btn pn-btn--quiet" type="button" data-nw-add' + (CAN ? '' : ' aria-disabled="true"') + '>' + icon('plus', 'icon--16') + 'Add block</button></div></div>';
    var sec = function (id, title, inner, open) {
      return '<details class="nw-sec" data-nw-sec="' + id + '"' + (open !== false ? ' open' : '') + '><summary><h4 class="nw-sec__title">' + title + '</h4></summary><div class="nw-sec__body">' + inner + '</div></details>';
    };
    var closedNote = d.ends && d.ends < iso(new Date()) ? '<p class="pn-note">' + icon('clock') + '<span>The end date has passed: the post shows &ldquo;This registration is closed&rdquo; and is never counted as new.</span></p>' : '';
    return '<div class="ct-edit nw-edit"><div class="ct-colhead"><h3 class="pn-h3" id="nw-edit-h">' + (st.sel === '__new' ? 'New post' : 'Edit post') + '</h3><span class="ct-colhead__note">' + (d.sample ? 'The sample: every block' : esc(TOPIC[d.topic] || '')) + '</span>' +
      '<a class="inline-link ct-jump" href="#nw-prev">Jump to the preview</a></div>' + lock +
      '<form class="pn-form nw-form" data-nw-form novalidate aria-labelledby="nw-edit-h">' +
      sec('post', 'The post', text('title', 'Title', { req: true, lim: LIM.title }) + text('summary', 'Summary', { area: true, rows: 3, req: true, lim: LIM.summary, help: 'Under the title, on cards and in search when no description is set.' }) + addr +
        '<div class="pn-form__row pn-form__row--2">' + select('topic', 'Topic', TOPICS.map(function (t) { return [t.id, t.label]; })) + select('author', 'Author', AUTHORS.map(function (a) { return [a.id, a.name + (a.role ? ', ' + a.role : '')]; }), { help: 'A coach as author links to their entry on Our Coaches.' }) + '</div>' +
        '<div class="pn-field"><label class="pn-label" for="nw-tags">Tags</label><input class="pn-input" id="nw-tags" data-nw-tags value="' + esc((d.tags || []).join(', ')) + '"' + ro() + ' aria-describedby="nw-tags-help"><p class="pn-help" id="nw-tags-help">Separated by commas.</p></div>' +
        '<div class="pn-form__row pn-form__row--2">' + select('program', 'The program it is about', PROGRAMS) + text('ends', 'End date', { type: 'date', help: 'For a registration post: the day after, it shows closed.' }) + '</div>' + closedNote +
        check('pinned', 'Pin to Home', 'Pinned posts come first in Home&rsquo;s Latest news.') + rel) +
      sec('cover', 'Cover photo or video', cover) +
      sec('body', 'Body', blocks) +
      sec('seo', 'Search and sharing', seoHtml(d)) +
      sec('publish', 'Publish', actions(d)) +
      '</form></div>';
  }
  function previewHtml() {
    if (!st.draft) return '';
    var w = st.view === 'phone' ? 390 : 1280;
    return '<div class="ct-prev nw-prev" id="nw-prev" tabindex="-1" role="region" aria-labelledby="nw-prev-h"><div class="ct-prev__bar"><h3 class="pn-h3" id="nw-prev-h">Preview</h3>' +
      '<div class="pn-seg" role="group" aria-label="Preview on"><button type="button" data-nw-view="phone" aria-pressed="' + (st.view === 'phone') + '">Phone</button><button type="button" data-nw-view="desk" aria-pressed="' + (st.view === 'desk') + '">Desk</button></div>' +
      '<button class="pn-btn pn-btn--text pn-btn--sm" type="button" data-nw-refresh>Refresh</button></div>' +
      '<p class="ct-prev__scale" data-nw-scale></p><div class="ct-stage nw-stage" data-nw-stage><iframe class="nw-frame" title="Preview of the article page" data-nw-frame data-w="' + w + '" width="' + w + '" height="' + (st.view === 'phone' ? 844 : 900) + '" src="about:blank"></iframe></div>' +
      '<p class="ct-prev__foot">The site&rsquo;s own article page with this draft in it, drawn in this browser. Published or not, nothing leaves the browser. ' +
      '<a class="inline-link" href="' + esc(S.SITE + 'news/post/' + (S.HTTP ? '' : 'index.html') + '?preview=1') + '" target="_blank" rel="noopener">Open the preview in a new tab<span class="sr-only"> (opens in a new tab)</span></a></p></div>';
  }
  function fitStage() {
    var stage = $('[data-nw-stage]', el), fr = stage && $('[data-nw-frame]', stage); if (!fr) return;
    var W = +fr.getAttribute('data-w'), H = +fr.getAttribute('height'), avail = stage.clientWidth || W, s = Math.min(1, avail / W);
    fr.style.transform = s < 0.999 ? 'scale(' + s + ')' : ''; fr.style.transformOrigin = '0 0';
    stage.style.height = Math.ceil(H * s) + 'px';
    var lab = $('[data-nw-scale]', el); if (lab) lab.textContent = (st.view === 'phone' ? 'A 390 px phone' : 'A 1280 px desk window') + (s < 0.999 ? ', shown at ' + Math.round(s * 100) + '% of its true size' : ', at true size');
  }
  var ptimer = 0;
  function refreshPreview(now) {
    clearTimeout(ptimer);
    ptimer = setTimeout(function () {
      if (!st.draft) return;
      var d = clone(st.draft); d.slug = slugOf(d);
      if (st.showUpdated && !d.updated) d.updated = iso(new Date());
      d.show_updated = st.showUpdated;
      S.write('tptc-news-preview-v1', { at: new Date().toISOString(), post: d });
      var fr = $('[data-nw-frame]', el);
      if (fr) fr.src = S.SITE + 'news/post/' + (S.HTTP ? '' : 'index.html') + '?preview=1&t=' + Date.now();
    }, now ? 0 : 900);
  }
  function render(target) {
    el = target || el; if (!el) return;
    if (st.sel === null || (st.sel !== '__new' && !full(st.sel))) { pickFirst(); load(st.sel); }
    else if (!st.draft) load(st.sel);
    el.innerHTML = '<div class="ct-bench nw-bench">' + listHtml() + editorHtml() + previewHtml() + '</div>';
    fitStage(); refreshPreview(true);
  }
  function soft() {
    /* counters, previews and the checklist, without touching the field being typed in */
    var d = st.draft; if (!d || !el) return;
    $$('[data-nw-count]', el).forEach(function (c) { var v = getP(d, c.getAttribute('data-nw-count')), lim = +c.getAttribute('data-lim'); c.textContent = cnt(v, lim); c.classList.toggle('is-over', String(v || '').length > lim); });
    var box = $('[data-nw-sec="seo"] .nw-sec__body', el);
    if (box) {
      var tmp = document.createElement('div'); tmp.innerHTML = seoHtml(d);
      var a = $('[data-nw-seoprev]', box), b = $('[data-nw-seoprev]', tmp); if (a && b) a.innerHTML = b.innerHTML;
      var c2 = $('[data-nw-checklist]', box), e2 = $('[data-nw-checklist]', tmp); if (c2 && e2) c2.innerHTML = e2.innerHTML;
    }
    var it = st.sel === '__new' && $('[data-nw-pick="__new"] .ct-item__title', el); if (it) it.textContent = d.title || 'New post';
    var ds = $('.nw-publish__state p:last-child', el);
    if (ds && !$('.ct-dirty', ds)) ds.insertAdjacentHTML('beforeend', ' <span class="ct-dirty">Unsaved changes</span>');
    refreshPreview(false);
  }
  function rerender(focusSel) {
    var openSecs = $$('details.nw-sec', el).map(function (x) { return [x.getAttribute('data-nw-sec'), x.open]; });
    var scroll = window.scrollY;
    render();
    openSecs.forEach(function (o) { var x = $('details[data-nw-sec="' + o[0] + '"]', el); if (x) x.open = o[1]; });
    window.scrollTo(0, scroll);
    if (focusSel) { var f = $(focusSel, el); if (f) try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
  }

  /* ---------- Checks and saving ---------- */
  function validate(d, publishing) {
    var e = {};
    if (!String(d.title || '').trim()) e.title = 'Write a title';
    if (!String(d.summary || '').trim()) e.summary = 'Write a summary';
    if (d.cover && d.cover.media && !String(d.cover.alt || '').trim()) e['cover.alt'] = 'Write the alt text: every photo needs it';
    (d.blocks || []).forEach(function (b, i) {
      if ((b.type === 'photo' && b.media) || (b.type === 'video' && b.poster)) { if (!String(b.alt || '').trim()) e['blocks.' + i + '.alt'] = 'Write the alt text: every photo needs it'; }
      (b.items || []).forEach(function (it, k) { if (it.media && !String(it.alt || '').trim()) e['blocks.' + i + '.items.' + k + '.alt'] = 'Write the alt text: every photo needs it'; });
      if (b.type === 'button' && !String(b.label || '').trim()) e['blocks.' + i + '.label'] = 'Say where the button goes';
    });
    if (!BASE[d.id] && !/^[a-z0-9-]*$/.test(d.slug || '')) e.slug = 'Lower-case letters, numbers and hyphens only';
    var taken = all().some(function (p) { return p.id !== d.id && p.slug && p.slug === slugOf(d); });
    if (taken) e.slug = 'Another post has this address';
    return e;
  }
  function snapshot(p) { var s = clone(p); delete s.versions; delete s._new; return s; }
  function commit(state, extra, label) {
    if (!CAN) return deny();
    var d = st.draft; if (!d) return;
    st.errors = validate(d, state !== 'draft');
    var bad = Object.keys(st.errors);
    if (bad.length) {
      rerender('[aria-invalid="true"]');
      $$('details.nw-sec', el).forEach(function (x) { if ($('[aria-invalid="true"]', x)) x.open = true; });
      var f = $('[aria-invalid="true"]', el); if (f) f.focus();
      UI.toast('Fix the ' + (bad.length === 1 ? 'marked field' : bad.length + ' marked fields') + '. Nothing was saved.', { kind: 'warn' });
      return;
    }
    var n = store(), prev = n.posts[d.id] || null, base = BASE[d.id];
    var rec = snapshot(d);
    rec.slug = slugOf(d); rec.state = state; rec.status = state === 'published' ? 'published' : 'draft';
    Object.assign(rec, extra || {});
    if (st.showUpdated) { rec.show_updated = true; rec.updated = iso(new Date()); } else rec.show_updated = false;
    if (state === 'published' && !rec.publishAt && !base) rec.publishAt = new Date().toISOString();
    if (state === 'published' && !base) rec.published = iso(new Date(rec.publishAt));
    var versions = (prev && prev.versions) || [];
    var before = prev ? snapshot(Object.assign({}, base || {}, prev)) : base ? snapshot(base) : null;
    if (before) versions = versions.concat([{ at: prev && prev.editedAt || (base ? base.published + 'T12:00:00' : new Date().toISOString()), by: prev && prev.editedBy || 'The club', label: prev ? (prev.lastLabel || 'Saved') : 'As the club published it', snap: before }]).slice(-12);
    rec.versions = versions; rec.editedAt = new Date().toISOString(); rec.editedBy = D.roleName(); rec.lastLabel = label;
    n.posts[d.id] = rec;
    if (!S.saveNews(n)) return;
    D.log(label + ': \u201c' + String(rec.title).slice(0, 60) + '\u201d', { type: 'content', id: d.id });
    st.sel = d.id; load(d.id); rerender('[data-nw-pick="' + d.id + '"]');
    UI.toast(label + '. Saved in this browser; the site shows it here only.', { action: { label: 'Undo', run: function () {
      var n2 = store(); if (prev) n2.posts[d.id] = prev; else delete n2.posts[d.id]; S.saveNews(n2); if (!prev && !base) st.sel = null; load(st.sel === d.id && (prev || base) ? d.id : null); render();
    } } });
  }
  function act(a) {
    var d = st.draft; if (!d) return;
    if (!CAN) return deny();
    if (a === 'draft') return commit(stateOf(d) === 'unpublished' ? 'unpublished' : 'draft', { publishAt: BASE[d.id] ? d.publishAt || null : null }, 'Saved the draft');
    if (a === 'save') return commit(stateOf(d), {}, 'Saved the changes');
    if (a === 'publish') return commit('published', { publishAt: BASE[d.id] ? null : new Date().toISOString() }, 'Published the post');
    if (a === 'schedule') {
      var t = st.schedule ? new Date(st.schedule) : null;
      if (!t || isNaN(t) || t <= new Date()) { st.errors = { schedule: 'Choose a time after now' }; rerender('#nw-schedule'); UI.toast('Choose a time after now. Nothing was saved.', { kind: 'warn' }); return; }
      return commit('scheduled', { publishAt: t.toISOString(), published: iso(t) }, 'Scheduled the post for ' + D.fmt.stamp(t.toISOString()));
    }
    if (a === 'unpublish') {
      return UI.confirm({ title: 'Unpublish this post?', body: '<p>It comes off Home and the News page in this browser and its page says it is unpublished. You can publish it again.</p>', confirm: 'Unpublish', cancel: 'Keep it published', danger: true })
        .then(function (yes) { if (yes) commit('unpublished', { publishAt: BASE[d.id] ? null : d.publishAt }, 'Unpublished the post'); });
    }
    if (a === 'duplicate') {
      guard(function () {
        var c = clone(d), nid = 'post-' + Date.now().toString(36);
        c.id = nid; c.slug = ''; c.title = 'Copy of ' + (d.title || 'Untitled post'); c.state = 'draft'; c.status = 'draft'; c.pinned = false; c.publishAt = null;
        c.published = iso(new Date()); c.updated = null; c.show_updated = false; c.source = null; c.sample = false; delete c.versions; c._new = true;
        st.sel = '__new'; st.draft = c; st.dirty = true; st.errors = {}; st.showUpdated = false; st.schedule = '';
        rerender('#nw-title'); UI.toast('A copy, as a draft. Nothing is saved until you save it.');
      });
      return;
    }
    if (a === 'restore') {
      return UI.confirm({ title: 'Restore the club\u2019s version?', body: '<p>Every change to this post in this browser goes, and it reads as the club published it.</p>', confirm: 'Restore', cancel: 'Keep my changes' })
        .then(function (yes) { if (!yes) return; var n = store(), was = n.posts[d.id]; delete n.posts[d.id]; S.saveNews(n); D.log('Restored the club\u2019s version of a post', { type: 'content', id: d.id }); load(d.id); rerender();
          UI.toast('The club\u2019s version is back, in this browser.', { action: { label: 'Undo', run: function () { var n2 = store(); n2.posts[d.id] = was; S.saveNews(n2); load(d.id); render(); } } }); });
    }
    if (a === 'remove') {
      return UI.confirm({ title: 'Remove this post?', body: '<p>It was written in this browser and leaves it for good.</p>', confirm: 'Remove post', cancel: 'Keep it', danger: true })
        .then(function (yes) { if (!yes) return; var n = store(), was = n.posts[d.id]; delete n.posts[d.id]; S.saveNews(n); D.log('Removed a post written here', { type: 'content', id: d.id }); st.sel = null; render();
          UI.toast('Post removed.', { action: { label: 'Undo', run: function () { var n2 = store(); n2.posts[d.id] = was; S.saveNews(n2); st.sel = d.id; load(d.id); render(); } } }); });
    }
  }
  function deny() { UI.toast(WHO + ' only. You can read and preview every post.', { kind: 'warn' }); }
  function guard(fn) {
    if (!st.dirty || !CAN) return fn();
    UI.confirm({ title: 'Discard your changes?', body: '<p>The changes to this post are not saved.</p>', confirm: 'Discard changes', cancel: 'Keep editing' })
      .then(function (yes) { if (yes) { st.dirty = false; fn(); } });
  }
  function dirty() { if (!st.dirty) { st.dirty = true; } }

  /* ---------- Events ---------- */
  function wire(target) {
    if (target._nw) return; target._nw = true;
    target.addEventListener('input', function (e) {
      var t = e.target;
      if (t.matches('[data-nw-q]')) { st.q = t.value; var box = $('.nw-list', el); if (box) { var tmp = document.createElement('div'); tmp.innerHTML = listHtml(); box.replaceWith(tmp.firstChild); var q = $('[data-nw-q]', el); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } } return; }
      if (!st.draft || !CAN) return;
      if (t.matches('[data-nw]') && t.type !== 'checkbox' && t.tagName !== 'SELECT') {
        setP(st.draft, t.getAttribute('data-nw'), t.value); dirty();
        var k = t.getAttribute('data-nw');
        if (st.errors[k]) { delete st.errors[k]; t.removeAttribute('aria-invalid'); var er = document.getElementById('nw-err-' + k.replace(/\./g, '-')); if (er) er.remove(); }
        soft(); return;
      }
      if (t.matches('[data-nw-focal]')) {
        var path = t.getAttribute('data-nw-focal'), cur = String(getP(st.draft, path) || '50% 50%').split(/\s+/);
        if (t.getAttribute('data-axis') === 'x') cur[0] = t.value + '%'; else cur[1] = t.value + '%';
        setP(st.draft, path, cur[0] + ' ' + (cur[1] || '50%')); dirty();
        var lab = t.parentNode.querySelector('.pn-num'); if (lab) lab.textContent = t.value + '%';
        var pic = t.closest('.nw-media'), im = pic && $('.nw-media__pic img', pic); if (im) im.style.objectPosition = getP(st.draft, path);
        soft(); return;
      }
      if (t.matches('[data-nw-tags]')) { st.draft.tags = t.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); dirty(); soft(); return; }
      if (t.matches('[data-nw-schedule]')) { st.schedule = t.value; return; }
    });
    target.addEventListener('change', function (e) {
      var t = e.target;
      if (!st.draft || !CAN) return;
      if (t.matches('[data-nw]') && (t.type === 'checkbox' || t.tagName === 'SELECT')) {
        var k = t.getAttribute('data-nw');
        setP(st.draft, k, t.type === 'checkbox' ? t.checked : t.value); dirty();
        if (t.hasAttribute('data-nw-re')) {
          var it = t.value ? S.item(t.value) : null, altK = k.replace(/(media|poster)$/, 'alt');
          if (it && it.alt && altK !== k && !String(getP(st.draft, altK) || '').trim()) setP(st.draft, altK, it.alt);
          if (it && it.kind === 'pdf' && k.match(/\.media$/)) { var bp = k.replace(/\.media$/, ''); if (!getP(st.draft, bp + '.label')) setP(st.draft, bp + '.label', it.title); if (!getP(st.draft, bp + '.meta')) setP(st.draft, bp + '.meta', it.meta || 'PDF'); if (it.href) setP(st.draft, bp + '.href', it.href); }
          rerender('#' + t.id);
        } else soft();
        return;
      }
      if (t.matches('[data-nw-related]')) {
        var id = t.getAttribute('data-nw-related'), r = st.draft.related || [];
        st.draft.related = t.checked ? r.concat([id]).slice(0, 3) : r.filter(function (x) { return x !== id; }); dirty(); rerender('[data-nw-related="' + id + '"]'); return;
      }
      if (t.matches('[data-nw-showupdated]')) { st.showUpdated = t.checked; dirty(); soft(); }
    });
    target.addEventListener('click', function (e) {
      var t = e.target;
      var pk = t.closest('[data-nw-pick]'); if (pk) { var id = pk.getAttribute('data-nw-pick'); if (id !== st.sel) guard(function () { load(id); rerender('[data-nw-pick="' + id + '"]'); }); return; }
      var vw = t.closest('[data-nw-view]'); if (vw) { st.view = vw.getAttribute('data-nw-view'); try { localStorage.setItem('tptc-panel-content-preview', st.view); } catch (er) { /* no memory */ } var box = $('.nw-prev', el); if (box) { var tmp = document.createElement('div'); tmp.innerHTML = previewHtml(); box.replaceWith(tmp.firstChild); fitStage(); refreshPreview(true); } var b = $('[data-nw-view="' + st.view + '"]', el); if (b) b.focus(); return; }
      if (t.closest('[data-nw-refresh]')) { refreshPreview(true); return; }
      var a = t.closest('[data-nw-act]'); if (a) { e.preventDefault(); act(a.getAttribute('data-nw-act')); return; }
      var ver = t.closest('[data-nw-version]');
      if (ver) {
        if (!CAN) return deny();
        var r = store().posts[st.draft.id], v = r && r.versions && r.versions[+ver.getAttribute('data-nw-version')]; if (!v) return;
        st.draft = Object.assign(clone(v.snap), { id: st.draft.id }); st.showUpdated = !!st.draft.show_updated; dirty(); rerender();
        UI.toast('That version is in the editor. Save to keep it; nothing has changed yet.'); return;
      }
      if (!st.draft) return;
      var ctl = t.closest('[data-nw-add], [data-nw-up], [data-nw-down], [data-nw-del], [data-nw-gadd], [data-nw-gdel]');
      if (!ctl) return;
      if (!CAN) return deny();
      var B = st.draft.blocks;
      if (ctl.hasAttribute('data-nw-add')) { var ty = $('[data-nw-addtype]', el).value; B.push(ty === 'gallery' ? { type: ty, items: [{ media: '', alt: '' }, { media: '', alt: '' }] } : ty === 'button' ? { type: ty, label: '', href: st.draft.program ? '@' + st.draft.program : '@news', kind: 'ink' } : { type: ty }); dirty(); rerender('[data-nw-block="' + (B.length - 1) + '"] input, [data-nw-block="' + (B.length - 1) + '"] textarea, [data-nw-block="' + (B.length - 1) + '"] select'); return; }
      var i;
      if (ctl.hasAttribute('data-nw-up')) { i = +ctl.getAttribute('data-nw-up'); if (i > 0) { B.splice(i - 1, 0, B.splice(i, 1)[0]); dirty(); rerender('[data-nw-up="' + Math.max(0, i - 1) + '"]:not([disabled]), [data-nw-down="' + (i - 1) + '"]'); } return; }
      if (ctl.hasAttribute('data-nw-down')) { i = +ctl.getAttribute('data-nw-down'); if (i < B.length - 1) { B.splice(i + 1, 0, B.splice(i, 1)[0]); dirty(); rerender('[data-nw-down="' + (i + 1) + '"]:not([disabled]), [data-nw-up="' + (i + 1) + '"]'); } return; }
      if (ctl.hasAttribute('data-nw-del')) { i = +ctl.getAttribute('data-nw-del'); var gone = B.splice(i, 1)[0]; dirty(); rerender('[data-nw-add]'); UI.toast(BLOCK[gone.type] + ' block removed from the draft.', { action: { label: 'Undo', run: function () { B.splice(i, 0, gone); rerender(); } } }); return; }
      if (ctl.hasAttribute('data-nw-gadd')) { i = +ctl.getAttribute('data-nw-gadd'); (B[i].items = B[i].items || []).push({ media: '', alt: '' }); dirty(); rerender('[data-nw-gadd="' + i + '"]'); return; }
      if (ctl.hasAttribute('data-nw-gdel')) { var gk = ctl.getAttribute('data-nw-gdel').split(':'); B[+gk[0]].items.splice(+gk[1], 1); dirty(); rerender('[data-nw-gadd="' + gk[0] + '"]'); return; }
    });
    target.addEventListener('submit', function (e) { if (e.target.closest('[data-nw-form]')) e.preventDefault(); });
    window.addEventListener('resize', fitStage);
  }
  window.addEventListener('beforeunload', function (e) { if (st.dirty && CAN) { e.preventDefault(); e.returnValue = ''; } });

  window.CTNews = {
    render: function (target) { wire(target); render(target); },
    isDirty: function () { return st.dirty && CAN; },
    discard: function () { st.dirty = false; if (st.sel) load(st.sel === '__new' ? null : st.sel); },
    startNew: function () { load('__new'); st.dirty = false; if (el) { rerender('#nw-title'); } },
    open: function (id) { if (window.CTContent) window.CTContent.tab('news', function () { if (id && full(id)) { load(id); rerender('[data-nw-pick="' + id + '"]'); } }); },
    stats: function () {
      var l = all(), now = new Date();
      return { total: l.length, live: l.filter(liveNow).length, drafts: l.filter(function (p) { return stateOf(p) === 'draft' || stateOf(p) === 'unpublished'; }).length,
        scheduled: l.filter(function (p) { return stateOf(p) === 'scheduled' && new Date(p.publishAt) > now; }).length, edited: Object.keys(store().posts).length };
    },
    reset: function () { st.sel = null; st.draft = null; st.dirty = false; }
  };
})();
