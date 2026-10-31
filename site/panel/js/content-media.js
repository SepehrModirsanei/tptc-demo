/* Content > Photos and media (N1a, 24 Oct 2026). Level 1 admin: "Pages, text and photos: change any
   photo on any page, from one media library" and "Media library: photos, videos and PDFs".

   Two views on one tab:
   - Photo slots by page: every photo and video slot on every public page (TPTC_CONTENT.slots, read
     by panel/build.py from the built site), page by page, with what it shows now, where else the
     same slot appears and which other pages use the same photo. Administrator replaces a slot from
     the library, with alt text required and a focal point for the crops; Restore puts the site's
     photo back. Photos inside news posts are changed in the post (News tab); coach portraits in
     Coaches, where only a real portrait is allowed.
   - Media library: the site's licensed stand-ins and the club's own photos (content/media.json),
     the club's PDFs, and anything uploaded here (photos, MP4 or WebM videos, PDFs), each with where
     it is used.
   Saved in this browser only, in localStorage 'tptc-media-v1' (uploaded photos as small JPEGs) and
   IndexedDB 'tptc-media' (videos and PDFs). The public pages read the same record (site/js/media.js)
   and show the swap in this browser. Reset demo clears both.
   The story: a slot is a court on the club's plan. It keeps its place and its shape (the ratio);
   staff change who plays on it. The focal point is where the ball is: the crop keeps it in view.
   Also window.CTStore: the record helpers the News editor (content-news.js) shares. */
