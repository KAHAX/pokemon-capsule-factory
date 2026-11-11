# Conservative scene optimization — 2026-11-11

High-quality source + all shipped assets archived locally, before any edits:
`D:/Codex/2026-11-11/pokemon-capsule-high-quality-53fb9ce.zip`
Git baseline: `53fb9ce`. ZIP contains 380 files, 1,001,977,532 bytes; excludes rebuildable node_modules/dist.

## Changes

- Background additions: 3,172,581 → 2,422,855 unique triangles. Simplification locks borders, keeps attribute seams, limits relative geometric error to 0.0008, and skips hero-named geometry, glass, text, signs and decals.
- Chamber shared ball shells: conservative 0.0005 error limit and 70% target. Shell geometry 13,346 → 10,570 triangles, reused by the animated chamber balls. Other chamber mechanisms unchanged.
- Main machine, bag, cart, box, display props and Pokédex: compression/reordering only; unchanged triangle counts.
- Core model transfer bytes, including referenced buffers: 164.55 MB → 78.35 MB (52.4% reduction). This is asset size, not a measured network load-time claim.
- No Pokémon mesh or texture assets changed; output ball and output animation assets unchanged.
- Original texture image bytes preserved and hashed; node names, material names and animation channels retained. Exporter rounds near-zero node transforms within 0.00001 units.
- No changes to lights, exposure, glass, shadows, bloom, depth-of-field, outlines, color grading or render resolution.
- Background Pokémon load after the interactive factory, through a bounded decoder queue (2 touch devices, 3 desktop). Full background population is progressive rather than blocking the first scene.
- Physics engine is a separate lazy bundle, allowing loading UI and factory downloads to start before its large bundle is parsed.
- Removed unnecessary observation-canvas preserved framebuffer. Loading displays completed core asset count, preparation stages and a reload button on error; stalled model requests time out after 180 seconds.

## Validation

`npm run build`; `node scripts/validate-optimization.mjs` compares original archive assets to output: index bounds, finite attributes, animation keys, node transforms. `scripts/optimize-scene.mjs` checks texture hashes/material and node identities before writing. Hosting files remain below 25 MiB.

To reproduce, extract the high-quality ZIP separately, then run `node scripts/optimize-scene.mjs <extracted-web/public/assets>`. Do not use already optimized models as input.

Huawei/WeChat real-device load-time and memory behavior need confirmation on the user's phone. A narrow desktop viewport is not a substitute for its GPU/browser/network.

## Mobile runtime follow-up — 2026-11-12

User authorized mobile smoothness over fine raster detail, keeping the lighting style. Coarse-pointer/no-hover devices now use a 30 fps render ceiling and adaptive pixel ratio (starts at 0.9, bounded 0.65–1.0). Slow frames reduce resolution; recovery requires sustained spare capacity. Desktop settings remain unchanged.

- Keep the same light colors/intensities, materials, glass, bloom, depth of field, grading and outlines. Scale outline sample width with actual mobile pixel ratio.
- Mobile shadow maps use 1024 pixels and update at most 20 times/sec. Landscape touch devices no longer enable desktop 4x offscreen MSAA.
- Distant companion animation updates share accumulated elapsed time at a reduced cadence; no Pokémon geometry removed or reduced.
- Idle docked Pokédex draws at most 12 times/sec. Full viewer/flight interactions retain the main frame rate. Freeze the factory canvas behind the mobile Pokédex viewer, and redraw on resize.
- Mobile observation, card and Pokédex renderers cap pixel ratio at 1.0; HTML text remains at native browser resolution.

Validation: `node scripts/check-mobile-performance.mjs` checks device detection, adaptation bounds, warmup, slow-device response and recovery hysteresis; production build passes. Desktop Chrome touch emulation loaded the scene at 412×915 with a 370×823 main framebuffer, no context loss or shader failures. This verifies the mobile code path, not Huawei frame rate.

## Remove rear devices and extend conveyor — 2026-11-12

User requested removing background machinery while retaining Pokémon, main-machine interactions and feed tube. Preserved source at commit `fb96057`; a separate pre-removal additions asset is also stored locally outside the web root.

- Remove complete connected pieces from the merged additions asset. Retain hero glass, main sign, cabinet, tile plinth, artwork and existing straight conveyor. Remaining texture image bytes are unchanged. No clipping plane or runtime hiding of downloaded machinery.
- Add conveyor continuation to x=180 on the right; also cover the old left endpoint to x=-180. Reuse original nearby slat geometry and dark/light materials. Distant repeats use low-cost box geometry in spatial instance batches. The added continuation contains 78,192 triangles in total, with off-screen batches culled.
- Relocate four Magnemite repair stations onto retained conveyor fittings and move Emolga's rest point to the main sign, avoiding invisible removed support objects. Other Pokémon meshes and behaviors unchanged.
- Additions asset: 2,422,855 → 846,904 triangles; 162 → 60 mesh objects. Core packed model downloads: 48,598,947 → 28,275,560 bytes (41.8% less). This excludes later Pokémon, audio and other textures.
- Controlled 1600×1000 desktop browser snapshots with all companions loaded and forced shadow refresh: six main-render samples averaged about 13.38M → 9.11M submitted triangles/frame (31.9% less), 4,412 → 4,087 draw calls (7.4% less). Reflections alternate update frames; averages include both. These are rendering workload counts, not a Huawei FPS benchmark. The final check also removes the orphan cabinet cover.

Validation: build passes; `check-background-removal.mjs` verifies original retained texture pixels/transforms, nine protected hero meshes and valid indices/finite attributes. Browser reports no shader/runtime errors; output ball produced successfully; maximum zoom-out and both permitted horizontal orbit endpoints show continuous tracks beyond the viewport.
