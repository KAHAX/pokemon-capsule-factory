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

Cloudflare Pages allows assets up to 25 MiB. Larger GLB files have been losslessly repackaged as GLB JSON containers with external `.buffer-XX.bin` files, each below 20 MiB. Keep each GLB and its adjacent buffers together. Three.js GLTFLoader supports this format directly; no runtime loader changes are required.

`publication-audit.json` records the original SHA-256 and the byte-for-byte verification of all repackaged buffer views. Materials, images, meshes, skeletons and animation data have not been reduced or recompressed.

The original development project is separate from this publication copy. Future edits must be copied or committed here deliberately before redeploying.

Pokémon names and artwork belong to their respective owners. Additional asset attribution is in `web/public/credits`.
