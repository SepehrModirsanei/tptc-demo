/* Court Bookings: fills the booking window with real dates. A day opens at 7:30am (club rule),
   members book up to 7 days ahead and non-members 1 day ahead, so the sheet starts today. Without
   script the sheet still reads: today, then days 1 to 7. */
(function () {
  'use strict';
  var root = document.querySelector('.cb-window');
  if (!root) return;
  var days = root.querySelectorAll('.cb-window__days li');
  var dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var now = new Date();
  function at(n) { var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n); return d; }
  function label(d) { return dow[d.getDay()] + ' ' + mon[d.getMonth()] + ' ' + d.getDate(); }
  for (var i = 0; i < days.length; i++) {
    var d = at(i);
    days[i].querySelector('.cb-window__dow').textContent = i === 0 ? 'Today' : dow[d.getDay()];
    days[i].querySelector('.cb-window__d').textContent = (i === 0 || d.getDate() === 1 ? mon[d.getMonth()] + ' ' : '') + d.getDate();
  }
  var m = root.querySelector('[data-cbw-member]');
  var p = root.querySelector('[data-cbw-public]');
  var t = root.querySelector('[data-cbw-today]');
  if (m) m.textContent = 'Today to ' + label(at(7));
  if (p) p.textContent = 'Today and ' + label(at(1));
  if (t) t.textContent = 'From today, ' + label(at(0)) + '.';
})();
