
/* ------------------------------------------------------------
   14. water sampler used by floating things
------------------------------------------------------------ */
function makeWater(sim) {
  return {
    sim: sim,
    hAt(x, z) {
      const fx = clamp((x + HALF) / CS, 1, N - 2.01), fz = clamp((z + HALF) / CS, 1, N - 2.01);
      const i = Math.floor(fx), j = Math.floor(fz);
      const tx = fx - i, tz = fz - j;
      const k = j * N + i;
      const H = sim.h;
      return lerp(lerp(H[k], H[k + 1], tx), lerp(H[k + N], H[k + N + 1], tx), tz);
    },
    grad(x, z) {
      const e = CS * 1.5;
      return [(this.hAt(x + e, z) - this.hAt(x - e, z)) / (2 * e), (this.hAt(x, z + e) - this.hAt(x, z - e)) / (2 * e)];
    },
    splash(x, z, a) { sim.splash(x, z, a); },
    push(x, z, r, h, s) { sim.push(x, z, r, h, s); },
  };
}

/* ------------------------------------------------------------
   15. fish
------------------------------------------------------------ */
const FISH_KINDS = [
  { body: [0.99, 0.80, 0.16], fin: [0.99, 0.72, 0.10], n: 14, label: 'yellow tang' },
  { body: [0.10, 0.36, 0.82], fin: [0.99, 0.84, 0.18], n: 12, label: 'blue tang' },
  { body: [0.97, 0.96, 0.94], fin: [0.12, 0.12, 0.13], n: 9, label: 'banded' },
  { body: [0.96, 0.44, 0.14], fin: [0.99, 0.96, 0.92], n: 7, label: 'clown' },
];
class Fish {
  constructor(i) {
    this.i = i;
    let kind = 0, acc = 0;
    for (let k = 0; k < 4; k++) { acc += FISH_KINDS[k].n; if (i < acc) { kind = k; break; } }
    this.kind = kind;
    this.phase = rnd() * TAU;
    this.speed = rr(0.30, 0.55);
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * 1.5;
    this.x = Math.cos(a) * r; this.z = Math.sin(a) * r - 0.3;
    this.y = clamp(terrain(this.x, this.z) + 0.11, 0.6, SEA - 0.06);
    this.vx = rr(-0.2, 0.2); this.vy = 0; this.vz = rr(-0.2, 0.2);
    this.yaw = Math.atan2(this.vz, this.vx);
    this.fear = 0;
    this.eaten = 0;
    this.target = null;
  }
  update(dt, all, anchors, pellets, sfc) {
    const sea = sfc();
    let ax = 0, ay = 0, az = 0;
    const anc = anchors[this.kind];
    ax += (anc[0] - this.x) * 0.22;
    az += (anc[1] - this.z) * 0.22;
    let sepx = 0, sepy = 0, sepz = 0, alx = 0, alz = 0, cox = 0, coz = 0, nSame = 0;
    for (let k = 0; k < all.length; k++) {
      if (k === this.i) continue;
      const o = all[k];
      const dx = this.x - o.x, dy = this.y - o.y, dz = this.z - o.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 0.0026 && d2 > 1e-7) {
        const d = Math.sqrt(d2);
        sepx += dx / d * 1.9; sepy += dy / d * 1.2; sepz += dz / d * 1.9;
      }
      if (o.kind === this.kind && d2 < 0.36) {
        alx += o.vx; alz += o.vz; cox += o.x; coz += o.z; nSame++;
      }
    }
    ax += sepx * 1.4; ay += sepy * 1.6; az += sepz * 1.4;
    if (nSame > 0) {
      ax += (alx / nSame - this.vx) * 1.1;
      az += (alz / nSame - this.vz) * 1.1;
      ax += (cox / nSame - this.x) * 0.20;
      az += (coz / nSame - this.z) * 0.20;
    }
    // wander
    ax += Math.sin(this.phase + S.time * 0.9) * 0.10;
    az += Math.cos(this.phase * 1.7 + S.time * 0.8) * 0.10;
    ay += Math.sin(this.phase * 2.3 + S.time * 1.3) * 0.08;
    // pellets
    let best = null, bd = 1.2;
    for (const p of pellets) {
      const d = Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) {
      const d = Math.max(0.02, bd);
      ax += (best.x - this.x) / d * 3.2;
      ay += (best.y - this.y) / d * 3.2;
      az += (best.z - this.z) / d * 3.2;
      if (bd < 0.045) { best.dead = true; S.fed++; this.eaten++; }
    }
    // bounds: stay in the water
    const g = terrain(this.x, this.z);
    const lowY = g + 0.055, highY = sea - 0.045;
    if (this.y < lowY + 0.05) ay += (lowY + 0.06 - this.y) * 12;
    if (this.y > highY - 0.05) ay -= (this.y - highY + 0.06) * 12;
    // keep out of the shallows / off the beach
    if (g > sea - 0.10) {
      const inward = Math.atan2(-this.z, -this.x);
      ax += Math.cos(inward) * 0.9; az += Math.sin(inward) * 0.9;
    }
    const m = Math.hypot(this.x, this.z);
    if (m > 2.30) { ax -= this.x / m * 1.6; az -= this.z / m * 1.6; }
    if (this.fear > 0.01) { this.fear *= Math.exp(-dt * 1.7); }
    this.vx += ax * dt; this.vy += ay * dt; this.vz += az * dt;
    const sp = Math.hypot(this.vx, this.vy, this.vz);
    const maxS = this.speed * (1 + this.fear * 2.4);
    if (sp > maxS) { const s = maxS / sp; this.vx *= s; this.vy *= s; this.vz *= s; }
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.y = clamp(this.y, terrain(this.x, this.z) + 0.045, sea - 0.035);
    this.y = Math.min(this.y, sea - 0.035);
    // hard keep-out: never inside the islet mound or the shallows
    if (terrain(this.x, this.z) > sea - 0.05) {
      const dxI = this.x + 1.52, dzI = this.z + 1.56;
      const dI = Math.hypot(dxI, dzI) || 1;
      this.x += dxI / dI * 2.6 * dt; this.z += dzI / dI * 2.6 * dt;
      this.x = clamp(this.x, -2.5, 2.5); this.z = clamp(this.z, -2.5, 2.5);
    }
    this.yaw = Math.atan2(this.vz, this.vx);
    this.bank = clamp((this.yaw - (this.pyaw === undefined ? this.yaw : this.pyaw)) / Math.max(dt, 0.001) * 0.06, -0.4, 0.4);
    this.pyaw = this.yaw;
    return sp;
  }
  startle(x, z, r) {
    const d = Math.hypot(this.x - x, this.z - z);
    if (d < r) {
      const f = (1 - d / r) * 2.6;
      this.vx += (this.x - x) / (d + 0.05) * f;
      this.vz += (this.z - z) / (d + 0.05) * f;
      this.vy += 0.35 * f * 0.3;
      this.fear = Math.min(1.4, this.fear + f * 0.5);
    }
  }
}

