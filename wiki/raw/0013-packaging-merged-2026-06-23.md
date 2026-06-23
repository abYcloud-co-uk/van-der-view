---
source_id: 0013
title: Packaging merged (PR #19) — tsup ESM dual-entry build, scoped GHP package
origin: "dev session 2026-06-23; PR #19 (feat/packaging → main, merge 93de215); design docs/superpowers/specs/2026-06-23-packaging-design.md, plan docs/superpowers/plans/2026-06-23-packaging.md"
fetched: 2026-06-23
type: user-note
supersedes: null
---

# Packaging — installable ESM package to the org GitHub Packages registry

The "no build step" library is now a buildable, publishable **ESM package**. Merged via
PR #19 (4 tasks, subagent-driven + per-task reviews + final whole-branch review + an
external high-effort code-review fix wave). Public npm is deferred to a stable version.

## What shipped

- **Build tool = tsup** (esbuild), config `tsup.config.ts`:
  - Two entries → `dist/index.js` (the `.` export, agent-side, molstar-free) and
    `dist/browser.js` (the `./browser` export, molstar/React) + `.d.ts` + sourcemaps.
  - `format: ['esm']` (ESM-only), `target: es2022`, `treeshake`, `clean`, `dts: true`.
  - `external: [/^molstar(\/|$)/, /^react(-dom)?(\/|$)/]` — **regexes**, so molstar deep
    imports (`molstar/lib/...`) and `react-dom/server` stay external (never bundled).
  - `splitting: true` keeps `<MolViewCanvas>`'s lazy `import('../mol/create-mol-view')` as
    its own chunk, so neither `index.js` nor `browser.js` pulls molstar at module-load.
    Output: `dist/index.js` is self-contained; `dist/browser.js` (~2.3 KB) statically
    imports only react + reaches molstar only via the lazy `create-mol-view-*.js` chunk.
- **`package.json` public contract:** scoped name **`@abycloud-co-uk/van-der-view`**,
  `version 0.1.0`, `private` removed, `type: module`, `sideEffects: false`,
  `files: ["dist"]`, `license: MIT`. `exports` map is **types-first**:
  `.` → `{types:index.d.ts, import:index.js}`, `./browser` → browser, plus
  `./package.json`. `main`/`module`/`types` point at the agent-side entry.
  `publishConfig.registry = https://npm.pkg.github.com`.
- **Dependency policy:**
  - `molstar` moved `dependencies` → **optional `peerDependency` ^5.10.1**, kept as a
    `devDependency` (this repo's tests/build need it). Optional because the agent-side `.`
    entry never needs molstar (the load-bearing value); a missing-molstar mount logs an
    actionable "install the molstar peer" hint from `<MolViewCanvas>`'s catch.
  - **`react`/`react-dom` are REQUIRED peers** (`^18 || ^19`). The external review flagged
    that marking them optional turns a missing-peer *warning* into a runtime crash when the
    browser entry loads; reverted to required. (molstar is the only optional peer.)
- **`verify:package` release gate** (a script, not the normal Vitest run):
  `pnpm typecheck && pnpm test && pnpm build && publint && attw --pack --profile esm-only &&
  node scripts/assert-agent-side-molstar-free.mjs && node scripts/smoke-dist.mjs`.
  - `scripts/assert-agent-side-molstar-free.mjs` — statically walks `dist/index.js`'s import
    graph (resolving local chunks via `existsSync` + `.js` fallback, skipping unresolved
    rather than crashing) and fails if any reachable chunk imports `molstar`. Turns the
    molstar-free invariant from discipline into an executable gate.
  - `scripts/smoke-dist.mjs` — `import('../dist/index.js')` in Node; asserts `commands`
    (non-empty), `tools.anthropic`, and `adapters.anthropic.toCommand`.
  - `prepublishOnly` runs `verify:package`, so a local `pnpm publish` runs the full gate too.
- **Publishing:** `.github/workflows/publish.yml` — `on: release: [published]`,
  `permissions: packages: write`, setup-node `registry-url: https://npm.pkg.github.com`,
  `pnpm install --frozen-lockfile` → `pnpm verify:package` → `pnpm publish --no-git-checks`
  with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` (built-in token, no PAT). A committed
  root `.npmrc` maps the scope to GHP (no token committed). README gained an **Install**
  section (consumers add the scope `.npmrc` + a `read:packages` token).
- **Demo** keeps aliasing TS source (fast iteration) but imports the scoped name
  `@abycloud-co-uk/van-der-view[/browser]`; Vite alias + tsconfig `paths` map it to
  `src/*.ts` with the `/browser` key first (longest-match). `examples/demo` package `name`
  unchanged.
- Root `tsconfig.json` gained `"ignoreDeprecations": "6.0"` so the TS 6.0 dts pass doesn't
  hard-error on the `baseUrl` tsup injects for declaration generation.

## Gotchas / decisions worth remembering

- **GitHub Packages npm requires auth even for public packages** — every consumer (org or
  external) needs a token + `.npmrc`. This is exactly why the plan is to move to **public
  npm at a stable release** (frictionless for external devs). Scope on public npm needs
  owning the `abycloud-co-uk` npm org + `publishConfig.access: "public"`.
- **`pnpm test`/`pnpm typecheck` still run on TS source** (Vitest), unchanged — 116 tests.
  The build is separate; no test runs against `dist`.
- `pnpm-lock.yaml`'s root importer block records only `dependencies`/`devDependencies` (NOT
  `peerDependenciesMeta`), so the react/molstar peer-meta edits did not need a lockfile sync.
- **To verify at first publish (untestable offline):** whether pnpm interpolates the
  `${NODE_AUTH_TOKEN}` that setup-node writes (npm does; pnpm 11 supports `${VAR}` in
  `.npmrc`, but confirm at the first Release).

## Out of scope (cut)

Public npm publish (stable release); dual CJS/ESM; bundling molstar/react; push-triggered
CI; changesets/auto-versioning; typedoc; the demo consuming `dist`.
