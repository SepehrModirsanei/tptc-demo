/* FAQ page script: search, topic index, deep links, copy link.
   site.js opens and closes the answers; this adds what only this page needs.
   Stories: the index marks where you stand like the centre mark; a linked answer opens itself
   (the front desk answers once, then sends the link). */
(function () {
  'use strict';
  var doc = document;
  var root = doc.querySelector('.faqx');
  if (!root) return;
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var groups = $$('.faq__group', root);
  var items = $$('.acc__item', root);
  var input = doc.getElementById('faq-search');
  var clear = doc.querySelector('.faqsearch__clear');
  var status = doc.getElementById('faq-status');
  var empty = doc.getElementById('faq-empty');
  var emptyQ = empty ? empty.querySelector('[data-empty-q]') : null;
  var links = $$('.faqidx a', root);
  var words = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

  /* Keep each question's original text for highlighting, and its full text for matching */
  items.forEach(function (it) {
    var q = it.querySelector('.acc__q');
    it._q = q.textContent;
    it._text = (it._q + ' ' + it.querySelector('.acc__panel').textContent).toLowerCase();
  });

  function setOpen(it, open) {
    var b = it.querySelector('.acc__btn');
    var p = doc.getElementById(b.getAttribute('aria-controls'));
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    p.hidden = !open;
  }

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function highlight(it, terms) {
    var q = it.querySelector('.acc__q');
    if (!terms.length) { q.textContent = it._q; return; }
    var re = new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    q.innerHTML = esc(it._q).replace(re, '<mark>$1</mark>');
  }

  function filter() {
    var raw = input.value.trim();
    var terms = raw.toLowerCase().split(/\s+/).filter(function (t) { return t.length > 1; });
    var shown = 0, topics = 0;
    groups.forEach(function (g) {
      var n = 0;
      $$('.acc__item', g).forEach(function (it) {
        var hit = terms.every(function (t) { return it._text.indexOf(t) !== -1; });
        it.hidden = !hit;
        highlight(it, terms);
        if (hit) n++;
      });
      g.hidden = n === 0;
      $$('[data-count="' + g.id + '"]', doc).forEach(function (c) { c.textContent = n; });
      var ht = doc.querySelector('.faq-topics a[data-topic="' + g.id + '"]');
      if (ht) { ht.classList.toggle('is-empty', n === 0); ht.style.setProperty('--n', n); } /* the card's strokes follow the search */
      var cnt = g.querySelector('.faq__count');
      if (cnt) cnt.lastChild.textContent = n === 1 ? ' question' : ' questions';
      var a = root.querySelector('.faqidx a[data-topic="' + g.id + '"]');
      if (a) a.classList.toggle('is-empty', n === 0);
      shown += n;
      if (n) topics++;
    });
    var total = doc.querySelector('[data-card-total]');
    if (total) total.textContent = shown;
    if (clear) clear.hidden = !raw;
    if (empty) { empty.hidden = shown !== 0; if (emptyQ) emptyQ.textContent = raw; }
    if (!raw) status.innerHTML = '<span class="num">' + items.length + '</span> questions in six topics.';
    else if (shown) status.innerHTML = '<span class="num">' + shown + '</span> ' + (shown === 1 ? 'question matches' : 'questions match') + ' in ' + (words[topics] || topics) + (topics === 1 ? ' topic.' : ' topics.');
    else status.textContent = 'No question matches.';
    spy();
  }

  if (input) {
    input.addEventListener('input', filter);
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && input.value) { input.value = ''; filter(); } });
    var form = input.closest('form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); });
  }
  if (clear) clear.addEventListener('click', function () { input.value = ''; filter(); input.focus(); });

  /* Topic index: the centre mark follows the topic in view */
  function mark(id) {
    links.forEach(function (a) {
      if (a.getAttribute('data-topic') === id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  /* The topic whose heading has passed 35% of the viewport; above the first topic, the first.
     A scroll position, not an observer, so returning to the top marks Programs again. */
  var ticking = false;
  function spy() {
    ticking = false;
    var line = window.innerHeight * 0.35, cur = null;
    groups.forEach(function (g) { if (!g.hidden && g.getBoundingClientRect().top <= line) cur = g; });
    if (!cur) cur = groups.filter(function (g) { return !g.hidden; })[0];
    if (cur) mark(cur.id);
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
  mark(groups[0] && groups[0].id);
  spy();
  links.forEach(function (a) {
    a.addEventListener('click', function () { mark(a.getAttribute('data-topic')); });
  });

  /* Deep links: #question opens that answer and marks it */
  function openFromHash(scroll) {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var it = doc.getElementById(id);
    if (!it || !it.classList.contains('acc__item')) return;
    if (it.hidden && input) { input.value = ''; filter(); }
    setOpen(it, true);
    it.classList.remove('is-target');
    void it.offsetWidth;
    it.classList.add('is-target');
    if (scroll) it.scrollIntoView({ block: 'start' });
  }
  openFromHash(true);
  window.addEventListener('hashchange', function () { openFromHash(true); });

  /* Phones and tablets: while the hero's six topics are on screen the travelling index under the
     header stays out of the way, so the same six names are never shown twice. It docks once the
     hero's row has scrolled off. Its space is always reserved, so nothing shifts. */
  var heroTopics = doc.querySelector('.faq-topics');
  var idx = root.querySelector('.faqidx');
  if (heroTopics && idx && 'IntersectionObserver' in window) {
    idx.classList.add('is-waiting');
    new IntersectionObserver(function (es) {
      idx.classList.toggle('is-waiting', es[0].isIntersecting);
    }, { rootMargin: '-72px 0px 0px 0px' }).observe(heroTopics);
  }

  /* Opening an answer puts its address in the bar, so it can be shared as is */
  items.forEach(function (it) {
    var b = it.querySelector('.acc__btn');
    b.addEventListener('click', function () {
      if (b.getAttribute('aria-expanded') === 'true' && history.replaceState) history.replaceState(null, '', '#' + it.id);
    });
    /* Copy link to this answer */
    var p = it.querySelector('.acc__panel');
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'faq-copy';
    btn.setAttribute('aria-live', 'polite');
    btn.innerHTML = '<span>Copy link to this answer</span>';
    btn.addEventListener('click', function () {
      var url = location.href.split('#')[0] + '#' + it.id;
      var done = function (label) {
        btn.setAttribute('data-done', '');
        btn.innerHTML = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-check"/></svg><span>' + (label || 'Link copied') + '</span>';
        setTimeout(function () { btn.removeAttribute('data-done'); btn.innerHTML = '<span>Copy link to this answer</span>'; }, 2400);
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(function () { done(); }, function () { history.replaceState(null, '', '#' + it.id); done('Link is in the address bar'); });
      else { if (history.replaceState) history.replaceState(null, '', '#' + it.id); done('Link is in the address bar'); }
    });
    p.appendChild(btn);
  });
})();
