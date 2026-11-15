/* ============================================================
   ATOLL JELLY — a WebGPU jelly diorama
   single file, no dependencies, no network
   ============================================================ */
(function () {
'use strict';

/* ------------------------------------------------------------
   0. math
------------------------------------------------------------ */
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

let _seed = 0x2f6e2b1;
function rnd() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }
function reseed(s) { _seed = s >>> 0; }
const rr = (a, b) => a + (b - a) * rnd();

const m4 = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function mmul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function mtrans(x, y, z) { const o = m4(); o[12] = x; o[13] = y; o[14] = z; return o; }
function mscale(x, y, z) { const o = m4(); o[0] = x; o[5] = y; o[10] = z; return o; }
function mrotY(a) { const c = Math.cos(a), s = Math.sin(a); const o = m4(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; }
function mrotX(a) { const c = Math.cos(a), s = Math.sin(a); const o = m4(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; }
function mrotZ(a) { const c = Math.cos(a), s = Math.sin(a); const o = m4(); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }
/* translate * rotY * rotX * rotZ * scale */
function mTRS(px, py, pz, ry, rx, rz, sx, sy, sz) {
  let m = mtrans(px, py, pz);
  m = mmul(m, mrotY(ry));
  if (rx) m = mmul(m, mrotX(rx));
  if (rz) m = mmul(m, mrotZ(rz));
  if (sx !== 1 || sy !== 1 || sz !== 1) m = mmul(m, mscale(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
  return m;
}
function persp(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1, 0, 0, near * far / (near - far), 0]);
}
function lookAt(eye, ctr, up) {
  let zx = eye[0] - ctr[0], zy = eye[1] - ctr[1], zz = eye[2] - ctr[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]);
}

/* ------------------------------------------------------------
   1. world constants
------------------------------------------------------------ */
const BLOCK = 5.2;            // footprint
const HALF = BLOCK / 2;
const SEA = 1.30;             // sea level
const BOT = 0.10;             // bottom of the cut
const N = 168;                // sim resolution
const CS = BLOCK / (N - 1);

/* the seabed heightfield — mirrored verbatim in WGSL */
function terrain(x, z) {
  let h = 0.968;
  const d1 = Math.hypot(x - 1.30, z - 1.28);
  h -= 0.615 * (1 - smoothstep(0, 1.02, d1));       // blue hole, front corner
  const d2 = Math.hypot(x + 1.52, z + 1.56);
  h += 0.80 * (1 - smoothstep(0.30, 1.24, d2));     // islet mound, back-left
  h += 0.048 * smoothstep(-2.6, 2.6, x) * smoothstep(-2.6, 2.6, z);
  h += 0.011 * Math.sin(x * 7.3 + 0.4) * Math.cos(z * 6.1 - 0.8);
  h += 0.007 * Math.sin(x * 13.7 - z * 11.3);
  return h;
}
const waterDepth = (x, z) => clamp(SEA - terrain(x, z), 0.02, 1.4);

/* ------------------------------------------------------------
   2. palette
------------------------------------------------------------ */
const PAL = {
  paper: [0.925, 0.912, 0.89],
  sand: [0.945, 0.905, 0.792],
  sand2: [0.905, 0.856, 0.722],
  sandWet: [0.80, 0.775, 0.66],
  shell: [0.945, 0.918, 0.87],
  caramel: [0.79, 0.60, 0.385],
  choc: [0.435, 0.255, 0.165],
  wood: [0.575, 0.415, 0.275],
  woodD: [0.415, 0.29, 0.195],
  woodL: [0.72, 0.585, 0.435],
  pale: [0.905, 0.858, 0.775],
  thatch: [0.845, 0.735, 0.525],
  thatch2: [0.72, 0.60, 0.40],
  thatch3: [0.90, 0.815, 0.635],
  leaf: [0.235, 0.44, 0.26],
  leafL: [0.35, 0.56, 0.29],
  leafD: [0.155, 0.325, 0.195],
  dry: [0.61, 0.49, 0.30],
  trunk: [0.53, 0.435, 0.325],
  glass: [0.30, 0.72, 0.74],
  steel: [0.70, 0.72, 0.72],
  white: [0.965, 0.962, 0.95],
  ink: [0.155, 0.135, 0.125],
  teal: [0.045, 0.60, 0.60],
  pink: [0.965, 0.545, 0.60],
  purple: [0.56, 0.42, 0.72],
  orange: [0.96, 0.52, 0.24],
  yellow: [0.98, 0.80, 0.22],
  coralTeal: [0.22, 0.72, 0.68],
};
const jit = (c, a) => [clamp(c[0] + (rnd() - .5) * a, 0, 1), clamp(c[1] + (rnd() - .5) * a, 0, 1), clamp(c[2] + (rnd() - .5) * a, 0, 1)];

const FLAVOURS = {
  turquoise: { absorb: [2.05, 0.72, 0.50], deep: [0.02, 0.35, 0.38], scatter: [0.10, 0.62, 0.63], accent: '#12a2a6', sand: [0.945, 0.905, 0.792] },
  sapphire: { absorb: [1.55, 1.32, 0.42], deep: [0.02, 0.16, 0.42], scatter: [0.06, 0.36, 0.78], accent: '#2b64c9', sand: [0.915, 0.905, 0.80] },
  lime: { absorb: [0.62, 1.02, 1.55], deep: [0.20, 0.32, 0.06], scatter: [0.52, 0.72, 0.14], accent: '#6f9c1e', sand: [0.945, 0.925, 0.775] },
};

/* ------------------------------------------------------------
   3. geometry builder  (pos3 nrm3 col3 aux2)
------------------------------------------------------------ */
const MAT_DEF = 0, MAT_SAND = 1, MAT_STRATA = 2;
class Mesh {
  constructor() { this.p = []; this.n = []; this.c = []; this.a = []; }
  get count() { return this.p.length / 3; }
  raw(v, n, c, ax, ay) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]); this.a.push(ax || 0, ay || 0); }
  tri(a, b, c, col, ax, ay) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const n = [nx, ny, nz];
    this.raw(a, n, col, ax, ay); this.raw(b, n, col, ax, ay); this.raw(c, n, col, ax, ay);
  }
  quad(a, b, c, d, col, ax, ay) { this.tri(a, b, c, col, ax, ay); this.tri(a, c, d, col, ax, ay); }
  quadN(a, b, c, d, col, ax, ay, nrm) {
    this.raw(a, nrm, col, ax, ay); this.raw(b, nrm, col, ax, ay); this.raw(c, nrm, col, ax, ay);
    this.raw(a, nrm, col, ax, ay); this.raw(c, nrm, col, ax, ay); this.raw(d, nrm, col, ax, ay);
  }
  /* axis-aligned box, optionally rotated about Y around its centre */
  box(cx, cy, cz, sx, sy, sz, col, rotY, colTop) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const cs = Math.cos(rotY || 0), sn = Math.sin(rotY || 0);
    const P = (x, y, z) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
    const c = col, ct = colTop || col;
    const v000 = P(-hx, -hy, -hz), v100 = P(hx, -hy, -hz), v110 = P(hx, hy, -hz), v010 = P(-hx, hy, -hz);
    const v001 = P(-hx, -hy, hz), v101 = P(hx, -hy, hz), v111 = P(hx, hy, hz), v011 = P(-hx, hy, hz);
    const nx = [-sn, 0, -cs], nz = [cs, 0, -sn];
    this.quadN(v001, v101, v111, v011, c, 0, 0, nz);
    this.quadN(v100, v000, v010, v110, c, 0, 0, [-nz[0], 0, -nz[2]]);
    this.quadN(v101, v100, v110, v111, c, 0, 0, [nx[0], 0, nx[2]]);
    this.quadN(v000, v001, v011, v010, c, 0, 0, [-nx[0], 0, -nx[2]]);
    this.quadN(v010, v011, v111, v110, ct, 0, 0, [0, 1, 0]);
    this.quadN(v000, v100, v101, v001, c, 0, 0, [0, -1, 0]);
  }
  /* tapered tube along a polyline with smooth normals; col may be fn(t,n) */
  tube(pts, radii, sides, colFn, ax, cap) {
    const n = pts.length;
    const rings = [];
    // frames
    let ref = [0, 1, 0];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      if (i === 0 && Math.abs(ty) > 0.95) ref = [1, 0, 0];
      let ux = ref[1] * tz - ref[2] * ty, uy = ref[2] * tx - ref[0] * tz, uz = ref[0] * ty - ref[1] * tx;
      let ul = Math.hypot(ux, uy, uz); if (ul < 1e-5) { ux = 1; uy = 0; uz = 0; ul = 1; }
      ux /= ul; uy /= ul; uz /= ul;
      ref = [ux, uy, uz];
      const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
      rings.push({ c: pts[i], u: [ux, uy, uz], v: [vx, vy, vz], r: radii[i], t: tx, ty: ty, tz: tz });
    }
    for (let i = 0; i < n - 1; i++) {
      const A = rings[i], B = rings[i + 1];
      for (let s = 0; s < sides; s++) {
        const a0 = s / sides * TAU, a1 = (s + 1) / sides * TAU;
        const ca0 = Math.cos(a0), sa0 = Math.sin(a0), ca1 = Math.cos(a1), sa1 = Math.sin(a1);
        const p = (R, ca, sa) => [R.c[0] + (R.u[0] * ca + R.v[0] * sa) * R.r, R.c[1] + (R.u[1] * ca + R.v[1] * sa) * R.r, R.c[2] + (R.u[2] * ca + R.v[2] * sa) * R.r];
        const nrm = (R, ca, sa) => { const x = R.u[0] * ca + R.v[0] * sa, y = R.u[1] * ca + R.v[1] * sa, z = R.u[2] * ca + R.v[2] * sa; const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
        const A0 = p(A, ca0, sa0), A1 = p(A, ca1, sa1), B0 = p(B, ca0, sa0), B1 = p(B, ca1, sa1);
        const cA0 = typeof colFn === 'function' ? colFn(i / (n - 1), s / sides) : colFn;
        const cB0 = typeof colFn === 'function' ? colFn((i + 1) / (n - 1), s / sides) : colFn;
        this.raw(A0, nrm(A, ca0, sa0), cA0, ax, 0); this.raw(B0, nrm(B, ca0, sa0), cB0, ax, 0); this.raw(B1, nrm(B, ca1, sa1), cB0, ax, 0);
        this.raw(A0, nrm(A, ca0, sa0), cA0, ax, 0); this.raw(B1, nrm(B, ca1, sa1), cB0, ax, 0); this.raw(A1, nrm(A, ca1, sa1), cA0, ax, 0);
      }
    }
    if (cap !== false) {
      const A = rings[0];
      const col = typeof colFn === 'function' ? colFn(0, 0) : colFn;
      for (let s = 0; s < sides; s++) {
        const a0 = s / sides * TAU, a1 = (s + 1) / sides * TAU;
        const p0 = [A.c[0] + (A.u[0] * Math.cos(a0) + A.v[0] * Math.sin(a0)) * A.r, A.c[1] + (A.u[1] * Math.cos(a0) + A.v[1] * Math.sin(a0)) * A.r, A.c[2] + (A.u[2] * Math.cos(a0) + A.v[2] * Math.sin(a0)) * A.r];
        const p1 = [A.c[0] + (A.u[0] * Math.cos(a1) + A.v[0] * Math.sin(a1)) * A.r, A.c[1] + (A.u[1] * Math.cos(a1) + A.v[1] * Math.sin(a1)) * A.r, A.c[2] + (A.u[2] * Math.cos(a1) + A.v[2] * Math.sin(a1)) * A.r];
        this.tri(A.c, p0, p1, col, ax, 0);
      }
    }
  }
  /* low-poly blob / dome */
  blob(cx, cy, cz, rx, ry, rz, seg, rings, col, wob, ax, ay) {
    const pts = [];
    for (let j = 0; j <= rings; j++) {
      const ph = j / rings * PI;
      const row = [];
      for (let i = 0; i < seg; i++) {
        const th = i / seg * TAU;
        const w = 1 + (wob ? (Math.sin(th * 3.1 + j * 1.7) * 0.5 + Math.cos(th * 5.3) * 0.5) * wob : 0);
        row.push([cx + Math.sin(ph) * Math.cos(th) * rx * w, cy + Math.cos(ph) * ry * w, cz + Math.sin(ph) * Math.sin(th) * rz * w]);
      }
      pts.push(row);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      const a = pts[j][i], b = pts[j][i2], c = pts[j + 1][i2], d = pts[j + 1][i];
      const cc = typeof col === 'function' ? col(j / rings, i / seg) : col;
      if (j !== 0) this.tri(a, b, c, cc, ax, ay);
      if (j !== rings - 1) this.tri(a, c, d, cc, ax, ay);
    }
  }
  /* hipped thatch roof, banded */
  hipRoof(cx, cy, cz, w, d, h, bands, colA, colB, rotY) {
    const insets = [];
    for (let b = 0; b <= bands; b++) {
      const t = b / bands;
      insets.push({ t: t, s: 1 - t * 0.92, y: cy + h * Math.pow(t, 0.92) });
    }
    const P = (x, z, y, s) => {
      const x2 = x * s, z2 = z * s;
      const c = Math.cos(rotY || 0), sn = Math.sin(rotY || 0);
      return [cx + x2 * c + z2 * sn, y, cz - x2 * sn + z2 * c];
    };
    for (let b = 0; b < bands; b++) {
      const A = insets[b], B = insets[b + 1];
      const col = b % 2 ? colB : colA;
      const cols = jit(col, 0.06);
      const hw = w / 2, hd = d / 2;
      const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        const p0 = P(corners[k][0], corners[k][1], A.y, A.s);
        const p1 = P(corners[k2][0], corners[k2][1], A.y, A.s);
        const p2 = P(corners[k2][0], corners[k2][1], B.y, B.s);
        const p3 = P(corners[k][0], corners[k][1], B.y, B.s);
        this.quad(p0, p1, p2, p3, cols, 0, 0);
      }
    }
    // apex cap
    const T = insets[bands];
    const hw = w / 2 * T.s, hd = d / 2 * T.s;
    const c = Math.cos(rotY || 0), sn = Math.sin(rotY || 0);
    this.quad([cx - hw * c - hd * sn, T.y, cz + hw * sn - hd * c], [cx + hw * c - hd * sn, T.y, cz - hw * sn - hd * c],
      [cx + hw * c + hd * sn, T.y, cz - hw * sn + hd * c], [cx - hw * c + hd * sn, T.y, cz + hw * sn + hd * c], colA, 0, 0);
    // eaves skirt (thin fascia)
    const e = insets[0];
    const hw0 = w / 2, hd0 = d / 2;
    const pts = [[-hw0, -hd0], [hw0, -hd0], [hw0, hd0], [-hw0, hd0]];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const p0 = P(pts[k][0], pts[k][1], e.y, 1);
      const p1 = P(pts[k2][0], pts[k2][1], e.y, 1);
      const p2 = P(pts[k2][0], pts[k2][1], e.y - h * 0.10, 1.02);
      const p3 = P(pts[k][0], pts[k][1], e.y - h * 0.10, 1.02);
      this.quad(p0, p1, p2, p3, colB, 0, 0);
    }
  }
  torus(cx, cy, cz, R, r, segU, segV, colFn, ax) {
    for (let i = 0; i < segU; i++) {
      const u0 = i / segU * TAU, u1 = (i + 1) / segU * TAU;
      for (let j = 0; j < segV; j++) {
        const v0 = j / segV * TAU, v1 = (j + 1) / segV * TAU;
        const P = (u, v) => {
          const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
          return [cx + (R + r * cv) * cu, cy + r * sv, cz + (R + r * cv) * su];
        };
        const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1);
        const col = colFn(i / segU, j / segV);
        this.tri(a, b, c, col, ax, 0); this.tri(a, c, d, col, ax, 0);
      }
    }
  }
  build() {
    const vcount = this.p.length / 3;
    const buf = new Float32Array(vcount * 11);
    for (let i = 0; i < vcount; i++) {
      buf[i * 11 + 0] = this.p[i * 3]; buf[i * 11 + 1] = this.p[i * 3 + 1]; buf[i * 11 + 2] = this.p[i * 3 + 2];
      buf[i * 11 + 3] = this.n[i * 3]; buf[i * 11 + 4] = this.n[i * 3 + 1]; buf[i * 11 + 5] = this.n[i * 3 + 2];
      buf[i * 11 + 6] = this.c[i * 3]; buf[i * 11 + 7] = this.c[i * 3 + 1]; buf[i * 11 + 8] = this.c[i * 3 + 2];
      buf[i * 11 + 9] = this.a[i * 2]; buf[i * 11 + 10] = this.a[i * 2 + 1];
    }
    return { data: buf, count: vcount };
  }
}
