/* Facilities only. The season switch (shared select, name=season) tells the drawing which season
   to show: Indoor raises the dome over the four nets, Outdoor lets it down. The movement itself is
   CSS (transform and opacity only), and under reduced motion the change is instant. */
(function () {
  var fig = document.querySelector('.seasons__fig');
  if (!fig) return;
  document.addEventListener('tptc:select', function (e) {
    if (!e.detail || e.detail.name !== 'season') return;
    fig.setAttribute('data-season', e.detail.value);
  });
})();
