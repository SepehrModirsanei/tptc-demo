/* Photo and video slots changed in the staff panel demo (N1a, 24 Oct 2026), shown in this browser only.

   Every photograph on the site sits in a slot: a figure with data-slot (the slot id) and data-media
   (the library photo it shows). The panel's Photos and media screen (site/panel/content/, Photos tab)
   keeps what staff change in localStorage 'tptc-media-v1':
     { v: 1, savedAt, uploads: { id: { kind, name, src (a data URL for a photo), alt, store } },
       slots: { slotId: { kind: 'photo' | 'video', media, file, src, alt, focal, club, at } } }
   Photos uploaded in the panel are kept in that record as small JPEG data URLs; videos and PDFs are
   kept in this browser's IndexedDB ('tptc-media', store 'files'). This script swaps the picture in
   every figure whose slot changed: the new file, its alt text and its focal point (--pos, which the
   frame's object-position reads). A licensed stand-in keeps the Placeholder image tag; an upload says
   it came from the staff panel; the club's own photographs carry no tag. A video slot plays the file
   chosen for it. With no record, or no localStorage, nothing changes: the page is the published one. */
(function () {
  'use strict';
  var KEY = 'tptc-media-v1';
  var data = null;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  var root = document.documentElement.getAttribute('data-root') || '';
  var ASSETS = root + '../assets/';

  /* IndexedDB: the panel keeps videos and PDFs here (too large for localStorage) */
  function idbGet(id, cb) {
    var done = false;
    function fin(v) { if (!done) { done = true; cb(v); } }
    try {
      var rq = indexedDB.open('tptc-media', 1);
      rq.onupgradeneeded = function () { try { rq.result.createObjectStore('files'); } catch (e) { /* exists */ } };
      rq.onerror = function () { fin(null); };
      rq.onsuccess = function () {
        try {
          var g = rq.result.transaction('files', 'readonly').objectStore('files').get(id);
          g.onsuccess = function () { fin(g.result || null); };
          g.onerror = function () { fin(null); };
        } catch (e) { fin(null); }
      };
    } catch (e) { fin(null); }
  }
  var urls = {};
  function blobUrl(id, cb) {
    if (urls[id]) return cb(urls[id]);
    idbGet(id, function (rec) {
      if (!rec || !rec.blob) return cb(null);
      try { urls[id] = URL.createObjectURL(rec.blob); } catch (e) { return cb(null); }
      cb(urls[id]);
    });
  }
  var uploads = (data && data.uploads) || {};
  /* Where a library item's picture lives: an upload's data URL, or a file under demo/assets */
  function srcOf(rec) {
    if (!rec) return null;
    var u = rec.media && uploads[rec.media];
    if (u && u.src) return u.src;
    if (rec.src) return rec.src;
    if (rec.file) return ASSETS + rec.file;
    return null;
  }
  window.TPTCMedia = { idbGet: idbGet, blobUrl: blobUrl, srcOf: srcOf, uploads: uploads, assets: ASSETS };
  if (!data || data.v !== 1 || !data.slots) return;

  var TAG = '<svg class="frame__tag-mark" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M0.5 0.5h9v9h-9zM5 0.5v9"/></svg>';
  function setTag(fig, words) {
    var tag = fig.querySelector('.frame__tag');
    if (!words) { if (tag) tag.hidden = true; return; }
    if (!tag) {
      tag = document.createElement('span'); tag.className = 'frame__tag';
      var cap = fig.querySelector('.frame__cap');
      fig.insertBefore(tag, cap || null);
    }
    tag.hidden = false;
    tag.innerHTML = TAG + words;
  }
  function photo(fig, rec) {
    var src = srcOf(rec);
    if (!src) return;
    var drift = fig.querySelector('.frame__drift') || fig.querySelector('.frame__media');
    if (!drift) return;
    var img = fig.querySelector('img.frame__img');
    if (!img) { img = document.createElement('img'); img.className = 'frame__img'; img.decoding = 'async'; drift.appendChild(img); }
    img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.removeAttribute('onerror');
    img.src = src;
    img.alt = rec.alt || '';
    img.classList.add('is-loaded');
    fig.classList.add('has-img');
    fig.classList.remove('frame--due');
    if (rec.focal) fig.style.setProperty('--pos', rec.focal);
    fig.setAttribute('data-media', rec.media || '');
    fig.setAttribute('data-swapped', '');
    var up = rec.media && uploads[rec.media];
    setTag(fig, rec.club ? '' : up ? 'From the staff panel (demo)' : 'Placeholder image');
    /* The Home slideshow names each slide on its dot */
    var slide = fig.closest('.show__slide');
    if (slide && rec.alt) {
      var i = Array.prototype.indexOf.call(slide.parentNode.children, slide);
      var dot = document.querySelector('[data-show-dot="' + i + '"]');
      if (dot) dot.setAttribute('aria-label', 'Slide ' + (i + 1) + ': ' + rec.alt.replace(/\.$/, ''));
    }
  }
  function video(fig, rec) {
    var up = rec.media && uploads[rec.media];
    if (!up) return;
    blobUrl(rec.media, function (u) {
      if (!u) return;
      var poster = rec.poster ? srcOf({ media: rec.poster, file: rec.posterFile }) : '';
      if (fig.classList.contains('vslot')) {
        var box = fig.querySelector('.vslot__box');
        var v = document.createElement('video');
        v.className = 'vslot__video'; v.controls = true; v.preload = 'metadata'; v.playsInline = true;
        if (poster) v.poster = poster;
        v.src = u;
        v.setAttribute('aria-label', rec.alt || up.name || 'Club film');
        if (box) box.parentNode.replaceChild(v, box);
        fig.setAttribute('data-swapped', '');
      } else {
        fig.setAttribute('data-video-src', u);
        fig.setAttribute('data-swapped', '');
      }
    });
  }
  Object.keys(data.slots).forEach(function (slot) {
    var rec = data.slots[slot];
    if (!rec) return;
    var figs = document.querySelectorAll('[data-slot="' + String(slot).replace(/["\\]/g, '') + '"]');
    Array.prototype.forEach.call(figs, function (fig) {
      if (fig.getAttribute('data-kind') === 'video') { if (rec.kind === 'video') video(fig, rec); }
      else if (rec.kind !== 'video') photo(fig, rec);
    });
  });
})();
