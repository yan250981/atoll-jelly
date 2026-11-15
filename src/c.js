
/* ------------------------------------------------------------
   10. state
------------------------------------------------------------ */
const S = {
  flavour: 'turquoise',
  firm: 0.62,
  damp: 0.35,
  tide: 0,
  paused: false,
  landings: 0,
  fed: 0,
  time: 0,
  simMs: 0,
  tilt: 0,
  tiltTarget: 0,
  energy: 0,
};
let seaY = () => SEA + S.tide * 0.10;

/* ------------------------------------------------------------
   11. water simulation  (staggered shallow water, 120 Hz)
------------------------------------------------------------ */
class Sim {
  constructor() {
    const nn = N * N;
    this.h = new Float32Array(nn);
    this.ux = new Float32Array(nn);
    this.uz = new Float32Array(nn);
    this.foam = new Float32Array(nn);
    this.tmp = new Float32Array(nn);
    this.depth = new Float32Array(nn);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -HALF + i * CS, z = -HALF + j * CS;
      this.depth[j * N + i] = clamp(waterDepth(x, z), 0.045, 0.50);
    }
    this.acc = 0;
  }
  idx(x, z) {
    const i = Math.round((x + HALF) / CS), j = Math.round((z + HALF) / CS);
    return [clamp(i, 1, N - 2), clamp(j, 1, N - 2)];
  }
  stir(x, z, dx, dz, dt, strength) {
    const [ci, cj] = this.idx(x, z);
    const R = 5;
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
      const k = j * N + i;
      const d = Math.hypot(i - ci, j - cj) / R;
      const f = Math.max(0, 1 - d * d);
      const s = f * f * strength;
      this.h[k] -= s * 0.055 * clamp(dt * 60, 0.3, 2);
      this.ux[k] += dx * s * 1.6;
      this.uz[k] += dz * s * 1.6;
      this.foam[k] = Math.min(1.6, this.foam[k] + s * 0.32);
    }
  }
  splash(x, z, amount) {
    const [ci, cj] = this.idx(x, z);
    const R = Math.round(3 + amount * 7);
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
      const k = j * N + i;
      const d = Math.hypot(i - ci, j - cj) / R;
      if (d > 1) continue;
      const f = 1 - d * d;
      this.h[k] -= amount * 0.085 * f * f;
      this.foam[k] = Math.min(2.0, this.foam[k] + f * amount * 1.3);
      const a = Math.atan2(j - cj, i - ci);
      this.ux[k] += Math.cos(a) * f * amount * 0.9;
      this.uz[k] += Math.sin(a) * f * amount * 0.9;
    }
  }
  push(x, z, r, hTarget, strength) {
    // a floating body handing its displaced volume back to the sea
    const [ci, cj] = this.idx(x, z);
    const R = Math.max(1, Math.round(r / CS));
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
      const k = j * N + i;
      const d = Math.hypot(i - ci, j - cj) / R;
      if (d > 1.35) continue;
      const f = Math.max(0, 1 - d * d * 0.75);
      this.h[k] = lerp(this.h[k], hTarget, f * strength);
      if (d > 0.7) this.foam[k] = Math.min(1.6, this.foam[k] + f * 0.10);
    }
  }
  step(dt) {
    const H = this.h, UX = this.ux, UZ = this.uz, D = this.depth, F = this.foam;
    const g = 8.0;
    const damp = 1 - Math.min(0.9, (0.12 + S.damp * 1.5) * dt);
    const kappa = 0.035 * (1 - S.firm * 0.7);
    const gdt = -dt * g / CS;
    const gx = Math.sin(S.tilt * 0.55) * 9.8 * 0.55;
    const gz = Math.cos(S.tilt * 0.55) * 0.0;
    for (let j = 1; j < N - 1; j++) {
      const row = j * N;
      for (let i = 1; i < N - 1; i++) {
        const k = row + i;
        UX[k] = (UX[k] + gdt * (H[k] - H[k - 1]) + gx * dt) * damp;
        UZ[k] = (UZ[k] + gdt * (H[k] - H[k - N]) + gz * dt) * damp;
      }
    }
    const hdt = dt / CS;
    const kd = kappa * dt;
    for (let j = 1; j < N - 1; j++) {
      const row = j * N;
      for (let i = 1; i < N - 1; i++) {
        const k = row + i;
        const div = (UX[k + 1] - UX[k] + UZ[k + N] - UZ[k]) * hdt;
        let nh = H[k] - D[k] * div;
        nh += kd * (H[k + 1] + H[k - 1] + H[k + N] + H[k - N] - 4 * H[k]);
        H[k] = nh > 0.30 ? 0.30 : nh < -0.30 ? -0.30 : nh;
        H[k] *= (1 - 0.02 * dt);
      }
    }
    // boundaries
    for (let i = 0; i < N; i++) {
      H[i] = 0; H[(N - 1) * N + i] = 0;
      H[i * N] = 0; H[i * N + N - 1] = 0;
    }
    // foam decay
    const fd = Math.exp(-dt * 0.85);
    for (let k = 0; k < H.length; k++) { F[k] *= fd; if (F[k] < 0.002) F[k] = 0; }
  }
}

