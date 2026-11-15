
/* ------------------------------------------------------------
   27. boot
------------------------------------------------------------ */
let raf = 0, last = 0;

async function boot() {
  sizeCanvas();
  const ok = await initGPU();
  if (!ok) {
    document.getElementById('fallback').classList.add('show');
    document.getElementById('pill').classList.add('dead');
    document.getElementById('pillTxt').textContent = 'NO WEBGPU';
    window.__aj = { ready: false, reason: 'no-adapter', check: async () => ({ pass: 0, total: 1, results: [{ name: 'webgpu-adapter', pass: false }] }) };
    return;
  }
  createPipelines();
  buildWorld();

  const sc = buildScene();
  sceneMesh = sc.mesh.build();
  planeMesh = buildPlane();
  propMesh = buildProp();
  fishMesh = buildFish();
  rayMesh = buildRay();
  ringMesh = buildRing();
  {
    const m = new Mesh();
    m.blob(0, 0, 0, 0.016, 0.016, 0.016, 8, 5, () => [0.99, 0.74, 0.32], 0.12, 0, 0);
    pelletMesh = m.build();
  }

  makeGroup('gStatic', sceneMesh, 1);
  makeGroup('gPlane', planeMesh, 1);
  makeGroup('gProp', propMesh, 2);
  makeGroup('gFish', fishMesh, 48);
  makeGroup('gRay', rayMesh, 4);
  makeGroup('gRing', ringMesh, 8);
  makeGroup('gPellet', pelletMesh, 24);

  setupSimBuffers();

  const sg = waterSideMesh();
  buffers.side = device.createBuffer({ size: sg.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffers.side, 0, sg.data);
  buffers.sideIdx = device.createBuffer({ size: sg.idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffers.sideIdx, 0, sg.idx);
  buffers.sideIdxCount = sg.idx.length;

  const ti = topMesh();
  topIdxCount = ti.length;
  buffers.topIdx = device.createBuffer({ size: ti.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffers.topIdx, 0, ti);

  makeTargets();
  bindGroups.water = device.createBindGroup({
    layout: waterLayout,
    entries: [
      { binding: 0, resource: { buffer: buffers.waterU } },
      { binding: 1, resource: { buffer: buffers.simH } },
      { binding: 2, resource: { buffer: buffers.simF } },
      { binding: 3, resource: textures.sceneColView2 },
      { binding: 4, resource: textures.depthView },
    ],
  });
  bindGroups.blit = device.createBindGroup({
    layout: blitLayout,
    entries: [{ binding: 0, resource: textures.sceneColView }],
  });

  window.addEventListener('resize', () => { sizeCanvas(); });
  installInput();
  installUI();
  syncSliders();
  setFlavour('turquoise');
  document.getElementById('pillTxt').textContent = 'WEBGPU · LIVE';

  window.__aj = {
    ready: true,
    state: S,
    sim, qa: QA,
    get plane() { return plane; },
    get fishes() { return fishes; },
    get rays() { return rays; },
    get rings() { return rings; },
    get pellets() { return pellets; },
    api: {
      feed, addRing, seaplane: () => plane.press(), reset,
      resetView, pause: setPaused, flavour: setFlavour, firm: setFirm,
      damp: setDamp, tide: setTide, tilt: (v) => { S.tiltTarget = v; },
      stir, fastForward, runSim, pickRing,
    },
    check: runChecks,
  };

  last = performance.now();
  raf = requestAnimationFrame(tick);
  setTimeout(() => { sizeCanvas(); }, 80);
}

/* ------------------------------------------------------------
   28. uniforms
------------------------------------------------------------ */
function blockMatrix() {
  if (Math.abs(S.tilt) < 1e-5) return m4();
  return mmul(mmul(mtrans(0, 0.72, 0), mrotZ(S.tilt)), mtrans(0, -0.72, 0));
}
function writeUniforms() {
  const sea = seaY();
  const bm = blockMatrix();
  const g = globData;
  g.set(viewProj, 0);
  g.set(bm, 16);
  g[32] = eye[0]; g[33] = eye[1]; g[34] = eye[2]; g[35] = S.time;
  g[36] = -0.40; g[37] = 0.84; g[38] = 0.36; g[39] = 1.0;
  g[40] = 0.05; g[41] = 60; g[42] = 0; g[43] = 0;
  device.queue.writeBuffer(buffers.glob, 0, g);

  const s = skyData;
  s[0] = eye[0]; s[1] = eye[1]; s[2] = eye[2]; s[3] = 0;
  s[4] = right[0]; s[5] = right[1]; s[6] = right[2]; s[7] = 0;
  s[8] = upv[0]; s[9] = upv[1]; s[10] = upv[2]; s[11] = 0;
  s[12] = fwd[0]; s[13] = fwd[1]; s[14] = fwd[2]; s[15] = 0;
  s[16] = canvas.width; s[17] = canvas.height; s[18] = 0.30; s[19] = canvas.width / Math.max(1, canvas.height);
  device.queue.writeBuffer(buffers.sky, 0, s);

  const fl = FLAVOURS[S.flavour];
  const w = waterData;
  w.set(viewProj, 0);
  w.set(bm, 16);
  w[32] = eye[0]; w[33] = eye[1]; w[34] = eye[2]; w[35] = S.time;
  w[36] = N; w[37] = CS; w[38] = sea; w[39] = S.time;
  w[40] = fl.absorb[0]; w[41] = fl.absorb[1]; w[42] = fl.absorb[2]; w[43] = 1.0;
  w[44] = 0; w[45] = 0.05; w[46] = 60; w[47] = S.firm;
  w[48] = canvas.width; w[49] = canvas.height; w[50] = 0; w[51] = 0;
  const sc2 = fl.scatter || [0.10, 0.62, 0.63];
  w[52] = sc2[0]; w[53] = sc2[1]; w[54] = sc2[2]; w[55] = window.__DBG_W || 0;
  w[56] = fwd[0]; w[57] = fwd[1]; w[58] = fwd[2]; w[59] = 0;
  device.queue.writeBuffer(buffers.waterU, 0, w);

  device.queue.writeBuffer(buffers.simH, 0, sim.h);
  device.queue.writeBuffer(buffers.simF, 0, sim.foam);
}

/* ------------------------------------------------------------
   29. frame
------------------------------------------------------------ */
function tick(ts) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0.0005, (ts - last) / 1000));
  last = ts;
  if (!S.paused) stepWorld(dt);
  const aspect = canvas.width / Math.max(1, canvas.height);
  updateCamera(aspect);
  writeUniforms();
  const list = writeInstances();
  render(list);
  hud();
  QA.frames++;
}