/* ------------------------------------------------------------
   16. eagle rays
------------------------------------------------------------ */
class Ray {
  constructor(i) {
    this.i = i;
    this.phase = rnd() * TAU;
    this.a = rnd() * TAU;
    this.rad = rr(0.7, 1.6);
    this.y = rr(0.45, 0.75);
    this.yaw = this.a + PI / 2;
    this.x = Math.cos(this.a) * this.rad;
    this.z = Math.sin(this.a) * this.rad;
    this.speed = rr(0.26, 0.36);
    this.fear = 0;
  }
  update(dt, sfc, pellets) {
    this.a += this.speed * dt / Math.max(0.4, this.rad) * 1.5;
    const tgt = [Math.cos(this.a) * this.rad, Math.sin(this.a) * this.rad];
    const want = Math.atan2(tgt[1] - this.z, tgt[0] - this.x);
    let d = ((want - this.yaw + PI * 3) % TAU) - PI;
    this.yaw += clamp(d, -1.6 * dt, 1.6 * dt);
    const sp = this.speed * (1 + this.fear * 1.6);
    this.x += Math.cos(this.yaw) * sp * dt;
    this.z += Math.sin(this.yaw) * sp * dt;
    const g = terrain(this.x, this.z);
    this.y = lerp(this.y, clamp(g + 0.16 + Math.sin(this.phase + S.time * 0.5) * 0.06, 0.30, sfc() - 0.10), dt * 0.8);
    this.roll = clamp(d * 0.5, -0.35, 0.35);
    if (this.fear > 0.01) this.fear *= Math.exp(-dt * 1.4);
    this.yaw += Math.sin(S.time * 2 + this.phase) * 0.15 * dt;
  }
  startle(x, z, r) {
    const d = Math.hypot(this.x - x, this.z - z);
    if (d < r) this.fear = Math.min(1, this.fear + (1 - d / r));
  }
}

