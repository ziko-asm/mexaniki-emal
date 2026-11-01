/* Two machined parts in 3D on plain 2D canvases (no libraries).
   Each part is a surface of revolution (the way a lathe makes it) with drilled holes.
   The parts turn as the page scrolls, can be dragged, and the button shows the underside. */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BG = '#0b0f15';

  /* ---------- part definitions: profile (r, y) walked around the cross-section ---------- */
  var PARTS = {
    // weld-neck flange: plate with chamfers, tapered neck, 8 bolt holes
    flange: {
      profile: [[0.32, 0], [0.97, 0], [1.0, 0.03], [1.0, 0.15], [0.97, 0.18], [0.61, 0.18], [0.57, 0.21],
                [0.45, 0.52], [0.42, 0.55], [0.35, 0.55], [0.32, 0.52], [0.32, 0]],
      holes: { n: 8, R: 0.79, r: 0.068, y0: 0, y1: 0.18 },
      lift: 0.27
    },
    // V-belt pulley: rim with three grooves, thin web with six lightening holes, hub and bore
    pulley: {
      profile: [[0.20, 0], [0.45, 0], [0.45, 0.20], [0.82, 0.20], [0.82, 0], [0.97, 0], [1.0, 0.03],
                [1.0, 0.075], [0.86, 0.125], [1.0, 0.175], [1.0, 0.20], [0.86, 0.25], [1.0, 0.30],
                [1.0, 0.325], [0.86, 0.375], [1.0, 0.425], [1.0, 0.47], [0.97, 0.5], [0.82, 0.5],
                [0.82, 0.30], [0.45, 0.30], [0.45, 0.5], [0.23, 0.5], [0.20, 0.47], [0.20, 0]],
      holes: { n: 6, R: 0.635, r: 0.105, y0: 0.20, y1: 0.30 },
      lift: 0.25
    }
  };

  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  // Revolve the profile. Long edges are split so the painter's sort stays correct,
  // and flat faces alternate brightness slightly, like the rings a cutting tool leaves.
  function build(def) {
    var N = 72, quads = [], P = def.profile, j, i, k;
    for (j = 0; j < P.length - 1; j++) {
      var p = P[j], q = P[j + 1], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      var parts = Math.max(1, Math.ceil(len / 0.07)), flat = Math.abs(q[1] - p[1]) < 1e-6;
      for (k = 0; k < parts; k++) {
        var a = [p[0] + (q[0] - p[0]) * k / parts, p[1] + (q[1] - p[1]) * k / parts];
        var b = [p[0] + (q[0] - p[0]) * (k + 1) / parts, p[1] + (q[1] - p[1]) * (k + 1) / parts];
        var tone = flat ? (k % 2 ? 1.035 : 0.965) : 1;
        for (i = 0; i < N; i++) {
          var t0 = i / N * 2 * Math.PI, t1 = (i + 1) / N * 2 * Math.PI, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
          quads.push({ v: [[a[0] * c0, a[1], a[0] * s0], [a[0] * c1, a[1], a[0] * s1], [b[0] * c1, b[1], b[0] * s1], [b[0] * c0, b[1], b[0] * s0]], tone: tone });
        }
      }
    }
    var H = def.holes, holes = [];
    for (i = 0; i < H.n; i++) {
      var ha = (i + 0.5) / H.n * 2 * Math.PI, cx = H.R * Math.cos(ha), cz = H.R * Math.sin(ha), top = [], bot = [];
      for (k = 0; k < 28; k++) {
        var t = k / 28 * 2 * Math.PI, x = cx + H.r * Math.cos(t), z = cz + H.r * Math.sin(t);
        top.push([x, H.y1, z]); bot.push([x, H.y0, z]);
      }
      holes.push({ top: top, bot: bot, c: [cx, (H.y0 + H.y1) / 2, cz] });
    }
    return { quads: quads, holes: holes, lift: def.lift, bottom: Math.min.apply(null, P.map(function (p) { return p[1]; })) };
  }

  /* ---------- one viewer per canvas ---------- */
  function Viewer(cv, part) {
    var ctx = cv.getContext('2d'), geo = build(PARTS[part]);
    var W = 0, Hh = 0, S = 1, dpr = 1, drag = 0, scrollYaw = 0, tilt = 0, base = 0.5, cur = 0.5, raf = 0, visible = true;
    var phase = part === 'pulley' ? 1.3 : 0;   // the two parts start at different angles
    var KEY = norm([-0.5, 0.75, 0.45]), RIM = norm([0.7, -0.2, 0.3]), STEEL = [172, 183, 198];

    function resize() {
      var r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; Hh = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
      S = Math.min(W, Hh) * 0.40;
      draw();
    }
    function cam(p, yaw, pitch) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, y = p[1] - geo.lift;
      return [x, y * cp - z * sp, y * sp + z * cp];
    }
    function scr(v) { var k = 3.4 / (3.4 - v[2]); return [W / 2 + v[0] * S * k, Hh / 2 - v[1] * S * k]; }
    function normal(a, b, c) {
      var u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      return norm([u[2] * w[1] - u[1] * w[2], u[0] * w[2] - u[2] * w[0], u[1] * w[0] - u[0] * w[1]]);
    }
    function color(n, tone) {
      var d = Math.max(0, n[0] * KEY[0] + n[1] * KEY[1] + n[2] * KEY[2]);
      var rim = Math.max(0, n[0] * RIM[0] + n[1] * RIM[1] + n[2] * RIM[2]) * 0.25;
      var h = norm([KEY[0], KEY[1], KEY[2] + 1]);   // half vector, viewer on +z
      var spec = Math.pow(Math.max(0, n[0] * h[0] + n[1] * h[1] + n[2] * h[2]), 40) * 90;
      var s = (0.26 + 0.62 * d + rim) * tone;
      return 'rgb(' + Math.min(255, STEEL[0] * s + spec | 0) + ',' + Math.min(255, STEEL[1] * s + spec | 0) + ',' + Math.min(255, STEEL[2] * s + spec | 0) + ')';
    }
    function path(pts) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var t = 1; t < pts.length; t++) ctx.lineTo(pts[t][0], pts[t][1]);
      ctx.closePath();
    }

    function draw() {
      if (!W) return;
      var yaw = phase + drag + scrollYaw, pitch = cur + tilt, k, v, n;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, Hh);

      // soft contact shadow under the part (only when we look from above)
      if (pitch > 0.05) {
        var f = scr(cam([0, geo.bottom - 0.02, 0], yaw, pitch)), sq = Math.max(0.12, Math.sin(pitch));
        ctx.save(); ctx.translate(f[0], f[1] + S * 0.05); ctx.scale(1, sq);
        var g = ctx.createRadialGradient(0, 0, S * 0.2, 0, 0, S * 1.25);
        g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, S * 1.25, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
      }

      var list = [];
      for (k = 0; k < geo.quads.length; k++) {
        var q = geo.quads[k];
        v = [cam(q.v[0], yaw, pitch), cam(q.v[1], yaw, pitch), cam(q.v[2], yaw, pitch), cam(q.v[3], yaw, pitch)];
        n = normal(v[0], v[1], v[2]);
        if (n[2] <= 0.0005) continue;                     // facing away
        list.push({ z: (v[0][2] + v[1][2] + v[2][2] + v[3][2]) / 4, pts: v.map(scr), fill: color(n, q.tone) });
      }
      // a drilled hole: clip to the opening on the visible face, paint the bore wall, then the far opening
      var up = cam([0, 1, 0], yaw, pitch)[2] - cam([0, 0, 0], yaw, pitch)[2];
      for (k = 0; k < geo.holes.length; k++) {
        var hole = geo.holes[k], near = up > 0 ? hole.top : hole.bot, far = up > 0 ? hole.bot : hole.top;
        var nv = near.map(function (p) { return cam(p, yaw, pitch); }), zmax = -9;
        for (var m = 0; m < nv.length; m++) zmax = Math.max(zmax, nv[m][2]);
        // sort by the opening's nearest point: just after the face it is cut into, before anything in front
        list.push({ z: zmax + 0.02, hole: true, near: nv.map(scr),
                    far: far.map(function (p) { return scr(cam(p, yaw, pitch)); }) });
      }
      list.sort(function (a, b) { return a.z - b.z; });

      ctx.lineJoin = 'round'; ctx.lineWidth = 0.8;
      for (k = 0; k < list.length; k++) {
        var it = list[k];
        if (it.hole) {
          ctx.save(); path(it.near); ctx.clip();
          ctx.fillStyle = '#262c36'; ctx.fill();
          path(it.far); ctx.fillStyle = BG; ctx.fill();
          ctx.restore();
          path(it.near); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
        } else {
          path(it.pts); ctx.fillStyle = it.fill; ctx.strokeStyle = it.fill; ctx.fill(); ctx.stroke();
        }
      }
    }

    function frame() {
      raf = 0;
      cur += (base - cur) * 0.12;
      draw();
      if (Math.abs(base - cur) > 0.002 && visible) raf = requestAnimationFrame(frame); else cur = base;
    }
    function kick() { if (!raf && visible) raf = requestAnimationFrame(frame); }

    // scrolling turns the part and tilts it a little as it passes through the screen
    this.onScroll = function () {
      if (!visible) return;
      var r = cv.getBoundingClientRect(), mid = (r.top + r.height / 2) / innerHeight - 0.5;
      scrollYaw = (window.scrollY || pageYOffset) * 0.006;
      tilt = reduce ? 0 : -mid * 0.35;
      kick();
    };

    var down = false, lx = 0, ly = 0;
    cv.addEventListener('pointerdown', function (e) { down = true; lx = e.clientX; ly = e.clientY; if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) {
      if (!down) return;
      drag -= (e.clientX - lx) * 0.012;
      if (e.pointerType === 'mouse') base = cur = Math.max(-1.45, Math.min(1.45, cur + (e.clientY - ly) * 0.01));
      lx = e.clientX; ly = e.clientY; draw();
    });
    function up() { down = false; }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('keydown', function (e) {
      var d = { ArrowLeft: [0.25, 0], ArrowRight: [-0.25, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[e.key];
      if (!d) return;
      e.preventDefault(); drag += d[0]; base = cur = Math.max(-1.45, Math.min(1.45, cur + d[1])); draw();
    });
    this.flip = function () { var below = base > 0; base = below ? -0.8 : 0.5; kick(); return below; };

    if ('IntersectionObserver' in window) {
      var self = this;
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) self.onScroll(); }, { rootMargin: '100px' }).observe(cv);
    }
    window.addEventListener('resize', resize);
    resize();
  }

  var viewers = [].slice.call(document.querySelectorAll('canvas[data-part]')).filter(function (c) { return c.getContext; })
    .map(function (c) { return new Viewer(c, c.getAttribute('data-part')); });
  if (!viewers.length) return;

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { ticking = false; viewers.forEach(function (v) { v.onScroll(); }); });
  }, { passive: true });
  viewers.forEach(function (v) { v.onScroll(); });

  var btn = document.getElementById('parts-flip');
  if (btn) btn.addEventListener('click', function () {
    var below = false;
    viewers.forEach(function (v) { below = v.flip(); });
    btn.setAttribute('aria-pressed', below ? 'true' : 'false');
    btn.textContent = below ? btn.getAttribute('data-top') : btn.getAttribute('data-bottom');
  });
})();
