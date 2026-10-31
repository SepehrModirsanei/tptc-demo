/* Our Coaches: staff edits from the demo panel (B7).

   The page as built is the published content: the Head Pro, the entry format and the club's
   open question about the rest of the team. The staff panel (site/panel/coaches/) keeps any
   edits in this browser's localStorage under 'tptc-coaches-v1'. When that key exists, this
   script shows those edits here, in this browser only: the Head Pro's fields and portrait, and
   any coach added in the panel as a new entry with its own anchor (#their-name). With no key,
   nothing changes. Nothing is invented: every value shown comes from the published page or from
   what staff typed in the panel, and added entries say so. */
(function () {
  'use strict';
  var KEY = 'tptc-coaches-v1';
  var data = null;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  if (!data || data.v !== 1 || !Array.isArray(data.coaches)) return;

  /* The programs a coach can lead: the public pages, by id (the same list as the panel's) */
  var PROGRAMS = {
    'junior': ['Junior Recreational', 'programs/junior/'],
    'adult': ['Adult Programs', 'programs/adult/'],
    'high-performance': ['High Performance', 'programs/high-performance/'],
    'private-lessons': ['Private Lessons', 'programs/private-lessons/'],
    'camps-summer': ['Summer Camps', 'programs/camps/summer/'],
    'camps-march-break': ['March Break Camp', 'programs/camps/march-break/'],
    'camps-holiday': ['Holiday Camps', 'programs/camps/holiday/'],
    'leagues-events': ['Leagues & Events', 'leagues-events/']
  };
  var HTTP = location.protocol.indexOf('http') === 0;
  function href(route) { return '../../' + route + (HTTP ? '' : 'index.html'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function confirmSlot(what) { return '<span class="confirm"><span class="confirm__tag">Club to confirm</span><span class="confirm__what">' + esc(what) + '</span></span>'; }
  function links(ids) {
    return ids.filter(function (id) { return PROGRAMS[id]; }).map(function (id) {
      return '<a class="coach-in" href="' + href(PROGRAMS[id][1]) + '">' + esc(PROGRAMS[id][0]) + '</a>';
    }).join('\n');
  }
  var EDITED_NOTE = 'Edited in the staff panel demo. Shown in this browser only; the published page is unchanged.';
  var ADDED_NOTE = 'Added in the staff panel demo. Shown in this browser only; the club has not published this entry.';

  /* A portrait from the panel fills the frame the way a real photo does (site.css .frame.has-img) */
  function fillFrame(frame, src, name) {
    if (!frame) return;
    var media = frame.querySelector('.frame__media'); if (!media) return;
    var img = media.querySelector('img.coach-photo');
    if (!src) return;
    if (!img) { img = document.createElement('img'); img.className = 'frame__img is-loaded coach-photo'; img.decoding = 'async'; media.appendChild(img); }
    img.src = src; img.alt = 'Portrait of ' + name;
    frame.classList.add('has-img');
    var tag = frame.querySelector('.frame__tag');
    if (tag) { tag.lastChild.textContent = 'Portrait from the staff panel (demo)'; tag.style.display = 'inline-flex'; }
  }

  /* ---------- The Head Pro: the featured entry, its fields and the hero card ---------- */
  var PUB_ROLE = 'Head Pro';
  function applyLead(c) {
    var art = document.getElementById(c.id); if (!art) return;
    var role = art.querySelector('.coach__role');
    if (role && c.role && c.role !== PUB_ROLE) role.textContent = c.role;   // a new title replaces the "to confirm" slot
    var name = art.querySelector('.lead__name');
    if (name && name.textContent.trim() !== c.name) {
      var h = document.createElement('h2');                               // a fresh node, out of reach of the line split
      h.className = name.className; h.id = name.id; h.textContent = c.name;
      name.parentNode.replaceChild(h, name);
    }
    var bio = art.querySelector('.lead__bio');
    if (bio && c.bio) bio.textContent = c.bio;
    var dds = art.querySelectorAll('.lead__fields dd');
    if (dds[0] && c.certification) dds[0].textContent = c.certification;
    if (dds[1] && c.since) { dds[1].innerHTML = '<span class="num">' + esc(c.since) + '</span>'; }
    if (dds[2]) dds[2].innerHTML = c.programs.length ? links(c.programs) : confirmSlot('Programs they lead');
    art.querySelectorAll('.frame').forEach(function (f) { fillFrame(f, c.portrait, c.name); });
    var body = art.querySelector('.lead__body');
    if (body && !body.querySelector('.coach-demo')) {
      var n = document.createElement('p'); n.className = 'coach-demo'; n.textContent = EDITED_NOTE; body.appendChild(n);
    }
    var card = document.querySelector('[data-coach-card="' + c.id + '"]');
    if (card) {
      var pn = card.querySelector('.procard__name'); if (pn) pn.textContent = c.name;
      var pr = card.querySelector('.coach__role'); if (pr && c.role) pr.textContent = c.role;
      fillFrame(card.querySelector('.frame'), c.portrait, c.name);
    }
  }

  /* ---------- Added coaches: the entry format, filled in ---------- */
  function entry(c) {
    var pic = c.portrait
      ? '<img class="roster__img" src="' + esc(c.portrait) + '" alt="' + esc('Portrait of ' + c.name) + '" width="480" height="600">'
      : '<span class="roster__ph"><span>To be photographed</span></span>';
    var hid = 'coach-' + c.id + '-name';
    return '<article class="coach coach--entry" id="' + esc(c.id) + '" data-coach="' + esc(c.id) + '" aria-labelledby="' + hid + '">' +
      '<div class="roster__pic">' + pic + '</div>' +
      '<div class="roster__body">' +
        '<p class="coach__role">' + (c.role ? esc(c.role) : confirmSlot('Their title at the club')) + '</p>' +
        '<h3 class="roster__name" id="' + hid + '">' + esc(c.name) + '</h3>' +
        (c.bio ? '<p class="roster__bio">' + esc(c.bio) + '</p>' : '') +
        '<dl class="roster__fields">' +
          '<div><dt>Certification</dt><dd>' + (c.certification ? esc(c.certification) : confirmSlot('Their coaching certification')) + '</dd></div>' +
          '<div><dt>Coaching here since</dt><dd>' + (c.since ? '<span class="num">' + esc(c.since) + '</span>' : confirmSlot('The year they began')) + '</dd></div>' +
          '<div class="roster__in"><dt>Coaches in</dt><dd>' + (c.programs.length ? links(c.programs) : confirmSlot('The programs they lead')) + '</dd></div>' +
        '</dl>' +
        '<p class="coach-demo">' + ADDED_NOTE + '</p>' +
      '</div></article>';
  }

  var added = [];
  data.coaches.forEach(function (c) {
    if (!c || !c.id || !c.name) return;
    c.programs = Array.isArray(c.programs) ? c.programs : [];
    if (c.origin === 'published' && document.getElementById(c.id)) applyLead(c);
    else if (c.origin === 'added') added.push(c);
  });
  var roster = document.querySelector('[data-coach-roster]');
  if (roster && added.length) {
    roster.innerHTML = '<h3 class="roster__title">In this browser</h3>' + added.map(entry).join('');
    roster.hidden = false;
  }

  /* An anchor to an entry drawn here (#their-name) did not exist when the page loaded: go to it now */
  var id = decodeURIComponent(location.hash.slice(1));
  if (id && added.some(function (c) { return c.id === id; })) {
    var el = document.getElementById(id);
    if (el) requestAnimationFrame(function () { el.scrollIntoView({ block: 'start' }); });
  }
})();
