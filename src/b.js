
/* ------------------------------------------------------------
   4. layout
------------------------------------------------------------ */
const LAY = {
  jettyA: [-1.05, -0.66],
  jettyB: [1.86, 1.30],
  islet: [-1.52, -1.56],
  isletR: 1.24,
  pontoon: [-1.52, 0.60],
  dock: [-1.06, 0.56],
  dockYaw: 1.30,
  land: [-0.72, 1.62],
  bung: [],
};
(function () {
  const ax = LAY.jettyA[0], az = LAY.jettyA[1];
  const bx = LAY.jettyB[0], bz = LAY.jettyB[1];
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  const nx = uz, nz = -ux;
  LAY.jetty = { ax, az, ux, uz, len, nx, nz, ang: Math.atan2(-uz, ux) };
  const ts = [0.19, 0.355, 0.52, 0.685, 0.85];
  for (let i = 0; i < ts.length; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const t = ts[i];
    LAY.bung.push({
      x: ax + dx * t + nx * 0.66 * side,
      z: az + dz * t + nz * 0.66 * side,
      ang: LAY.jetty.ang + (side > 0 ? 0 : PI),
      sx: 0, sz: side, t: t, big: false,
    });
  }
  LAY.bung.push({ x: bx + ux * 0.42, z: bz + uz * 0.42, ang: LAY.jetty.ang, sx: 1, sz: 0, t: 1.05, big: true });
})();

/* ------------------------------------------------------------
   5. seabed + strata
------------------------------------------------------------ */
function buildSeabed() {
  const m = new Mesh();
  const G = 96, st = BLOCK / (G - 1);
  const H = [];
  for (let j = 0; j < G; j++) {
    H.push([]);
    for (let i = 0; i < G; i++) {
      const x = -HALF + i * st, z = -HALF + j * st;
      H[j].push(terrain(x, z));
    }
  }
  const sandTop = (x, z, y) => {
    if (y > SEA + 0.002) {
      const dry = smoothstep(SEA, SEA + 0.10, y);
      return mix3(PAL.sandWet, jit(PAL.sand, 0.02), dry);
    }
    const deep = smoothstep(SEA - 0.05, SEA - 0.55, y);
    return mix3(jit(PAL.sand2, 0.03), mix3(PAL.sand2, PAL.sand, 0.5), deep * 0.8);
  };
  for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) {
    const x0 = -HALF + i * st, z0 = -HALF + j * st;
    const x1 = x0 + st, z1 = z0 + st;
    const a = [x0, H[j][i], z0], b = [x1, H[j][i + 1], z0], c = [x1, H[j + 1][i + 1], z1], d = [x0, H[j + 1][i], z1];
    m.quadN(a, d, c, b, sandTop(x0, z0, (a[1] + c[1]) / 2), 0, MAT_SAND, [0, 1, 0]);
  }
  // skirt sides + bottom  (candy strata)
  const edge = [];
  const push = (x, z) => { const y = terrain(x, z); edge.push([x, y, z]); };
  for (let i = 0; i < G; i++) push(-HALF + i * st, -HALF);
  for (let j = 0; j < G; j++) push(HALF, -HALF + j * st);
  for (let i = G - 1; i >= 0; i--) push(-HALF + i * st, HALF);
  for (let j = G - 1; j >= 0; j--) push(-HALF, -HALF + j * st);
  for (let k = 0; k < edge.length - 1; k++) {
    const p = edge[k], q = edge[k + 1];
    let nx = q[2] - p[2], nz = -(q[0] - p[0]);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    m.quadN([p[0], BOT, p[2]], [q[0], BOT, q[2]], [q[0], q[1], q[2]], [p[0], p[1], p[2]], PAL.sand, 0, MAT_STRATA, [nx, 0, nz]);
  }
  // bottom of the cut
  const bl = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]];
  m.quadN([bl[0][0], BOT, bl[0][1]], [bl[1][0], BOT, bl[1][1]], [bl[2][0], BOT, bl[2][1]], [bl[3][0], BOT, bl[3][1]], [0.30, 0.19, 0.13], 0, MAT_STRATA, [0, -1, 0]);
  return { mesh: m, G: G, H: H, st: st };
}

