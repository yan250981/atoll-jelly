
/* ------------------------------------------------------------
   23. world
------------------------------------------------------------ */
let sim, water, plane, fishes = [], rays = [], rings = [], pellets = [];
const QA = { errors: [], maxAlt: 0, maxFoam: 0, maxWave: 0, states: {}, waterDev: 0, frames: 0, lastLanding: -1 };

function buildWorld() {
  sim = new Sim();
  water = makeWater(sim);
  plane = new Plane();
  reseed(4242);
  fishes = [];
  for (let i = 0; i < 42; i++) fishes.push(new Fish(i));
  rays = [new Ray(0), new Ray(1), new Ray(2)];
  rings = [];
  for (let i = 0; i < 5; i++) rings.push(new Ring(i));
  pellets = [];
  S.time = 0; S.energy = 0;
}

const anchors = [[0, 0], [0, 0], [0, 0], [0, 0]];
const anchorState = [
  { a: 0.4, r: 1.05, sp: 0.20 }, { a: 2.1, r: 1.25, sp: -0.16 },
  { a: 3.9, r: 0.95, sp: 0.22 }, { a: 5.4, r: 1.15, sp: -0.19 },
];

function stepWorld(dt) {
  const t0 = performance.now();
  for (let k = 0; k < 4; k++) {
    const st = anchorState[k];
    st.a += st.sp * dt;
    let ax = Math.cos(st.a) * st.r, az = Math.sin(st.a) * st.r - 0.25;
    if (terrain(ax, az) > SEA - 0.12) { ax *= 0.55; az *= 0.55; }
    anchors[k][0] = ax; anchors[k][1] = az;
  }
  S.time += dt;

  if (!S.paused) {
    sim.acc += dt;
    let guard = 0;
    while (sim.acc >= 1 / 120 && guard < 8) { sim.step(1 / 120); sim.acc -= 1 / 120; guard++; }
    if (sim.acc > 0.2) sim.acc = 0;
    S.simMs = performance.now() - t0;
  }

  plane.advance(dt, water);
  plane.onWaterNow = plane.alt < 0.12;
  const steady = plane.onWaterNow && (plane.state === PL.DOCK || plane.state === PL.PIVOT || plane.state === PL.TAXI || plane.state === PL.TAXIIN || plane.state === PL.TURN);
  if (steady) {
    const c = Math.cos(plane.yaw), s = Math.sin(plane.yaw);
    const hs = [water.hAt(plane.x + c * 0.30, plane.z + s * 0.30), water.hAt(plane.x - c * 0.34, plane.z - s * 0.34)];
    for (const h of hs) {
      const d = Math.abs(plane.y - seaY() - h);
      if (d > QA.waterDev) QA.waterDev = d;
    }
  }
  QA.states[STATE_NAME[plane.state]] = 1;
  if (plane.alt > QA.maxAlt) QA.maxAlt = plane.alt;
  if (plane.state === PL.RUNOUT && plane.t < dt * 2) QA.lastLanding = S.time;

  for (let i = 0; i < fishes.length; i++) fishes[i].update(dt, fishes, anchors, pellets, seaY);
  for (const r of rays) r.update(dt, seaY, pellets);
  for (const p of pellets) p.update(dt, water, seaY());
  if (pellets.some(p => p.dead)) pellets = pellets.filter(p => !p.dead);
  for (const r of rings) r.update(dt, water, plane);
  if (plane.onWaterNow && plane.spd > 3.0) {
    for (const f of fishes) f.startle(plane.x, plane.z, 0.9);
  }
  S.tilt = lerp(S.tilt, S.tiltTarget, Math.min(1, dt * 2.2));

  let mx = 0, mf = 0;
  const H = sim.h, F = sim.foam, nn = H.length;
  for (let k = 0; k < nn; k += 5) {
    const a = H[k] < 0 ? -H[k] : H[k];
    if (a > mx) mx = a;
    if (F[k] > mf) mf = F[k];
  }
  S.energy = mx;
  if (mx > QA.maxWave) QA.maxWave = mx;
  if (mf > QA.maxFoam) QA.maxFoam = mf;
}

