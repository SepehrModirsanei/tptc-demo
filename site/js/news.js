/* Club news in the browser (N1a, 24 Oct 2026). Loaded on every page after js/news-data.js.

   1. New since your last visit. This browser keeps its own record in localStorage 'tptc-news-seen-v1'
      ({ v: 1, baseline, opened: [post ids] }). The first visit only sets the baseline, so nothing is
      ever marked on a first visit. Afterwards a post counts as new when it was published after the
      baseline, this visitor has not opened it, and it is not closed (its end date has passed). The
      count sits beside News in the menus and a quiet New mark on its cards; opening the article
      clears it. No pop-ups, no permission prompts. Without JavaScript or storage: no count, no harm.
   2. The staff panel demo's edits, in this browser only. The panel's News editor keeps changed and
      new posts in localStorage 'tptc-news-v1' ({ v: 1, savedAt, posts: { id: record }, deleted: [] });
      when that record exists the Home band, the News page and the article are drawn from it. A post
      written in the panel opens at news/post/?id=<id>; the panel's preview at news/post/?preview=1
      reads 'tptc-news-preview-v1'. A record's state is draft, scheduled (publishAt), published or
      unpublished; only published posts, and scheduled ones whose time has come, are shown.
   3. The News page: the topic filter and pages of TPTC_NEWS.perPage, kept in the address
      (?topic=camps&page=2). Without JavaScript every post is listed on one page.
   4. Closed banners and Closed marks, read against today's date in this browser.
   5. The article's video: plays the film the panel chose for the slot (js/media.js), or says that
      there is no film yet.
   Facts never come from here: every word is the post's own, from content/posts.json or the panel. */