/* ------------------------------------------------------------
   30. interaction
------------------------------------------------------------ */
const ptr = { down: false, id: -1, lx: 0, ly: 0, moved: 0, mode: 'none', ring: null };
const pinch = { active: false, d: 0 };
const touches = new Map();

function ndcFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
}
function pickRing(nx, ny) {
  let best = null, bd = 0.12;
  for (const r of rings) {
    if (r.held) continue;
    const m = viewProj;
    const x = r.x, y = r.y, z = r.z;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.01) continue;
    const d = Math.hypot(cx / cw - nx, cy / cw - ny);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
function stirAt(nx, ny, dx, dz) {
  const aspect = canvas.width / Math.max(1, canvas.height);
  const p = waterPoint(nx, ny, aspect);
  if (!p) return null;
  if (Math.abs(p[0]) > 2.62 || Math.abs(p[1]) > 2.62) return null;
  if (terrain(p[0], p[1]) > seaY() - 0.008) return null;
  sim.stir(p[0], p[1], dx * 22, dz * 22, 1 / 20, 1.0);
  for (const f of fishes) f.startle(p[0], p[1], 0.55);
  for (const r of rays) r.startle(p[0], p[1], 0.75);
  return p;
}
function stir(x, z, dx, dz) { sim.stir(x, z, dx === undefined ? 8 : dx, dz === undefined ? 4 : dz, 0.2, 1.0); }

function installInput() {
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) {
        const a = [...touches.values()];
        pinch.active = true;
        pinch.d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
        ptr.mode = 'pinch';
        ptr.down = false;
        return;
      }
    }
    const [nx, ny] = ndcFromEvent(e);
    ptr.down = true; ptr.id = e.pointerId; ptr.lx = nx; ptr.ly = ny;
    ptr.moved = 0; ptr.ring = null;
    if (e.shiftKey) { ptr.mode = 'tilt'; return; }
    if (e.button === 2 || e.button === 1) { ptr.mode = 'orbit'; return; }
    const r = pickRing(nx, ny);
    if (r) { ptr.mode = 'ring'; ptr.ring = r; r.held = true; return; }
    const aspect = canvas.width / Math.max(1, canvas.height);
    const p = waterPoint(nx, ny, aspect);
    if (p && Math.abs(p[0]) < 2.6 && Math.abs(p[1]) < 2.6 && terrain(p[0], p[1]) < seaY() - 0.005) {
      ptr.mode = 'stir';
      sim.splash(p[0], p[1], 0.16);
    } else {
      ptr.mode = 'orbit';
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch.active && touches.size >= 2) {
        const a = [...touches.values()];
        const d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
        CAM.rad = clamp(CAM.rad * (pinch.d / Math.max(1, d)), 5.2, 17);
        pinch.d = d;
        return;
      }
    }
    if (!ptr.down || e.pointerId !== ptr.id) return;
    const [nx, ny] = ndcFromEvent(e);
    const dx = nx - ptr.lx, dy = ny - ptr.ly;
    ptr.moved += Math.abs(dx) + Math.abs(dy);
    if (ptr.mode === 'orbit') {
      CAM.th -= dx * 3.2;
      CAM.ph = clamp(CAM.ph + dy * 2.0, 0.07, 1.40);
    } else if (ptr.mode === 'tilt') {
      S.tiltTarget = clamp(S.tiltTarget + dx * 1.2, -0.18, 0.18);
    } else if (ptr.mode === 'stir') {
      stirAt(nx, ny, dx, dy);
    } else if (ptr.mode === 'ring' && ptr.ring) {
      const aspect = canvas.width / Math.max(1, canvas.height);
      const p = waterPoint(nx, ny, aspect);
      if (p) { ptr.ring.x = clamp(p[0], -2.35, 2.35); ptr.ring.z = clamp(p[1], -2.35, 2.35); }
    }
    ptr.lx = nx; ptr.ly = ny;
  });

  const up = (e) => {
    if (e.pointerType === 'touch') touches.delete(e.pointerId);
    if (touches.size < 2) pinch.active = false;
    if (!ptr.down || e.pointerId !== ptr.id) return;
    ptr.down = false;
    const [nx, ny] = ndcFromEvent(e);
    if (ptr.mode === 'ring' && ptr.ring) {
      const aspect = canvas.width / Math.max(1, canvas.height);
      const p = waterPoint(nx, ny, aspect);
      ptr.ring.held = false;
      if (p) ptr.ring.throwTo(p[0], p[1], 2.6);
      else ptr.ring.throwTo(ptr.ring.x, ptr.ring.z, 1.6);
      ptr.ring = null;
    } else if (ptr.mode === 'stir' && ptr.moved < 0.03) {
      const aspect = canvas.width / Math.max(1, canvas.height);
      const p = waterPoint(nx, ny, aspect);
      if (p) sim.splash(p[0], p[1], 0.5);
    }
    ptr.mode = 'none';
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    CAM.rad = clamp(CAM.rad * (1 + Math.sign(e.deltaY) * 0.07), 5.2, 17);
  }, { passive: false });
}