/* ------------------------------------------------------------
   24. camera
------------------------------------------------------------ */
function updateCamera(aspect) {
  const cp = Math.cos(CAM.ph), sp = Math.sin(CAM.ph);
  eye = [
    CAM.target[0] + Math.cos(CAM.th) * cp * CAM.rad,
    CAM.target[1] + sp * CAM.rad,
    CAM.target[2] + Math.sin(CAM.th) * cp * CAM.rad,
  ];
  const proj = persp(0.60, aspect, 0.05, 60);
  const view = lookAt(eye, CAM.target, [0, 1, 0]);
  viewProj = mmul(proj, view);
  const fl = Math.hypot(CAM.target[0] - eye[0], CAM.target[1] - eye[1], CAM.target[2] - eye[2]) || 1;
  fwd = [(CAM.target[0] - eye[0]) / fl, (CAM.target[1] - eye[1]) / fl, (CAM.target[2] - eye[2]) / fl];
  let rx = fwd[1] * 0 - fwd[2] * 1, ry = fwd[2] * 0 - fwd[0] * 0, rz = fwd[0] * 1 - fwd[1] * 0;
  const rl = Math.hypot(rx, ry, rz) || 1;
  right = [rx / rl, ry / rl, rz / rl];
  upv = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
}
function rayFromNdc(nx, ny, aspect) {
  const th = Math.tan(0.30);
  const d = [
    fwd[0] + right[0] * nx * th * aspect + upv[0] * ny * th,
    fwd[1] + right[1] * nx * th * aspect + upv[1] * ny * th,
    fwd[2] + right[2] * nx * th * aspect + upv[2] * ny * th,
  ];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}
function waterPoint(nx, ny, aspect) {
  const d = rayFromNdc(nx, ny, aspect);
  if (Math.abs(d[1]) < 1e-4) return null;
  const t = (seaY() - eye[1]) / d[1];
  if (t <= 0) return null;
  return [eye[0] + d[0] * t, eye[2] + d[2] * t];
}

/* ------------------------------------------------------------
   25. buffers / instances
------------------------------------------------------------ */
let topIdxCount = 0;