/* ------------------------------------------------------------
   6. coral heads
------------------------------------------------------------ */
const CORAL_HEADS = [
  [0.30, -0.15, 1.00], [1.15, 0.55, 0.80], [-0.10, 0.95, 0.72],
  [0.72, 1.55, 0.62], [-0.95, 1.45, 0.55], [1.75, -0.55, 0.66],
  [-0.35, -1.15, 0.50], [0.30, 2.05, 0.48],
];
function buildCorals() {
  const m = new Mesh();
  const deco = [PAL.pink, PAL.purple, PAL.orange, PAL.yellow, PAL.coralTeal];
  CORAL_HEADS.forEach((hd, idx) => {
    const [cx, cz, s] = hd;
    const base = terrain(cx, cz);
    // rock bump
    m.blob(cx, base - 0.02, cz, 0.30 * s, 0.16 * s, 0.28 * s, 9, 5, () => jit([0.62, 0.60, 0.55], 0.10), 0.28, 0, 0);
    // brain coral
    const bc = deco[idx % deco.length];
    const bx = cx + 0.10 * s, bz = cz - 0.08 * s;
    m.blob(bx, base + 0.09 * s, bz, 0.115 * s, 0.10 * s, 0.11 * s, 10, 6, (v, u) => {
      const g = 0.5 + 0.5 * Math.sin(u * TAU * 5 + v * 9);
      return mix3(bc, mix3(bc, [0.99, 0.95, 0.88], 0.5), g * 0.7);
    }, 0.14, 0.012, 0);
    // branching coral
    const cc = deco[(idx + 2) % deco.length];
    for (let b = 0; b < 4; b++) {
      const a = rnd() * TAU, r = 0.06 + rnd() * 0.16;
      const x0 = cx + Math.cos(a) * r * s, z0 = cz + Math.sin(a) * r * s;
      const h0 = 0.09 + rnd() * 0.14;
      const pts = [[x0, base - 0.01, z0], [x0 + Math.cos(a) * 0.03, base + h0 * 0.55, z0 + Math.sin(a) * 0.03], [x0 + Math.cos(a) * 0.05, base + h0, z0 + Math.sin(a) * 0.05]];
      m.tube(pts, [0.016 * s + 0.006, 0.011 * s + 0.005, 0.007 * s + 0.004], 5, () => jit(cc, 0.07), 0.006);
    }
    // sea fan
    const fc = deco[(idx + 3) % deco.length];
    const fa = rnd() * TAU;
    const fx = cx - Math.cos(fa) * 0.16 * s, fz = cz - Math.sin(fa) * 0.16 * s;
    const fr = 0.14 * s + 0.06;
    for (let b = 0; b < 5; b++) {
      const ang = -0.9 + b * 0.45 + fa;
      const sway = 0.012 + b * 0.004;
      const tipX = fx + Math.cos(ang) * fr, tipZ = fz + Math.sin(ang) * fr;
      const w = 0.018;
      m.quad(
        [fx, base + 0.01, fz], [fx + Math.cos(ang + 1.57) * w, base + 0.01, fz + Math.sin(ang + 1.57) * w],
        [tipX + Math.cos(ang + 1.57) * w * 1.4, base + 0.02 + fr * 0.9, tipZ + Math.sin(ang + 1.57) * w * 1.4],
        [tipX, base + 0.03 + fr, tipZ], jit(fc, 0.05), sway, 0);
    }
    // small staghorn cluster
    const sc = deco[(idx + 1) % deco.length];
    for (let b = 0; b < 3; b++) {
      const a = rnd() * TAU;
      const x0 = cx + Math.cos(a) * 0.2 * s, z0 = cz + Math.sin(a) * 0.2 * s;
      m.blob(x0, base + 0.03, z0, 0.05 * s, 0.06 * s, 0.05 * s, 7, 4, () => jit(sc, 0.08), 0.3, 0.01, 0);
    }
  });
  // scattered small rubble
  for (let i = 0; i < 60; i++) {
    const x = rr(-2.45, 2.45), z = rr(-2.45, 2.45);
    const y = terrain(x, z);
    if (y > SEA - 0.03) continue;
    const s = rr(0.02, 0.05);
    m.blob(x, y, z, s, s * 0.7, s, 5, 3, () => jit(PAL.sand2, 0.09), 0.2, 0, 0);
  }
  return m;
}