(function () {
  'use strict';
  var N = window.TPTC_NEWS;
  if (!N) return;
  var doc = document, html = doc.documentElement;
  var ROOT = html.getAttribute('data-root') || '';
  var ASSETS = ROOT + '../assets/';
  var HTTP = /^https?:$/.test(location.protocol);
  var NOW = new Date();
  var TODAY = iso(NOW);
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TOPIC = {}; N.topics.forEach(function (t) { TOPIC[t.id] = t.label; });
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* Visible copy: escaped, apostrophes typographic, as the build sets them */
  function words(s) { return esc(s).replace(/(\w)&#39;(\w)/g, '$1&rsquo;$2').replace(/(\w)&#39;(?=[\s.,;:!?)]|$)/g, '$1&rsquo;'); }
  function day(s) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function nice(s) { var d = day(s); return d ? MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() : ''; }
  /* W2a: a date set like a score (build.py score_date): the month over the day over the year */
  function score(s, cls) {
    var d = day(s); if (!d) return '';
    return '<time class="' + cls + '" datetime="' + esc(String(s).slice(0, 10)) + '"><span class="ndate__m">' + MON[d.getMonth()] + '</span> ' +
      '<span class="ndate__d">' + d.getDate() + '</span><span class="sr-only">,</span> <span class="ndate__y">' + d.getFullYear() + '</span></time>';
  }
  function page(pid, frag) {
    var p = N.pages[pid]; if (!p) return '#';
    return ROOT + p[1] + (HTTP ? '' : 'index.html') + (frag ? '#' + frag : '');
  }
  function href(h) { return h && h.charAt(0) === '@' ? page(h.slice(1).split('#')[0], h.split('#')[1]) : h; }

  /* ---------- The posts: the club's, with this browser's panel edits over them ---------- */
  var store = read('tptc-news-v1');
  if (!store || store.v !== 1) store = null;
  var edits = (store && store.posts) || {}, deleted = (store && store.deleted) || [];
  var BASE = {}; N.posts.forEach(function (p) { BASE[p.id] = p; });
  function stateOf(p) { return p.state || (p.status === 'published' ? 'published' : 'draft'); }
  function liveAt(p) {
    if (p.publishAt) return new Date(p.publishAt);
    var d = day(p.published); return d || new Date(0);
  }
  function shown(p) {
    var s = stateOf(p);
    return s === 'published' ? liveAt(p) <= NOW : s === 'scheduled' ? !!p.publishAt && new Date(p.publishAt) <= NOW : false;
  }
  function closed(p) { return !!p.ends && p.ends < TODAY; }
  var ALL = N.posts.filter(function (p) { return deleted.indexOf(p.id) < 0; }).map(function (p) { return edits[p.id] ? Object.assign({}, p, edits[p.id], { _edited: true }) : p; });
  Object.keys(edits).forEach(function (id) { if (!BASE[id] && deleted.indexOf(id) < 0) ALL.push(Object.assign({ _added: true }, edits[id])); });
  function order(list) {
    return list.slice().sort(function (a, b) {
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || liveAt(b) - liveAt(a);
    });
  }
  var LIVE = order(ALL.filter(shown));
  function postHref(p) {
    if (BASE[p.id] && !p._added) return ROOT + 'news/' + BASE[p.id].slug + '/' + (HTTP ? '' : 'index.html');
    return ROOT + 'news/post/' + (HTTP ? '' : 'index.html') + '?id=' + encodeURIComponent(p.id);
  }

  /* ---------- 1. New since your last visit ---------- */
  var SEEN = 'tptc-news-seen-v1';
  var seen = read(SEEN), first = false;
  if (!seen || seen.v !== 1 || !seen.baseline) { seen = { v: 1, baseline: NOW.toISOString(), opened: [] }; first = true; }
  var art = $('[data-article]');
  var dyn = $('[data-article-dynamic]');
  var params = {}; location.search.replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); });
  var openedId = art ? art.getAttribute('data-article') : dyn && params.id && !params.preview ? params.id : null;
  if (openedId && seen.opened.indexOf(openedId) < 0) seen.opened.push(openedId);
  if (first || openedId) write(SEEN, seen);
  var base = new Date(seen.baseline);
  var NEW = {};
  if (!first) LIVE.forEach(function (p) { if (!closed(p) && liveAt(p) > base && seen.opened.indexOf(p.id) < 0) NEW[p.id] = true; });
  var count = Object.keys(NEW).length;
  $$('[data-news-count]').forEach(function (el) {
    if (count) { el.innerHTML = '<span class="ncount__n">' + count + '</span><span class="sr-only"> new</span>'; el.hidden = false; }
    else { el.innerHTML = ''; el.hidden = true; }
  });

  /* ---------- Cards (the same markup build.py writes) ---------- */
  var TAGMARK = '<svg class="frame__tag-mark" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M0.5 0.5h9v9h-9zM5 0.5v9"/></svg>';
  var uploads = (window.TPTCMedia && window.TPTCMedia.uploads) || {};
  function mediaOf(id) {
    if (uploads[id] && uploads[id].src) return { src: uploads[id].src, alt: uploads[id].alt || '', club: false, upload: true };
    var m = N.media[id];
    return m ? { src: ASSETS + m.file, alt: m.alt, club: m.club, upload: false, title: m.title } : null;
  }
  function frame(slot, mediaId, ratio, alt, focal, cls) {
    var r = (ratio || '3x2').split('x'), m = mediaOf(mediaId);
    var style = '--ar:' + r[0] + ' / ' + r[1] + ';' + (focal && focal !== '50% 50%' ? '--pos:' + esc(focal) + ';' : '');
    if (!m) {
      return '<figure class="frame' + (cls ? ' ' + cls : '') + '" data-slot="' + esc(slot) + '" style="' + style + '"><div class="frame__box"><div class="frame__inner"><div class="frame__media"><div class="frame__drift"></div>' +
        '<div class="ph"><p class="ph__label"><span class="ph__id">' + esc(slot) + '</span><span class="ph__desc">A photograph for this post</span></p></div></div></div></div></figure>';
    }
    var tag = m.club ? '' : '<span class="frame__tag">' + TAGMARK + (m.upload ? 'From the staff panel (demo)' : 'Placeholder image') + '</span>';
    return '<figure class="frame has-img' + (m.club ? ' frame--photo' : '') + (cls ? ' ' + cls : '') + '"' + (m.club ? ' data-photo="club"' : '') + ' data-slot="' + esc(slot) + '" data-media="' + esc(mediaId) + '" style="' + style + '">' +
      '<div class="frame__box"><div class="frame__inner"><div class="frame__media"><div class="frame__drift"><img class="frame__img is-loaded" src="' + esc(m.src) + '" alt="' + esc(alt != null ? alt : m.alt) + '" loading="lazy" decoding="async"></div></div></div></div>' + tag + '</figure>';
  }
  /* The same story markup build.py news_card writes (W2a): photograph, score cell, then the words */
  function card(p, where, pin, lead) {
    var c = p.cover || {};
    return '<li class="ncard' + (lead ? ' ncard--lead' : '') + '" data-news-card="' + esc(p.id) + '" data-topic="' + esc(p.topic) + '" data-published="' + esc(p.published) + '" data-ends="' + esc(p.ends || '') + '">' +
      frame('news-' + p.id + '-cover', c.media, '3x2', c.alt, c.focal) + '<div class="ncard__body">' + score(p.published, 'ndate ncard__date') +
      '<div class="ncard__text"><p class="ncard__kicker"><span class="ncard__topic">' + esc(TOPIC[p.topic] || '') + '</span>' +
      '<span class="ncard__flag ncard__flag--new" data-news-new hidden>New</span>' + (pin && p.pinned ? '<span class="ncard__flag ncard__flag--pin">Pinned</span>' : '') +
      '<span class="ncard__flag ncard__flag--closed" data-news-closed' + (closed(p) ? '' : ' hidden') + '>Closed</span></p>' +
      '<h3 class="ncard__title" id="nc-' + where + '-' + esc(p.id) + '"><a class="ncard__link" href="' + esc(postHref(p)) + '">' + words(p.title || 'Untitled post') + '</a></h3>' +
      '<p class="ncard__sum">' + words(p.summary || '') + '</p></div></div></li>';
  }
  var changed = !!store && (Object.keys(edits).length > 0 || deleted.length > 0);
  var band = $('[data-news-band] [data-news-cards]');
  if (band && changed) band.innerHTML = LIVE.slice(0, 3).map(function (p, i) { return card(p, 'band', true, i === 0); }).join('');
  $$('[data-news-band]').forEach(function (b) { b.hidden = LIVE.length === 0; });
  /* The Home strip under the hero: the same three newest posts, one line each (the New marks are set below). */
  function stripItem(p) {
    return '<li class="nstrip__item" data-news-card="' + esc(p.id) + '" data-published="' + esc(p.published) + '" data-ends="' + esc(p.ends || '') + '">' +
      score(p.published, 'ndate nstrip__date') +
      '<p class="nstrip__text"><span class="ncard__flag ncard__flag--new" data-news-new hidden>New</span>' +
      '<span class="ncard__flag ncard__flag--closed" data-news-closed' + (closed(p) ? '' : ' hidden') + '>Closed</span>' +
      '<a class="nstrip__link" href="' + esc(postHref(p)) + '">' + words(p.title || 'Untitled post') + '</a></p></li>';
  }
  var strip = $('[data-news-strip-items]');
  if (strip && changed) strip.innerHTML = LIVE.slice(0, 3).map(stripItem).join('');
  $$('[data-news-strip]').forEach(function (s) { s.hidden = LIVE.length === 0; });

  /* ---------- 3. The News page: topics and pages ---------- */
  var list = $('[data-news-list]');
  if (list) {
    var ul = $('[data-news-cards]', list), bar = $('[data-news-filters]', list), pager = $('[data-news-pager]', list);
    var status = $('[data-news-status]', list), empty = $('[data-news-empty]', list);
    var per = +list.getAttribute('data-per-page') || N.perPage || 6;
    if (changed) ul.innerHTML = LIVE.map(function (p, i) { return card(p, 'list', true, i === 0); }).join('');
    /* W2a: the first story shown on page one is the lead (photograph, the net, its words); its photo asks for the lead's size */
    var leadSizes = ul.getAttribute('data-lead-sizes');
    var setLead = function (c, on) {
      c.classList.toggle('ncard--lead', on);
      var img = $('.frame__img', c);
      if (img && img.hasAttribute('srcset') && leadSizes) {
        if (!img.hasAttribute('data-row-sizes')) img.setAttribute('data-row-sizes', img.getAttribute('sizes') || '');
        img.setAttribute('sizes', on ? leadSizes : img.getAttribute('data-row-sizes'));
      }
    };
    var counts = { '': LIVE.length };
    LIVE.forEach(function (p) { counts[p.topic] = (counts[p.topic] || 0) + 1; });
    $$('[data-news-topic]', bar).forEach(function (b) { var n = $('.num', b); if (n) n.textContent = counts[b.getAttribute('data-news-topic')] || 0; });
    bar.hidden = false;
    var st = { topic: TOPIC[params.topic] ? params.topic : '', page: Math.max(1, parseInt(params.page, 10) || 1) };
    var draw = function (focusList) {
      var cards = $$('.ncard', ul), match = cards.filter(function (c) { return !st.topic || c.getAttribute('data-topic') === st.topic; });
      var pages = Math.max(1, Math.ceil(match.length / per));
      st.page = Math.min(st.page, pages);
      cards.forEach(function (c) { c.hidden = true; });
      var on = match.slice((st.page - 1) * per, st.page * per);
      on.forEach(function (c) { c.hidden = false; });
      cards.forEach(function (c) { setLead(c, st.page === 1 && c === on[0]); });
      $$('[data-news-topic]', bar).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-news-topic') === st.topic)); });
      empty.hidden = match.length > 0;
      var a = (st.page - 1) * per + 1, z = Math.min(match.length, st.page * per);
      status.textContent = match.length ? (match.length === 1 ? '1 post' : (pages > 1 ? 'Posts ' + a + ' to ' + z + ' of ' + match.length : match.length + ' posts')) + (st.topic ? ' in ' + TOPIC[st.topic] : '') : '';
      if (pages > 1) {
        var h = '<ul class="npager__list" role="list">';
        h += '<li><button type="button" class="npager__btn" data-news-page="' + (st.page - 1) + '"' + (st.page === 1 ? ' disabled' : '') + '>Previous<span class="sr-only"> page</span></button></li>';
        for (var i = 1; i <= pages; i++) h += '<li><button type="button" class="npager__btn npager__num" data-news-page="' + i + '"' + (i === st.page ? ' aria-current="page"' : '') + '><span class="sr-only">Page </span>' + i + '</button></li>';
        h += '<li><button type="button" class="npager__btn" data-news-page="' + (st.page + 1) + '"' + (st.page === pages ? ' disabled' : '') + '>Next<span class="sr-only"> page</span></button></li></ul>';
        pager.innerHTML = h; pager.hidden = false;
      } else { pager.innerHTML = ''; pager.hidden = true; }
      try {
        var q = (st.topic ? 'topic=' + st.topic : '') + (st.page > 1 ? (st.topic ? '&' : '') + 'page=' + st.page : '');
        history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
      } catch (e) { /* a file address may refuse: the view still changes */ }
      if (focusList) { ul.setAttribute('tabindex', '-1'); ul.focus({ preventScroll: true }); list.scrollIntoView({ block: 'start' }); }
    };
    bar.addEventListener('click', function (e) { var b = e.target.closest('[data-news-topic]'); if (!b) return; st.topic = b.getAttribute('data-news-topic'); st.page = 1; draw(false); });
    pager.addEventListener('click', function (e) { var b = e.target.closest('[data-news-page]'); if (!b || b.disabled) return; st.page = +b.getAttribute('data-news-page'); draw(true); });
    draw(false);
  }

  /* ---------- 2. An article drawn from a record (panel edits, panel posts, the preview) ---------- */
  function text(t) {
    return String(t || '').split(/\n\s*\n/).filter(function (x) { return x.trim(); }).map(function (para) {
      var lines = para.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var mark = /^(\d+[.)]|-)\s+/;
      if (lines.every(function (l) { return mark.test(l); })) {
        var plain = lines.map(function (l) { return l.replace(mark, ''); }), pair = /^(.+?):\s+(.+)$/;
        if (/^\d/.test(lines[0])) return '<ol class="nart__list nart__list--steps">' + plain.map(function (l) { return '<li>' + inline(l) + '</li>'; }).join('') + '</ol>';
        if (plain.every(function (l) { return pair.test(l); })) return '<ul class="nart__list nart__list--pairs">' + plain.map(function (l) { var m = pair.exec(l); return '<li><span class="nart__k">' + inline(m[1]) + '</span> <span class="nart__v">' + inline(m[2]) + '</span></li>'; }).join('') + '</ul>';
        return '<ul class="nart__list">' + plain.map(function (l) { return '<li>' + inline(l) + '</li>'; }).join('') + '</ul>';
      }
      return '<p>' + inline(lines.join(' ')) + '</p>';
    }).join('');
  }
  function inline(t) { return words(t).replace(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+\w)/g, '<a class="inline-link" href="mailto:$1">$1</a>'); }
  function slug(t) { return (String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)) || 'section'; }
  function btnHtml(label, h, kind) {
    var ext = /^https?:/.test(h || '');
    return '<a class="btn btn--' + esc(kind || 'ink') + '" href="' + esc(href(h)) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '><span class="btn__fill" aria-hidden="true"></span>' +
      '<span class="btn__label"><span>' + words(label) + '</span><span aria-hidden="true">' + words(label) + '</span></span>' + (ext ? '<span class="sr-only"> (opens in a new tab)</span>' : '') + '</a>';
  }
  function icon(n, cls) { return '<svg class="' + (cls || 'icon') + '" aria-hidden="true" focusable="false"><use href="#i-' + n + '"/></svg>'; }
  function linkHtml(label, h, cls) { return '<a class="link' + (cls ? ' ' + cls : '') + '" href="' + esc(href(h)) + '"><span class="link__text">' + words(label) + '</span>' + icon('arrow') + '</a>'; }
  function block(p, b, n) {
    var id = p.id;
    if (b.type === 'heading') return '<h2 class="nart__h2" id="' + slug(b.text) + '">' + words(b.text) + '</h2>';
    if (b.type === 'text') return text(b.text);
    if (b.type === 'photo') return frame('news-' + id + '-photo-' + n, b.media, b.ratio || '3x2', b.alt, b.focal, 'nart__photo').replace('</figure>', b.caption ? '<figcaption class="frame__cap"><span>' + words(b.caption) + '</span></figcaption></figure>' : '</figure>');
    if (b.type === 'gallery') {
      var items = b.items || [];
      return '<figure class="ngallery" style="--n:' + items.length + '"><ul class="ngallery__grid" role="list">' + items.map(function (it, k) { return '<li>' + frame('news-' + id + '-gallery-' + n + '-' + (k + 1), it.media, '4x3', it.alt, it.focal) + '</li>'; }).join('') + '</ul>' +
        (b.caption ? '<figcaption class="ngallery__cap">' + words(b.caption) + '</figcaption>' : '') + '</figure>';
    }
    if (b.type === 'video') {
      return '<figure class="nvideo" data-slot="news-' + esc(id) + '-video-' + n + '" data-kind="video" data-video-src="' + esc(b.src || '') + '"' + (b.media ? ' data-video-media="' + esc(b.media) + '"' : '') + '><div class="nvideo__stage">' +
        frame('news-' + id + '-video-' + n + '-poster', b.poster, '16x9', b.alt, null, 'nvideo__poster') +
        '<button class="nvideo__play" type="button" data-video-play aria-describedby="nv-' + esc(id) + '-' + n + '">' + icon('play', 'icon nvideo__icon') + '<span class="nvideo__label">Play the film</span></button>' +
        '<p class="nvideo__note" id="nv-' + esc(id) + '-' + n + '" data-video-note>No film yet: the club supplies it. Staff add it in the panel&rsquo;s Photos and media.</p></div>' +
        '<figcaption class="frame__cap"><em>' + words(b.title || 'Video') + '</em><span>' + words(b.caption || '') + '</span></figcaption></figure>';
    }
    if (b.type === 'pdf') {
      var d = (b.media && N.pdfs[b.media]) || {};
      var up = b.media && uploads[b.media];
      var h = b.href || d.href || '#', label = b.label || d.title || (up && up.name) || 'Document', meta = b.meta || d.meta || 'PDF';
      return '<p class="nart__doc"><a class="doclink" href="' + esc(h) + '"' + (up ? ' data-pdf-media="' + esc(b.media) + '"' : '') + ' target="_blank" rel="noopener"><span class="link__text">' + words(label) + '</span><span class="doclink__meta">' + words(meta) + '</span>' + icon('arrow-external', 'icon ext-mark') + '<span class="sr-only"> (opens in a new tab)</span></a>' +
        (b.note ? '<span class="nart__docnote small">' + words(b.note) + '</span>' : '') + '</p>';
    }
    if (b.type === 'button') return '<p class="nart__btn">' + btnHtml(b.label || 'Read more', b.href || '@news', b.kind) + '</p>';
    if (b.type === 'quote') return '<figure class="nquote"><blockquote><p>' + words(b.text) + '</p></blockquote>' + (b.cite ? '<figcaption>' + words(b.cite) + '</figcaption>' : '') + '</figure>';
    return '';
  }
  function author(p) {
    var a = (N.authors[p.author] || N.authors.club);
    return a.kind === 'coach' ? '<a class="inline-link" href="' + esc(page('coaches', a.anchor)) + '">' + words(a.name) + '</a>, ' + words(a.role || '') : words(a.name);
  }
  function articleHtml(p, opts) {
    var who = author(p), c = p.cover || {}, prog = p.program && N.pages[p.program];
    /* W2a: the scorecard line and the closed state, as build.py article_meta and closed_banner write them */
    var upd = p.updated && p.show_updated ? '<div class="nart__cell nart__cell--updated"><dt>Updated</dt><dd><time datetime="' + esc(p.updated) + '">' + nice(p.updated) + '</time></dd></div>' : '';
    var banner = p.ends ? '<div class="nclosed" data-news-closed-banner data-ends="' + esc(p.ends) + '"' + (closed(p) ? '' : ' hidden') + '>' +
      '<p class="nclosed__text"><span class="nclosed__mark">Registration closed</span> <span class="nclosed__when">It closed on <time datetime="' + esc(p.ends) + '">' + nice(p.ends) + '</time>.</span></p>' +
      (prog ? linkHtml('See ' + prog[0], '@' + p.program, 'nclosed__next') : '') + '</div>' : '';
    var note = opts.note ? '<p class="nart__demo notice">' + icon('alert') + '<span>' + opts.note + '</span></p>' : '';
    var head = '<p class="nart__kicker"><a href="' + esc(page('news')) + '?topic=' + esc(p.topic) + '">' + esc(TOPIC[p.topic] || 'News') + '</a></p>' +
      '<h1 class="nart__title" id="page-title">' + words(p.title || 'Untitled post') + '</h1>' +
      (p.summary ? '<p class="lede nart__lede">' + words(p.summary) + '</p>' : '') +
      '<div class="nart__facts"><dl class="nart__meta"><div class="nart__cell"><dt>Posted</dt><dd><time datetime="' + esc(p.published || '') + '">' + (nice(p.published) || 'Not yet') + '</time></dd></div>' + upd +
      '<div class="nart__cell nart__cell--by"><dt>Written by</dt><dd>' + who + '</dd></div></dl>' + banner + '</div>' + note;
    var aside = (prog ? '<div class="nart__about"><p class="nart__label">This post is about</p><a class="nabout" href="' + esc(page(p.program)) + '"><span class="nabout__name">' + words(prog[0]) + '</span>' + icon('arrow') + '</a></div>' : '') +
      ((p.tags || []).length ? '<div class="nart__tags"><p class="nart__label">Tags</p><ul class="ntags" role="list">' + p.tags.map(function (t) { return '<li>' + words(t) + '</li>'; }).join('') + '</ul></div>' : '');
    return { head: head, cover: frame('news-' + p.id + '-cover', c.media, '16x9', c.alt, c.focal),
      body: (p.blocks || []).map(function (b, i) { return block(p, b, i + 1); }).join(''), aside: aside };
  }
  function fillArticle(el, p, opts) {
    var a = articleHtml(p, opts);
    var headin = $('.nart__headin', el), crumbs = headin ? $('.crumbs', headin) : null;
    if (crumbs) { var last = $('[aria-current="page"]', crumbs); if (last) last.textContent = p.title || 'Untitled post'; }
    headin.innerHTML = (crumbs ? crumbs.outerHTML : '') + a.head;
    var cover = $('.nart__cover', el), grid = $('.nart__grid', el);
    if (!cover) { cover = doc.createElement('div'); cover.className = 'wrap nart__cover'; el.appendChild(cover); }
    if (!grid) { grid = doc.createElement('div'); grid.className = 'wrap nart__grid'; el.appendChild(grid); }
    cover.innerHTML = a.cover;
    grid.innerHTML = '<div class="nart__main" data-news-body>' + a.body + '</div><aside class="nart__aside" aria-label="About this post">' + a.aside + '</aside>';
    if (p.title) doc.title = p.title + ' | TPTC';
  }
  if (art) {
    var aid = art.getAttribute('data-article'), rec = edits[aid];
    if (deleted.indexOf(aid) > -1) {
      var hd = $('.nart__headin', art);
      if (hd) hd.insertAdjacentHTML('beforeend', '<p class="nart__demo notice">' + icon('alert') + '<span>Removed in the staff panel demo, in this browser only. The published post is shown.</span></p>');
    } else if (rec) {
      var full = Object.assign({}, BASE[aid], rec);
      if (shown(full)) fillArticle(art, full, { note: 'Edited in the staff panel demo. Shown in this browser only; the published post is unchanged.' });
      else {
        var hd2 = $('.nart__headin', art);
        if (hd2) hd2.insertAdjacentHTML('beforeend', '<p class="nart__demo notice">' + icon('alert') + '<span>' + (stateOf(full) === 'scheduled' ? 'Scheduled' : 'Unpublished') + ' in the staff panel demo, in this browser only. The published post is shown.</span></p>');
      }
    }
  }
  if (dyn) {
    var pv = params.preview ? read('tptc-news-preview-v1') : null;
    var dp = pv && pv.post ? pv.post : params.id ? (ALL.filter(function (x) { return x.id === params.id; })[0] || null) : null;
    if (dp && (pv || shown(dp))) {
      fillArticle(dyn, dp, { note: pv ? 'Preview from the staff panel demo: not published.' : 'Written in the staff panel demo. Shown in this browser only; the club has not published it.' });
      var r = (dp.related || []).map(function (id) { return LIVE.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean).slice(0, 3);
      if (r.length) dyn.insertAdjacentHTML('afterend', '<section class="section section--chalk nrelated" aria-labelledby="nrel-title"><div class="wrap"><div class="nband__head"><h2 class="h2" id="nrel-title">Related news</h2>' + linkHtml('All news', '@news') + '</div><ul class="ncards ncards--related" role="list">' + r.map(function (x) { return card(x, 'rel'); }).join('') + '</ul></div></section>');
    } else if (dp) {
      var hd3 = $('.nart__headin', dyn);
      if (hd3) hd3.insertAdjacentHTML('beforeend', '<p class="nart__demo notice">' + icon('alert') + '<span>This post is not published in this browser.</span></p>');
    }
  }

  /* ---------- New marks, Closed marks and banners on whatever is now on the page ---------- */
  $$('[data-news-card]').forEach(function (c) {
    var id = c.getAttribute('data-news-card'), ends = c.getAttribute('data-ends');
    var nm = $('[data-news-new]', c); if (nm) nm.hidden = !NEW[id];
    var cm = $('[data-news-closed]', c); if (cm) cm.hidden = !(ends && ends < TODAY);
  });
  $$('[data-news-closed-banner]').forEach(function (b) { var e = b.getAttribute('data-ends'); b.hidden = !(e && e < TODAY); });

  /* PDFs uploaded in the panel live in IndexedDB: open them from there */
  $$('a[data-pdf-media]').forEach(function (a) {
    if (window.TPTCMedia) window.TPTCMedia.blobUrl(a.getAttribute('data-pdf-media'), function (u) { if (u) a.href = u; });
  });

  /* ---------- 5. The article's film ---------- */
  doc.addEventListener('click', function (e) {
    var b = e.target.closest('[data-video-play]'); if (!b) return;
    var fig = b.closest('.nvideo'), src = fig.getAttribute('data-video-src');
    var go = function (u) {
      if (!u) { var n = $('[data-video-note]', fig); if (n) { n.classList.add('is-shown'); n.setAttribute('role', 'status'); } return; }
      var v = doc.createElement('video');
      v.className = 'nvideo__video'; v.controls = true; v.playsInline = true; v.src = u;
      v.setAttribute('aria-label', ($('.frame__cap em', fig) || {}).textContent || 'Video');
      var stage = $('.nvideo__stage', fig); stage.innerHTML = ''; stage.appendChild(v);
      try { v.play(); } catch (err) { /* the controls are there */ }
      v.focus();
    };
    var m = fig.getAttribute('data-video-media');
    if (!src && m && window.TPTCMedia) window.TPTCMedia.blobUrl(m, go); else go(src);
  });
})();