/* ------------------------------------------------------------
   12. meshes: plane, prop, fish, ray, ring
------------------------------------------------------------ */
function buildPlane() {
  const m = new Mesh();
  const white = [0.965, 0.962, 0.945], teal = [0.03, 0.56, 0.58];
  // fuselage
  const xs = [-0.46, -0.34, -0.16, 0.06, 0.28, 0.44, 0.54, 0.60];
  const rs = [0.022, 0.042, 0.070, 0.080, 0.074, 0.060, 0.045, 0.020];
  const pts = xs.map((x, i) => [x, 0.228 + (i > 4 ? (i - 4) * 0.004 : 0), 0]);
  m.tube(pts, rs, 9, (t, u) => {
    const y = Math.sin(u * TAU);
    return (y > -0.10 && y < 0.22) ? teal : white;
  }, 0, true);
  // cockpit windows
  m.box(0.24, 0.262, 0, 0.10, 0.032, 0.098, [0.09, 0.14, 0.16], 0);
  // tail fin
  m.quad([-0.34, 0.245, 0.0], [-0.475, 0.245, 0], [-0.485, 0.375, 0], [-0.40, 0.375, 0], white, 0, 0);
  m.quad([-0.34, 0.245, 0.0], [-0.40, 0.375, 0], [-0.485, 0.375, 0], [-0.475, 0.245, 0], white, 0, 0);
  m.quad([-0.40, 0.372, 0], [-0.485, 0.372, 0], [-0.478, 0.392, 0], [-0.412, 0.392, 0], teal, 0, 0);
  // horizontal stabiliser
  m.box(-0.42, 0.243, 0, 0.13, 0.010, 0.30, white, 0);
  m.box(-0.44, 0.243, 0.163, 0.09, 0.011, 0.026, teal, 0);
  m.box(-0.44, 0.243, -0.163, 0.09, 0.011, 0.026, teal, 0);
  // high wing
  const wy = 0.352;
  m.quadN([0.10, wy, -0.74], [0.10, wy, 0.74], [-0.10, wy, 0.74], [-0.10, wy, -0.74], white, 0, 0, [0, 1, 0]);
  m.quadN([0.10, wy - 0.016, 0.74], [0.10, wy - 0.016, -0.74], [-0.10, wy - 0.016, -0.74], [-0.10, wy - 0.016, 0.74], white, 0, 0, [0, -1, 0]);
  // wing tips (teal, drooping)
  for (const s of [-1, 1]) {
    m.quad([0.10, wy, s * 0.74], [-0.10, wy, s * 0.74], [-0.10, wy - 0.055, s * 0.755], [0.10, wy - 0.055, s * 0.755], teal, 0, 0);
    m.quad([0.10, wy, s * 0.74], [0.10, wy - 0.055, s * 0.755], [-0.10, wy - 0.055, s * 0.755], [-0.10, wy, s * 0.74], teal, 0, 0);
    m.tri([0.10, wy, s * 0.74], [-0.10, wy, s * 0.74], [0, wy, s * 0.80], teal, 0, 0);
  }
  // wing struts
  for (const s of [-1, 1]) {
    m.tube([[0.02, 0.20, s * 0.13], [0.0, wy - 0.01, s * 0.30]], [0.008, 0.007], 4, () => teal, 0, false);
    m.tube([[0.02, 0.20, -s * 0.13], [0.0, wy - 0.01, -s * 0.30]], [0.008, 0.007], 4, () => teal, 0, false);
  }
  // engine nacelles
  for (const s of [-1, 1]) {
    m.tube([[0.18, 0.36, s * 0.40], [0.34, 0.36, s * 0.40], [0.46, 0.355, s * 0.40]], [0.048, 0.050, 0.030], 7, () => white, 0, true);
    m.box(0.455, 0.355, s * 0.40, 0.02, 0.05, 0.05, teal, 0);
  }
  // floats
  for (const s of [-1, 1]) {
    const zf = s * 0.20;
    m.tube([[0.46, 0.055, zf], [0.30, 0.070, zf], [0.0, 0.072, zf], [-0.28, 0.078, zf], [-0.42, 0.098, zf]],
      [0.030, 0.048, 0.050, 0.040, 0.020], 7, (t, u) => (Math.sin(u * TAU) < -0.55 ? [0.86, 0.86, 0.84] : white), 0, true);
    // float struts
    m.tube([[0.14, 0.075, zf], [0.10, 0.20, zf * 0.7]], [0.008, 0.008], 4, () => teal, 0, false);
    m.tube([[-0.18, 0.085, zf], [-0.14, 0.20, zf * 0.7]], [0.008, 0.008], 4, () => teal, 0, false);
    // water rudder
    m.quad([-0.42, 0.10, zf], [-0.42, 0.02, zf], [-0.46, 0.02, zf], [-0.46, 0.10, zf], teal, 0, 0);
  }
  // tail float
  m.tube([[-0.42, 0.19, 0], [-0.50, 0.20, 0]], [0.014, 0.008], 5, () => white, 0, true);
  return m.build();
}
function buildProp() {
  const m = new Mesh();
  const white = [0.93, 0.93, 0.91], dark = [0.15, 0.15, 0.15];
  m.tube([[0, 0, 0], [0.02, 0, 0]], [0.030, 0.026], 7, () => dark, 0, true);
  for (let b = 0; b < 3; b++) {
    const a = b / 3 * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const P = (r, w) => [0.015, r * ca - w * sa, r * sa + w * ca];
    const R = (r, w) => [0.015, r * ca + w * sa, r * sa - w * ca];
    m.quad(P(-0.02, 0.012), P(0.16, 0.006), P(0.16, -0.006), P(-0.02, -0.012), white, 0, 0);
    m.quad(R(-0.02, -0.012), R(0.16, -0.006), R(0.16, 0.006), R(-0.02, 0.012), white, 0, 0);
  }
  return m.build();
}
function buildFish() {
  const m = new Mesh();
  const body = [0.98, 0.98, 0.98];
  const dark = [0.10, 0.10, 0.11];
  const xs = [0.048, 0.030, 0.006, -0.020, -0.042], rs = [0.004, 0.020, 0.025, 0.019, 0.009];
  const pts = xs.map((x, i) => [x, 0, 0]);
  // body, with banded pattern baked for kind 2 (grayscale mask)
  m.tube(pts, rs, 7, (t, u) => {
    const b = Math.abs(Math.sin(t * PI * 3.4));
    return b > 0.62 ? [0.10, 0.10, 0.11] : body;
  }, 0.0, true);
  // tail fin (aux.x = 1)
  const tx = -0.046;
  m.tri([tx, 0, 0], [tx - 0.040, 0.032, 0], [tx - 0.040, -0.032, 0], body, 1.0, 1);
  m.tri([tx, 0, 0], [tx - 0.040, -0.032, 0], [tx - 0.040, 0.032, 0], body, 1.0, 1);
  // dorsal
  m.tri([0.012, 0.022, 0], [-0.024, 0.046, 0], [-0.026, 0.020, 0], body, 0.55, 1);
  // side fins
  for (const s of [-1, 1]) m.tri([0.012, 0.0, s * 0.020], [-0.012, 0.006, s * 0.042], [-0.016, -0.004, s * 0.022], body, 0.35, 1);
  return m.build();
}
function buildRay() {
  const m = new Mesh();
  const top = [0.62, 0.60, 0.66], spot = [0.20, 0.19, 0.21], belly = [0.94, 0.93, 0.90];
  // diamond wings: 24 vertices across the span
  const NS = 26;
  for (let i = 0; i < NS - 1; i++) {
    const t0 = i / (NS - 1), t1 = (i + 1) / (NS - 1);
    const P = (t, side, y) => {
      const z = (t - 0.5) * 2;
      const chord = 0.16 * (1 - Math.pow(Math.abs(z), 1.55)) + 0.012;
      const x = -Math.abs(z) * 0.10;
      return [x, y, z * 0.24];
    };
    const p0 = P(t0, 0, 0), p1 = P(t1, 0, 0);
    const a0 = [p0[0] + 0.10, 0.0, p0[2]], a1 = [p1[0] + 0.10, 0.0, p1[2]];
    const b0 = [p0[0] - 0.10, 0.0, p0[2]], b1 = [p1[0] - 0.10, 0.0, p1[2]];
    const c0 = (i + t0) % 3 < 1 ? spot : top, c1 = (i + t1) % 3 < 1 ? spot : top;
    const w0 = Math.abs(p0[2]) / 0.24, w1 = Math.abs(p1[2]) / 0.24;
    m.tri([a0[0], 0, a0[2]], [b0[0], 0, b0[2]], [b1[0], 0, b1[2]], c0, w0, 0);
    m.tri([a0[0], 0, a0[2]], [b1[0], 0, b1[2]], [a1[0], 0, a1[2]], c1, w1, 0);
    m.tri([a0[0], -0.004, a0[2]], [b1[0], -0.004, b1[2]], [b0[0], -0.004, b0[2]], belly, w0, 0);
    m.tri([a0[0], -0.004, a0[2]], [a1[0], -0.004, a1[2]], [b1[0], -0.004, b1[2]], belly, w1, 0);
  }
  // cephalic fins
  for (const s of [-1, 1]) m.tri([0.10, 0, s * 0.026], [0.155, 0.004, s * 0.045], [0.128, -0.004, s * 0.012], top, 0.3, 0);
  // whip tail
  const tp = [];
  for (let i = 0; i <= 6; i++) tp.push([-0.12 - i * 0.075, -0.004 - i * 0.002, 0]);
  m.tube(tp, tp.map((_, i) => 0.010 * (1 - i / 6 * 0.85) + 0.002), 4, () => [0.35, 0.34, 0.36], 1.0, false);
  return m.build();
}
function buildRing() {
  const m = new Mesh();
  const stripes = 14, segU = 52, segV = 10;
  const R = 0.108, r = 0.038;
  const P = (u, v) => [Math.cos(u) * (R + r * Math.cos(v)), r * Math.sin(v), Math.sin(u) * (R + r * Math.cos(v))];
  for (let i = 0; i < segU; i++) {
    const u0 = i / segU * TAU, u1 = (i + 1) / segU * TAU;
    const s = Math.floor(i / segU * stripes) % 2;
    for (let j = 0; j < segV; j++) {
      const v0 = j / segV * TAU, v1 = (j + 1) / segV * TAU;
      m.tri(P(u0, v0), P(u1, v0), P(u1, v1), [1, 1, 1], 0, s);
      m.tri(P(u0, v0), P(u1, v1), P(u0, v1), [1, 1, 1], 0, s);
    }
  }
  return m.build();
}