function setupSimBuffers() {
  buffers.simH = device.createBuffer({ size: N * N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  buffers.simF = device.createBuffer({ size: N * N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
}

function writeInstances() {
  const out = [];
  const put = (arr, off, m, a, b, i) => {
    for (let k = 0; k < 16; k++) arr[off + k] = m[k];
    arr[off + 16] = a[0]; arr[off + 17] = a[1]; arr[off + 18] = a[2]; arr[off + 19] = a[3];
    arr[off + 20] = b[0]; arr[off + 21] = b[1]; arr[off + 22] = b[2]; arr[off + 23] = b[3];
    arr[off + 24] = i[0]; arr[off + 25] = i[1]; arr[off + 26] = i[2]; arr[off + 27] = i[3];
  };
  const id = m4();

  // static scene
  {
    const arr = new Float32Array(INST_STRIDE);
    put(arr, 0, id, [1, 1, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0]);
    device.queue.writeBuffer(buffers.gStatic, 0, arr);
    out.push({ name: 'gStatic', count: 1 });
  }
  // plane
  const pm = plane.matrix();
  {
    const arr = new Float32Array(INST_STRIDE);
    put(arr, 0, pm, [1, 1, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0]);
    device.queue.writeBuffer(buffers.gPlane, 0, arr);
    out.push({ name: 'gPlane', count: 1 });
  }
  // props
  {
    const arr = new Float32Array(INST_STRIDE * 2);
    const spin = 24 + plane.spd * 9 + (plane.onWaterNow ? 10 : 0);
    put(arr, 0, mmul(pm, mtrans(0.50, 0.355, 0.40)), [1, 1, 1, 0], [1, 1, 1, 0], [3, spin, 0, 0]);
    put(arr, INST_STRIDE, mmul(pm, mtrans(0.50, 0.355, -0.40)), [1, 1, 1, 0], [1, 1, 1, 0], [3, spin, 0, 0]);
    device.queue.writeBuffer(buffers.gProp, 0, arr);
    out.push({ name: 'gProp', count: 2 });
  }
  // fish
  {
    const arr = new Float32Array(INST_STRIDE * fishes.length);
    for (let k = 0; k < fishes.length; k++) {
      const f = fishes[k];
      const c = FISH_KINDS[f.kind];
      put(arr, k * INST_STRIDE,
        mTRS(f.x, f.y, f.z, -f.yaw, 0, f.bank || 0, 1.9, 1.9, 1.9),
        [c.body[0], c.body[1], c.body[2], f.phase],
        [c.fin[0], c.fin[1], c.fin[2], 0],
        [1, f.phase, f.kind === 2 ? 1 : 0, 0]);
    }
    device.queue.writeBuffer(buffers.gFish, 0, arr);
    out.push({ name: 'gFish', count: fishes.length });
  }
  // rays
  {
    const arr = new Float32Array(INST_STRIDE * rays.length);
    for (let k = 0; k < rays.length; k++) {
      const r = rays[k];
      put(arr, k * INST_STRIDE, mTRS(r.x, r.y, r.z, -r.yaw, 0, r.roll || 0, 1.15, 1.15, 1.15),
        [0.60, 0.58, 0.64, r.phase], [0.96, 0.95, 0.92, 0], [2, r.phase, 0, 0]);
    }
    device.queue.writeBuffer(buffers.gRay, 0, arr);
    out.push({ name: 'gRay', count: rays.length });
  }
  // rings
  {
    const arr = new Float32Array(INST_STRIDE * rings.length);
    for (let k = 0; k < rings.length; k++) {
      const r = rings[k];
      const c = RING_COLS[r.kind];
      put(arr, k * INST_STRIDE, r.matrix(), [c[0][0], c[0][1], c[0][2], 0], [c[1][0], c[1][1], c[1][2], 0], [4, 0, 0, 0]);
    }
    device.queue.writeBuffer(buffers.gRing, 0, arr);
    out.push({ name: 'gRing', count: rings.length });
  }
  // pellets
  {
    const arr = new Float32Array(INST_STRIDE * Math.max(1, pellets.length));
    for (let k = 0; k < pellets.length; k++) {
      const p = pellets[k];
      put(arr, k * INST_STRIDE, mTRS(p.x, p.y, p.z, 0, 0, 0, 1, 1, 1), [1, 1, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0]);
    }
    if (pellets.length) device.queue.writeBuffer(buffers.gPellet, 0, arr);
    out.push({ name: 'gPellet', count: pellets.length });
  }
  return out;
}

/* ------------------------------------------------------------
   26. render
------------------------------------------------------------ */
function render(list) {
  const enc = device.createCommandEncoder();
  const p1 = enc.beginRenderPass({
    colorAttachments: [{
      view: textures.sceneColView,
      clearValue: { r: 0.92, g: 0.91, b: 0.89, a: 1 },
      loadOp: 'clear', storeOp: 'store',
    }],
    depthStencilAttachment: {
      view: textures.depthView,
      depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store',
    },
  });
  p1.setPipeline(pipelines.sky);
  p1.setBindGroup(0, bindGroups.sky);
  p1.draw(3);
  p1.setPipeline(pipelines.mesh);
  for (const g of list) {
    if (!g.count) continue;
    p1.setBindGroup(0, bindGroups[g.name]);
    p1.setVertexBuffer(0, buffers[g.name + 'V']);
    p1.draw(buffers[g.name + 'Count'], g.count, 0, 0);
  }
  p1.end();

  const p2 = enc.beginRenderPass({
    colorAttachments: [{
      view: ctx.getCurrentTexture().createView(),
      clearValue: { r: 0.92, g: 0.91, b: 0.89, a: 1 },
      loadOp: 'clear', storeOp: 'store',
    }],
  });
  p2.setPipeline(pipelines.blit);
  p2.setBindGroup(0, bindGroups.blit);
  p2.draw(3);

  const dbg = window.__DBG || 0;
  if (dbg & 1) { p2.end(); device.queue.submit([enc.finish()]); return; }
  p2.setPipeline(pipelines.waterSide);
  p2.setBindGroup(0, bindGroups.water);
  p2.setIndexBuffer(buffers.sideIdx, 'uint16');
  p2.setVertexBuffer(0, buffers.side);
  p2.drawIndexed(buffers.sideIdxCount);

  p2.setPipeline(pipelines.waterTop);
  p2.setBindGroup(0, bindGroups.water);
  p2.setIndexBuffer(buffers.topIdx, 'uint32');
  p2.drawIndexed(topIdxCount);
  p2.end();
  device.queue.submit([enc.finish()]);
}
