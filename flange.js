/* Rotatable 3D flange on a plain 2D canvas: a surface of revolution with bolt holes,
   flat-shaded and painter-sorted. No libraries. Drag to spin; the button flips to a view from below. */
(function () {
  var cv = document.getElementById('flange');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var flip = document.getElementById('flange-flip');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- geometry (radius 1 = outer edge) ---------- */
  // Profile (r, y) walked around the cross-section; each edge is revolved into a ring of quads.
  var P = [[0.30, 0], [0.53, 0], [0.77, 0], [1.0, 0], [1.0, 0.16], [0.83, 0.16], [0.66, 0.16], [0.50, 0.16],
           [0.50, 0.28], [0.50, 0.40], [0.30, 0.40], [0.30, 0.20], [0.30, 0]];
  var N = 72, quads = [], i, j;
  for (j = 0; j < P.length - 1; j++) {
    for (i = 0; i < N; i++) {
      var a0 = i / N * 2 * Math.PI, a1 = (i + 1) / N * 2 * Math.PI, p = P[j], q = P[j + 1];
      quads.push([[p[0] * Math.cos(a0), p[1], p[0] * Math.sin(a0)], [p[0] * Math.cos(a1), p[1], p[0] * Math.sin(a1)],
                  [q[0] * Math.cos(a1), q[1], q[0] * Math.sin(a1)], [q[0] * Math.cos(a0), q[1], q[0] * Math.sin(a0)]]);
    }
  }
  // Bolt holes: dark discs on the top and bottom faces of the flange plate.
  var holes = [], H = 8, hr = 0.075, hR = 0.75;
  for (i = 0; i < H; i++) {
    var ha = (i + 0.5) / H * 2 * Math.PI, cx = hR * Math.cos(ha), cz = hR * Math.sin(ha);
    [[0.16, 1], [0, -1]].forEach(function (f) {
      var ring = [];
      for (var k = 0; k < 20; k++) {
        var t = k / 20 * 2 * Math.PI;
        ring.push([cx + hr * Math.cos(t), f[0], cz + hr * Math.sin(t)]);
      }
      holes.push({ pts: ring, up: f[1] });
    });
  }

  /* ---------- view ---------- */
  var yaw = 0.6, pitch = 0.55, target = null, W = 0, Hh = 0, S = 1, dpr = 1, raf = 0, idle = 0, visible = true;
  var L = norm([-0.45, 0.85, 0.35]);   // light direction (world)
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; Hh = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    S = Math.min(W, Hh) * 0.42;
    draw();
  }

  // world -> view: rotate around Y (yaw) then X (pitch); y is up, z towards the viewer after rotation
  function view(p) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, y = p[1] - 0.2;
    return [x, y * cp - z * sp, y * sp + z * cp];
  }
  function screen(v) {
    var k = 3.2 / (3.2 - v[2]);       // mild perspective
    return [W / 2 + v[0] * S * k, Hh / 2 - v[1] * S * k];
  }
  function shade(n, base) {
    var d = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    var spec = Math.pow(Math.max(0, n[1] * 0.5 + n[2] * 0.85), 18) * 60;
    var s = 0.32 + 0.68 * d;
    return 'rgb(' + Math.min(255, base[0] * s + spec | 0) + ',' + Math.min(255, base[1] * s + spec | 0) + ',' + Math.min(255, base[2] * s + spec | 0) + ')';
  }
  // the light stays fixed to the camera so the visible side is always lit
  function camNormal(v) {
    var a = v[0], b = v[1], c = v[2];
    var u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return norm([u[2] * w[1] - u[1] * w[2], u[0] * w[2] - u[2] * w[0], u[1] * w[0] - u[0] * w[1]]);   // outward for this profile's winding
  }

  var STEEL = [168, 180, 196], DARK = '#06090d';
  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    var list = [], k, v, n;
    for (k = 0; k < quads.length; k++) {
      v = quads[k].map(view);
      n = camNormal(v);
      if (n[2] <= 0.0005) continue;                 // back face
      list.push({ z: (v[0][2] + v[1][2] + v[2][2] + v[3][2]) / 4, pts: v.map(screen), fill: shade(n, STEEL) });
    }
    for (k = 0; k < holes.length; k++) {
      v = holes[k].pts.map(view);
      // a hole disc is visible when its face points at the camera
      var up = view([0, holes[k].up, 0]), o = view([0, 0, 0]);
      if ((up[2] - o[2]) <= 0) continue;
      var z = 0; for (var m = 0; m < v.length; m++) z += v[m][2];
      list.push({ z: z / v.length + 0.1, pts: v.map(screen), fill: DARK });   // drawn after the plate face around it
    }
    list.sort(function (a, b) { return a.z - b.z; });
    ctx.lineJoin = 'round'; ctx.lineWidth = 0.7;
    for (k = 0; k < list.length; k++) {
      var it = list[k], pts = it.pts;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var t = 1; t < pts.length; t++) ctx.lineTo(pts[t][0], pts[t][1]);
      ctx.closePath(); ctx.fillStyle = it.fill; ctx.strokeStyle = it.fill; ctx.fill(); ctx.stroke();
    }
  }

  /* ---------- animation & input ---------- */
  function loop() {
    raf = 0;
    var moving = false;
    if (target !== null) {
      pitch += (target - pitch) * 0.12;
      if (Math.abs(target - pitch) < 0.002) { pitch = target; target = null; } else moving = true;
    }
    if (!reduce && !dragging && Date.now() > idle) { yaw += 0.006; moving = true; }
    draw();
    if (moving && visible) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && visible) raf = requestAnimationFrame(loop); }

  var dragging = false, lx = 0, ly = 0;
  cv.addEventListener('pointerdown', function (e) {
    dragging = true; lx = e.clientX; ly = e.clientY; target = null;
    if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    yaw -= (e.clientX - lx) * 0.012;
    if (e.pointerType === 'mouse') pitch = Math.max(-1.45, Math.min(1.45, pitch + (e.clientY - ly) * 0.01));
    lx = e.clientX; ly = e.clientY; draw();
  });
  function end() { if (dragging) { dragging = false; idle = Date.now() + 2500; setTimeout(kick, 2600); } }
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('keydown', function (e) {
    var d = { ArrowLeft: [0.2, 0], ArrowRight: [-0.2, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[e.key];
    if (!d) return;
    e.preventDefault(); yaw += d[0]; pitch = Math.max(-1.45, Math.min(1.45, pitch + d[1])); idle = Date.now() + 2500; draw();
  });

  if (flip) flip.addEventListener('click', function () {
    var below = pitch > 0;
    target = below ? -0.75 : 0.55;
    flip.setAttribute('aria-pressed', below ? 'true' : 'false');
    flip.textContent = below ? flip.getAttribute('data-top') : flip.getAttribute('data-bottom');
    kick();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }).observe(cv);
  }
  window.addEventListener('resize', resize);
  resize(); kick();
})();
