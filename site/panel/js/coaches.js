/* Coaches module (B7). The coaching team as the public Our Coaches page shows it.

   The published entries come from js/facts.js (TPTC_CONTENT.coaches, built from
   demo/content/coaches.json): only the coaches the club names, today the Head Pro. Staff with
   coaches.edit (Head Pro, Administrator) can edit an entry or add one; the whole roster is then
   kept in localStorage under 'tptc-coaches-v1', which the public page (site/js/pages/coaches.js)
   reads in the same browser. Nothing is sent to a server. Reset demo clears it.

   Story: a coach's entry is a line on the order of play: the name, the court they run (the
   programs, each in its program colour) and the portrait frame in the 4:5 of the site's frames. */
(function () {
  'use strict';
  var UI = window.PanelUI, D = window.PanelData;
  var F = (window.TPTC_CONTENT || {}).coaches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = UI.esc;
  if (!F) return;
  var KEY = F.storage_key;
  var CAN = UI.can('coaches.edit');
  var WHO = UI.whoCan('coaches.edit');
  var PROG = {};
  F.programs.forEach(function (p) { PROG[p.id] = p; });
  var PUB = {};
  F.published.forEach(function (c) { PUB[c.id] = c; });
  var PUBLIC = UI.root + '../' + F.page + 'index.html';
  var THIS_YEAR = (D && D.today ? D.today() : new Date()).getFullYear();

  /* ---------- Storage: the whole roster, or nothing (the published page) ---------- */
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function published() {
    return F.published.map(function (c) {
      return { id: c.id, name: c.name, role: c.role, certification: c.certification, since: c.since, bio: c.bio,
        programs: c.programs.slice(), portrait: c.portrait, origin: 'published' };
    });
  }
  function read() {
    try {
      var raw = localStorage.getItem(KEY); if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.v === 1 && Array.isArray(o.coaches) ? o : null;
    } catch (e) { return null; }
  }
  function roster() { var o = read(); return o ? o.coaches : published(); }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), coaches: list })); return true; }
    catch (e) { return false; }
  }
  function clearAll() { try { localStorage.removeItem(KEY); } catch (e) { /* nothing stored */ } }

  function status(c) {
    if (c.origin === 'added') return 'added';
    var p = PUB[c.id]; if (!p) return 'added';
    var same = ['name', 'role', 'certification', 'since', 'bio', 'portrait'].every(function (k) { return (c[k] || null) === (p[k] || null); }) &&
      c.programs.join() === p.programs.join();
    return same ? 'published' : 'edited';
  }
  var STATUS = {
    published: '<span class="chip pn-chip pn-chip--t-ok">Published</span>',
    edited: '<span class="chip pn-chip pn-chip--t-pending">Edited in this browser</span>',
    added: '<span class="chip pn-chip pn-chip--t-info">Added in this browser</span>'
  };

  function slug(name, taken) {
    var s = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'coach';
    var out = s, n = 2;
    while (taken.indexOf(out) > -1 || out === 'head-pro' || out === 'team' || out === 'approach') out = s + '-' + n++;
    return out;
  }
  function anchor(id) { return PUBLIC + '#' + id; }

  /* ---------- Render ---------- */
  function tags(ids) {
    return ids.length ? '<span class="co-tags">' + ids.map(function (id) {
      var p = PROG[id]; return p ? '<span class="pn-tag pn-tag--' + p.tag + '">' + esc(p.label) + '</span>' : '';
    }).join('') + '</span>' : UI.confirmSlot('Programs they lead');
  }
  function portrait(c, cls) {
    return c.portrait
      ? '<img class="co-pic ' + (cls || '') + '" src="' + esc(c.portrait) + '" alt="" width="48" height="60">'
      : '<span class="co-pic co-pic--none ' + (cls || '') + '" aria-hidden="true"><svg viewBox="0 0 10.97 23.77" focusable="false"><rect x="0.5" y="0.5" width="9.97" height="22.77"/><path d="M0.5 11.885h9.97"/></svg></span>';
  }

  function renderKpis(list) {
    var st = list.map(status);
    var k = [
      ['On the public page', list.length, list.length === 1 ? 'coach, the Head Pro' : 'coaches'],
      ['Published by the club', F.published.length, 'the coaches the club names'],
      ['Edited here', st.filter(function (s) { return s === 'edited'; }).length, 'kept in this browser'],
      ['Added here', st.filter(function (s) { return s === 'added'; }).length, 'kept in this browser']
    ];
    $('[data-co-kpis]').innerHTML = k.map(function (x) {
      return '<div class="pn-kpi"><p class="pn-kpi__label">' + esc(x[0]) + '</p><p class="pn-kpi__value pn-num">' + x[1] + '</p><p class="pn-kpi__note">' + esc(x[2]) + '</p></div>';
    }).join('');
  }

  function renderList() {
    var list = roster();
    renderKpis(list);
    $('[data-co-count]').textContent = list.length + (list.length === 1 ? ' coach' : ' coaches') + ' in the order the page shows them.';
    var dis = CAN ? '' : ' aria-disabled="true" title="' + esc(WHO) + ' only"';
    $('[data-co-list]').innerHTML = '<ul class="co-rows" role="list">' + list.map(function (c) {
      var p = PUB[c.id] || {};
      return '<li class="co-row" data-co-id="' + esc(c.id) + '">' +
        portrait(c) +
        '<div class="co-row__who">' +
          '<p class="co-row__role">' + esc(c.role || 'Role to confirm') + (c.id === 'josh-borenstein' && c.role === p.role ? ' ' + UI.confirmSlot(p.role_gap) : '') + '</p>' +
          '<h3 class="co-row__name">' + esc(c.name) + '</h3>' +
          '<p class="co-row__status">' + STATUS[status(c)] + '</p>' +
        '</div>' +
        '<dl class="pn-dl co-row__dl">' +
          '<div><dt>Certification</dt><dd>' + (c.certification ? esc(c.certification) : UI.confirmSlot(p.certification_gap || 'Coaching certification')) + '</dd></div>' +
          '<div><dt>Coaching here since</dt><dd class="pn-num">' + (c.since ? esc(c.since) : UI.confirmSlot(p.since_gap || 'The year they began coaching here')) + '</dd></div>' +
          '<div><dt>Coaches in</dt><dd>' + tags(c.programs || []) + '</dd></div>' +
        '</dl>' +
        '<div class="co-row__acts">' +
          '<button type="button" class="pn-btn pn-btn--ink pn-btn--sm" data-co-edit="' + esc(c.id) + '"' + dis + '>Edit<span class="sr-only"> ' + esc(c.name) + '</span></button>' +
          '<a class="pn-btn pn-btn--quiet pn-btn--sm co-row__link" href="' + esc(anchor(c.id)) + '">Our Coaches <span class="co-hash">#' + esc(c.id) + '</span><span class="sr-only">: ' + esc(c.name) + ' on the public page</span></a>' +
        '</div>' +
      '</li>';
    }).join('') + '</ul>';
  }

  function renderFormat() {
    $('[data-co-format]').innerHTML =
      '<article class="co-entry" aria-labelledby="co-entry-name">' +
        '<span class="co-pic co-pic--none co-pic--lg" aria-hidden="true"><svg viewBox="0 0 10.97 23.77" focusable="false"><rect x="0.5" y="0.5" width="9.97" height="22.77"/><path d="M0.5 11.885h9.97"/></svg></span>' +
        '<div class="co-entry__body"><p class="co-row__role">The entry format</p><p class="co-entry__name" id="co-entry-name">A coach&rsquo;s name</p>' +
        '<dl class="pn-dl">' + F.format.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd class="pn-muted">' + esc(r[1]) + '</dd></div>'; }).join('') +
        '<div><dt>Portrait</dt><dd class="pn-muted">One real photo, 4:5, the same set-up as the Head Pro</dd></div></dl></div>' +
      '</article>' +
      '<div class="co-ask">' + UI.confirmSlot('The coaching team: names, roles, certifications, short bios and portraits') +
        '<p class="pn-muted">' + esc(F.others_gap) + '</p>' +
        '<button type="button" class="pn-btn pn-btn--quiet" data-co-add' + (CAN ? '' : ' aria-disabled="true" title="' + esc(WHO) + ' only"') + '>Add a coach in this format</button>' +
      '</div>';
  }

  /* ---------- The edit sheet ---------- */
  var pending = null;   // the portrait chosen in the open sheet (data URL), or null, or undefined (unchanged)

  function field(id, label, input, help) {
    return '<div class="pn-field"><label class="pn-label" for="' + id + '">' + label + '</label>' + input +
      (help ? '<p class="pn-help" id="' + id + '-help">' + help + '</p>' : '') + '<p class="pn-error" id="' + id + '-err" hidden></p></div>';
  }

  function openSheet(id) {
    if (!CAN) { UI.toast(WHO + ' only. Editing coaches is not open to the Front desk.', { kind: 'warn' }); return; }
    var list = roster();
    var c = id ? list.filter(function (x) { return x.id === id; })[0] : null;
    var isNew = !c;
    var p = c ? (PUB[c.id] || {}) : {};
    c = c || { id: '', name: '', role: '', certification: null, since: null, bio: '', programs: [], portrait: null, origin: 'added' };
    pending = undefined;
    var st = isNew ? 'added' : status(c);
    var body =
      '<form class="pn-form co-form" novalidate data-co-form>' +
        '<p class="co-form__demo">' + UI.icon('alert', 'icon--16') + '<span>Saved in this browser only, for the demo. The published page does not change for anyone else.</span></p>' +
        field('co-name', 'Name', '<input class="pn-input" id="co-name" name="name" autocomplete="off" required aria-required="true" aria-describedby="co-name-help" value="' + esc(c.name) + '">',
          isNew ? 'As the club confirms it. The link on the public page is made from it once and then stays the same.' : 'Link on the public page: <span class="co-hash">#' + esc(c.id) + '</span>, kept even if the name changes.') +
        '<div class="pn-form__row pn-form__row--2">' +
          field('co-role', 'Role', '<input class="pn-input" id="co-role" name="role" autocomplete="off" placeholder="Their title at the club" aria-describedby="co-role-help" value="' + esc(c.role || '') + '">',
            p.role_note ? esc(p.role_note) : 'Their title at the club, as the club confirms it.') +
          field('co-since', 'Coaching here since', '<input class="pn-input pn-num" id="co-since" name="since" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="A year" aria-describedby="co-since-help" value="' + esc(c.since || '') + '">',
            'A year from 1951 (the club&rsquo;s founding) to ' + THIS_YEAR + '. Leave empty to show &ldquo;Club to confirm&rdquo;.') +
        '</div>' +
        field('co-cert', 'Certification', '<input class="pn-input" id="co-cert" name="certification" autocomplete="off" placeholder="Their coaching certification" aria-describedby="co-cert-help" value="' + esc(c.certification || '') + '">',
          'Exactly as the certificate names it. Leave empty to show &ldquo;Club to confirm&rdquo;.') +
        field('co-bio', 'Short bio', '<textarea class="pn-textarea" id="co-bio" name="bio" rows="5" maxlength="600" aria-describedby="co-bio-help">' + esc(c.bio || '') + '</textarea>',
          '<span data-co-bio-count>' + (c.bio || '').length + '</span> of 600 characters. A few lines, facts the coach or the club has confirmed.') +
        '<fieldset class="co-progs"><legend class="pn-label">Programs they lead</legend><p class="pn-help">Each becomes a link on the public page.</p><div class="co-progs__grid">' +
          F.programs.map(function (pr) {
            var on = (c.programs || []).indexOf(pr.id) > -1;
            return '<label class="pn-check co-prog"><input type="checkbox" name="programs" value="' + pr.id + '"' + (on ? ' checked' : '') + '><span class="pn-tag pn-tag--' + pr.tag + '">' + esc(pr.label) + '</span></label>';
          }).join('') +
        '</div></fieldset>' +
        '<fieldset class="co-photo"><legend class="pn-label">Portrait</legend>' +
          '<div class="co-photo__row"><div class="co-photo__frame" data-co-preview>' + previewHtml(c.portrait, c.name) + '</div>' +
          '<div class="co-photo__ctl"><label class="pn-btn pn-btn--quiet co-photo__pick" for="co-file">' + UI.icon('plus', 'icon--16') + 'Choose a photo</label>' +
          '<input class="co-photo__file" type="file" id="co-file" accept="image/jpeg,image/png,image/webp" aria-describedby="co-file-help">' +
          '<button type="button" class="pn-btn pn-btn--text" data-co-photo-clear' + (c.portrait ? '' : ' hidden') + '>Remove the portrait</button>' +
          '<p class="pn-help" id="co-file-help">JPEG, PNG or WebP. Cropped to 4:5 and made smaller here, in the browser; nothing is uploaded.' + (p.portrait_gap ? ' ' + esc(p.portrait_gap) : '') + '</p>' +
          '<p class="pn-error" id="co-file-err" hidden></p></div></div>' +
        '</fieldset>' +
      '</form>';
    var foot =
      (!isNew && st === 'added' ? '<button class="pn-btn pn-btn--danger co-foot__left" type="button" data-co-remove>Remove coach</button>' : '') +
      (!isNew && st === 'edited' ? '<button class="pn-btn pn-btn--quiet co-foot__left" type="button" data-co-revert>Back to the published entry</button>' : '') +
      '<button class="pn-btn pn-btn--quiet" type="button" data-sheet-close>Cancel</button>' +
      '<button class="pn-btn pn-btn--ink" type="button" data-co-save>' + (isNew ? 'Add to Our Coaches' : 'Save') + '</button>';
    var sh = UI.sheet.open({ kicker: isNew ? 'New coach' : (st === 'published' ? 'Published entry' : st === 'edited' ? 'Edited in this browser' : 'Added in this browser'),
      title: isNew ? 'Add a coach' : c.name, body: body, foot: foot, wide: true });
    wire(sh, c, isNew);
  }

  function previewHtml(src, name) {
    return src ? '<img src="' + esc(src) + '" alt="' + esc('Portrait of ' + (name || 'the coach') + ', preview') + '">'
      : '<span class="co-photo__none">No portrait yet. The page shows the frame &ldquo;To be photographed&rdquo;.</span>';
  }

  function setErr(sh, id, msg) {
    var inp = $('#' + id, sh), e = $('#' + id + '-err', sh);
    if (!e) return;
    if (msg) {
      e.innerHTML = UI.icon('alert') + '<span>' + esc(msg) + '</span>'; e.hidden = false;
      if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', id + '-err ' + id + '-help'); }
    } else {
      e.hidden = true; e.innerHTML = '';
      if (inp) { inp.removeAttribute('aria-invalid'); inp.setAttribute('aria-describedby', id + '-help'); }
    }
  }

  /* A portrait is drawn to a 480 x 600 canvas (4:5, centre crop) and kept as a JPEG data URL,
     small enough for local storage. */
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { reject(new Error('type')); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var W = 480, H = 600, r = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        var w = img.naturalWidth * r, h = img.naturalHeight * r;
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var g = cv.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
        g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('read')); };
      img.src = url;
    });
  }

  function wire(sh, c, isNew) {
    var bio = $('#co-bio', sh), cnt = $('[data-co-bio-count]', sh);
    bio.addEventListener('input', function () { cnt.textContent = bio.value.length; });
    var file = $('#co-file', sh), prev = $('[data-co-preview]', sh), clr = $('[data-co-photo-clear]', sh);
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      setErr(sh, 'co-file', '');
      shrink(f).then(function (data) {
        pending = data; prev.innerHTML = previewHtml(data, $('#co-name', sh).value); clr.hidden = false;
      }, function (err) {
        setErr(sh, 'co-file', err.message === 'type' ? 'Choose a JPEG, PNG or WebP photo.' : 'This photo could not be read. Try another file.');
      });
    });
    clr.addEventListener('click', function () { pending = null; file.value = ''; prev.innerHTML = previewHtml(null); clr.hidden = true; file.focus(); });

    $('[data-co-save]', sh).addEventListener('click', function () { save(sh, c, isNew); });
    var rm = $('[data-co-remove]', sh); if (rm) rm.addEventListener('click', function () { remove(c); });
    var rv = $('[data-co-revert]', sh); if (rv) rv.addEventListener('click', function () { revert(c); });
  }

  function save(sh, c, isNew) {
    var name = $('#co-name', sh).value.trim(), since = $('#co-since', sh).value.trim();
    var ok = true;
    setErr(sh, 'co-name', ''); setErr(sh, 'co-since', '');
    if (!name) { setErr(sh, 'co-name', 'Enter the coach’s name.'); ok = false; }
    if (since && (!/^\d{4}$/.test(since) || +since < 1951 || +since > THIS_YEAR)) { setErr(sh, 'co-since', 'Enter a year from 1951 to ' + THIS_YEAR + ', or leave it empty.'); ok = false; }
    if (!ok) { var bad = $('[aria-invalid="true"]', sh); if (bad) bad.focus(); return; }
    var list = roster();
    var next = {
      id: c.id, name: name, role: $('#co-role', sh).value.trim(), certification: $('#co-cert', sh).value.trim() || null,
      since: since || null, bio: $('#co-bio', sh).value.trim(),
      programs: $$('input[name="programs"]:checked', sh).map(function (x) { return x.value; }),
      portrait: pending === undefined ? c.portrait : pending, origin: c.origin || 'added'
    };
    if (isNew) {
      next.id = slug(name, list.map(function (x) { return x.id; }));
      next.origin = 'added';
      list.push(next);
    } else {
      list = list.map(function (x) { return x.id === c.id ? next : x; });
    }
    if (!write(list)) {
      setErr(sh, 'co-file', 'This browser could not keep the entry (its storage is full or blocked). Try a smaller photo, or remove it.');
      return;
    }
    UI.sheet.close();
    renderList();
    UI.toast((isNew ? name + ' added' : name + ' saved') + ' in this browser. Our Coaches shows it here only.', {
      ms: 9000, action: { label: 'View on the page', run: function () { location.href = anchor(next.id); } }
    });
    focusRow(next.id);
  }

  function focusRow(id) {
    setTimeout(function () { var b = $('[data-co-edit="' + id + '"]'); if (b) b.focus(); }, 30);
  }

  function remove(c) {
    UI.sheet.close();
    UI.confirm({ title: 'Remove ' + c.name + '?', body: '<p>The entry leaves Our Coaches in this browser. It was added here for the demo; the club&rsquo;s published page never had it.</p>',
      confirm: 'Remove coach', cancel: 'Keep it', danger: true }).then(function (yes) {
      if (!yes) { focusRow(c.id); return; }
      var before = roster();
      write(before.filter(function (x) { return x.id !== c.id; }));
      renderList();
      UI.toast(c.name + ' removed from this browser.', { action: { label: 'Undo', run: function () { write(before); renderList(); focusRow(c.id); } } });
      var first = $('[data-co-edit]'); if (first) first.focus();
    });
  }

  function revert(c) {
    var p = PUB[c.id]; if (!p) return;
    var before = roster();
    var list = before.map(function (x) { return x.id === c.id ? published().filter(function (y) { return y.id === c.id; })[0] : x; });
    if (list.every(function (x) { return status(x) === 'published'; }) && list.length === F.published.length) clearAll(); else write(list);
    UI.sheet.close();
    renderList();
    UI.toast(c.name + ' is back to the published entry.', { action: { label: 'Undo', run: function () { write(before); renderList(); focusRow(c.id); } } });
    focusRow(c.id);
  }

  /* ---------- Start ---------- */
  function init() {
    renderList();
    renderFormat();
    if (!CAN) {
      var n = $('[data-co-rolenote]');
      n.innerHTML = UI.icon('alert') + '<span>Signed in as ' + esc(D.roleName()) + ': you can read the entries and open them on the public page. Editing is for the ' + esc(WHO) + '.</span>';
      n.hidden = false;
      $$('[data-co-add]').forEach(function (b) { b.setAttribute('aria-disabled', 'true'); b.setAttribute('title', WHO + ' only'); });
    }
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null; if (!t) return;
      var ed = t.closest('[data-co-edit]'); if (ed) { openSheet(ed.getAttribute('data-co-edit')); return; }
      if (t.closest('[data-co-add]')) openSheet(null);
    });
    /* Reset demo clears the roster too */
    window.addEventListener('panel:change', function (e) { if (e.detail && e.detail.collection === '*') { clearAll(); renderList(); } });
    /* Another tab (or the public page) may have changed it */
    window.addEventListener('storage', function (e) { if (e.key === KEY) renderList(); });
    var q = new URLSearchParams(location.search);
    if (q.get('coach')) openSheet(q.get('coach'));
    else if (q.get('add') === '1') openSheet(null);
  }
  init();
})();