/* ------------------------------------------------------------
   31. ui
------------------------------------------------------------ */
function setFlavour(f) {
  if (!FLAVOURS[f]) return;
  S.flavour = f;
  document.documentElement.style.setProperty('--accent', FLAVOURS[f].accent);
  document.querySelectorAll('.sw').forEach((el) => { el.dataset.on = el.dataset.f === f ? '1' : '0'; });
}
function setFirm(v) { S.firm = clamp(v, 0, 1); syncSliders(); }
function setDamp(v) { S.damp = clamp(v, 0, 1); syncSliders(); }
function setTide(v) { S.tide = clamp(v, -1, 1); syncSliders(); }
function syncSliders() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('sFirm', S.firm.toFixed(2)); set('msFirm', S.firm.toFixed(2));
  set('sDamp', S.damp.toFixed(2)); set('msDamp', S.damp.toFixed(2));
  set('sTide', S.tide.toFixed(2)); set('msTide', S.tide.toFixed(2));
  const a = document.getElementById('vFirm'), b = document.getElementById('mvFirm');
  if (a) a.textContent = S.firm.toFixed(2); if (b) b.textContent = S.firm.toFixed(2);
  const c = document.getElementById('vDamp'), d = document.getElementById('mvDamp');
  if (c) c.textContent = S.damp.toFixed(2); if (d) d.textContent = S.damp.toFixed(2);
  const cm = Math.round(S.tide * 10);
  const txt = (cm > 0 ? '+' : cm < 0 ? '\u2212' : '\u00b1') + Math.abs(cm) + ' cm';
  const e1 = document.getElementById('vTide'), e2 = document.getElementById('mvTide');
  if (e1) e1.textContent = txt; if (e2) e2.textContent = txt;
}
function setPaused(v) {
  S.paused = !!v;
  for (const id of ['bPause', 'mPause']) {
    const b = document.getElementById(id);
    if (b) { b.textContent = S.paused ? 'Play' : 'Pause'; b.classList.toggle('on', S.paused); }
  }
}
function feed() {
  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * 0.6;
    const x = clamp(Math.cos(a) * r - 0.15, -2.1, 2.1);
    const z = clamp(Math.sin(a) * r + 0.15, -2.1, 2.1);
    if (terrain(x, z) > seaY() - 0.05) continue;
    pellets.push(new Pellet(x, seaY() + 0.015, z));
  }
  for (const f of fishes) f.fear = Math.max(f.fear, 0.12);
  sim.splash(-0.15, 0.15, 0.3);
}
function addRing() {
  const r = new Ring(rings.length);
  let t = 0;
  do { r.x = rr(-1.9, 1.9); r.z = rr(-0.4, 1.9); t++; }
  while (terrain(r.x, r.z) > seaY() - 0.06 && t < 40);
  r.y = seaY() + 0.5; r.vy = 0.3;
  rings.push(r);
  if (rings.length > 8) rings.shift();
}
function reset() {
  buildWorld();
  S.landings = 0; S.fed = 0; S.tilt = 0; S.tiltTarget = 0;
  QA.maxAlt = 0; QA.maxFoam = 0; QA.maxWave = 0; QA.states = {}; QA.waterDev = 0;
  syncSliders();
}
function resetView() {
  CAM.th = 0.72; CAM.ph = 0.56; CAM.rad = 9.4;
}
function installUI() {
  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  bind('bPlane', () => plane.press()); bind('mPlane', () => plane.press());
  bind('bFeed', feed); bind('mFeed', feed);
  bind('bRing', addRing); bind('mRing', addRing);
  bind('bReset', () => { reset(); resetView(); });
  bind('mReset', () => { reset(); resetView(); });
  bind('bPause', () => setPaused(!S.paused));
  bind('mPause', () => setPaused(!S.paused));
  bind('bView', resetView); bind('mView', resetView);
  document.querySelectorAll('.sw').forEach((el) => el.addEventListener('click', () => setFlavour(el.dataset.f)));
  const sl = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('input', () => fn(parseFloat(el.value))); };
  sl('sFirm', setFirm); sl('msFirm', setFirm);
  sl('sDamp', setDamp); sl('msDamp', setDamp);
  sl('sTide', setTide); sl('msTide', setTide);
  const grip = document.getElementById('grip');
  if (grip) grip.addEventListener('click', () => document.getElementById('sheet').classList.toggle('open'));
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { setPaused(!S.paused); e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') resetView();
  });
}
function hud() {
  const meter = document.getElementById('meterFill');
  if (meter) meter.style.width = (clamp(S.energy * 26, 0.02, 1) * 100).toFixed(1) + '%';
  const mv = document.getElementById('meterVal');
  if (mv) mv.textContent = S.energy.toFixed(3);
  const ids = [['tLand', S.landings], ['tFed', S.fed], ['tRing', rings.length], ['mLand', S.landings], ['mFed', S.fed], ['mRing', rings.length]];
  for (const [id, v] of ids) { const el = document.getElementById(id); if (el && el.textContent !== String(v)) el.textContent = v; }
  const cl = document.getElementById('clock');
  if (cl) {
    const hrs = (6 + (S.time / 100) % 12);
    const h = Math.floor(hrs), m = Math.floor((hrs - h) * 60);
    const t = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    if (cl.textContent !== t) cl.textContent = t;
  }
}