/* ------------------------------------------------------------
   7. palms
------------------------------------------------------------ */
function palm(m, px, pz, h, lean, seedA) {
  reseed(seedA);
  const base = terrain(px, pz) - 0.03;
  const segs = 9, sides = 7;
  const pts = [], rad = [];
  const lx = Math.cos(lean), lz = Math.sin(lean);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const bend = Math.pow(t, 1.9);
    pts.push([px + lx * bend * 0.42 + Math.sin(t * 3.1) * 0.02, base + h * t - bend * 0.04, pz + lz * bend * 0.42 + Math.cos(t * 2.7) * 0.02]);
    rad.push((0.062 - t * 0.028) * (1 + Math.sin(t * 6) * 0.05));
  }
  m.tube(pts, rad, sides, (t) => {
    const ring = Math.sin(t * 34) > 0.55 ? 0.82 : 1.0;
    return jit([PAL.trunk[0] * ring, PAL.trunk[1] * ring, PAL.trunk[2] * ring], 0.05);
  }, 0.004, false);
  const top = pts[segs];
  const fronds = 16;
  for (let f = 0; f < fronds; f++) {
    const a = f / fronds * TAU + rr(-0.10, 0.10);
    const elev = rr(-0.05, 0.85) + (f % 3 === 0 ? 0.16 : 0);
    const L = rr(0.62, 0.92) * (1 - Math.abs(elev) * 0.18);
    frond(m, top[0], top[1] + 0.02, top[2], a, elev, L, f);
  }
  // dry hanging fronds
  for (let f = 0; f < 3; f++) {
    const a = rr(0, TAU);
    const L = rr(0.34, 0.5);
    const bx = top[0], by = top[1] - 0.02, bz = top[2];
    const steps = 5;
    const pts2 = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts2.push([bx + Math.cos(a) * L * t * 0.45, by - L * 0.72 * t - 0.02, bz + Math.sin(a) * L * t * 0.45]);
    }
    m.tube(pts2, pts2.map((_, i) => 0.010 - i * 0.0012), 4, () => jit(PAL.dry, 0.8), 0.004, false);
  }
}
function frond(m, bx, by, bz, ang, elev, L, f) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const steps = 8;
  const sp = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const drop = Math.pow(t, 2.1) * L * (0.42 + elev * 0.25);
    const lift = Math.sin(Math.min(1, t * 1.35) * PI * 0.5) * elev * L * 0.42;
    sp.push([bx + ca * L * t, by + lift - drop, bz + sa * L * t]);
  }
  const base = mix3(PAL.leaf, PAL.leafL, 0.4);
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const p = sp[i], q = sp[i + 1];
    const tx = q[0] - p[0], ty = q[1] - p[1], tz = q[2] - p[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    const sideX = -tz / tl, sideZ = tx / tl;
    const ll = Math.sin(Math.min(1, t * 1.1) * PI * 0.92) * 0.15 + 0.02;
    const cc = jit(mix3(base, PAL.leafD, t * 0.55), 0.09);
    for (const s of [-1, 1]) {
      const tipX = p[0] + sideX * ll * s - (tx / tl) * ll * 0.42;
      const tipZ = p[2] + sideZ * ll * s - (tz / tl) * ll * 0.42;
      const tipY = p[1] - ll * 0.45;
      m.tri([p[0], p[1], p[2]], [q[0], q[1], q[2]], [tipX, tipY, tipZ], cc, 0.012, 0);
      m.tri([p[0], p[1], p[2]], [tipX, tipY, tipZ], [p[0] - sideX * ll * 0.14 * s, p[1] + 0.004, p[2] - sideZ * ll * 0.14 * s], cc, 0.012, 0);
    }
  }
  // spine
  m.tube(sp, sp.map((_, i) => 0.011 * (1 - i / steps * 0.7)), 3, () => jit(mix3(PAL.leafD, PAL.leaf, 0.4), 0.06), 0.01, false);
}

