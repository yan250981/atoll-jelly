# Atoll / Jelly.

A jelly diorama of a Maldivian lagoon — one self-contained HTML file, native **WebGPU + WGSL**, simulation in plain JavaScript, zero external requests (no CDN, no fonts, no images, no network).

Part of the editorial **MATERIAL STUDIES** series: a square cut-out block of turquoise jelly with a palm islet, a jetty of overwater bungalows, a seaplane that runs its own day, and reef life gliding through the jelly below.

Open `index.html` in a WebGPU-capable browser (Chrome / Edge 113+). Nothing to install, nothing to build.

## What's inside

**Water** — a linear shallow-water sim on a 168² staggered grid at 120 Hz with √(g·depth) wave speed, small surface tension and damping. Finger stirring, slosh when the block tilts, floating bodies hand displaced volume back to the sea, splash craters and bubbles. Rendered as translucent jelly: refraction of the scene behind it, Beer–Lambert absorption per flavour, fresnel sky, caustics, shoreline lace and a lacing foam field.

**The block** — white-sand lagoon sloping into a deep blue hole at the front corner, eight coral heads dressed with brain, branching corals and sea fans, a sandy islet with coconut palms and thatched parasols, an open lobby pavilion, a plank jetty on thin stilts with lamp posts, six bungalows on alternating sides, a seaplane pontoon. The cut faces show candy strata: sand, shell band, caramel, chocolate.

**The seaplane** — a twin-engine floatplane with a fixed daily loop: wait → pivot on its floats → taxi → take-off run → climb → racetrack circuit at ~3.1 with banking → approach → touchdown with a crater and white water → landing run → turn → taxi home. On water it rides the jelly: four float samples set height, pitch and roll, and its floats push volume into the sim.

**Reef life** — 42 boids in four colour kinds schooling with their own kind, plus 3 spotted eagle rays gliding near the floor. A finger, a splash or a passing floatplane scatters them. Feed the fish and they home in on the pellets.

**Float rings** — candy-striped inflatables that lie flat on the waves, get shoved aside by the seaplane, and can be picked up and thrown.

## Controls

- **Drag** — orbit · **scroll / pinch** — zoom · **drag in the water** — stir
- **Shift-drag** — tilt the block and slosh the lagoon
- **Click a bungalow** — jump the seaplane's day forward
- Glass panel: **Seaplane · Feed the fish · Float ring**, flavours (Turquoise / Sapphire / Lime), sliders for firmness, wave damping and tide (±10 cm), Reset · Pause · Reset view

## QA

The page exposes `window.__aj` with a `check()` routine that drives the whole model and asserts 23 behaviours — the full seaplane cycle and a landing, altitude, floats riding the surface, touchdown foam, fish staying in water, feeding, scattering, ring float, wave decay, tilt slosh, flavours, sliders, pause, orbit, sim cost, no network, no console errors, canvas sizing, fallback and the mobile sheet. All 23 pass, with the water sim at ~0.9 ms per frame.

## Fallback

Without a WebGPU adapter the page shows a quiet card instead of the scene — nothing throws, nothing spins.
