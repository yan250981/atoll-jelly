# Source

`index.html` in the repo root is **generated** — don't edit it by hand. It is the
concatenation of `head.html` plus the seven JavaScript modules, which together form
one IIFE. They share a single top-level scope, so the concatenation order is load-bearing.

```bash
bash build.sh          # → ../index.html  (137,527 bytes, byte-identical to the shipped file)
```

`build.sh` runs `node --check` on the concatenated output first, so a syntax error in
any module fails the build instead of shipping a broken page.

## Modules

The numbers are the section headers inside the files; they run continuously from `a.js`
to `g.js` and are how you find your way around the source.

### `head.html`
`<head>`, the whole stylesheet (warm paper, ink, accent, italic serif H1, the right
glass panel, the mobile bottom sheet, the WebGPU fallback card), and the HTML shell.
Ends immediately before the opening `<script>` tag.

### `a.js` — foundation
| § | |
|---|---|
| 0 | math: `clamp`, `lerp`, `smoothstep`, `mix`, matrices, seeded RNG |
| 1 | world constants: block is 5.2², sea level 1.3, grid size `N`, cell size `CS` |
| 2 | palette + the three flavours (turquoise / sapphire / lime): absorption, scatter, sand tint |
| 3 | geometry builder — `Mesh` with `pos3 nrm3 col3 aux2`, plus `box`, `cyl`, `torus`, `quadN`, `raw` |

Every mesh in the scene is emitted through that builder, so the whole diorama is a
handful of vertex buffers with no external assets.

### `b.js` — the static scene
| § | |
|---|---|
| 4 | `LAY` — jetty axis, islet centre, pontoon, dock, bungalow spots, all in one place |
| 5 | seabed with the blue hole, plus the candy strata on the cut faces |
| 6 | eight coral heads: brain, branching corals, sea fans |
| 7 | coconut palms — 16 arching pinnate fronds each, plus dry hanging ones |
| 8 | decks, huts, hipped thatch roofs, parasols, loungers, ladder, lamp posts |
| 9 | assembly: merges everything into one static mesh |

### `c.js` — water, meshes, the seaplane
| § | |
|---|---|
| 10 | `S` — the live state object the UI writes into |
| 11 | water sim: staggered 168² grid at 120 Hz, `√(g·depth)` wave speed, surface tension, damping, foam field |
| 12 | meshes for the seaplane, propeller, fish, eagle ray, float ring |
| 13 | the seaplane's fixed daily loop — eleven states, four float samples set height/pitch/roll, floats push displaced volume back into the sim |

### `d.js` — things that float and swim
| § | |
|---|---|
| 14 | `makeWater(sim)` — bilinear height sampler used by everything afloat |
| 15 | fish: 42 boids, four colour kinds, schooling, wandering, tail beat via vertex shader |
| 16 | eagle rays: wave-flapping wings, whip tails |
| 17 | float rings: light, damped, shoved by the seaplane, pick up and throw |
| 18 | pellets: float, then sink, get eaten |

### `e.js` — GPU side
| § | |
|---|---|
| 19 | all WGSL: mesh pass, jelly top + side faces with refraction and Beer–Lambert absorption, seaplane, fish, rings, sky, foam |
| 20 | adapter/device, canvas configure, depth texture, scene colour texture |
| 21 | pipelines and bind groups |
| 22 | extra geometry generated at boot |

The terrain height function exists **twice** — once in JS (`a.js`) and once in WGSL
(`e.js`, `terrainFn`). They must stay in exact agreement, or the water surface stops
being clipped by the island and starts drawing lace over dry sand.

### `f.js` — frame assembly
| § | |
|---|---|
| 23 | `buildWorld()` and the `QA` accumulator |
| 24 | orbit camera, projection |
| 25 | instance buffers (static, fish, rings, plane) |
| 26 | the render pass: scene → scene colour texture, then the jelly passes reading it |

### `g.js` — application
| § | |
|---|---|
| 27 | boot, WebGPU fallback path |
| 28 | uniform packing — note the water uniform is 256 bytes, laid out by hand |
| 29 | the frame loop, fixed 120 Hz sim accumulator |
| 30 | interaction: orbit, pinch, stir, tilt, throw |
| 31 | UI wiring: buttons, flavours, sliders, pause, reset |
| 32 | `window.__aj` — the QA harness |
| 33 | go |

## Headless QA

These drive the page through Chrome DevTools Protocol, screenshot it, and decode the
PNG in Node to sample actual pixels. They need Chrome and nothing else — no npm install.

| file | |
|---|---|
| `cdp.js` | minimal CDP client over a raw WebSocket (`ws://` + the DevTools JSON endpoint) |
| `run.js` | launch headless Chrome with WebGPU enabled, load `index.html`, optionally evaluate an expression, screenshot, dump console errors |
| `png.js` | PNG decoder (zlib inflate + unfilter) so pixels can be inspected without a canvas |
| `test.js` | older fetter-based probe, kept for reference |
| `probe.js` | adapter discovery — which Chrome flags actually hand you a WebGPU device on this machine |

```bash
node run.js ../index.html shot.png                 # screenshot
node run.js ../index.html shot.png "" "window.__aj.api.fastForward(46)"
node run.js ../index.html shot.png checks          # full 23-check QA sweep
```

Debug hooks left in the build: `window.__DBG = 1` skips the water passes so you can see
the bare seabed, and `window.__DBG_W = 1` makes the water shader output its thickness
terms as colour instead of shading — those two are how the depth-reconstruction sign bug
was found.