/* ------------------------------------------------------------
   13. seaplane
------------------------------------------------------------ */
const PL = {
  DOCK: 0, PIVOT: 1, TAXI: 2, RUN: 3, CLIMB: 4, CIRCUIT: 5,
  APPROACH: 6, FLARE: 7, RUNOUT: 8, TURN: 9, TAXIIN: 10,
};
const STATE_NAME = ['dock', 'pivot', 'taxi', 'run', 'climb', 'circuit', 'approach', 'flare', 'runout', 'turn', 'taxiin'];

class Plane {
  constructor() {
    this.x = LAY.dock[0]; this.z = LAY.dock[1]; this.y = SEA;
    this.yaw = LAY.dockYaw; this.pitch = 0; this.roll = 0;
    this.spd = 0; this.state = PL.DOCK; this.t = 0; this.alt = 0;
    this.dockWait = 7; this.lapT = 0; this.laps = 0; this.hurry = false;
    this.arrived = false;
    this.flapT = 0;
    this.bank = 0;
  }
  get alt() { return this.y - seaY(); }
  set alt(v) { this.y = seaY() + v; }
  headingTo(tx, tz) { return Math.atan2(tz - this.z, tx - this.x); }
  turnToward(target, rate, dt) {
    let d = ((target - this.yaw + PI * 3) % TAU) - PI;
    const s = Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    this.yaw += s;
    return s / Math.max(dt, 1e-4);
  }
  advance(dt, water) {
    this.t += dt;
    const sea = seaY();
    const fwdX = Math.cos(this.yaw), fwdZ = Math.sin(this.yaw);
    let onWater = false;
    switch (this.state) {
      case PL.DOCK: {
        this.spd = lerp(this.spd, 0, Math.min(1, dt * 3));
        this.x = lerp(this.x, LAY.dock[0], Math.min(1, dt * 1.4));
        this.z = lerp(this.z, LAY.dock[1], Math.min(1, dt * 1.4));
        this.yaw = this.yaw + ((((LAY.dockYaw - this.yaw + PI * 3) % TAU) - PI)) * Math.min(1, dt * 1.2);
        onWater = true;
        if (this.t > this.dockWait) this.go(PL.PIVOT);
        break;
      }
      case PL.PIVOT: {
        this.spd = 0;
        onWater = true;
        const d = ((LAY.dockYaw + PI - this.yaw + PI * 3) % TAU) - PI;
        this.yaw += Math.sign(d) * Math.min(Math.abs(d), 1.05 * dt);
        this.roll = Math.sin(this.t * 3) * 0.01;
        if (Math.abs(d) < 0.05 || this.t > 4.4) { this.yaw = LAY.dockYaw + PI; this.go(PL.TAXI); }
        break;
      }
      case PL.TAXI: {
        this.spd = lerp(this.spd, 1.5, Math.min(1, dt * 1.2));
        this.x += fwdX * this.spd * dt; this.z += fwdZ * this.spd * dt;
        onWater = true;
        if (this.t > 5.4) this.go(PL.RUN);
        break;
      }
      case PL.RUN: {
        this.spd = Math.min(11.5, this.spd + 5.2 * dt);
        this.x += fwdX * this.spd * dt; this.z += fwdZ * this.spd * dt;
        onWater = true;
        this.pitch = lerp(this.pitch, -0.03 - this.spd * 0.004, dt * 2);
        water.splash(this.x - fwdX * 0.35, this.z - fwdZ * 0.35, 0.30 * clamp(this.spd / 7, 0, 1.2));
        if (this.spd > 6.2) this.go(PL.CLIMB);
        break;
      }
      case PL.CLIMB: {
        this.spd = Math.min(13.5, this.spd + 1.6 * dt);
        this.x += fwdX * this.spd * dt; this.z += fwdZ * this.spd * dt;
        this.pitch = lerp(this.pitch, -0.26, dt * 2.2);
        this.y += (0.55 + 2.0 * clamp(this.t / 2.2, 0, 1)) * dt;
        this.roll = lerp(this.roll, 0, dt * 2);
        if (this.t > 1.8 && !this.arrived) { this.arrived = true; this.yaw += 0.0; }
        if (this.t > 4.6) { this.go(PL.CIRCUIT); this.laps = 0; }
        break;
      }
      case PL.CIRCUIT: {
        this.spd = lerp(this.spd, this.hurry ? 15.5 : 12.2, dt * 0.8);
        // pursue a point on the racetrack
        const ang = Math.atan2(this.z / 3.95, this.x / 4.55);
        const targetAng = ang + (this.hurry ? 0.62 : 0.40);
        const tx = Math.cos(targetAng) * 4.55, tz = Math.sin(targetAng) * 3.95;
        const want = this.headingTo(tx, tz);
        const rate = this.turnToward(want, 0.85, dt);
        this.bank = lerp(this.bank, clamp(rate * 0.55, -0.62, 0.62), dt * 2);
        this.roll = this.bank;
        this.x += fwdX * this.spd * dt; this.z += fwdZ * this.spd * dt;
        const tAlt = 3.12 + Math.sin(this.t * 0.7) * 0.05;
        this.y = lerp(this.y, sea + tAlt, Math.min(1, dt * 1.1));
        this.pitch = lerp(this.pitch, -0.045 - this.bank * 0.05, dt * 2);
        this.lapT += dt;
        const need = this.hurry ? 7.0 : 21.0;
        if (this.lapT > need) this.go(PL.APPROACH);
        break;
      }
      case PL.APPROACH: {
        this.spd = lerp(this.spd, 9.2, dt * 1.2);
        const tx = LAY.land[0] - 0.9, tz = LAY.land[1] - 4.2;
        const want = this.headingTo(tx, tz);
        const rate = this.turnToward(want, 0.9, dt);
        this.bank = lerp(this.bank, clamp(rate * 0.4, -0.4, 0.4), dt * 2);
        this.roll = this.bank;
        this.x += fwdX * this.spd * dt; this.z += fwdZ * this.spd * dt;
        this.y = lerp(this.y, sea + 0.20, Math.min(1, dt * 0.75));
        this.pitch = lerp(this.pitch, 0.02, dt * 2);
        const dd = Math.hypot(this.x - LAY.land[0], this.z - LAY.land[1]);
        if ((dd < 3.4 && this.alt < 0.55) || this.t > 16) this.go(PL.FLARE);
        break;
      }
      case PL.FLARE: {
        this.spd = lerp(this.spd, 7.4, dt * 1.4);
        this.x += fwdX * this.spd * dt; this.z += fwdZ * this.spd * dt;
        this.y = lerp(this.y, sea + 0.035, Math.min(1, dt * 4.5));
        this.pitch = lerp(this.pitch, -0.10, dt * 3);
        this.bank = lerp(this.bank, 0, dt * 3);
        this.roll = this.bank;
        if (this.y - sea < 0.075 || this.t > 2.4) {
          this.y = sea;
          S.landings++;
          water.splash(this.x, this.z, 1.35);
          water.splash(this.x - fwdX * 0.5, this.z - fwdZ * 0.5, 0.9);
          this.jolt = 1;
          this.go(PL.RUNOUT);
        }
        break;
      }
      case PL.RUNOUT: {
        this.spd = Math.max(1.3, this.spd - 2.6 * dt);
        this.x += fwdX * this.spd * dt; this.z += fwdZ * this.spd * dt;
        onWater = true;
        this.pitch = lerp(this.pitch, 0.01, dt * 2);
        if (this.spd < 1.6) this.go(PL.TURN);
        break;
      }
      case PL.TURN: {
        this.spd = Math.max(0.6, this.spd - 0.5 * dt);
        this.x += fwdX * this.spd * dt; this.z += fwdZ * this.spd * dt;
        onWater = true;
        const want = this.tYaw === undefined ? (this.tYaw = this.yaw + PI) : this.tYaw;
        const d = ((want - this.yaw + PI * 3) % TAU) - PI;
        this.yaw += Math.sign(d) * Math.min(Math.abs(d), 0.95 * dt);
        this.roll = lerp(this.roll, 0.03, dt * 2);
        if (Math.abs(d) < 0.06 || this.t > 4.2) { this.tYaw = undefined; this.go(PL.TAXIIN); }
        break;
      }
      case PL.TAXIIN: {
        onWater = true;
        const want = this.headingTo(LAY.dock[0], LAY.dock[1]);
        this.turnToward(want, 0.9, dt);
        const dd = Math.hypot(this.x - LAY.dock[0], this.z - LAY.dock[1]);
        this.spd = lerp(this.spd, clamp(dd * 1.6, 0.5, 1.6), dt * 2);
        this.x += Math.cos(this.yaw) * this.spd * dt;
        this.z += Math.sin(this.yaw) * this.spd * dt;
        this.roll = lerp(this.roll, 0, dt * 2);
        if (dd < 0.22 || this.t > 15) { this.tYaw = undefined; this.go(PL.DOCK); this.dockWait = 9; }
        break;
      }
    }
    if (onWater) {
      // ride the jelly: four float samples
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      const samp = (fx, fz) => water.hAt(this.x + c * fx - s * fz, this.z + s * fx + c * fz);
      const hF = samp(0.30, 0), hB = samp(-0.34, 0), hL = samp(0, -0.20), hR = samp(0, 0.20);
      const hh = (hF + hB + hL + hR) / 4;
      this.y = lerp(this.y, sea + hh + 0.012, Math.min(1, dt * 16));
      this.pitch = lerp(this.pitch, (hF - hB) * 1.5, Math.min(1, dt * 10));
      this.roll = lerp(this.roll, (hR - hL) * 1.1, Math.min(1, dt * 5));
      // displaced volume: the floats push water out
      water.push(this.x + c * 0.05, this.z + s * 0.05, 0.30, hh * 0.35 + 0.012, 0.20);
      water.push(this.x - c * 0.30, this.z - s * 0.30, 0.22, hh * 0.3, 0.12);
    } else {
      this.y = Math.max(this.y, sea + 0.02);
    }
    if (this.jolt > 0) this.jolt = Math.max(0, this.jolt - dt * 2.2);
  }
  go(s) { this.state = s; this.t = 0; this.arrived = false; }
  press() {
    if (this.state === PL.DOCK) { this.dockWait = 0; this.t = Math.max(this.t, 0.5); }
    else if (this.state === PL.CIRCUIT || this.state === PL.CLIMB) { this.hurry = true; this.t = Math.max(this.t, 1); }
    else if (this.state === PL.TAXI) { this.t = Math.max(this.t, 4.6); }
  }
  matrix() {
    let M = mtrans(this.x, this.y, this.z);
    M = mmul(M, mrotY(-this.yaw));
    M = mmul(M, mrotZ(this.pitch));
    M = mmul(M, mrotX(this.roll));
    return M;
  }
}
