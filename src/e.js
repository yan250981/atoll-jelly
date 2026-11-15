
/* ------------------------------------------------------------
   19. WGSL
------------------------------------------------------------ */
const WGSL_COMMON = /* wgsl */`
fn paperCol() -> vec3f { return vec3f(0.925, 0.912, 0.890); }
fn terrainFn(x : f32, z : f32) -> f32 {
  var h = 0.968;
  let d1 = length(vec2f(x - 1.30, z - 1.28));
  h -= 0.615 * (1.0 - smoothstep(0.0, 1.02, d1));
  let d2 = length(vec2f(x + 1.52, z + 1.56));
  h += 0.80 * (1.0 - smoothstep(0.30, 1.24, d2));
  h += 0.048 * smoothstep(-2.6, 2.6, x) * smoothstep(-2.6, 2.6, z);
  h += 0.011 * sin(x * 7.3 + 0.4) * cos(z * 6.1 - 0.8);
  h += 0.007 * sin(x * 13.7 - z * 11.3);
  return h;
}
fn strataCol(y : f32, x : f32, z : f32) -> vec3f {
  let w = sin(x * 3.4) * 0.030 + sin(z * 4.1 + 1.2) * 0.024;
  let yy = y + w;
  var c = vec3f(0.400, 0.225, 0.145);
  if (yy > 0.38) { c = vec3f(0.585, 0.345, 0.215); }
  if (yy > 0.55) { c = vec3f(0.795, 0.600, 0.380); }
  if (yy > 0.735) {
    c = vec3f(0.905, 0.855, 0.775);
    let sp = sin(x * 62.0) * cos(z * 57.0 + x * 4.0);
    if (sp > 0.55) { c = vec3f(0.965, 0.945, 0.915); }
  }
  if (yy > 0.862) { c = vec3f(0.945, 0.908, 0.800); }
  return c;
}
`;