/* ------------------------------------------------------------
   8. decks, huts, bungalows
------------------------------------------------------------ */
function deck(m, cx, cz, w, d, y, ang, plankCol) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
  const n = Math.max(4, Math.round(w / 0.072));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    const p = P(x, 0);
    m.box(p[0], y, p[1], w / n - 0.012, 0.035, d, jit(plankCol, 0.07), ang);
  }
  // rim
  for (const zz of [-d / 2, d / 2]) {
    const p = P(0, zz);
    m.box(p[0], y + 0.005, p[1], w, 0.055, 0.035, PAL.woodD, ang);
  }
  for (const xx of [-w / 2, w / 2]) {
    const p = P(xx, 0);
    m.box(p[0], y + 0.005, p[1], 0.035, 0.055, d, PAL.woodD, ang);
  }
  return P;
}
function stilts(m, cx, cz, w, d, y, ang, col) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
  const pts = [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [w / 2 - 0.06, d / 2 - 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [0, 0]];
  for (const [x, z] of pts) {
    const p = P(x, z);
    const g = terrain(p[0], p[1]) - 0.02;
    const top = y - 0.02;
    const r = 0.021 + rnd() * 0.006;
    m.tube([[p[0], g, p[1]], [p[0], (g + top) / 2, p[1]], [p[0], top, p[1]]], [r, r, r], 5, () => jit(col, 0.08), 0, false);
  }
}
function bungalow(m, b, kind) {
  const big = b.big;
  const w = big ? 0.92 : 0.78, d = big ? 0.82 : 0.68;
  const y = SEA + 0.175;
  const ang = b.ang;
  deck(m, b.x, b.z, w, d, y, ang, PAL.woodL);
  stilts(m, b.x, b.z, w, d, y, ang, PAL.woodD);
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (x, z) => [b.x + x * c + z * s, b.z - x * s + z * c];

  // hut body
  const hw = big ? 0.60 : 0.50, hd = big ? 0.44 : 0.38, hh = 0.30;
  const hc = P(0, -d * 0.10);
  m.box(hc[0], y + hh / 2 + 0.02, hc[1], hw, hh, hd, PAL.pale, ang);
  // vertical plank shadow lines
  for (let i = 0; i < 7; i++) {
    const x = -hw / 2 + (i + 0.5) * (hw / 7);
    const p = P(x, -d * 0.10 + hd / 2 + 0.004);
    m.box(p[0], y + hh / 2 + 0.02, p[1], 0.006, hh * 0.95, 0.006, jit([0.78, 0.73, 0.65], 0.05), ang);
  }
  // glass door to the sea
  const gp = P(0, -d * 0.10 + hd / 2 + 0.012);
  m.box(gp[0], y + 0.135, gp[1], hw * 0.62, 0.21, 0.012, PAL.glass, ang);
  m.box(gp[0], y + 0.135, gp[1] + 0.0, 0.012, 0.21, 0.02, PAL.woodD, ang);
  // side windows
  for (const sx of [-1, 1]) {
    const p = P(sx * (hw / 2 + 0.006), -d * 0.10);
    m.box(p[0], y + 0.15, p[1], 0.012, 0.10, hd * 0.42, PAL.glass, ang);
  }
  // roof
  const rc = P(0, -d * 0.10);
  m.hipRoof(rc[0], y + hh + 0.02, rc[1], hw + 0.30, hd + 0.26, 0.24, 4, PAL.thatch, PAL.thatch2, ang);
  // plunge pool on the sea side
  if (big) {
    const pp = P(0.0, d * 0.30);
    m.box(pp[0], y + 0.03, pp[1], 0.34, 0.06, 0.24, PAL.pale, ang);
    m.box(pp[0], y + 0.045, pp[1], 0.30, 0.05, 0.20, [0.24, 0.76, 0.78], ang);
  }
  // two loungers
  for (const sx of [-1, 1]) {
    const lp = P(sx * (big ? 0.28 : 0.24), d * (big ? 0.30 : 0.34));
    m.box(lp[0], y + 0.06, lp[1], 0.13, 0.022, 0.26, PAL.white, ang);
    const bp = P(sx * (big ? 0.28 : 0.24), d * (big ? 0.30 : 0.34) - (d * 0.34 > 0 ? 0.10 : -0.10));
  }
  // steel ladder into the water
  const lx = P(w / 2 - 0.02, -d / 2 + 0.10);
  for (const o of [-0.045, 0.045]) {
    const p = P(w / 2 - 0.02 + o, -d / 2 + 0.10);
    m.tube([[p[0], y - 0.01, p[1]], [p[0], SEA - 0.16, p[1]]], [0.007, 0.007], 4, () => PAL.steel, 0, false);
  }
  for (let i = 0; i < 3; i++) {
    const p = P(w / 2 - 0.02, -d / 2 + 0.10);
    m.box(p[0], y - 0.05 - i * 0.07, p[1], 0.10, 0.006, 0.006, PAL.steel, ang);
  }
}

