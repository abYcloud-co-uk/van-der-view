---
title: Packaging & Distribution
slug: packaging
type: decision
status: stable
sources: [raw/0013-packaging-merged-2026-06-23.md, "docs/superpowers/specs/2026-06-23-packaging-design.md"]
updated: 2026-06-23
links: [project-overview, headless-react, testing-strategy, agent-command-flow]
---

# Packaging & Distribution

> How van-der-view is built and published: a **tsup ESM dual-entry** package
> `@abycloud-co-uk/van-der-view` on the org **GitHub Packages** registry, keeping the
> agent-side entry molstar-free. Landed PR #19 (src: raw/0013).

## Key facts

- **Build = tsup (esbuild), ESM-only.** Two entries → `dist/index.js` (the `.` export,
  agent-side, molstar-free) and `dist/browser.js` (the `./browser` export, molstar/React),
  plus `.d.ts` + sourcemaps (src: raw/0013).
- **The molstar-free split is enforced, not just disciplined.** `external` regexes keep
  molstar/react out of the bundle; `splitting: true` keeps `<MolViewCanvas>`'s lazy
  `import('../mol/create-mol-view')` in its own chunk, so **neither entry pulls molstar at
  module-load**; and `scripts/assert-agent-side-molstar-free.mjs` fails the release if any
  chunk reachable from `dist/index.js` imports molstar (src: raw/0013, [[agent-command-flow]]).
- **Scoped name `@abycloud-co-uk/van-der-view`** (GitHub Packages requires the scope to match
  the org). Subpath `./browser`. `version 0.1.0`, ESM-only, MIT (src: raw/0013).
- **Dependency policy:** `molstar` is an **optional** peer (the agent side never needs it; a
  missing-molstar canvas mount logs an actionable hint); **`react`/`react-dom` are REQUIRED
  peers** (optional peers would silently turn a missing-peer warning into a runtime crash)
  (src: raw/0013).
- **GitHub Packages npm requires authentication even for public packages** — so external
  consumption is awkward; the plan is to move to **public npm at a stable release** (src:
  raw/0013).

## Details

### Build config (`tsup.config.ts`)

```ts
entry: { index: 'src/index.ts', browser: 'src/browser.ts' },
format: ['esm'], dts: true, treeshake: true, splitting: true,
target: 'es2022', sourcemap: true, clean: true,
external: [/^molstar(\/|$)/, /^react(-dom)?(\/|$)/],   // regexes: molstar/lib/* must stay external
```

`dist/index.js` is self-contained (no molstar). `dist/browser.js` (~2.3 KB) statically
imports only react and reaches molstar only through the lazy `create-mol-view-*.js` chunk.
Root `tsconfig.json` carries `"ignoreDeprecations": "6.0"` so the TS 6.0 dts pass tolerates
the `baseUrl` tsup injects (src: raw/0013).

### The `package.json` contract

| Field | Value |
|---|---|
| `name` / `version` | `@abycloud-co-uk/van-der-view` / `0.1.0`, no `private` |
| `exports` (types-first) | `.` → `{types,import}` index · `./browser` → browser · `./package.json` |
| `main`/`module`/`types` | all → the agent-side `dist/index.*` |
| `files` / `sideEffects` | `["dist"]` / `false` |
| `peerDependencies` | `molstar ^5.10.1` (optional), `react`/`react-dom ^18‖^19` (required) |
| `publishConfig.registry` | `https://npm.pkg.github.com` |

### The release gate — `verify:package`

```
typecheck → test → build → publint → attw --pack --profile esm-only
          → assert-agent-side-molstar-free → smoke-dist
```
`prepublishOnly` runs `verify:package`, so **both** CI and a local `pnpm publish` run the
full gate — a release can't ship code that fails the suite/typecheck or defeats the
agent-side/browser-side split (src: raw/0013). `scripts/smoke-dist.mjs` imports
`dist/index.js` in Node and asserts `commands` + `tools.anthropic` + `adapters`.
`pnpm test`/`pnpm typecheck` themselves still run on **TS source** (Vitest), unchanged —
116 tests; nothing tests against `dist`.

### Publishing (`.github/workflows/publish.yml`)

`on: release: [published]`, `permissions: packages: write`, setup-node with
`registry-url: https://npm.pkg.github.com`, then `pnpm install --frozen-lockfile` →
`pnpm verify:package` → `pnpm publish --no-git-checks` with
`NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` — the **built-in token, no PAT**. A committed
root `.npmrc` maps the scope to GHP (no token committed). The README **Install** section
tells consumers to add the scope `.npmrc` + a `read:packages` token.

### Demo

`examples/demo` keeps aliasing **TS source** (edit-lib→hot-reload) but imports the real
scoped name; the Vite alias + tsconfig `paths` map `@abycloud-co-uk/van-der-view[/browser]`
→ `src/*.ts`, with the `/browser` key **first** (Vite/TS longest-match). See
[[headless-react]] and [[testing-strategy]].

## See also
- [[project-overview]] — where packaging sits; the molstar-free/browser split it ships
- [[agent-command-flow]] — the `.` (agent-side) vs `./browser` boundary the build enforces
- [[testing-strategy]] — `verify:package` and the off-GPU/GPU split this rides on
- [[headless-react]] — the React mount the `./browser` entry exposes

## Open questions
- **Public npm release** — at a stable version: own the `abycloud-co-uk` npm org +
  `publishConfig.access: "public"`, flip the registry; then external devs install with no
  token (src: raw/0013).
- **pnpm + GHP auth** — confirm pnpm interpolates the `${NODE_AUTH_TOKEN}` setup-node writes,
  at the first real Release (untestable offline) (src: raw/0013).
- **Mol\* version pin** — the build targets molstar `5.10.1`; a wider peer range is untested
  ([[molstar-api]]).
