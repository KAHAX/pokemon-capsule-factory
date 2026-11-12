# Pokémon Capsule Works

宝可梦扭蛋机的独立网站发布副本，保留场景、模型、音乐与交互。

## Cloudflare Pages

- Git repository: `KAHAX/pokemon-capsule-factory`
- Production branch: `main`
- Framework preset: `None`
- Root directory: `web`
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: 22 (set by `web/.node-version`)
- No environment variables or custom domain are required.

The site uses relative, same-origin asset URLs and does not require a local server on port 5180 in production. `npm run sync` is a development-only utility, not part of the build.

## Local preview

```sh
cd web
npm ci
npm run dev
```

## Large models

The current release uses compressed, content-addressed model chunks listed in `web/src/transfer-manifest.json`. All referenced chunks are published, and the loader reconstructs each model before parsing it. Raw model files remain available below the Pages 25 MiB limit. The unused original `scene-v5.glb`, local backups, and obsolete transfer chunks are excluded from publication.

Unused Pokémon animation clips have been removed while preserving the clips used by the scene and collection viewer. Earlier audit reports in the repository describe earlier releases.

## Current behavior

- `/` preserves the existing edition. Tag `desktop-preserved-20261112` records the complete pre-mobile release.
- `/mobile/` is an independent phone entry; there is no automatic redirect or replacement of `/`.
- Mobile keeps the factory, neon bloom, warm projected key light, capsule opening and card collection. Its full original background cast and routes are restored; the default phone camera is 10% closer. It uses Fresnel transparency, hardware depth for distant blur/outlines, a cached static shadow map, and ground reflections updated on camera movement. Internal resolution adapts between 0.6 and 0.95 CSS pixels, targeting 30 FPS rather than guaranteeing device performance.
- Mobile uses direct scene interaction (tap the crank or the output ball). The CSS loading indicator avoids an extra startup WebGL context, and the docked Pokédex redraws only when needed.
- Mobile startup models use a separate content-addressed manifest: 17.3 MiB across 33 requests, versus the earlier 26.7 MiB across 103 requests. Model textures are capped at 512 pixels; the sky and Pokédex surface atlas have separate smaller textures. Original model files and the desktop manifest remain unchanged. Prize models still load on demand from the existing collection.
- `cd web && node scripts/build-mobile-assets.mjs` regenerates the mobile assets. It preserves triangle counts, vertex positions, UV layout, node names and clip selections. Background prop normal/UV precision is packed without quantizing positions: scene setup needs to reposition connected sign vertices. Phone downloads use a 30-second inactivity deadline so progressing slow transfers are not repeatedly restarted.

- Mobile Pokédex previews use a single externally driven 15 Hz portrait renderer and a 1x card texture. A tighter depth range and offset card faces prevent overlapping surfaces from competing for depth. Selecting a card resumes its own animation loop; desktop rendering remains unchanged.

- Wait for the ordinary scene Pokémon and initial rendering before revealing the factory.
- Default shiny prize probability: 50%; the former saved 10% default is migrated once.
- Random shiny scene visitors and the shiny Mew replacement are removed. Ordinary Mew behavior and shiny capsule prizes remain in both editions.

The original development project is separate from this publication copy. Future edits must be copied or committed here deliberately before redeploying.

Pokémon names and artwork belong to their respective owners. Additional asset attribution is in `web/public/credits`.
