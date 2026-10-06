# Scottish Hill Runners — Agent Instructions

Static-export Next.js site for Scottish Hill Runners. Content is Markdown/CSV driven; all data is precomputed at build time into gzip-compressed JSON served from `public/results/`.

## Commands

```bash
npm run dev              # local dev server (Next.js)
npm run prebuild         # run all build-*.ts scripts via tsx (required before build)
npm run build            # prebuild + next build → static export
npm run content:sync     # sync external content repo (needs CONTENT_REPO + CONTENT_REF env vars)
npm run content:build    # alias for prebuild after sync
npm run validate:results # validate race CSVs
npm run lint             # ESLint
npm run format           # Prettier
```

Node requirement: **>=22 <25**. Next.js 16 hits heap OOM on Node 25; use `NODE_OPTIONS=--max-old-space-size=4096` for dev, `6144` for build if needed.

## Architecture

| Layer | Location | Role |
| ----- | -------- | ---- |
| Build scripts | `scripts/build-*.ts` | Parse `content/` → write `public/results/*.json.gz` |
| App pages | `src/app/` | Next.js App Router pages (all statically pre-rendered) |
| Components | `src/components/` | React components (MapLibre maps, data tables, elevation profiles) |
| Data loaders | `src/lib/` | Fetch + decompress `.json.gz` at runtime in the browser |
| Types | `src/types/datatable.ts` | Core types: `RaceResult`, `RaceInfo`, `RaceData`, `AllRaceData` |

Build pipeline runs `scripts/run-builds.mjs` which discovers and runs each `build-*.ts` sequentially via `tsx`.

## Content formats

**Race metadata** — `content/races/{RaceName}/index.md` with gray-matter frontmatter:

```yaml
---
title: Ben Nevis Race
venue: New Town Park, Fort William
distance: 14        # km
climb: 1360         # metres
maleRecord: Kenny Stuart, 1:25:34 (1984)
femaleRecord: Victoria Wilkinson, 1:43:01 (2018)
web: www.example.com
organiser: Club Name <email@example.com>
---
```

**Race results** — `content/races/{RaceName}/{YEAR}.csv` (Position, Name, Club, Category, Time). Multiple events per year: `{YEAR}-s.csv` / `{YEAR}-w.csv`. Time format is flexible: `1:25:34`, `85:34`, `85.34`, `1h25m34s`.

Other content folders: `clubs/`, `championships/`, `news/`, `info/`, `long-distance/`, `committee/`.

## Key conventions & gotchas

- **Static export only** (`output: 'export'` in `next.config.ts`) — no SSR, no API routes at runtime.
- **`useSearchParams` must be inside `Suspense`** in any prerendered page (Next.js App Router requirement).
- **Runner page** (`/runner?name=...`) uses client-side query params + lazy fetch of `/results/R-<hash>.json.gz` (surname hash) to avoid generating ~26 000 static pages.
- **Gzip results**: All result data is written as `.json.gz`; use `writeGz()` in `scripts/write-gz-util.ts` when adding new build outputs.
- **CSV parsing**: Use `csvtojson` (already a dependency) — do not use `awk -F,`; quoted commas will break it. For validation scripts use `csv-parse`.
- **React Compiler** is enabled (`reactCompiler: true`) — avoid manual `useMemo`/`useCallback` for simple derived values.
- **External content repo** workflow: set `CONTENT_REPO` + `CONTENT_REF` env vars, then `npm run content:sync && npm run content:build`.

## Key files

- [`README.md`](README.md) — build process overview and CSV format details
- [`src/types/datatable.ts`](src/types/datatable.ts) — canonical data types
- [`scripts/run-builds.mjs`](scripts/run-builds.mjs) — build orchestrator
- [`scripts/build-race-results.ts`](scripts/build-race-results.ts) — main result processor
- [`src/lib/results-data.ts`](src/lib/results-data.ts) — runtime data loaders

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