const WGSL_MESH = WGSL_COMMON + /* wgsl */`
struct Glob {
  viewProj : mat4x4f,
  block : mat4x4f,
  cam : vec4f,
  light : vec4f,
  misc : vec4f,
};
@group(0) @binding(0) var<uniform> G : Glob;

struct Inst {
  c0 : vec4f, c1 : vec4f, c2 : vec4f, c3 : vec4f,
  colA : vec4f,
  colB : vec4f,
  info : vec4f,
};
@group(0) @binding(1) var<storage, read> insts : array<Inst>;

struct VSIn {
  @location(0) pos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) col : vec3f,
  @location(3) aux : vec2f,
  @builtin(instance_index) ii : u32,
};
struct VSOut {
  @builtin(position) clip : vec4f,
  @location(0) wpos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) col : vec3f,
  @location(3) mat : f32,
  @location(4) ly : f32,
};

@vertex
fn vs_mesh(in : VSIn) -> VSOut {
  let I = insts[in.ii];
  let M = mat4x4f(I.c0, I.c1, I.c2, I.c3);
  let t = G.cam.w;
  let kind = I.info.x;
  var p = in.pos;
  var n = in.nrm;

  if (kind < 0.5) {
    if (in.aux.x > 0.0004) {
      let s = sin(t * 1.7 + p.x * 3.1 + p.z * 2.3 + I.info.y);
      let c = cos(t * 1.3 + p.x * 2.0 + p.z * 1.4);
      p.x = p.x + s * in.aux.x;
      p.z = p.z + c * in.aux.x * 0.7;
    }
  } else if (kind < 1.5) {
    let w = clamp((0.055 - p.x) / 0.150, 0.0, 1.0);
    let ph = I.colA.w;
    let s = sin(t * 7.4 + ph);
    p.z = p.z + s * w * w * 0.045;
    p.x = p.x - abs(s) * w * w * 0.004;
  } else if (kind < 2.5) {
    let w = in.aux.x * in.aux.x;
    p.y = p.y + sin(t * 2.5 + I.colA.w - abs(p.z) * 3.4) * w * 0.075;
  } else if (kind < 3.5) {
    let a = t * I.info.y;
    let c = cos(a);
    let s = sin(a);
    let yy = p.y * c - p.z * s;
    let zz = p.y * s + p.z * c;
    p.y = yy; p.z = zz;
    let ny = n.y * c - n.z * s;
    let nz = n.y * s + n.z * c;
    n.y = ny; n.z = nz;
  }

  var base = in.col * I.colA.rgb;
  if (kind > 0.5 && kind < 1.5) {
    if (I.info.z < 0.5 && in.col.r < 0.5) { base = I.colA.rgb; }
    if (in.aux.y > 0.5) { base = in.col * I.colB.rgb; }
  }
  if (kind > 3.5) { base = select(I.colA.rgb, I.colB.rgb, in.aux.y > 0.5); }

  var mat = 0.0;
  if (kind < 0.5) {
    mat = in.aux.y;
    if (mat > 1.5) { base = strataCol(in.pos.y, in.pos.x, in.pos.z); }
  }

  let wp = (G.block * M * vec4f(p, 1.0)).xyz;
  let wn = normalize((G.block * M * vec4f(n, 0.0)).xyz);
  var o : VSOut;
  o.clip = G.viewProj * vec4f(wp, 1.0);
  o.wpos = wp;
  o.nrm = wn;
  o.col = base;
  o.mat = mat;
  o.ly = wp.y;
  return o;
}

struct FSIn {
  @builtin(position) clip : vec4f,
  @location(0) wpos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) col : vec3f,
  @location(3) mat : f32,
  @location(4) ly : f32,
  @builtin(front_facing) ff : bool,
};

@fragment
fn fs_mesh(in : FSIn) -> @location(0) vec4f {
  var N = normalize(in.nrm);
  if (!in.ff) { N = -N; }
  let L = normalize(G.light.xyz);
  let V = normalize(G.cam.xyz - in.wpos);
  let H = normalize(L + V);
  let diff = max(dot(N, L), 0.0);
  let hemi = 0.5 + 0.5 * N.y;
  var c = in.col;

  if (in.mat > 0.5 && in.mat < 1.5) {
    let q = in.wpos.xz * 9.5;
    let tt = G.cam.w * 0.5;
    let c1 = sin(q.x * 1.35 + sin(q.y * 1.25 + tt) * 1.9 + tt);
    let c2 = sin(q.y * 1.55 - cos(q.x * 1.05 - tt) * 1.6 - tt * 0.8);
    let ca = pow(clamp(c1 * c2 * 1.45, 0.0, 1.0), 3.0);
    c = c + ca * vec3f(0.50, 0.48, 0.42) * (0.35 + 0.65 * hemi);
  }

  let amb = 0.44 + 0.30 * hemi;
  var lit = c * (amb + diff * 0.84);
  let spec = pow(max(dot(N, H), 0.0), 48.0);
  lit = lit + spec * 0.15 * G.light.w;
  let rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.4);
  lit = lit + rim * 0.13 * vec3f(1.0, 0.98, 0.94);

  let d = length(G.cam.xyz - in.wpos);
  let fg = smoothstep(9.5, 28.0, d);
  lit = mix(lit, paperCol(), fg * 0.42);
  return vec4f(lit, 1.0);
}
`;

const WGSL_SKY = WGSL_COMMON + /* wgsl */`
struct Sky {
  cam : vec4f,
  right : vec4f,
  up : vec4f,
  fwd : vec4f,
  misc : vec4f,
};
@group(0) @binding(0) var<uniform> S : Sky;

@vertex
fn vs_sky(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}

@fragment
fn fs_sky(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let uv = fc.xy / S.misc.xy;
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let dir = normalize(S.fwd.xyz + S.right.xyz * ndc.x * S.misc.z * S.misc.w + S.up.xyz * ndc.y * S.misc.z);
  var col = mix(vec3f(0.972, 0.962, 0.940), vec3f(0.876, 0.860, 0.834), smoothstep(-0.30, 0.90, dir.y));
  let gl = pow(max(dot(dir, normalize(vec3f(-0.35, 0.62, 0.70))), 0.0), 2.4);
  col = col + vec3f(0.035, 0.032, 0.024) * gl;

  var sh = 0.0;
  if (dir.y < -0.0015) {
    let t = (0.02 - S.cam.y) / dir.y;
    if (t > 0.0 && t < 90.0) {
      let p = S.cam.xyz + dir * t;
      let d = max(abs(p.x) - 2.62, abs(p.z) - 2.62);
      sh = smoothstep(0.55, -0.35, d) * 0.85 + smoothstep(2.4, 0.1, d) * 0.28;
    }
  }
  col = col * (1.0 - 0.155 * sh);
  let vig = length(ndc * vec2f(0.84, 1.0));
  col = col * (1.0 - 0.09 * vig * vig);
  return vec4f(col, 1.0);
}
`;