(function () {
  'use strict';
  var D = window.PanelData, UI = window.PanelUI, F = window.TPTC_CONTENT || {};
  if (!D || !UI || !F.media || !F.slots) return;
  var esc = UI.esc, icon = UI.icon;
  var ASSETS = '../../../assets/', SITE = '../../';
  var HTTP = /^https?:$/.test(location.protocol);
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var CAN = UI.can('content.edit'), WHO = UI.whoCan ? UI.whoCan('content.edit') : 'Administrator';
  var MKEY = 'tptc-media-v1', NKEY = 'tptc-news-v1';

  /* ---------- Records in this browser ---------- */
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { UI.toast('This browser is out of room for the demo (about 5 MB). Remove an upload and try again.', { kind: 'warn' }); return false; }
  }
  function media() { var m = read(MKEY); return m && m.v === 1 ? m : { v: 1, uploads: {}, slots: {} }; }
  function saveMedia(m) { m.savedAt = new Date().toISOString(); m.uploads = m.uploads || {}; m.slots = m.slots || {}; return write(MKEY, m); }
  function news() { var n = read(NKEY); return n && n.v === 1 ? n : { v: 1, posts: {}, deleted: [] }; }
  function saveNews(n) { n.savedAt = new Date().toISOString(); return write(NKEY, n); }
  function idb(mode, fn) {
    return new Promise(function (resolve) {
      try {
        var rq = indexedDB.open('tptc-media', 1);
        rq.onupgradeneeded = function () { try { rq.result.createObjectStore('files'); } catch (e) { /* exists */ } };
        rq.onerror = function () { resolve(null); };
        rq.onsuccess = function () {
          try {
            var tx = rq.result.transaction('files', mode), st = tx.objectStore('files'), r = fn(st);
            tx.oncomplete = function () { resolve(r && 'result' in r ? r.result : true); };
            tx.onerror = function () { resolve(null); };
          } catch (e) { resolve(null); }
        };
      } catch (e) { resolve(null); }
    });
  }
  var urls = {};
  function blobUrl(id) {
    if (urls[id]) return Promise.resolve(urls[id]);
    return idb('readonly', function (st) { return st.get(id); }).then(function (rec) {
      if (!rec || !rec.blob) return null;
      urls[id] = URL.createObjectURL(rec.blob); return urls[id];
    });
  }
  function clearAll() {
    try { localStorage.removeItem(MKEY); localStorage.removeItem(NKEY); localStorage.removeItem('tptc-news-preview-v1'); } catch (e) { /* nothing stored */ }
    idb('readwrite', function (st) { return st.clear(); });
  }

  /* ---------- The library ---------- */
  var BUILT = {}; (F.media.photos || []).forEach(function (m) { BUILT[m.id] = m; });
  var PDF = {}; (F.media.pdfs || []).forEach(function (m) { PDF[m.id] = m; });
  function item(id) {
    var u = media().uploads[id];
    if (u) return { id: id, kind: u.kind, title: u.name, src: u.src || null, alt: u.alt || '', origin: 'upload', w: u.w, h: u.h, bytes: u.bytes, at: u.at, store: u.store, type: u.type };
    var b = BUILT[id];
    if (b) return { id: id, kind: 'photo', title: b.title, src: ASSETS + b.file, file: b.file, alt: b.alt, origin: b.origin, w: b.width, h: b.height, status: b.status_label, credit: b.credit, licence: b.licence, note: b.note };
    var p = PDF[id];
    if (p) return { id: id, kind: 'pdf', title: p.title, href: p.href, meta: p.meta, origin: 'club', note: p.note };
    return null;
  }
  function library(kind) {
    var out = [];
    if (!kind || kind === 'photo') (F.media.photos || []).forEach(function (m) { out.push(item(m.id)); });
    if (!kind || kind === 'pdf') (F.media.pdfs || []).forEach(function (m) { out.push(item(m.id)); });
    var ups = media().uploads;
    Object.keys(ups).sort(function (a, b) { return String(ups[b].at).localeCompare(String(ups[a].at)); }).forEach(function (id) {
      if (!kind || ups[id].kind === kind) out.push(item(id));
    });
    return out;
  }
  function originLabel(it) {
    return it.origin === 'club' ? 'The club&rsquo;s own' : it.origin === 'upload' ? 'Uploaded here' : 'Licensed stand-in';
  }

  /* ---------- Slots: the built registry under this browser's swaps ---------- */
  var SLOT = {}; F.slots.slots.forEach(function (s) { SLOT[s.id] = s; });
  var PAGE = {}; F.slots.pages.forEach(function (p) { PAGE[p.page] = p; });
  function current(s) {
    var o = media().slots[s.id];
    if (o) return { media: o.media, alt: o.alt, focal: o.focal || s.pos || '50% 50%', changed: true, at: o.at, by: o.by, poster: o.poster };
    return { media: s.media, alt: s.alt, focal: s.pos || '50% 50%', changed: false };
  }
  function pageTitle(pid) { return PAGE[pid] ? PAGE[pid].title : pid; }
  function siteHref(pid) { var p = PAGE[pid]; return p ? SITE + p.route + (HTTP ? '' : 'index.html') : SITE; }
  /* Where a library item is used: slots (as swapped in this browser) and news posts */
  function postsNow() {
    var n = news(), out = [];
    (F.posts.posts || []).forEach(function (p) { if (n.deleted.indexOf(p.id) < 0) out.push(n.posts[p.id] ? Object.assign({}, p, n.posts[p.id]) : p); });
    Object.keys(n.posts).forEach(function (id) { if (!out.some(function (p) { return p.id === id; })) out.push(n.posts[id]); });
    return out;
  }
  function postMedia(p) {
    var ids = [];
    if (p.cover) { if (p.cover.media) ids.push(p.cover.media); if (p.cover.video) ids.push(p.cover.video); }
    (p.blocks || []).forEach(function (b) {
      if (b.media) ids.push(b.media); if (b.poster) ids.push(b.poster);
      (b.items || []).forEach(function (it) { if (it.media) ids.push(it.media); });
    });
    return ids;
  }
  function usedIn(id) {
    var out = [];
    F.slots.slots.forEach(function (s) {
      if (s.managed === 'news') return;
      var c = current(s);
      if (c.media === id || c.poster === id) s.pages.forEach(function (pg) { out.push({ text: pageTitle(pg.page) + ', ' + pg.where, slot: s.id, page: pg.page }); });
    });
    postsNow().forEach(function (p) { if (postMedia(p).indexOf(id) > -1) out.push({ text: 'News: ' + (p.title || 'Untitled post'), post: p.id }); });
    return out;
  }
  function thumb(it, ratio, focal) {
    var r = String(ratio || '3x2').split('x');
    var st = 'aspect-ratio:' + r[0] + ' / ' + r[1] + ';' + (focal ? 'object-position:' + esc(focal) + ';' : '');
    if (!it) return '<span class="md-thumb md-thumb--none" style="aspect-ratio:' + r[0] + ' / ' + r[1] + '"><span>Court frame</span></span>';
    if (it.kind === 'photo' && it.src) return '<img class="md-thumb" src="' + esc(it.src) + '" alt="" style="' + st + '" loading="lazy" decoding="async">';
    return '<span class="md-thumb md-thumb--file" style="aspect-ratio:' + r[0] + ' / ' + r[1] + '">' + icon(it.kind === 'video' ? 'camera' : 'receipt') + '<span>' + (it.kind === 'video' ? 'Video' : 'PDF') + '</span></span>';
  }
  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

  /* ---------- Uploads, in the browser only ---------- */
  var LIMIT = { video: 60 * 1048576, pdf: 20 * 1048576 };
  function uid(kind) { return 'up-' + kind + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function photoUpload(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject('The photo could not be read.'); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject('That file is not a photo this browser can open.'); };
        img.onload = function () {
          var max = 1600, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          var w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          var src = c.toDataURL('image/jpeg', 0.82);
          resolve({ id: uid('photo'), kind: 'photo', name: file.name.replace(/\.[a-z0-9]+$/i, ''), src: src, w: w, h: h, bytes: Math.round(src.length * 0.75), alt: '', at: new Date().toISOString(), by: D.roleName(), store: 'local' });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function fileUpload(file, kind) {
    if (file.size > LIMIT[kind]) return Promise.reject((kind === 'video' ? 'Videos' : 'PDFs') + ' up to ' + kb(LIMIT[kind]) + ' in the demo; this one is ' + kb(file.size) + '.');
    var rec = { id: uid(kind), kind: kind, name: file.name.replace(/\.[a-z0-9]+$/i, ''), type: file.type, bytes: file.size, alt: '', at: new Date().toISOString(), by: D.roleName(), store: 'idb' };
    return idb('readwrite', function (st) { return st.put({ blob: file, type: file.type, name: file.name }, rec.id); })
      .then(function (ok) { if (!ok) throw 'This browser would not keep the file (private window?).'; return rec; });
  }
  function upload(files) {
    if (!CAN) return deny();
    var list = Array.prototype.slice.call(files || []);
    return list.reduce(function (p, f) {
      return p.then(function (done) {
        var kind = /^image\//.test(f.type) ? 'photo' : /^video\/(mp4|webm)$/.test(f.type) ? 'video' : f.type === 'application/pdf' ? 'pdf' : null;
        if (!kind) { UI.toast(f.name + ': photos (JPEG, PNG, WebP), MP4 or WebM videos and PDFs only.', { kind: 'warn' }); return done; }
        return (kind === 'photo' ? photoUpload(f) : fileUpload(f, kind)).then(function (rec) {
          var m = media(); m.uploads[rec.id] = rec;
          if (!saveMedia(m)) { if (rec.store === 'idb') idb('readwrite', function (st) { return st.delete(rec.id); }); return done; }
          D.log('Uploaded ' + (kind === 'photo' ? 'a photo' : kind === 'video' ? 'a video' : 'a PDF') + ': ' + rec.name, { type: 'content', id: rec.id });
          return done.concat([rec]);
        }, function (msg) { UI.toast(f.name + ': ' + msg, { kind: 'warn' }); return done; });
      });
    }, Promise.resolve([]));
  }
  function removeUpload(id) {
    if (!CAN) return deny();
    var it = item(id); if (!it) return;
    var uses = usedIn(id);
    UI.confirm({ title: 'Remove this upload?', body: '<p>' + esc(it.title) + ' leaves the library in this browser.' + (uses.length ? ' It is used in ' + uses.length + (uses.length === 1 ? ' place' : ' places') + '; those go back to the site&rsquo;s photo.' : '') + '</p>', confirm: 'Remove upload', cancel: 'Keep it', danger: true })
      .then(function (yes) {
        if (!yes) return;
        var m = media();
        delete m.uploads[id];
        Object.keys(m.slots).forEach(function (k) { if (m.slots[k].media === id) delete m.slots[k]; else if (m.slots[k].poster === id) delete m.slots[k].poster; });
        saveMedia(m);
        if (it.store === 'idb') idb('readwrite', function (st) { return st.delete(id); });
        D.log('Removed an upload: ' + it.title, { type: 'content', id: id });
        UI.toast('Removed from the library in this browser.');
        render();
      });
  }
  function deny() { UI.toast(WHO + ' only. You can see every slot and the library.', { kind: 'warn' }); }

  /* ---------- The tab ---------- */
  var VKEY = 'tptc-panel-content-media';
  var st = { view: 'slots', page: 'home', kind: '' };
  try { var sv = JSON.parse(localStorage.getItem(VKEY) || 'null'); if (sv) { st.view = sv.view || st.view; st.page = PAGE[sv.page] ? sv.page : st.page; } } catch (e) { /* defaults */ }
  function remember() { try { localStorage.setItem(VKEY, JSON.stringify({ view: st.view, page: st.page })); } catch (e) { /* no memory */ } }
  var el = null;
  function counts() {
    var m = media(), n = 0; Object.keys(m.slots).forEach(function () { n++; });
    return { slots: F.slots.slots.length, pages: F.slots.pages.length, changed: n, uploads: Object.keys(m.uploads).length, library: library().length };
  }
  function slotRow(s, pid) {
    var c = current(s), it = c.media ? item(c.media) : null;
    var others = s.pages.filter(function (pg) { return pg.page !== pid; }).map(function (pg) { return pageTitle(pg.page); });
    var here = s.pages.filter(function (pg) { return pg.page === pid; })[0] || {};
    var same = c.media ? usedIn(c.media).filter(function (u) { return u.slot !== s.id && u.page !== pid; }) : [];
    var sameNames = []; same.forEach(function (u) { var t = u.post ? u.text : pageTitle(u.page); if (sameNames.indexOf(t) < 0) sameNames.push(t); });
    var status = s.kind === 'video' ? (it ? UI.chip('published', 'Video from the panel') : UI.chip('draft', 'Club to supply')) :
      !it ? UI.chip('pending', 'Court frame, no photo') : it.origin === 'upload' ? UI.chip('published', 'Uploaded here') : it.origin === 'club' ? UI.chip('published', 'The club&rsquo;s own') : UI.chip('pending', 'Placeholder image');
    var act;
    if (s.managed === 'news') {
      var postId = (s.id.match(/^news-(.+?)-(cover|photo|gallery|video)/) || [])[1] || (PAGE[pid] && PAGE[pid].article);
      act = '<button class="pn-btn pn-btn--quiet pn-btn--sm" type="button" data-md-post="' + esc(postId || '') + '">Change it in the post</button>';
    } else if (s.managed === 'coaches') {
      act = '<a class="pn-btn pn-btn--quiet pn-btn--sm" href="' + esc(UI.link('coaches')) + '">Set in Coaches</a>';
    } else {
      act = '<button class="pn-btn pn-btn--ink pn-btn--sm" type="button" data-md-replace="' + esc(s.id) + '"' + (CAN ? '' : ' aria-disabled="true" title="' + esc(WHO) + ' only"') + '>' + (s.kind === 'video' ? 'Choose a video' : 'Replace') + '</button>' +
        (c.changed ? '<button class="pn-btn pn-btn--text pn-btn--sm" type="button" data-md-restore="' + esc(s.id) + '"' + (CAN ? '' : ' aria-disabled="true"') + '>Restore the site&rsquo;s photo</button>' : '');
    }
    var note = s.managed === 'news' ? 'A photo in a news post: chosen in the post, on the News tab.' :
      s.managed === 'coaches' ? 'A coach portrait: real portraits only, set in Coaches.' :
      s.kind === 'video' ? 'A video slot. The club film goes here (MP4, 30 to 90 seconds).' : '';
    return '<li class="md-slot' + (c.changed ? ' is-changed' : '') + '">' +
      '<div class="md-slot__pic">' + thumb(it, s.ratio, c.focal) + '</div>' +
      '<div class="md-slot__body"><p class="md-slot__where">' + esc(here.where || 'On the page') + '</p>' +
      '<p class="md-slot__what">' + (it ? esc(it.title) : s.kind === 'video' ? 'No film yet' : 'No photograph yet') + '</p>' +
      '<p class="md-slot__meta"><code>' + esc(s.id) + '</code><span>' + esc(s.ratios.join(', ').replace(/x/g, ':')) + '</span>' + status +
      (c.changed ? '<span class="ct-edited">Changed here' + (c.by ? ' by ' + esc(c.by) : '') + '</span>' : '') + '</p>' +
      (c.alt ? '<p class="md-slot__alt"><span>Alt text</span> ' + esc(c.alt) + '</p>' : '') +
      (others.length ? '<p class="md-slot__also"><span>Same slot on</span> ' + esc(others.join(', ')) + '. One change updates every one.</p>' : '') +
      (sameNames.length ? '<p class="md-slot__also"><span>Same photo on</span> ' + esc(sameNames.slice(0, 6).join(', ')) + (sameNames.length > 6 ? ' and ' + (sameNames.length - 6) + ' more' : '') + '.</p>' : '') +
      (note ? '<p class="pn-help">' + note + '</p>' : '') +
      '<div class="md-slot__acts">' + act + '</div></div></li>';
  }
  function slotsView() {
    var pages = F.slots.pages, pg = PAGE[st.page] || pages[0];
    var m = media();
    var nav = '<div class="md-pages"><label class="pn-label" for="md-page">Page</label><select class="pn-select md-pages__select" id="md-page" data-md-page>' +
      pages.map(function (p) {
        var ch = p.slots.filter(function (id) { return m.slots[id]; }).length;
        return '<option value="' + esc(p.page) + '"' + (p.page === pg.page ? ' selected' : '') + '>' + esc((p.article ? 'News: ' : '') + p.title) + ' (' + p.slots.length + (ch ? ', ' + ch + ' changed' : '') + ')</option>';
      }).join('') + '</select>' +
      '<a class="inline-link md-pages__open" href="' + esc(siteHref(pg.page)) + '" target="_blank" rel="noopener">Open ' + esc(pg.title) + ' on the site<span class="sr-only"> (opens in a new tab)</span></a></div>';
    var rows = pg.slots.map(function (id) { return slotRow(SLOT[id], pg.page); }).join('');
    return nav + '<h3 class="pn-h3 md-h3">' + esc(pg.title) + ': ' + pg.slots.length + (pg.slots.length === 1 ? ' slot' : ' slots') + ', top to bottom</h3><ul class="md-slots" role="list">' + rows + '</ul>';
  }
  function libCard(it) {
    var uses = usedIn(it.id);
    var meta = it.kind === 'pdf' ? (it.meta || 'PDF') + (it.bytes ? ', ' + kb(it.bytes) : '') : it.kind === 'video' ? 'Video' + (it.bytes ? ', ' + kb(it.bytes) : '') : (it.w ? it.w + ' x ' + it.h + ' px' : 'Photo') + (it.bytes ? ', ' + kb(it.bytes) : '');
    return '<li class="md-item"><div class="md-item__pic">' + thumb(it, '3x2') + '</div><div class="md-item__body">' +
      '<p class="md-item__title">' + esc(it.title) + '</p>' +
      '<p class="md-item__meta"><span>' + originLabel(it) + '</span><span>' + esc(meta) + '</span></p>' +
      (it.status ? '<p class="md-item__meta"><span>' + esc(it.status) + '</span>' + (it.licence ? '<span>' + esc(it.licence) + '</span>' : '') + '</p>' : '') +
      (it.credit ? '<p class="md-item__credit">' + esc(it.credit) + '</p>' : '') +
      '<details class="md-item__uses"><summary>' + (uses.length ? 'Used in ' + uses.length + (uses.length === 1 ? ' place' : ' places') : 'Not used yet') + '</summary>' +
      (uses.length ? '<ul role="list">' + uses.map(function (u) { return '<li>' + esc(u.text) + '</li>'; }).join('') + '</ul>' : '<p class="pn-help">Choose it in a slot, or in a news post.</p>') + '</details>' +
      (it.kind === 'pdf' && it.href ? '<a class="inline-link" href="' + esc(it.href) + '" target="_blank" rel="noopener">Open the PDF<span class="sr-only"> (opens in a new tab)</span></a>' : '') +
      (it.origin === 'upload' ? '<button class="pn-btn pn-btn--text pn-btn--sm" type="button" data-md-remove="' + esc(it.id) + '"' + (CAN ? '' : ' aria-disabled="true"') + '>Remove upload</button>' : '') +
      '</div></li>';
  }
  function libraryView() {
    var kinds = [['', 'All'], ['photo', 'Photos'], ['video', 'Videos'], ['pdf', 'PDFs']];
    var list = library(st.kind || null);
    return '<div class="pn-toolbar md-libbar"><div class="pn-seg" role="group" aria-label="Show">' +
      kinds.map(function (k) { return '<button type="button" data-md-kind="' + k[0] + '" aria-pressed="' + (st.kind === k[0]) + '">' + k[1] + ' <span class="pn-num">' + library(k[0] || null).length + '</span></button>'; }).join('') + '</div>' +
      '<label class="pn-btn pn-btn--ink md-upload"' + (CAN ? '' : ' aria-disabled="true" title="' + esc(WHO) + ' only"') + '>' + icon('plus', 'icon--16') + 'Upload<input class="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf" data-md-file' + (CAN ? '' : ' disabled') + '></label></div>' +
      '<p class="pn-help md-libhelp">Photos are made smaller here (1600 px, JPEG) and kept in this browser; videos (MP4 or WebM, up to 60 MB) and PDFs (up to 20 MB) are kept in this browser&rsquo;s own storage. Nothing is uploaded to a server. On the real site files sit in the club&rsquo;s own storage in Toronto and photos are sized for every screen.</p>' +
      (list.length ? '<ul class="md-lib" role="list">' + list.map(libCard).join('') + '</ul>' : '<div class="pn-empty"><p class="pn-empty__title">Nothing here yet</p><p>' + (st.kind === 'video' ? 'No videos yet: the club film is waiting for the club. Upload one to try it.' : 'Upload a file to add it.') + '</p></div>');
  }
  function render(target) {
    el = target || el; if (!el) return;
    var c = counts();
    el.innerHTML = '<div class="md-head"><p class="pn-muted">' + c.slots + ' photo and video slots on ' + c.pages + ' public pages; ' + c.library + ' items in the library. ' +
      (c.changed ? c.changed + (c.changed === 1 ? ' slot' : ' slots') + ' changed in this browser.' : 'Every slot shows the site&rsquo;s photo.') + '</p>' +
      (CAN ? '' : '<p class="pn-note">' + icon('alert') + '<span>Read only for ' + esc(D.roleName()) + '. ' + esc(WHO) + ' changes photos.</span></p>') +
      '<div class="pn-seg md-views" role="group" aria-label="View"><button type="button" data-md-view="slots" aria-pressed="' + (st.view === 'slots') + '">Photo slots by page</button><button type="button" data-md-view="library" aria-pressed="' + (st.view === 'library') + '">Media library</button></div></div>' +
      '<div class="md-body">' + (st.view === 'library' ? libraryView() : slotsView()) + '</div>';
  }

  /* ---------- Replace a slot: the sheet ---------- */
  var pick = null;
  function sheetBody(s, c) {
    var kind = s.kind === 'video' ? 'video' : 'photo';
    var list = library(kind);
    var grid = list.length ? '<div class="md-pick" role="radiogroup" aria-label="' + (kind === 'video' ? 'Videos' : 'Photos') + ' in the library">' + list.map(function (it) {
      var on = it.id === pick.media;
      return '<div class="md-pick__cell"><button type="button" class="md-pick__item" role="radio" aria-checked="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-md-pick="' + esc(it.id) + '">' + thumb(it, '3x2') +
        '<span class="md-pick__name">' + esc(it.title) + '</span><span class="md-pick__from">' + originLabel(it) + '</span></button></div>';
    }).join('') + '</div>' : '<div class="pn-empty"><p class="pn-empty__title">No videos in the library</p><p>Upload an MP4 or WebM film below. It stays in this browser.</p></div>';
    var fx = String(pick.focal || '50% 50%').split(/\s+/), x = parseInt(fx[0], 10), y = parseInt(fx[1], 10);
    var cur = item(pick.media);
    var crops = kind === 'photo' && cur && cur.src ? '<div class="md-crops" data-md-crops>' + s.ratios.map(function (r) {
      return '<figure class="md-crop"><button type="button" class="md-crop__btn" data-md-focus aria-label="Set the focal point on this crop">' + thumb(cur, r, pick.focal) + '<span class="md-crop__dot" style="left:' + x + '%;top:' + y + '%" aria-hidden="true"></span></button><figcaption>' + r.replace('x', ':') + '</figcaption></figure>';
    }).join('') + '</div>' : '';
    return '<form class="pn-form md-form" data-md-form novalidate>' +
      '<p class="pn-help">' + esc(s.pages.map(function (pg) { return pageTitle(pg.page) + ', ' + pg.where; }).join('; ')) + '. Ratio ' + esc(s.ratios.join(', ').replace(/x/g, ':')) + '.</p>' +
      '<fieldset class="ct-fieldset"><legend class="pn-label">' + (kind === 'video' ? 'Video' : 'Photo') + '</legend>' + grid +
      '<label class="pn-btn pn-btn--quiet pn-btn--sm md-upload">' + icon('plus', 'icon--16') + 'Upload ' + (kind === 'video' ? 'a video' : 'a photo') + '<input class="sr-only" type="file" accept="' + (kind === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp') + '" data-md-sheetfile></label></fieldset>' +
      (kind === 'video' ? '<div class="pn-field"><label class="pn-label" for="md-poster">Poster photo, shown before it plays</label><select class="pn-select" id="md-poster" data-md-poster><option value="">None</option>' +
        library('photo').map(function (it) { return '<option value="' + esc(it.id) + '"' + (pick.poster === it.id ? ' selected' : '') + '>' + esc(it.title) + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="pn-field"><div class="ct-fieldhead"><label class="pn-label" for="md-alt">' + (kind === 'video' ? 'What the film shows' : 'Alt text') + ' (required)</label><span class="ct-counter" data-md-altcount>' + String(pick.alt || '').length + ' of 140</span></div>' +
      '<textarea class="pn-textarea" id="md-alt" rows="2" data-md-alt aria-describedby="md-alt-help md-alt-err"' + (pick.altErr ? ' aria-invalid="true"' : '') + '>' + esc(pick.alt || '') + '</textarea>' +
      '<p class="pn-help" id="md-alt-help">What the picture shows, for someone who cannot see it. Name no place or person the photo does not show.</p>' +
      (pick.altErr ? '<p class="pn-error" id="md-alt-err">' + icon('alert') + 'Write the alt text: every photo needs it</p>' : '<span id="md-alt-err"></span>') + '</div>' +
      (kind === 'photo' ? '<fieldset class="ct-fieldset md-focal"><legend class="pn-label">Focal point: what every crop keeps in view</legend>' + crops +
        '<div class="pn-form__row pn-form__row--2"><div class="pn-field"><label class="pn-label" for="md-fx">Across <span class="pn-num" data-md-fxv>' + x + '%</span></label><input type="range" id="md-fx" min="0" max="100" step="1" value="' + x + '" data-md-fx></div>' +
        '<div class="pn-field"><label class="pn-label" for="md-fy">Down <span class="pn-num" data-md-fyv>' + y + '%</span></label><input type="range" id="md-fy" min="0" max="100" step="1" value="' + y + '" data-md-fy></div></div>' +
        '<p class="pn-help">Or click the spot on a crop. The site keeps this point in view at every size.</p></fieldset>' : '') +
      '</form>';
  }
  function openReplace(id) {
    if (!CAN) return deny();
    var s = SLOT[id]; if (!s) return;
    var c = current(s);
    pick = { slot: id, media: c.media, alt: c.alt || (c.media && item(c.media) ? item(c.media).alt : ''), focal: c.focal, poster: c.poster || '', altErr: false };
    UI.sheet.open({ kicker: 'Photo slot ' + id, title: s.kind === 'video' ? 'Choose the video' : 'Replace the photo', wide: true,
      body: sheetBody(s, c),
      foot: '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Cancel</button><button class="pn-btn pn-btn--ink" type="button" data-md-save>Save, in this browser</button>' });
    wireSheet(s);
  }
  function redrawSheet(s) {
    var dlg = UI.sheet.el(), b = dlg && $('.pn-sheet__body', dlg); if (!b) return;
    var keep = document.activeElement && document.activeElement.getAttribute('data-md-pick');
    b.innerHTML = sheetBody(s, current(s));
    var f = keep ? $('[data-md-pick="' + keep + '"]', b) : null; if (f) f.focus();
  }
  function wireSheet(s) {
    var dlg = UI.sheet.el(); if (!dlg || dlg._md) { if (dlg) dlg._mdSlot = s; return; }
    dlg._md = true; dlg._mdSlot = s;
    dlg.addEventListener('click', function (e) {
      var sl = dlg._mdSlot; if (!pick || !sl) return;
      var p = e.target.closest('[data-md-pick]');
      if (p) { pick.media = p.getAttribute('data-md-pick'); var it = item(pick.media); if (it && (!pick.alt || pick.altAuto)) { pick.alt = it.alt || ''; pick.altAuto = true; } redrawSheet(sl); return; }
      var fb = e.target.closest('[data-md-focus]');
      if (fb) {
        var r = fb.getBoundingClientRect(), x = Math.round(100 * (e.clientX - r.left) / r.width), y = Math.round(100 * (e.clientY - r.top) / r.height);
        if (e.detail === 0) return;   /* keyboard: the sliders set it */
        pick.focal = Math.max(0, Math.min(100, x)) + '% ' + Math.max(0, Math.min(100, y)) + '%'; redrawSheet(sl); return;
      }
      if (e.target.closest('[data-md-save]')) saveSlot(sl);
    });
    dlg.addEventListener('keydown', function (e) {
      var p = e.target.closest('[data-md-pick]'); if (!p) return;
      var all = $$('[data-md-pick]', dlg), i = all.indexOf(p), n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % all.length; else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + all.length) % all.length;
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); p.click(); return; }
      if (n === null) return; e.preventDefault(); all[n].click(); var q = $$('[data-md-pick]', dlg)[n]; if (q) q.focus();
    });
    dlg.addEventListener('input', function (e) {
      if (!pick) return;
      if (e.target.matches('[data-md-alt]')) { pick.alt = e.target.value; pick.altAuto = false; var c = $('[data-md-altcount]', dlg); if (c) c.textContent = pick.alt.length + ' of 140'; }
      if (e.target.matches('[data-md-fx], [data-md-fy]')) {
        var x = $('[data-md-fx]', dlg).value, y = $('[data-md-fy]', dlg).value;
        pick.focal = x + '% ' + y + '%';
        $('[data-md-fxv]', dlg).textContent = x + '%'; $('[data-md-fyv]', dlg).textContent = y + '%';
        $$('.md-crop', dlg).forEach(function (f) { var im = $('img', f); if (im) im.style.objectPosition = pick.focal; var d = $('.md-crop__dot', f); if (d) { d.style.left = x + '%'; d.style.top = y + '%'; } });
      }
    });
    dlg.addEventListener('change', function (e) {
      if (!pick) return;
      if (e.target.matches('[data-md-poster]')) pick.poster = e.target.value;
      if (e.target.matches('[data-md-sheetfile]')) {
        upload(e.target.files).then(function (recs) { if (recs[0]) { pick.media = recs[0].id; pick.alt = ''; } redrawSheet(dlg._mdSlot); });
      }
    });
  }
  function saveSlot(s) {
    if (!pick || !pick.media) { UI.toast('Choose a ' + (s.kind === 'video' ? 'video' : 'photo') + ' first.', { kind: 'warn' }); return; }
    if (!String(pick.alt || '').trim()) { pick.altErr = true; redrawSheet(s); var a = $('[data-md-alt]', UI.sheet.el()); if (a) a.focus(); return; }
    var it = item(pick.media), m = media();
    var before = m.slots[s.id] ? Object.assign({}, m.slots[s.id]) : null;
    var same = !before && pick.media === s.media && pick.alt === s.alt && pick.focal === (s.pos || '50% 50%');
    if (same) { UI.sheet.close(); UI.toast('Nothing changed: the slot already shows that photo.'); return; }
    m.slots[s.id] = { kind: s.kind, media: pick.media, file: it && it.file || null, alt: String(pick.alt).trim().slice(0, 200), focal: s.kind === 'video' ? null : pick.focal,
      club: !!(it && it.origin === 'club'), poster: s.kind === 'video' ? (pick.poster || null) : undefined, posterFile: pick.poster && item(pick.poster) ? item(pick.poster).file || null : null,
      at: new Date().toISOString(), by: D.roleName() };
    if (!saveMedia(m)) return;
    D.log('Changed the photo slot ' + s.id + ' (' + s.pages.map(function (pg) { return pageTitle(pg.page); }).join(', ') + ') to ' + (it ? it.title : pick.media), { type: 'content', id: s.id });
    UI.sheet.close(); render();
    var b = $('[data-md-replace="' + s.id + '"]', el); if (b) b.focus();
    UI.toast('Saved in this browser. ' + s.pages.length + (s.pages.length === 1 ? ' page shows' : ' pages show') + ' it here; the published site is not changed.', { action: { label: 'Undo', run: function () {
      var m2 = media(); if (before) m2.slots[s.id] = before; else delete m2.slots[s.id]; saveMedia(m2); render();
    } } });
  }
  function restoreSlot(id) {
    if (!CAN) return deny();
    var m = media(), before = m.slots[id]; if (!before) return;
    delete m.slots[id]; saveMedia(m);
    D.log('Restored the site\'s photo in slot ' + id, { type: 'content', id: id });
    render(); UI.toast('The site\'s photo is back in ' + id + ', in this browser.', { action: { label: 'Undo', run: function () { var m2 = media(); m2.slots[id] = before; saveMedia(m2); render(); } } });
  }

  /* ---------- Events (the tab's own controls) ---------- */
  function wire(target) {
    if (target._md) return; target._md = true;
    target.addEventListener('click', function (e) {
      var t = e.target;
      var v = t.closest('[data-md-view]'); if (v) { st.view = v.getAttribute('data-md-view'); remember(); render(); var b = $('[data-md-view="' + st.view + '"]', el); if (b) b.focus(); return; }
      var k = t.closest('[data-md-kind]'); if (k) { st.kind = k.getAttribute('data-md-kind'); render(); var kb2 = $('[data-md-kind="' + st.kind + '"]', el); if (kb2) kb2.focus(); return; }
      var r = t.closest('[data-md-replace]'); if (r) { openReplace(r.getAttribute('data-md-replace')); return; }
      var rs = t.closest('[data-md-restore]'); if (rs) { restoreSlot(rs.getAttribute('data-md-restore')); return; }
      var rm = t.closest('[data-md-remove]'); if (rm) { removeUpload(rm.getAttribute('data-md-remove')); return; }
      var po = t.closest('[data-md-post]'); if (po && window.CTNews) { window.CTNews.open(po.getAttribute('data-md-post')); return; }
      if (t.closest('.md-upload[aria-disabled="true"]')) { e.preventDefault(); deny(); }
    });
    target.addEventListener('change', function (e) {
      if (e.target.matches('[data-md-page]')) { st.page = e.target.value; remember(); render(); var s = $('[data-md-page]', el); if (s) s.focus(); }
      if (e.target.matches('[data-md-file]')) upload(e.target.files).then(function (recs) { if (recs.length) UI.toast(recs.length + (recs.length === 1 ? ' file' : ' files') + ' added to the library, in this browser.'); render(); });
    });
  }
  window.addEventListener('panel:change', function (e) { if (e.detail && e.detail.collection === '*') { clearAll(); if (el && el.isConnected) render(); } });

  window.CTStore = { read: read, write: write, media: media, saveMedia: saveMedia, news: news, saveNews: saveNews, item: item, library: library,
    usedIn: usedIn, thumb: thumb, upload: upload, blobUrl: blobUrl, originLabel: originLabel, ASSETS: ASSETS, SITE: SITE, HTTP: HTTP, kb: kb };
  window.CTMedia = {
    render: function (target) { wire(target); render(target); },
    stats: function () { return counts(); },
    isDirty: function () { return false; }
  };
})();
