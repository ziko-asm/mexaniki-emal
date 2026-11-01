/* Two machined parts in 3D, drawn by a small software renderer (no libraries).
   Each part is a surface of revolution (the way a lathe makes it) with drilled holes.
   Per-pixel depth buffer and per-pixel lighting; holes are cut per pixel and have real bore walls.
   Drag in any direction to turn a part freely; it also turns slowly by itself and with page scroll. */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- parts: profile (r, y) walked around the cross-section, plus hole circles ---------- */
  var PARTS = {
    // weld-neck flange: raised face, plate with chamfers and a decorative groove,
    // tapered neck ending in a weld bevel, 12 bolt holes
    flange: {
      profile: [[0.30, -0.06], [0.60, -0.06], [0.63, -0.03], [0.63, 0], [0.97, 0], [1.0, 0.03], [1.0, 0.17],
                [0.97, 0.20], [0.905, 0.20], [0.885, 0.18], [0.865, 0.20], [0.62, 0.20], [0.585, 0.225],
                [0.565, 0.27], [0.45, 0.60], [0.41, 0.70], [0.34, 0.70], [0.30, 0.66], [0.30, -0.06]],
      holes: [{ n: 12, R: 0.79, r: 0.052, y0: 0, y1: 0.20 }],
      center: 0.32
    },
    // V-belt pulley: four grooves, chamfered rim, web with two rings of lightening holes,
    // long hub sticking out on both sides, chamfered bore
    pulley: {
      profile: [[0.20, -0.14], [0.36, -0.14], [0.40, -0.10], [0.40, 0.18], [0.80, 0.18], [0.80, 0], [0.97, 0],
                [1.0, 0.03], [1.0, 0.06], [0.88, 0.10], [1.0, 0.14], [1.0, 0.16], [0.88, 0.20], [1.0, 0.24],
                [1.0, 0.26], [0.88, 0.30], [1.0, 0.34], [1.0, 0.36], [0.88, 0.40], [1.0, 0.44], [1.0, 0.47],
                [0.97, 0.50], [0.80, 0.50], [0.80, 0.30], [0.40, 0.30], [0.40, 0.60], [0.36, 0.64],
                [0.23, 0.64], [0.20, 0.61], [0.20, -0.14]],
      holes: [{ n: 6, R: 0.64, r: 0.095, y0: 0.18, y1: 0.30 }, { n: 6, R: 0.495, r: 0.04, y0: 0.18, y1: 0.30, phase: 0.5 }],
      center: 0.25
    }
  };

  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  /* ---------- mesh: vertices (position, normal) and triangles with flags ---------- */
  function build(def) {
    var N = 72, P = [], Nn = [], T = [], flags = [], holes = [];
    def.holes.forEach(function (H) {
      for (var i = 0; i < H.n; i++) {
        var a = (i + (H.phase || 0) + 0.5) / H.n * 2 * Math.PI;
        holes.push({ x: H.R * Math.cos(a), z: H.R * Math.sin(a), r: H.r, y0: H.y0, y1: H.y1 });
      }
    });
    function vert(x, y, z, nx, ny, nz) { P.push(x, y, z); Nn.push(nx, ny, nz); return P.length / 3 - 1; }
    function quad(a, b, c, d, flag) { T.push(a, b, c, a, c, d); flags.push(flag, flag); }

    var prof = def.profile;
    for (var j = 0; j < prof.length - 1; j++) {
      var p = prof[j], q = prof[j + 1], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      var nr = (q[1] - p[1]) / len, ny = -(q[0] - p[0]) / len, flat = Math.abs(q[1] - p[1]) < 1e-6;
      var y = p[1], cut = flat && holes.some(function (h) { return Math.abs(h.y0 - y) < 1e-6 || Math.abs(h.y1 - y) < 1e-6; });
      var parts = Math.max(1, Math.ceil(len / 0.06)), rows = [];
      for (var k = 0; k <= parts; k++) {
        var r = p[0] + (q[0] - p[0]) * k / parts, yy = p[1] + (q[1] - p[1]) * k / parts, row = [];
        for (var i = 0; i < N; i++) {
          var t = i / N * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
          row.push(vert(r * c, yy, r * s, nr * c, ny, nr * s));
        }
        rows.push(row);
      }
      // flag bits: 1 = flat face (turning rings), 2 = may contain holes
      var f = (flat ? 1 : 0) | (cut ? 2 : 0);
      for (k = 0; k < parts; k++) for (i = 0; i < N; i++) {
        var i1 = (i + 1) % N;
        quad(rows[k][i], rows[k][i1], rows[k + 1][i1], rows[k + 1][i], f);
      }
    }
    // bore walls of the drilled holes, normals pointing into the hole
    holes.forEach(function (h) {
      var M = 20, top = [], bot = [];
      for (var i = 0; i < M; i++) {
        var t = i / M * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
        top.push(vert(h.x + h.r * c, h.y1, h.z + h.r * s, -c, 0, -s));
        bot.push(vert(h.x + h.r * c, h.y0, h.z + h.r * s, -c, 0, -s));
      }
      for (i = 0; i < M; i++) { var i1 = (i + 1) % M; quad(top[i], top[i1], bot[i1], bot[i], 4); }
    });
    return { P: new Float32Array(P), N: new Float32Array(Nn), T: new Uint32Array(T), F: new Uint8Array(flags), holes: holes, center: def.center };
  }

  /* ---------- 3x3 rotations ---------- */
  function mul(a, b) {
    var r = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  }
  function rotX(t) { var c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function rotY(t) { var c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function ortho(m) {
    var x = norm([m[0], m[3], m[6]]), y = [m[1], m[4], m[7]], d = x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    y = norm([y[0] - d * x[0], y[1] - d * x[1], y[2] - d * x[2]]);
    var z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  }

  var KEY = norm([-0.5, 0.8, 0.45]), FILL = norm([0.75, -0.35, 0.45]), HALF = norm([KEY[0], KEY[1], KEY[2] + 1]);

  /* ---------- one viewer per canvas ---------- */
  function Viewer(cv, part) {
    var ctx = cv.getContext('2d'), g = build(PARTS[part]);
    var nv = g.P.length / 3, SX = new Float32Array(nv), SY = new Float32Array(nv), SZ = new Float32Array(nv), VN = new Float32Array(nv * 3);
    var START = mul(rotX(-0.6), rotY(part === "pulley" ? 1.1 : 0.4));
    var M = START.slice(), W = 0, H = 0, S = 1, img = null, buf = null, zb = null, raf = 0, visible = false, idleUntil = 0, lastScroll = null, down = false;
    var holeLists = triangleHoles();

    // which holes can touch each triangle (so the per-pixel test only checks a few)
    function triangleHoles() {
      var out = [], T = g.T, P = g.P;
      for (var t = 0; t < g.F.length; t++) {
        if (!(g.F[t] & 2)) { out.push(null); continue; }
        var xs = [], zs = [];
        for (var e = 0; e < 3; e++) { var v = T[t * 3 + e]; xs.push(P[v * 3]); zs.push(P[v * 3 + 2]); }
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
        var hs = g.holes.filter(function (h) { return h.x + h.r > x0 && h.x - h.r < x1 && h.z + h.r > z0 && h.z - h.r < z1; });
        out.push(hs.length ? hs : null);
      }
      return out;
    }

    function resize() {
      var r = cv.getBoundingClientRect();
      if (!r.width) { W = 0; return; }
      var scale = Math.min(window.devicePixelRatio || 1, 1.6);   // internal resolution: sharp but affordable
      W = Math.min(760, Math.round(r.width * scale)); H = Math.round(W * r.height / r.width);
      cv.width = W; cv.height = H;
      img = ctx.createImageData(W, H); buf = new Uint32Array(img.data.buffer); zb = new Float32Array(W * H);
      S = Math.min(W, H) * 0.37;
      draw();
    }

    function draw() {
      if (!W) return;
      var P = g.P, NN = g.N, T = g.T, F = g.F, m = M, c = g.center, i;
      // transform vertices
      for (i = 0; i < nv; i++) {
        var x = P[i * 3], y = P[i * 3 + 1] - c, z = P[i * 3 + 2];
        var vx = m[0] * x + m[1] * y + m[2] * z, vy = m[3] * x + m[4] * y + m[5] * z, vz = m[6] * x + m[7] * y + m[8] * z;
        var k = 3.6 / (3.6 - vz);
        SX[i] = W / 2 + vx * S * k; SY[i] = H / 2 - vy * S * k; SZ[i] = vz;
        var nx = NN[i * 3], ny = NN[i * 3 + 1], nz = NN[i * 3 + 2];
        VN[i * 3] = m[0] * nx + m[1] * ny + m[2] * nz; VN[i * 3 + 1] = m[3] * nx + m[4] * ny + m[5] * nz; VN[i * 3 + 2] = m[6] * nx + m[7] * ny + m[8] * nz;
      }
      buf.fill(0); zb.fill(-1e9);
      var cy0 = c;
      for (var t = 0; t < F.length; t++) {
        var a = T[t * 3], b = T[t * 3 + 1], d = T[t * 3 + 2];
        // back-face test on the smooth normals
        if (VN[a * 3 + 2] + VN[b * 3 + 2] + VN[d * 3 + 2] <= 0) continue;
        var ax = SX[a], ay = SY[a], bx = SX[b], by = SY[b], dx = SX[d], dy = SY[d];
        var area = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
        if (Math.abs(area) < 1e-6) continue;
        var minX = Math.max(0, Math.floor(Math.min(ax, bx, dx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, dx)));
        var minY = Math.max(0, Math.floor(Math.min(ay, by, dy))), maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, dy)));
        if (minX > maxX || minY > maxY) continue;
        var inv = 1 / area, flag = F[t], hs = holeLists[t];
        var za = SZ[a], zb_ = SZ[b], zd = SZ[d];
        for (var py = minY; py <= maxY; py++) {
          var sy = py + 0.5;
          for (var px = minX; px <= maxX; px++) {
            var sx = px + 0.5;
            var w0 = ((bx - sx) * (dy - sy) - (by - sy) * (dx - sx)) * inv;
            var w1 = ((dx - sx) * (ay - sy) - (dy - sy) * (ax - sx)) * inv;
            var w2 = 1 - w0 - w1;
            if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
            var zz = w0 * za + w1 * zb_ + w2 * zd, idx = py * W + px;
            if (zz <= zb[idx]) continue;
            var ox = 0, oz = 0;
            if (flag & 3) { ox = w0 * P[a * 3] + w1 * P[b * 3] + w2 * P[d * 3]; oz = w0 * P[a * 3 + 2] + w1 * P[b * 3 + 2] + w2 * P[d * 3 + 2]; }
            if (hs) {                       // drilled hole: nothing here, the bore wall shows through
              var hole = false;
              for (var h = 0; h < hs.length; h++) { var ex = ox - hs[h].x, ez = oz - hs[h].z; if (ex * ex + ez * ez < hs[h].r * hs[h].r) { hole = true; break; } }
              if (hole) continue;
            }
            zb[idx] = zz;
            // per-pixel lighting from the interpolated normal
            var n0 = w0 * VN[a * 3] + w1 * VN[b * 3] + w2 * VN[d * 3];
            var n1 = w0 * VN[a * 3 + 1] + w1 * VN[b * 3 + 1] + w2 * VN[d * 3 + 1];
            var n2 = w0 * VN[a * 3 + 2] + w1 * VN[b * 3 + 2] + w2 * VN[d * 3 + 2];
            var nl = 1 / Math.sqrt(n0 * n0 + n1 * n1 + n2 * n2); n0 *= nl; n1 *= nl; n2 *= nl;
            var dif = n0 * KEY[0] + n1 * KEY[1] + n2 * KEY[2]; if (dif < 0) dif = 0;
            var fil = n0 * FILL[0] + n1 * FILL[1] + n2 * FILL[2]; if (fil < 0) fil = 0;
            var sp = n0 * HALF[0] + n1 * HALF[1] + n2 * HALF[2]; if (sp < 0) sp = 0;
            var sp2 = sp * sp, sp4 = sp2 * sp2, sp8 = sp4 * sp4, sp32 = sp8 * sp8 * sp8 * sp8;
            var tone = 1;
            if (flag & 1) tone = 1 + 0.05 * Math.sin(Math.sqrt(ox * ox + oz * oz) * 160);   // turning rings
            else if (flag & 4) tone = 0.55;                                                   // inside a hole
            var lit = (0.3 + 0.68 * dif + 0.22 * fil) * tone, spec = sp32 * 90 + sp4 * sp2 * 14;
            var R = 172 * lit + spec, G = 183 * lit + spec, B = 199 * lit + spec;
            buf[idx] = 0xff000000 | (Math.min(255, B) << 16) | (Math.min(255, G) << 8) | Math.min(255, R);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    function turn(dx, dy) { M = ortho(mul(mul(rotY(dx), rotX(dy)), M)); }
    function frame() {
      raf = 0;
      if (!visible || !W) return;
      if (!reduce && !down && Date.now() > idleUntil) turn(0.004, 0);
      draw();
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && visible) raf = requestAnimationFrame(frame); }

    this.onScroll = function () {
      var y = window.scrollY || pageYOffset;
      if (lastScroll !== null && visible) { turn((y - lastScroll) * 0.005, 0); if (reduce) draw(); }
      lastScroll = y;
    };
    this.reset = function () { M = START.slice(); idleUntil = Date.now() + 1500; draw(); };
    this.resize = resize;

    // free rotation: horizontal drag turns around the vertical screen axis, vertical drag around the horizontal one
    var lx = 0, ly = 0, pending = false;
    cv.addEventListener('pointerdown', function (e) { down = true; lx = e.clientX; ly = e.clientY; if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId); e.preventDefault(); });
    cv.addEventListener('pointermove', function (e) {
      if (!down) return;
      turn((e.clientX - lx) * 0.011, (e.clientY - ly) * 0.011);
      lx = e.clientX; ly = e.clientY;
      if (reduce && !pending) { pending = true; requestAnimationFrame(function () { pending = false; draw(); }); }
    });
    function up() { if (down) { down = false; idleUntil = Date.now() + 3000; } }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('keydown', function (e) {
      var d = { ArrowLeft: [-0.2, 0], ArrowRight: [0.2, 0], ArrowUp: [0, -0.2], ArrowDown: [0, 0.2] }[e.key];
      if (!d) return;
      e.preventDefault(); turn(d[0], d[1]); idleUntil = Date.now() + 3000; draw();
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) { if (!W) resize(); draw(); kick(); } }).observe(cv);
    } else { visible = true; }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv); else window.addEventListener('resize', resize);
    resize(); kick();
  }

  var viewers = [].slice.call(document.querySelectorAll('canvas[data-part]')).filter(function (c) { return c.getContext; })
    .map(function (c) { return new Viewer(c, c.getAttribute('data-part')); });
  if (!viewers.length) return;

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { ticking = false; viewers.forEach(function (v) { v.onScroll(); }); });
  }, { passive: true });

  var reset = document.getElementById('parts-reset');
  if (reset) reset.addEventListener('click', function () { viewers.forEach(function (v) { v.reset(); }); });

  // phones show one part at a time; the tabs switch between them
  var tabs = [].slice.call(document.querySelectorAll('[data-show-part]'));
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var want = t.getAttribute('data-show-part');
      tabs.forEach(function (o) { o.setAttribute('aria-pressed', o === t ? 'true' : 'false'); });
      document.querySelectorAll('.part').forEach(function (f) { f.classList.toggle('on', f.getAttribute('data-part-box') === want); });
      viewers.forEach(function (v) { v.resize(); });
    });
  });
})();