/* ------------------------------------------------------------
   9. whole static scene
------------------------------------------------------------ */
function buildScene() {
  reseed(20260614);
  const m = new Mesh();

  // ---- jetty
  const J = LAY.jetty;
  const jd = 0.30;
  const nPlank = Math.round(J.len / 0.058);
  for (let i = 0; i < nPlank; i++) {
    const t = (i + 0.5) / nPlank;
    const x = J.ax + J.ux * J.len * t, z = J.az + J.uz * J.len * t;
    m.box(x, SEA + 0.115, z, 0.052, 0.032, jd, jit(PAL.wood, 0.10), J.ang);
  }
  // jetty stringers
  for (const o of [-0.11, 0.11]) {
    const x = J.ax + J.ux * J.len * 0.5 + J.nx * o, z = J.az + J.uz * J.len * 0.5 + J.nz * o;
    m.box(x, SEA + 0.088, z, J.len, 0.022, 0.03, PAL.woodD, J.ang);
  }
  for (let i = 0; i <= Math.floor(J.len / 0.42); i++) {
    const t = i / Math.floor(J.len / 0.42);
    for (const o of [-0.135, 0.135]) {
      const x = J.ax + J.ux * J.len * t + J.nx * o, z = J.az + J.uz * J.len * t + J.nz * o;
      const g = terrain(x, z) - 0.03;
      m.tube([[x, g, z], [x, (g + SEA) / 2, z], [x, SEA + 0.10, z]], [0.018, 0.017, 0.016], 5, () => jit(PAL.woodD, 0.06), 0, false);
    }
  }
  // lamp posts
  for (let i = 1; i <= 6; i++) {
    const t = i / 7;
    const sx = (i % 2 ? 1 : -1) * 0.135;
    const x = J.ax + J.ux * J.len * t + J.nx * sx, z = J.az + J.uz * J.len * t + J.nz * sx;
    m.tube([[x, SEA + 0.12, z], [x, SEA + 0.30, z], [x, SEA + 0.42, z]], [0.012, 0.010, 0.009], 5, () => PAL.woodD, 0, false);
    m.box(x, SEA + 0.455, z, 0.062, 0.058, 0.062, [1.0, 0.93, 0.72], J.ang);
    m.box(x, SEA + 0.485, z, 0.076, 0.012, 0.076, PAL.woodD, J.ang);
  }
  // spur walks to bungalows
  for (const b of LAY.bung) {
    if (b.big) continue;
    const bx = b.x - J.nx * 0.30 * b.sz, bz = b.z - J.nz * 0.30 * b.sz;
    for (let i = 0; i < 5; i++) {
      const t = (i + 0.5) / 5;
      const x = lerp(b.x - J.nx * 0.62 * b.sz, b.x, t);
      const z = lerp(b.z - J.nz * 0.62 * b.sz, b.z, t);
      m.box(x, SEA + 0.115, z, 0.30, 0.03, 0.048, jit(PAL.wood, 0.09), J.ang);
    }
  }
  // bungalows
  for (const b of LAY.bung) bungalow(m, b, 0);

  // ---- pontoon + walkway
  const PX = LAY.pontoon[0], PZ = LAY.pontoon[1];
  const pAng = 0;
  for (let i = 0; i < 12; i++) {
    const z = PZ - 0.42 + (i + 0.5) * 0.072;
    m.box(PX, SEA + 0.075, z, 0.62, 0.05, 0.066, jit(PAL.woodL, 0.09), 0);
  }
  // pontoon floats
  for (const o of [-0.22, 0.22]) m.box(PX + o, SEA - 0.06, PZ, 0.10, 0.14, 0.78, [0.86, 0.86, 0.82], 0);
  // tiny thatched shade
  for (const [ox, oz] of [[-0.22, -0.28], [0.22, -0.28], [-0.22, 0.20], [0.22, 0.20]]) {
    m.tube([[PX + ox, SEA + 0.10, PZ + oz], [PX + ox, SEA + 0.62, PZ + oz]], [0.013, 0.012], 5, () => PAL.woodD, 0, false);
  }
  m.hipRoof(PX, SEA + 0.62, PZ - 0.04, 0.62, 0.62, 0.18, 3, PAL.thatch, PAL.thatch2, 0);
  // stilted walk to the islet beach
  const wz0 = PZ - 0.44, wz1 = -0.30;
  const nW = 12;
  for (let i = 0; i < nW; i++) {
    const z = lerp(wz0, wz1, (i + 0.5) / nW);
    m.box(PX, SEA + 0.13, z, 0.28, 0.035, Math.abs(wz0 - wz1) / nW - 0.012, jit(PAL.wood, 0.09), 0);
  }
  for (let i = 0; i <= 5; i++) {
    const z = lerp(wz0, wz1, i / 5);
    for (const o of [-0.12, 0.12]) {
      const g = terrain(PX + o, z) - 0.02;
      m.tube([[PX + o, g, z], [PX + o, SEA + 0.12, z]], [0.014, 0.013], 4, () => PAL.woodD, 0, false);
    }
  }

  // ---- islet
  const IX = LAY.islet[0], IZ = LAY.islet[1];
  // wooded hump
  m.blob(IX - 0.06, terrain(IX, IZ) - 0.06, IZ - 0.02, 0.78, 0.40, 0.72, 12, 7, (v, u) => {
    return jit(mix3(PAL.leafD, PAL.leaf, 0.4 + 0.4 * Math.sin(u * TAU * 3 + v * 6)), 0.10);
  }, 0.30, 0.02, 0);
  // shrubs
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, r = rr(0.25, 0.92);
    const x = IX + Math.cos(a) * r, z = IZ + Math.sin(a) * r;
    const y = terrain(x, z);
    if (y < SEA + 0.05) continue;
    m.blob(x, y + 0.03, z, rr(0.07, 0.14), rr(0.06, 0.13), rr(0.07, 0.14), 8, 5, () => jit(mix3(PAL.leaf, PAL.leafL, rnd()), 0.10), 0.34, 0.014, 0);
  }
  // palms
  const palmSpots = [[-1.95, -1.10], [-1.28, -1.02], [-2.06, -1.92], [-1.42, -2.02], [-0.86, -1.72], [-1.86, -2.34], [-1.02, -2.32], [-2.28, -1.42]];
  palmSpots.forEach((p, i) => palm(m, p[0], p[1], rr(1.05, 1.52), Math.atan2(p[1] - IZ, p[0] - IX) + rr(-0.5, 0.5), 900 + i * 37));

  // pavilion (lobby)
  const pvx = -1.16, pvz = -1.20;
  const pvy = terrain(pvx, pvz);
  m.box(pvx, pvy + 0.02, pvz, 0.86, 0.06, 0.66, PAL.pale, 0.5);
  for (const [ox, oz] of [[-0.36, -0.26], [0.36, -0.26], [-0.36, 0.26], [0.36, 0.26]]) {
    const x = pvx + ox * Math.cos(0.5) + oz * Math.sin(0.5), z = pvz - ox * Math.sin(0.5) + oz * Math.cos(0.5);
    m.tube([[x, pvy, z], [x, pvy + 0.62, z]], [0.020, 0.018], 5, () => PAL.wood, 0, false);
  }
  m.hipRoof(pvx, pvy + 0.62, pvz, 1.02, 0.82, 0.30, 3, PAL.thatch3, PAL.thatch2, 0.5);

  // parasols + loungers on the beach
  const beachSpots = [[-0.66, -0.98, 0.6], [-2.30, -0.70, -0.5]];
  for (const [px, pz, a] of beachSpots) {
    const y = terrain(px, pz);
    if (y < SEA + 0.02) continue;
    m.tube([[px, y - 0.02, pz], [px, y + 0.44, pz]], [0.013, 0.011], 5, () => PAL.woodL, 0, false);
    m.hipRoof(px, y + 0.44, pz, 0.44, 0.44, 0.16, 3, PAL.thatch3, PAL.thatch, 0);
    // loungers
    for (let k = 0; k < 2; k++) {
      const ox = Math.cos(a) * (k * 0.24 - 0.12), oz = Math.sin(a) * (k * 0.24 - 0.12);
      const lx = px + Math.cos(a + 1.57) * 0.26 + ox, lz = pz + Math.sin(a + 1.57) * 0.26 + oz;
      m.box(lx, y + 0.055, lz, 0.11, 0.02, 0.24, PAL.white, -a);
      m.box(lx, y + 0.02, lz, 0.10, 0.045, 0.22, PAL.pale, -a);
    }
  }

  // ---- seabed
  const sb = buildSeabed();
  const out = new Mesh();
  const pushAll = (dst, src) => {
    for (let i = 0; i < src.length; i += 8192) {
      const end = Math.min(i + 8192, src.length);
      for (let k = i; k < end; k++) dst.push(src[k]);
    }
  };
  const cat = (src) => { pushAll(out.p, src.p); pushAll(out.n, src.n); pushAll(out.c, src.c); pushAll(out.a, src.a); };
  cat(sb.mesh); cat(m); cat(buildCorals());

  return { mesh: out, seabed: sb };
}