const WGSL_WATER = WGSL_COMMON + /* wgsl */`
struct WU {
  viewProj : mat4x4f,
  block : mat4x4f,
  cam : vec4f,
  grid : vec4f,
  absorb : vec4f,
  misc : vec4f,
  res : vec4f,
  tint : vec4f,
  basis : vec4f,
};
@group(0) @binding(0) var<uniform> W : WU;
@group(0) @binding(1) var<storage, read> hgt : array<f32>;
@group(0) @binding(2) var<storage, read> fld : array<f32>;
@group(0) @binding(3) var sceneCol : texture_2d<f32>;
@group(0) @binding(4) var sceneDep : texture_depth_2d;

fn linDepth(d : f32, near : f32, far : f32) -> f32 {
  return near * far / max(0.0001, far - d * (far - near));
}
fn skyTint(n : vec3f) -> vec3f {
  return mix(vec3f(0.940, 0.936, 0.922), vec3f(0.998, 0.994, 0.984), clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
}
fn boxExit(p : vec3f, d : vec3f, bmin : vec3f, bmax : vec3f) -> f32 {
  let inv = 1.0 / d;
  let t0 = (bmin - p) * inv;
  let t1 = (bmax - p) * inv;
  let tx = max(t0.x, t1.x);
  let ty = max(t0.y, t1.y);
  let tz = max(t0.z, t1.z);
  return max(0.002, min(min(tx, ty), tz));
}

struct WOut {
  @builtin(position) clip : vec4f,
  @location(0) wpos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) foam : f32,
  @location(3) lxz : vec2f,
  @location(4) lw : f32,
};

@vertex
fn vs_top(@builtin(vertex_index) vi : u32) -> WOut {
  let n = u32(W.grid.x);
  let cs = W.grid.y;
  let sea = W.grid.z;
  let tt = W.grid.w;
  let ix = vi % n;
  let iz = vi / n;
  let x = -2.6 + f32(ix) * cs;
  let z = -2.6 + f32(iz) * cs;
  let k = iz * n + ix;
  let h = hgt[k];
  let i0 = select(ix - 1u, 1u, ix == 0u);
  let i1 = select(ix + 1u, n - 2u, ix + 1u >= n);
  let j0 = select(iz - 1u, 1u, iz == 0u);
  let j1 = select(iz + 1u, n - 2u, iz + 1u >= n);
  let hx0 = hgt[iz * n + i0];
  let hx1 = hgt[iz * n + i1];
  let hz0 = hgt[j0 * n + ix];
  let hz1 = hgt[j1 * n + ix];
  let gx = (hx1 - hx0) / (2.0 * cs);
  let gz = (hz1 - hz0) / (2.0 * cs);

  // ambient swell that never dies
  let amb = sin(x * 2.30 + tt * 0.85) * 0.0042 + sin(z * 3.10 - tt * 0.62) * 0.0032
          + sin((x + z) * 5.30 + tt * 1.55) * 0.0016 + sin((x - z) * 7.10 - tt * 2.1) * 0.0009;
  let ambX = cos(x * 2.30 + tt * 0.85) * 0.0042 * 2.30 + cos((x + z) * 5.30 + tt * 1.55) * 0.0016 * 5.30
           + cos((x - z) * 7.10 - tt * 2.1) * 0.0009 * 7.10;
  let ambZ = cos(z * 3.10 - tt * 0.62) * 0.0032 * 3.10 + cos((x + z) * 5.30 + tt * 1.55) * 0.0016 * 5.30
           - cos((x - z) * 7.10 - tt * 2.1) * 0.0009 * 7.10;

  var p = vec3f(x, sea + h + amb, z);
  var nn = normalize(vec3f(-(gx + ambX), 1.0, -(gz + ambZ)));
  var o : WOut;
  o.wpos = (W.block * vec4f(p, 1.0)).xyz;
  o.nrm = normalize((W.block * vec4f(nn, 0.0)).xyz);
  o.clip = W.viewProj * vec4f(o.wpos, 1.0);
  o.foam = fld[k];
  o.lxz = vec2f(x, z);
  o.lw = p.y;
  return o;
}

struct FSInW {
  @builtin(position) clip : vec4f,
  @location(0) wpos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) foam : f32,
  @location(3) lxz : vec2f,
  @location(4) lw : f32,
};

@fragment
fn fs_top(in : FSInW) -> @location(0) vec4f {
  let sea = W.grid.z;
  let terr = terrainFn(in.lxz.x, in.lxz.y);
  if (terr > sea - 0.004) { discard; }

  let sz = vec2f(W.res.x, W.res.y);
  let suv = clamp(in.clip.xy, vec2f(0.0), sz - 1.0);
  let near = W.misc.y;
  let far = W.misc.z;
  let dsurf = length(W.cam.xyz - in.wpos);
  let rd = normalize(in.wpos - W.cam.xyz);
  let cosr = clamp(dot(rd, W.basis.xyz), 0.25, 1.0);
  let dwall = linDepth(textureLoad(sceneDep, vec2i(suv), 0), near, far) / cosr;
  let thick0 = dwall - dsurf;
  if (dwall < dsurf - 0.004) { discard; }
  if (W.tint.w > 0.5) { return vec4f(clamp(vec3f(thick0 * 2.0, dwall * 0.1, dsurf * 0.1), vec3f(0.0), vec3f(1.0)), 1.0); }
  let thick = clamp(thick0, 0.0, 2.6);

  var n = normalize(in.nrm);
  let V = normalize(W.cam.xyz - in.wpos);
  let fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);

  let rp = in.wpos.xz * 24.0 + vec2f(W.cam.w * 0.55, W.cam.w * 0.31);
  let rip = vec2f(sin(rp.x + sin(rp.y * 0.9)) * 0.026, cos(rp.y * 1.1 + sin(rp.x * 0.8)) * 0.026);
  n = normalize(vec3f(n.x + rip.x, n.y, n.z + rip.y));

  let k = W.absorb.rgb * (1.0 - W.misc.w * 0.42);
  let tr = exp(-k * thick);
  let refr = in.clip.xy + n.xz * (0.16 * thick + 0.02) * 260.0;
  let sc = min(textureLoad(sceneCol, vec2i(clamp(refr, vec2f(0.0), sz - 1.0)), 0).rgb, vec3f(1.0));

  var col = sc * mix(vec3f(1.0), tr, 0.94);
  let trL = clamp(tr.r * 0.35 + tr.g * 0.40 + tr.b * 0.25, 0.0, 1.0);
  col = col + W.tint.rgb * (1.0 - trL) * 0.95;

  let sky = skyTint(reflect(-V, n));
  col = mix(col, sky, fres * 0.88);

  let H = normalize(normalize(vec3f(-0.40, 0.86, 0.32)) + V);
  let spec = pow(max(dot(n, H), 0.0), 300.0);
  let sheen = pow(max(dot(n, H), 0.0), 22.0);
  col = col + vec3f(1.0, 0.97, 0.90) * (spec * 1.6 + sheen * 0.09);

  let shore = 1.0 - smoothstep(0.0, 0.055, sea - terr);
  let q = in.lxz * 50.0 + vec2f(W.cam.w * 0.20, -W.cam.w * 0.16);
  let ln = 0.5 + 0.5 * sin(q.x + sin(q.y * 1.7)) * cos(q.y * 1.3 + sin(q.x * 0.7));
  let lace = shore * smoothstep(0.40, 0.92, ln);
  let crest = smoothstep(0.016, 0.045, abs(in.lw - sea)) * 0.55;
  var fo = clamp(in.foam * 0.8 + lace * 0.95 + crest, 0.0, 1.0);
  fo = pow(fo, 0.85);
  col = mix(col, vec3f(0.988, 0.985, 0.975), fo);

  let a = clamp(0.80 + fres * 0.20 + fo * 0.9, 0.0, 1.0);
  return vec4f(col, a);
}

struct VSInW {
  @location(0) pos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) luv : vec2f,
};
struct SOut {
  @builtin(position) clip : vec4f,
  @location(0) wpos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) lw : f32,
};

@vertex
fn vs_side(in : VSInW) -> SOut {
  var o : SOut;
  o.wpos = (W.block * vec4f(in.pos, 1.0)).xyz;
  o.nrm = normalize((W.block * vec4f(in.nrm, 0.0)).xyz);
  o.clip = W.viewProj * vec4f(o.wpos, 1.0);
  o.lw = in.pos.y;
  return o;
}

struct FSInWS {
  @builtin(position) clip : vec4f,
  @location(0) wpos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) lw : f32,
};

@fragment
fn fs_side(in : FSInWS) -> @location(0) vec4f {
  let sea = W.grid.z;
  if (in.lw > sea + 0.002) { discard; }
  let sz = vec2f(W.res.x, W.res.y);
  let suv = clamp(in.clip.xy, vec2f(0.0), sz - 1.0);
  let near = W.misc.y;
  let far = W.misc.z;
  let dsurf = length(W.cam.xyz - in.wpos);
  let rd2 = normalize(in.wpos - W.cam.xyz);
  let cosr2 = clamp(dot(rd2, W.basis.xyz), 0.25, 1.0);
  let dwall = linDepth(textureLoad(sceneDep, vec2i(suv), 0), near, far) / cosr2;
  if (dwall < dsurf - 0.004) { discard; }

  let V = normalize(W.cam.xyz - in.wpos);
  var n = normalize(in.nrm);
  if (dot(n, V) < 0.0) { n = -n; }
  let path = boxExit(in.wpos, -V, vec3f(-2.6, 0.10, -2.6), vec3f(2.6, sea, 2.6));
  let tr = exp(-W.absorb.rgb * 0.30 * path);
  let sc = min(textureLoad(sceneCol, vec2i(clamp(suv + n.xz * 3.0, vec2f(0.0), sz - 1.0)), 0).rgb, vec3f(1.0));
  var col = sc * mix(vec3f(1.0), tr, 0.85);
  let trL2 = clamp(tr.r * 0.35 + tr.g * 0.40 + tr.b * 0.25, 0.0, 1.0);
  col = col + W.tint.rgb * (1.0 - trL2) * 0.85;
  let fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
  col = mix(col, skyTint(n), fres * 0.50);
  let wl = smoothstep(0.022, 0.0, abs(in.lw - sea));
  col = col + vec3f(0.96, 0.98, 0.97) * wl * 0.32;
  let a = clamp(0.40 + fres * 0.48 + wl * 0.5, 0.0, 1.0);
  return vec4f(col, a);
}
`;