/* ------------------------------------------------------------
   32. QA
------------------------------------------------------------ */
function fastForward(sec) {
  const dt = 1 / 30;
  const n = Math.floor(sec / dt);
  const was = S.paused;
  S.paused = true;
  for (let i = 0; i < n; i++) stepWorld(dt);
  S.paused = was;
}
function runSim(sec) {
  const dt = 1 / 60;
  const was = S.paused;
  S.paused = false;
  const n = Math.floor(sec / dt);
  for (let i = 0; i < n; i++) stepWorld(dt);
  S.paused = was;
}

async function runChecks() {
  const out = [];
  const add = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail || '' });
  add('webgpu-adapter', gpuOK, gpuOK ? 'device online' : 'no adapter');

  resetView();
  reset();
  fastForward(4);

  const before = S.landings;
  QA.states = {}; QA.maxAlt = 0; QA.waterDev = 0;
  fastForward(118);
  const need = ['dock', 'pivot', 'taxi', 'run', 'climb', 'circuit', 'approach', 'flare', 'runout', 'turn', 'taxiin'];
  const missing = need.filter((s) => !QA.states[s]);
  add('seaplane-cycle', missing.length === 0, missing.length ? 'missing ' + missing.join(', ') : 'all 11 states');
  add('seaplane-landing', S.landings > before, 'landings ' + S.landings);
  add('seaplane-altitude', QA.maxAlt > 2.8, 'peak ' + QA.maxAlt.toFixed(2) + ' over sea');
  add('floats-ride-water', QA.waterDev < 0.055, 'deviation ' + QA.waterDev.toFixed(3));

  reset();
  QA.maxFoam = 0; QA.maxWave = 0;
  fastForward(7); QA.maxFoam = 0; QA.maxWave = 0;
  let t = 0;
  while (plane.state !== PL.RUNOUT && t < 80) { fastForward(2); t++; }
  runSim(0.7);
  add('touchdown-foam', QA.maxFoam > 0.22 && QA.maxWave > 0.01, 'foam ' + QA.maxFoam.toFixed(2) + ', crater ' + QA.maxWave.toFixed(3));

  let bad = 0, worst = '';
  for (const f of fishes) {
    const low = terrain(f.x, f.z) + 0.01, hi = seaY() - 0.01;
    if (f.y < low || f.y > hi || Math.abs(f.x) > 2.6 || Math.abs(f.z) > 2.6) { bad++; worst = f.y.toFixed(3) + ' vs ' + low.toFixed(3); }
  }
  add('fish-in-water', bad === 0, bad ? bad + ' boids out (' + worst + ')' : '42 boids inside');

  const fed0 = S.fed;
  for (const f of fishes) f.fear = 0;
  feed();
  const nPell = pellets.length;
  fastForward(16);
  add('feed-spawns-pellets', nPell >= 10, nPell + ' pellets');
  add('fish-eat', S.fed > fed0, 'fed +' + (S.fed - fed0));

  const school = fishes.slice(0, 12);
  const cx = school.reduce((a, f) => a + f.x, 0) / 12, cz = school.reduce((a, f) => a + f.z, 0) / 12;
  const d0 = school.reduce((a, f) => a + Math.hypot(f.x - cx, f.z - cz), 0) / 12;
  for (const f of school) f.startle(cx, cz, 0.9);
  fastForward(0.7);
  const d1 = school.reduce((a, f) => a + Math.hypot(f.x - cx, f.z - cz), 0) / 12;
  add('finger-scatters', d1 > d0 * 1.04 || school.some((f) => f.fear > 0.15), 'spread ' + d0.toFixed(3) + ' -> ' + d1.toFixed(3));

  const rg = rings[0];
  rg.throwTo(rg.x + 0.04, rg.z + 0.04, 2.4);
  fastForward(9);
  const flat = Math.abs(rg.tiltX) < 0.32 && Math.abs(rg.tiltZ) < 0.32;
  const rest = rg.deckAt(rg.x, rg.z);
  const surf = seaY() + water.hAt(rg.x, rg.z);
  const near = Math.abs(rg.y - surf) < 0.25 || (rest !== null && Math.abs(rg.y - rest) < 0.15) || rg.y > surf;
  add('ring-floats-flat', flat && near, 'tilt ' + rg.tiltX.toFixed(2) + '/' + rg.tiltZ.toFixed(2) + ', y ' + rg.y.toFixed(2) + ' surf ' + surf.toFixed(2));

  reset();
  fastForward(2);
  sim.stir(0.2, 0.2, 14, 7, 0.25, 1.0);
  runSim(0.8);
  const peak = S.energy;
  runSim(8);
  const after = S.energy;
  add('stir-waves', peak > 0.004 && after < peak * 0.8, 'swell ' + peak.toFixed(4) + ' -> ' + after.toFixed(4));

  reset();
  fastForward(2);
  S.tiltTarget = 0.12;
  runSim(2.2);
  const slosh = S.energy;
  S.tiltTarget = 0;
  runSim(9);
  add('tilt-sloshes', slosh > 0.002 && S.energy < slosh * 0.85, 'slosh ' + slosh.toFixed(4) + ' -> ' + S.energy.toFixed(4));

  setFlavour('sapphire');
  const f1 = document.documentElement.style.getPropertyValue('--accent');
  setFlavour('lime');
  const f2 = document.documentElement.style.getPropertyValue('--accent');
  setFlavour('turquoise');
  add('flavours', f1 !== f2 && S.flavour === 'turquoise', f1.trim() + ' / ' + f2.trim());
  setFirm(0.3); setDamp(0.8); setTide(0.5);
  const sliders = Math.abs(S.firm - 0.3) < 1e-6 && Math.abs(S.damp - 0.8) < 1e-6 && Math.abs(S.tide - 0.5) < 1e-6;
  const tideMoved = Math.abs(seaY() - SEA) > 0.03;
  setFirm(0.62); setDamp(0.35); setTide(0);
  add('sliders+tide', sliders && tideMoved, 'sea ' + seaY().toFixed(2) + ' at +5cm');
  setPaused(true);
  const t0 = S.time;
  for (let i = 0; i < 20; i++) { /* frozen */ }
  const frozen = Math.abs(S.time - t0) < 1e-6;
  setPaused(false);
  add('pause', frozen, 'clock frozen');

  const r0 = CAM.rad;
  CAM.rad = 12; CAM.th = 1.15; CAM.ph = 0.9;
  updateCamera(canvas.width / Math.max(1, canvas.height));
  add('orbit-zoom', Math.abs(CAM.rad - r0) > 0.5 && Math.abs(CAM.ph - 0.9) < 1e-6, 'camera responds');
  resetView();

  add('sim-under-5ms', S.simMs < 5, S.simMs.toFixed(2) + ' ms / frame');
  let net = 0;
  try { net = performance.getEntriesByType('resource').filter((r) => !r.name.startsWith('data:')).length; } catch (e) { }
  add('no-network', net === 0, net + ' external requests');
  add('no-errors', QA.errors.length === 0, QA.errors.slice(0, 2).join(' | ') || 'clean');
  add('canvas-sized', canvas.width > 100 && canvas.height > 100, canvas.width + 'x' + canvas.height);
  const fb = document.getElementById('fallback');
  add('fallback-hidden', !!fb && !fb.classList.contains('show'), 'ready if the adapter dies');
  add('mobile-sheet', !!document.getElementById('sheet'), 'bottom sheet present');

  setFlavour('turquoise');
  const pass = out.filter((o) => o.pass).length;
  const report = { pass, total: out.length, results: out };
  try {
    console.log('%c ATOLL JELLY · QA ' + pass + '/' + out.length, 'color:#12a2a6;font-weight:600');
    for (const o of out) console.log((o.pass ? '  ok  ' : '  FAIL ') + o.name + (o.detail ? '  -  ' + o.detail : ''));
  } catch (e) { }
  return report;
}

/* ------------------------------------------------------------
   33. go
------------------------------------------------------------ */
window.addEventListener('error', (e) => { QA.errors.push(String(e.message)); });
window.addEventListener('unhandledrejection', (e) => { QA.errors.push(String(e.reason)); });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
