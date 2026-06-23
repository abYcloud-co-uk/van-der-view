# Packaging — van-der-view as an installable org package

**Status:** Approved (design locked 2026-06-23)
**Phase:** Packaging (the structural step after the v1 runtime + trajectory cluster, both merged & GPU-verified)
**Branch:** `feat/packaging` (off `main`)

## Goal

Turn the current **no-build, Vitest-runs-TS-source** library into an **installable
ESM package** published to the **org's GitHub Packages** registry as
`@abycloud-co-uk/van-der-view`, so other `abYcloud-co-uk` projects can
`npm install` it. The **agent-side entry stays molstar-free**. Going public on the
npm registry is **deferred to a stable release** — the package config is shaped so
that flip is a minimal change (registry + scope-auth only).

## Background / current state

- `package.json`: `"private": true`, `version: 0.0.0`, `"type": "module"`, **no**
  `exports`/`main`/`module`/`types`/`files`, no build script. `molstar` is a regular
  `dependencies`; `react`/`react-dom` are already `peerDependencies` (+ devDeps).
- Two barrels already define the public surface:
  - `src/index.ts` — **agent-side**, molstar-free (re-exports `types`, the Anthropic
    `adapters`, `commands`, `tools`). Its static import graph has **no molstar**
    (verified).
  - `src/browser.ts` — **browser-side**, value-exports the React layer
    (`MolViewProvider`/`MolViewCanvas`/`useMolView`) and **type-only** exports the mol
    layer + `SceneContext`/`FocusOptions`. molstar loads **lazily** inside
    `<MolViewCanvas/>`'s effect (`canvas.tsx` `import()`), so importing `browser.ts`
    pulls no molstar at module-load.
- `tsconfig.json`: `module: ESNext`, `moduleResolution: Bundler`, no emit/declaration.
- `examples/demo` consumes the lib via **Vite alias + tsconfig `paths`** pointing at
  TS source, importing the subpaths `van-der-view` and `van-der-view/browser`.
- `LICENSE` = MIT; `README.md` present. Repo is **public**, org `abYcloud-co-uk`,
  remote `git@github.com:abYcloud-co-uk/van-der-view.git`. No `.github/workflows/`,
  no `.npmrc`.

## Locked decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Build tool = tsup** (esbuild) | One config emits both entries + `.d.ts`, externalizes molstar/react, `splitting` preserves the lazy dynamic import; no extension-rewrite headache. |
| 2 | **ESM-only** | Matches `type: module` + bundler/browser consumers (Vite/Next); avoids the dual-package hazard. |
| 3 | **Publish to org GitHub Packages now**, scoped `@abycloud-co-uk/van-der-view`; **public npm deferred** to a stable version | User chose org-internal first. GHP requires the scope to match the org. |
| 4 | **demo keeps the TS-source alias** (renamed to the scoped package name) | Preserves edit-lib→hot-reload iteration; packaging correctness is validated separately. |
| 5 | **molstar → optional peerDependency** | A renderer-bridge lib must not bundle/duplicate molstar; agent-side-only consumers need neither molstar nor react. |

## Design