const WGSL_BLIT = /* wgsl */`
@group(0) @binding(0) var src : texture_2d<f32>;
@vertex
fn vs_blit(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}
@fragment
fn fs_blit(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  return vec4f(textureLoad(src, vec2i(fc.xy), 0).rgb, 1.0);
}
`;

/* ------------------------------------------------------------
   20. GPU boot
------------------------------------------------------------ */
const canvas = document.getElementById('gpu');
const FMT = 'rgba16float';
let device = null, ctx = null, gpuOK = false, canvasFmt = 'bgra8unorm';
let pipelines = {}, buffers = {}, textures = {}, bindGroups = {};
let sceneMesh = null, planeMesh = null, propMesh = null, fishMesh = null, rayMesh = null, ringMesh = null, pelletMesh = null;
const INST_STRIDE = 28;
let meshLayout = null, waterLayout = null, blitLayout = null;

const globData = new Float32Array(44);
const skyData = new Float32Array(24);
const waterData = new Float32Array(64);

let viewProj = m4();
let eye = [0, 0, 0], fwd = [0, 0, -1], right = [1, 0, 0], upv = [0, 1, 0];
const CAM = { th: 0.72, ph: 0.56, rad: 9.4, target: [0, 0.74, 0] };

async function initGPU() {
  if (!navigator.gpu) return false;
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { adapter = null; }
  if (!adapter) return false;
  try { device = await adapter.requestDevice(); } catch (e) { return false; }
  device.addEventListener('uncapturederror', (e) => {
    QA.errors.push(String((e.error && e.error.message) || e.error));
  });
  ctx = canvas.getContext('webgpu');
  if (!ctx) return false;
  canvasFmt = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: canvasFmt, alphaMode: 'opaque' });
  gpuOK = true;
  return true;
}

