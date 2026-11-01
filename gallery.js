/* "Görülən işlər" as a pinned horizontal gallery: while the section is on screen, scrolling down
   moves the photos sideways in one row. The photo in the middle is full size; the others turn
   away in 3D and fade. Falls back to the normal grid on very short screens or with reduced motion. */
(function () {
  var sec = document.getElementById('isler'), grid = document.getElementById('grid');
  if (!sec || !grid) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var sticky = sec.querySelector('.hs-sticky'), bar = sec.querySelector('.hs-bar i'), cur = sec.querySelector('[data-cur]');
  var cards = [], centers = [], on = false, dist = 0, top = 0, span = 1, last = -1, queued = false, prev = [];

  function setup() {
    cards = [].slice.call(grid.querySelectorAll('.card'));
    var total = sec.querySelector('[data-total]');
    if (total) total.textContent = String(cards.length).padStart(2, '0');
    layout();
    // photos slide in from the side, so load them all now instead of waiting for lazy loading
    if (on) [].forEach.call(grid.querySelectorAll('img'), function (im) { im.loading = 'eager'; });
  }

  // all measuring happens here, never while scrolling
  function layout() {
    var head = document.querySelector('.top'), headH = head ? head.offsetHeight : 0;
    var barH = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    var h = innerHeight - headH - barH;
    on = !reduce && h >= 480 && cards.length > 1;
    sec.classList.toggle('hs-on', on);
    grid.style.transform = '';
    cards.forEach(function (c) { c.style.transform = ''; c.style.opacity = ''; });
    prev = [];
    if (!on) { sec.style.height = ''; return; }
    // the heading lives in the pinned box, so show it right away instead of waiting for the reveal animation
    [].forEach.call(sec.querySelectorAll('.rv'), function (el) { el.classList.add('in'); });
    // photo height: what is left after the heading, caption and progress bar
    var imgH = Math.max(200, Math.min(560, h - (innerWidth < 600 ? 300 : 330)));
    var cardW = Math.min(Math.round(imgH * 0.78), Math.round(innerWidth * 0.76), 440);
    sec.style.setProperty('--hs-top', headH + 'px');
    sec.style.setProperty('--hs-h', h + 'px');
    sec.style.setProperty('--img-h', imgH + 'px');
    sec.style.setProperty('--card-w', cardW + 'px');
    centers = cards.map(function (c) { return c.offsetLeft + c.offsetWidth / 2; });
    dist = Math.max(0, centers[centers.length - 1] - centers[0]);
    sec.style.height = (dist * 1.1 + h) + 'px';            // a little more scroll than distance: calmer
    top = sec.getBoundingClientRect().top + scrollY - headH;
    span = Math.max(1, sec.offsetHeight - h);
    update();
  }

  function update() {
    queued = false;
    if (!on) return;
    var p = Math.min(1, Math.max(0, (scrollY - top) / span)), vw = sticky.clientWidth, x = vw / 2 - centers[0] - p * dist;
    grid.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
    if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    var best = 0, bestD = 1e9;
    for (var i = 0; i < cards.length; i++) {
      var off = (centers[i] + x - vw / 2) / vw;                // -1 .. 1 across the screen
      var k = Math.max(0, 1 - Math.abs(off) * 1.6);
      var key = Math.round(off * 200);
      if (prev[i] !== key) {
        prev[i] = key;
        var ang = Math.max(-55, Math.min(55, -off * 70));
        cards[i].style.transform = 'perspective(1100px) rotateY(' + ang.toFixed(1) + 'deg) scale(' + (0.8 + 0.2 * k).toFixed(3) + ')';
        cards[i].style.opacity = (0.35 + 0.65 * k).toFixed(2);
      }
      if (Math.abs(off) < bestD) { bestD = Math.abs(off); best = i; }
    }
    if (best !== last) {
      last = best;
      if (cur) cur.textContent = String(best + 1).padStart(2, '0');
      cards.forEach(function (c, j) { c.classList.toggle('active', j === best); });
    }
  }
  function onScroll() { if (!queued) { queued = true; requestAnimationFrame(update); } }

  // keyboard users: bring a focused photo to the middle
  sec.addEventListener('focusin', function (e) {
    var c = e.target.closest && e.target.closest('.card');
    if (!on || !c) return;
    sticky.scrollLeft = 0;
    var i = cards.indexOf(c);
    scrollTo({ top: top + (dist ? (centers[i] - centers[0]) / dist : 0) * span });
  });

  addEventListener('scroll', onScroll, { passive: true });
  var rz; addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(layout, 150); });
  addEventListener('load', layout);
  setup();
})();