### A. Build — `tsup.config.ts`

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', browser: 'src/browser.ts' },
  format: ['esm'],
  dts: true,
  treeshake: true,
  splitting: true,        // emit the lazily-imported mol layer as its own chunk
  target: 'es2022',
  sourcemap: true,
  clean: true,
  external: [/^molstar(\/|$)/, /^react(-dom)?(\/|$)/],
});
```

- **`external` must use regexes**, not bare names: molstar's deep imports
  (`molstar/lib/mol-model/...`) and `react-dom/server` have to be externalized too.
  A bare `'molstar'` external would let esbuild bundle the deep-import subtree.
- **`splitting: true`** keeps `canvas.tsx`'s `import('./mol/...')` as a separate chunk,
  so `dist/browser.js` pulls no molstar at module-load (preserves the Plan-3a
  SSR/lazy property). `dist/index.js` never statically imports the mol layer, so the
  agent-side entry is molstar-free by construction.
- Output: `dist/index.js`, `dist/browser.js`, shared/lazy chunks, `dist/*.d.ts`,
  sourcemaps.

`package.json` scripts:
- `"build": "tsup"`
- `"prepublishOnly": "pnpm build"`
- `pnpm test` / `pnpm typecheck` are **unchanged** — they still run on TS source.

### B. `package.json` public contract

```jsonc
{
  "name": "@abycloud-co-uk/van-der-view",
  "version": "0.1.0",
  "description": "Headless React bridge between an AI agent and the Mol* 3D molecular renderer.",
  "type": "module",
  "license": "MIT",
  "sideEffects": false,
  "files": ["dist"],
  "exports": {
    ".":              { "types": "./dist/index.d.ts",   "import": "./dist/index.js" },
    "./browser":      { "types": "./dist/browser.d.ts", "import": "./dist/browser.js" },
    "./package.json": "./package.json"
  },
  "main":   "./dist/index.js",
  "module": "./dist/index.js",
  "types":  "./dist/index.d.ts",
  "repository": { "type": "git", "url": "git+https://github.com/abYcloud-co-uk/van-der-view.git" },
  "homepage": "https://github.com/abYcloud-co-uk/van-der-view#readme",
  "bugs": "https://github.com/abYcloud-co-uk/van-der-view/issues",
  "keywords": ["molstar","molecular-visualization","react","llm","ai-agent","webxr","headless","protein","3d"],
  "publishConfig": { "registry": "https://npm.pkg.github.com" }
}
```

- **Remove** `"private": true` (required to publish).
- `exports` **types-first** ordering; `./package.json` exposed for tooling.
- `main`/`module`/`types` kept as fallbacks for older resolvers (all point at the
  agent-side entry — molstar-free default import).
- The `.` (agent-side) ↔ `./browser` (browser-side) split mirrors the subpaths the
  demo already uses; only the scope is added.

### C. Dependency layout

- `molstar`: move `dependencies` → **`peerDependencies`** (`^5.10.1`), add
  `"peerDependenciesMeta": { "molstar": { "optional": true } }`, **keep** in
  `devDependencies` (this repo's tests/typecheck need it). Same shape react already has.
- `react`/`react-dom`: already peers; mark **optional** too (agent-side-only consumers
  need no React).
- New `devDependencies`: `tsup`, `publint`, `@arethetypeswrong/cli`.

### D. Packaging-correctness verification — `"verify:package"`

A dedicated script (NOT part of the normal Vitest suite, which runs on TS source):

```
build → publint → attw --pack → assert-agent-side-molstar-free → dist smoke import
```

1. **`publint`** — package.json publish-correctness (exports/files/types resolvable).
2. **`@arethetypeswrong/cli` (`attw --pack`)** — types resolve for both entries under
   ESM resolution.
3. **agent-side molstar-free guard** (`scripts/assert-agent-side-molstar-free.mjs`) —
   statically follow `dist/index.js`'s `import` graph (its reachable chunks) and assert
   **no chunk references `molstar`**. Turns the molstar-free invariant from
   discipline into an executable gate.
4. **dist smoke import** — Node `import('./dist/index.js')`; assert it does not throw
   and that `commands` (non-empty array) and `tools.anthropic` are present.

`verify:package` runs locally and as the publish workflow's gate.

### E. Publishing — GitHub Actions on Release

`.github/workflows/publish.yml`:
- Trigger: `release: { types: [published] }` (you create a GitHub Release → it runs).
- `permissions: { contents: read, packages: write }`.
- Steps: checkout → pnpm + `actions/setup-node` with
  `registry-url: https://npm.pkg.github.com` → `pnpm install` → `pnpm verify:package`
  (gate) → `pnpm publish --no-git-checks` with
  `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
- Uses the built-in `GITHUB_TOKEN` — **no personal PAT** to manage.

Repo additions:
- A **root `.npmrc`** with the scope→registry mapping only, **no token**:
  `@abycloud-co-uk:registry=https://npm.pkg.github.com`. The token is injected by the
  workflow / by consumers locally; never committed.
- **README** gains an "Install (org GitHub Packages)" section: consumers add the same
  `.npmrc` scope line plus an auth token line, then `npm install`. Note that GHP's npm
  registry requires auth even for public packages — which is exactly why public npm is
  the planned next step at a stable release.
- The **actual publish is triggered by you** creating a Release; this session does not
  run an outward-facing `npm publish` directly.

### F. demo — keep the source alias, rename to the scoped name

`examples/demo` stays aliased to TS source (fast iteration). Mechanically rename the
package identifier `van-der-view` → `@abycloud-co-uk/van-der-view` (and
`.../browser`) in:
- `examples/demo/vite.config.ts` (`resolve.alias` `find` keys),
- `examples/demo/tsconfig.json` (`compilerOptions.paths` keys),
- every demo import (`main.tsx`, `App.tsx`, `ui.tsx`, and the `panels/*` files).

The demo then doubles as a real-package-name usage example.

## Acceptance criteria

1. `pnpm build` produces `dist/{index,browser}.js` + matching `.d.ts` + sourcemaps; no
   molstar bytes in `dist/index.js` or its statically-reachable chunks.
2. `pnpm verify:package` passes: publint clean, attw clean for both entries, the
   molstar-free guard passes, the dist smoke import exposes `commands` + `tools`.
3. `pnpm test` (full suite) and `pnpm typecheck` stay green (unchanged, on TS source).
4. `examples/demo` typechecks and builds against the renamed scoped alias.
5. `package.json` is publish-ready: scoped name, `0.1.0`, no `private`, exports map,
   molstar an optional peer, `publishConfig` → GHP.
6. `.github/workflows/publish.yml` is present and valid; a GitHub Release would run
   `verify:package` then `pnpm publish` to GHP using `GITHUB_TOKEN`.
7. README documents the GHP install (`.npmrc` + token).

## Out of scope (explicit cuts)

- **Public npm publish** (deferred to a stable version).
- **Dual CJS/ESM** output.
- **Bundling** molstar or react into the package.
- **Push-triggered CI** (lint/test on every push) — only the Release-triggered publish
  workflow is added now.
- **changesets / automated version management** — version is bumped manually.
- **typedoc / API docs site.**
- **demo consuming `dist`** — it keeps the TS-source alias.

## Open questions (resolved)

- *Registry?* → org GitHub Packages now; public npm at a stable release.
- *Scope vs unscoped?* → scoped (`@abycloud-co-uk/...`), required by GHP and a clean
  namespace for the eventual public release.
- *Bundler?* → tsup; `external` regexes keep molstar/react out; `splitting` preserves
  the lazy mol-layer import.
- *Module format?* → ESM-only.
- *molstar dependency kind?* → optional peer (+ devDep here).
- *demo?* → keep source alias, rename to scoped name.