const DEVMAX = () => device.limits.maxTextureDimension2D;

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    if (gpuOK && textures.sceneCol) makeTargets();
  }
}

/* ------------------------------------------------------------
   21. pipelines
------------------------------------------------------------ */
function createPipelines() {
  const meshMod = device.createShaderModule({ code: WGSL_MESH });
  const skyMod = device.createShaderModule({ code: WGSL_SKY });
  const waterMod = device.createShaderModule({ code: WGSL_WATER });
  const blitMod = device.createShaderModule({ code: WGSL_BLIT });

  const bglMesh = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });
  const bglSky = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const bglWater = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
    ],
  });
  const bglBlit = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } }],
  });
  meshLayout = bglMesh; waterLayout = bglWater; blitLayout = bglBlit;

  const VB = {
    arrayStride: 44,
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x3' },
      { shaderLocation: 3, offset: 36, format: 'float32x2' },
    ],
  };
  pipelines.mesh = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglMesh] }),
    vertex: { module: meshMod, entryPoint: 'vs_mesh', buffers: [VB] },
    fragment: { module: meshMod, entryPoint: 'fs_mesh', targets: [{ format: FMT }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  pipelines.sky = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglSky] }),
    vertex: { module: skyMod, entryPoint: 'vs_sky' },
    fragment: { module: skyMod, entryPoint: 'fs_sky', targets: [{ format: FMT }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
  });
  const blend = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };
  pipelines.waterTop = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglWater] }),
    vertex: { module: waterMod, entryPoint: 'vs_top' },
    fragment: { module: waterMod, entryPoint: 'fs_top', targets: [{ format: canvasFmt, blend }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
  });
  pipelines.waterSide = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglWater] }),
    vertex: {
      module: waterMod, entryPoint: 'vs_side', buffers: [{
        arrayStride: 32,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x2' },
        ],
      }],
    },
    fragment: { module: waterMod, entryPoint: 'fs_side', targets: [{ format: canvasFmt, blend }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
  });
  pipelines.blit = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglBlit] }),
    vertex: { module: blitMod, entryPoint: 'vs_blit' },
    fragment: { module: blitMod, entryPoint: 'fs_blit', targets: [{ format: canvasFmt }] },
    primitive: { topology: 'triangle-list' },
  });

  buffers.glob = device.createBuffer({ size: 176, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  buffers.sky = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  buffers.waterU = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  bindGroups.sky = device.createBindGroup({ layout: bglSky, entries: [{ binding: 0, resource: { buffer: buffers.sky } }] });
}

function makeGroup(name, mesh, maxInst) {
  buffers[name] = device.createBuffer({ size: Math.max(112, maxInst * INST_STRIDE * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  buffers[name + 'V'] = device.createBuffer({ size: mesh.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffers[name + 'V'], 0, mesh.data);
  bindGroups[name] = device.createBindGroup({
    layout: meshLayout,
    entries: [
      { binding: 0, resource: { buffer: buffers.glob } },
      { binding: 1, resource: { buffer: buffers[name] } },
    ],
  });
  buffers[name + 'Count'] = mesh.count;
  buffers[name + 'Max'] = maxInst;
}

function makeTargets() {
  const w = canvas.width, h = canvas.height;
  if (textures.sceneCol) textures.sceneCol.destroy();
  if (textures.depth) textures.depth.destroy();
  textures.sceneCol = device.createTexture({ size: [w, h, 1], format: FMT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  textures.depth = device.createTexture({ size: [w, h, 1], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  textures.sceneColView = textures.sceneCol.createView();
  textures.sceneColView2 = textures.sceneCol.createView();
  textures.depthView = textures.depth.createView({ aspect: 'depth-only', dimension: '2d' });
  if (bindGroups.water) {
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
  }
}

/* ------------------------------------------------------------
   22. extra geometry
------------------------------------------------------------ */
function waterSideMesh() {
  const y0 = 0.10, y1 = 1.415;
  const verts = [];
  const faces = [
    { n: [0, 0, -1], a: [-2.6, -2.6], b: [2.6, -2.6] },
    { n: [1, 0, 0], a: [2.6, -2.6], b: [2.6, 2.6] },
    { n: [0, 0, 1], a: [2.6, 2.6], b: [-2.6, 2.6] },
    { n: [-1, 0, 0], a: [-2.6, 2.6], b: [-2.6, -2.6] },
  ];
  const idx = [];
  for (const f of faces) {
    const i0 = verts.length / 8;
    verts.push(f.a[0], y0, f.a[1], f.n[0], f.n[1], f.n[2], 0, 0);
    verts.push(f.b[0], y0, f.b[1], f.n[0], f.n[1], f.n[2], 1, 0);
    verts.push(f.b[0], y1, f.b[1], f.n[0], f.n[1], f.n[2], 1, 1);
    verts.push(f.a[0], y1, f.a[1], f.n[0], f.n[1], f.n[2], 0, 1);
    idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  return { data: new Float32Array(verts), idx: new Uint16Array(idx) };
}

function topMesh() {
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let p = 0;
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = j * N + i + 1, c = (j + 1) * N + i + 1, d = (j + 1) * N + i;
    idx[p++] = a; idx[p++] = b; idx[p++] = c;
    idx[p++] = a; idx[p++] = c; idx[p++] = d;
  }
  return idx;
}