/* ------------------------------------------------------------
   17. float rings
------------------------------------------------------------ */
const RING_COLS = [
  [[0.98, 0.56, 0.60], [0.99, 0.95, 0.92]],
  [[0.99, 0.63, 0.28], [0.99, 0.95, 0.92]],
  [[0.30, 0.62, 0.92], [0.99, 0.95, 0.92]],
];
class Ring {
  constructor(i) {
    this.i = i;
    this.kind = i % 3;
    this.x = rr(-1.6, 1.6); this.z = rr(-0.6, 1.7);
    this.y = SEA + 0.05;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = rnd() * TAU;
    this.tiltX = 0; this.tiltZ = 0;
    this.held = false;
    this.spin = 0;
    this.settle = 0;
    this.alive = true;
    this.scale = 1;
    this.drift = rnd() * TAU;
  }
  deckAt(x, z) {
    for (const b of LAY.bung) {
      const dx = x - b.x, dz = z - b.z;
      const c = Math.cos(-b.ang), s = Math.sin(-b.ang);
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      const w = (b.big ? 0.92 : 0.78) / 2, d = (b.big ? 0.82 : 0.68) / 2;
      if (Math.abs(lx) < w && Math.abs(lz) < d) return SEA + 0.20;
    }
    return null;
  }
  update(dt, water, plane) {
    const sea = seaY();
    if (this.held) {
      this.vy = 0;
      this.y = lerp(this.y, sea + 0.42 + Math.sin(S.time * 2) * 0.01, Math.min(1, dt * 6));
      this.tiltX = lerp(this.tiltX, 0.06, dt * 4);
      this.tiltZ = lerp(this.tiltZ, 0, dt * 4);
      return;
    }
    const deck = this.deckAt(this.x, this.z);
    const g = terrain(this.x, this.z);
    let restY;
    if (deck !== null) restY = deck + 0.045;
    else if (g > sea) restY = g + 0.040;
    else restY = sea + water.hAt(this.x, this.z) + 0.030;
    this.vy -= 6.5 * dt;
    // buoyancy spring, heavily damped so it never pops out
    const err = restY - this.y;
    this.vy += err * (deck !== null || g > sea ? 42 : 26) * dt;
    this.vy *= Math.exp(-dt * (deck !== null || g > sea ? 7 : 5.2));
    this.y += this.vy * dt;
    if (this.y < restY - 0.02) { this.y = restY - 0.02; this.vy = Math.max(this.vy, 0); }
    this.vx *= Math.exp(-dt * 1.1); this.vz *= Math.exp(-dt * 1.1);
    // ride the swell
    if (deck === null && g < sea) {
      const [gx, gz] = water.grad(this.x, this.z);
      this.tiltX = lerp(this.tiltX, -gz * 0.9, dt * 5);
      this.tiltZ = lerp(this.tiltZ, gx * 0.9, dt * 5);
      this.vx += gx * 0.30 * dt * 60;
      this.vz += gz * 0.30 * dt * 60;
    } else {
      this.tiltX = lerp(this.tiltX, 0, dt * 5);
      this.tiltZ = lerp(this.tiltZ, 0, dt * 5);
    }
    // seaplane shoves it aside
    if (plane && plane.onWaterNow) {
      const dx = this.x - plane.x, dz = this.z - plane.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.85) {
        const f = (1 - d / 0.85) * 3.4;
        this.vx += dx / (d + 0.01) * f * dt * 10;
        this.vz += dz / (d + 0.01) * f * dt * 10;
        this.vy += f * dt * 2;
      }
    }
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.x = clamp(this.x, -2.42, 2.42); this.z = clamp(this.z, -2.42, 2.42);
    this.spin += (this.vx + this.vz) * dt * 0.6;
    this.yaw += this.spin * dt * 0.2;
  }
  throwTo(tx, tz, up) {
    this.held = false;
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    this.vx = clamp(dx * 1.6, -4, 4);
    this.vz = clamp(dz * 1.6, -4, 4);
    this.vy = up === undefined ? 2.0 : up;
    this.x += this.vx * 0.02; this.z += this.vz * 0.02;
  }
  matrix() {
    let M = mtrans(this.x, this.y, this.z);
    M = mmul(M, mrotY(this.yaw));
    M = mmul(M, mrotX(this.tiltX));
    M = mmul(M, mrotZ(this.tiltZ));
    M = mmul(M, mscale(this.scale, this.scale, this.scale));
    return M;
  }
}

/* ------------------------------------------------------------
   18. pellets
------------------------------------------------------------ */
class Pellet {
  constructor(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.vx = rr(-0.10, 0.10); this.vy = rr(-0.05, 0.05); this.vz = rr(-0.10, 0.10);
    this.age = 0; this.dead = false;
  }
  update(dt, water, sea) {
    this.age += dt;
    const s = this.age < 2.4 ? 1 : 0.45;
    this.vy -= 0.55 * dt * s;
    this.vy += water.hAt(this.x, this.z) * 6 * dt;
    this.vx *= Math.exp(-dt * 1.4); this.vz *= Math.exp(-dt * 1.4); this.vy *= Math.exp(-dt * 1.6);
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.y = Math.min(this.y, sea + water.hAt(this.x, this.z) + 0.012);
    const g = terrain(this.x, this.z) + 0.012;
    if (this.y < g) { this.y = g; this.vy = 0; this.vx *= 0.8; this.vz *= 0.8; }
    if (this.age > 26) this.dead = true;
  }
}
