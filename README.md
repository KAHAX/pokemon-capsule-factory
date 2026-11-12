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

- Wait for the ordinary scene Pokémon and initial rendering before revealing the factory.
- Default shiny prize probability: 50%; the former saved 10% default is migrated once.
- Random shiny scene visitors and the shiny Mew replacement are removed. Ordinary Mew behavior and shiny capsule prizes remain available.

The original development project is separate from this publication copy. Future edits must be copied or committed here deliberately before redeploying.

Pokémon names and artwork belong to their respective owners. Additional asset attribution is in `web/public/credits`.
