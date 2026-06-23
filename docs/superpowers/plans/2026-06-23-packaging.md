# Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the no-build TS-source library into an installable ESM package `@abycloud-co-uk/van-der-view` published to the org's GitHub Packages registry, keeping the agent-side entry molstar-free.

**Architecture:** tsup emits two ESM entries — `dist/index.js` (the molstar-free agent-side barrel `src/index.ts`, exported as `.`) and `dist/browser.js` (the molstar/React barrel `src/browser.ts`, exported as `./browser`) — plus `.d.ts`. molstar/react are external (regex) and the `<MolViewCanvas/>` lazy `import()` is preserved via code-splitting, so `dist/index.js` and `dist/browser.js` pull no molstar at module-load. Publishing is a Release-triggered GitHub Actions workflow using the built-in `GITHUB_TOKEN`. The demo keeps aliasing TS source (renamed to the scoped package name); `pnpm test`/`pnpm typecheck` stay on TS source.

**Tech Stack:** tsup (esbuild), TypeScript 6, publint, @arethetypeswrong/cli (`attw`), pnpm, GitHub Actions, GitHub Packages.

**Source spec:** `docs/superpowers/specs/2026-06-23-packaging-design.md`

## Global Constraints

- Package name is exactly `@abycloud-co-uk/van-der-view` (scoped, lowercase); subpath `./browser`.
- Version is `0.1.0`; `"private": true` is removed.
- ESM-only: `"type": "module"`, tsup `format: ['esm']`. No CJS output.
- `molstar` is an **optional `peerDependency` `^5.10.1`** (removed from `dependencies`, **kept** in `devDependencies`). `react`/`react-dom` are also optional peers.
- The agent-side entry (`.` → `dist/index.js`) and every chunk it statically imports must reference **no molstar** — enforced by `scripts/assert-agent-side-molstar-free.mjs`.
- tsup `external: [/^molstar(\/|$)/, /^react(-dom)?(\/|$)/]` and `splitting: true`.
- Registry is GitHub Packages `https://npm.pkg.github.com`; publish runs only via a Release-triggered workflow with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. **No token is ever committed.**
- `pnpm test` and `pnpm typecheck` remain unchanged and green (they run on TS source; suite is **116 tests**).
- The demo keeps its TS-source alias; it is only renamed to the scoped package name. `examples/demo/package.json`'s own `name` (`van-der-view-demo`) is **not** changed.
- License field is `MIT` (matches the existing `LICENSE`).

---

### Task 1: tsup build pipeline + dependency reshuffle

Make `pnpm build` produce a correct dual-entry ESM `dist/`, and move molstar to an optional peer dependency. No public-contract fields yet (name/exports/version come in Task 2).

**Files:**
- Create: `tsup.config.ts`
- Modify: `package.json` (devDependencies, peerDependencies/peerDependenciesMeta, remove `dependencies.molstar`, scripts)

**Interfaces:**
- Produces: `pnpm build` → `dist/index.js`, `dist/browser.js`, `dist/index.d.ts`, `dist/browser.d.ts` (+ shared/lazy chunks, sourcemaps). The `build` script (`"build": "tsup"`) is consumed by Task 2's `verify:package` and Task 3's workflow.

- [ ] **Step 1: Add the build/lint dev tooling**

Run:
```bash
pnpm add -D tsup publint @arethetypeswrong/cli
```
Expected: pnpm adds the three packages to `devDependencies` with concrete versions and updates `pnpm-lock.yaml`.

- [ ] **Step 2: Move molstar from a dependency to an optional peer (kept as devDep)**

Edit `package.json`. Remove the `dependencies` block entirely (molstar was its only entry). Add molstar to `devDependencies` (so local build/test/typecheck still resolve it), to `peerDependencies`, and mark all three peers optional. The result should contain:

```jsonc
  "devDependencies": {
    "@arethetypeswrong/cli": "^x",   // version written by Step 1
    "@types/node": "^25.9.3",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "jsdom": "^29.1.1",
    "molstar": "^5.10.1",
    "publint": "^x",                 // version written by Step 1
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "tsup": "^x",                    // version written by Step 1
    "typescript": "^6.0.3",
    "vitest": "^4.1.9"
  },
  "peerDependencies": {
    "molstar": "^5.10.1",
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  },
  "peerDependenciesMeta": {
    "molstar": { "optional": true },
    "react": { "optional": true },
    "react-dom": { "optional": true }
  }
```
There must be **no** top-level `"dependencies"` key after this edit.

- [ ] **Step 3: Sync the lockfile**

Run:
```bash
pnpm install
```
Expected: install succeeds with no unmet-peer errors (molstar/react are optional peers and remain present as devDeps).

- [ ] **Step 4: Add the build scripts**

Edit `package.json` `scripts` to add `build` and `prepublishOnly` (keep the existing `test`/`test:watch`/`typecheck`):

```jsonc
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "build": "tsup",
    "prepublishOnly": "pnpm build"
  }
```

- [ ] **Step 5: Create the tsup config**

Create `tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  // Two public entries: "." (agent-side, molstar-free) and "./browser" (molstar/React).
  entry: { index: 'src/index.ts', browser: 'src/browser.ts' },
  format: ['esm'],
  dts: true,
  treeshake: true,
  // Keep canvas.tsx's lazy import('./mol/...') as its own chunk, so neither
  // index.js nor browser.js pulls molstar at module-load.
  splitting: true,
  target: 'es2022',
  sourcemap: true,
  clean: true,
  // Regexes (not bare names): molstar's deep imports (molstar/lib/...) and
  // react-dom/server must stay external, never bundled.
  external: [/^molstar(\/|$)/, /^react(-dom)?(\/|$)/],
});
```

- [ ] **Step 6: Build and verify the four output files exist**

Run:
```bash
pnpm build && ls dist
```
Expected: build succeeds; `ls dist` lists at least `index.js`, `browser.js`, `index.d.ts`, `browser.d.ts` (plus possibly `chunk-*.js` and `*.map` files).

- [ ] **Step 7: Verify molstar was externalized, not bundled**

Run:
```bash
ls -lh dist/browser.js && grep -c "from \"molstar" dist/*.js
```
Expected: `dist/browser.js` is small (kilobytes, not megabytes — molstar is not inlined); `grep` finds molstar referenced only as `import ... from "molstar/..."` specifiers in the lazily-loaded chunk (a non-zero count of *import statements* is correct — it means molstar is external).

- [ ] **Step 8: Confirm the existing gates stay green**

Run:
```bash
pnpm test && pnpm typecheck
```
Expected: 116 tests pass; `tsc --noEmit` exits 0. (The dependency reshuffle did not break source typechecking or tests.)

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsup.config.ts
git commit -m "build: tsup ESM dual-entry build; molstar → optional peer"
```

---

### Task 2: publishable package.json contract + verify:package

Add the public-contract fields (scoped name, version, exports, metadata, publishConfig) and the automated proof that the package is publish-correct and the agent-side entry is molstar-free.

**Files:**
- Modify: `package.json` (name, version, remove `private`, `exports`, `main`/`module`/`types`, `files`, `sideEffects`, `repository`/`homepage`/`bugs`/`keywords`, `license`, `publishConfig`, add `verify:package` script)
- Create: `scripts/assert-agent-side-molstar-free.mjs`
- Create: `scripts/smoke-dist.mjs`

**Interfaces:**
- Consumes: Task 1's `dist/index.js`, `dist/browser.js`, `.d.ts`, and the `build` script.
- Produces: the published package name `@abycloud-co-uk/van-der-view` with subpath `./browser` (consumed by Task 4's demo rename and Task 3's README), and `pnpm verify:package` (consumed by Task 3's workflow).

- [ ] **Step 1: Write the agent-side molstar-free guard**

Create `scripts/assert-agent-side-molstar-free.mjs`:

```js
// Static guard: the built agent-side entry (dist/index.js) and every chunk it
// statically imports must not import molstar. Turns the molstar-free invariant of
// the "." export into an executable gate. Run after `pnpm build`.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ENTRY = resolve('dist/index.js');
const seen = new Set();
const offenders = [];

/** All import/export specifiers in a chunk: static `from '...'`, bare `import '...'`, dynamic `import('...')`. */
function importSpecs(code) {
  const specs = [];
  for (const m of code.matchAll(/(?:\bimport\b|\bexport\b)[^'"`]*?\bfrom\s*['"]([^'"]+)['"]/g)) specs.push(m[1]);
  for (const m of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) specs.push(m[1]);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
  return specs;
}

function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = readFileSync(file, 'utf8');
  for (const spec of importSpecs(code)) {
    if (/^molstar(\/|$)/.test(spec)) offenders.push(`${file} → ${spec}`);
    else if (spec.startsWith('.')) walk(resolve(dirname(file), spec));
  }
}

walk(ENTRY);

if (offenders.length > 0) {
  console.error('✗ agent-side entry imports molstar:\n  ' + offenders.join('\n  '));
  process.exit(1);
}
console.log(`✓ agent-side entry is molstar-free (${seen.size} chunk(s) checked)`);
```

- [ ] **Step 2: Write the dist smoke import**

Create `scripts/smoke-dist.mjs`:

```js
// Smoke: the built agent-side entry imports cleanly in Node (no molstar present at
// runtime is fine — it must not be reached) and exposes the public agent surface.
import { strict as assert } from 'node:assert';

const mod = await import('../dist/index.js');
assert(Array.isArray(mod.commands) && mod.commands.length > 0, 'commands must be a non-empty array');
assert(mod.tools && mod.tools.anthropic, 'tools.anthropic must be present');
assert(typeof mod.adapters?.anthropic?.toCommand === 'function', 'adapters.anthropic.toCommand must be a function');
console.log(`✓ dist/index.js smoke OK (${mod.commands.length} commands, tools.anthropic present)`);
```

- [ ] **Step 3: Rewrite package.json public-contract fields**

Edit `package.json` so it has these fields (set `name`, `version`, `license`, `sideEffects`, `files`, `exports`, `main`/`module`/`types`, `repository`/`homepage`/`bugs`/`keywords`, `publishConfig`; **delete** `"private": true`; add `verify:package` to `scripts`). The non-dependency portion should read:

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
  "keywords": ["molstar", "molecular-visualization", "react", "llm", "ai-agent", "webxr", "headless", "protein", "3d"],
  "publishConfig": { "registry": "https://npm.pkg.github.com" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "build": "tsup",
    "prepublishOnly": "pnpm build",
    "verify:package": "pnpm build && publint && attw --pack --profile esm-only && node scripts/assert-agent-side-molstar-free.mjs && node scripts/smoke-dist.mjs"
  }
}
```
Keep the `devDependencies`/`peerDependencies`/`peerDependenciesMeta` from Task 1 unchanged.

- [ ] **Step 4: Run the molstar-free guard against the current build**

Run:
```bash
pnpm build && node scripts/assert-agent-side-molstar-free.mjs
```
Expected: `✓ agent-side entry is molstar-free (N chunk(s) checked)` and exit 0. (If it reports an offender, the agent-side import graph regressed — stop and fix before continuing.)

- [ ] **Step 5: Run the dist smoke**

Run:
```bash
node scripts/smoke-dist.mjs
```
Expected: `✓ dist/index.js smoke OK (N commands, tools.anthropic present)` and exit 0.

- [ ] **Step 6: Run the full package verification**

Run:
```bash
pnpm verify:package
```
Expected: build succeeds, `publint` reports no errors, `attw` reports no problems for both `.` and `./browser`, the molstar-free guard passes, the smoke passes.

Note for the implementer: confirm the installed `attw` accepts `--profile esm-only` (run `attw --help` and check the profile names). If this version spells it differently, use the matching value; if `attw` flags only the expected "package is ESM-only" informational rows, that is acceptable — a hard error is not.

- [ ] **Step 7: Confirm source gates still green**

Run:
```bash
pnpm test && pnpm typecheck
```
Expected: 116 tests pass; typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add package.json scripts/assert-agent-side-molstar-free.mjs scripts/smoke-dist.mjs
git commit -m "build: publishable package.json contract + verify:package gate"
```

---

### Task 3: publish path — Release workflow, .npmrc, README

Wire up publishing to GitHub Packages and document consumption. Nothing here publishes during this session — the actual publish is triggered by a GitHub Release.

**Files:**
- Create: `.npmrc`
- Create: `.github/workflows/publish.yml`
- Modify: `README.md` (add an Install section)

**Interfaces:**
- Consumes: Task 2's `verify:package` script and the scoped package name `@abycloud-co-uk/van-der-view`.

- [ ] **Step 1: Add the scope→registry mapping (no token)**

Create `.npmrc`:

```
@abycloud-co-uk:registry=https://npm.pkg.github.com
```
This maps the scope to GitHub Packages for publish/consume. No auth token is committed — it is injected by the workflow (and by consumers locally).

- [ ] **Step 2: Verify the .npmrc does not break local install**

Run:
```bash
pnpm install --frozen-lockfile && pnpm test
```
Expected: install succeeds (nothing in this repo resolves a published `@abycloud-co-uk/*` package — the demo uses an alias — so the scope mapping is inert locally); 116 tests pass.

- [ ] **Step 3: Create the Release-triggered publish workflow**

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to GitHub Packages

on:
  release:
    types: [published]

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://npm.pkg.github.com
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify:package
      - run: pnpm publish --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
The built-in `GITHUB_TOKEN` (with `packages: write`) authenticates the publish; no personal access token is needed. `verify:package` gates the publish.

- [ ] **Step 4: Sanity-check the workflow YAML parses**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/publish.yml')); print('workflow YAML OK')"
```
Expected: `workflow YAML OK`. (If `python3`/`pyyaml` is unavailable, instead visually confirm the indentation matches the block above — two-space nesting, `steps` a list under `jobs.publish`.)

- [ ] **Step 5: Add the Install section to the README**

Read `README.md`, then insert a `## Install` section immediately after the opening title/description paragraph and before any existing usage/quick-start section:

````markdown
## Install

Published to the org's **GitHub Packages** registry. In the consuming project add an
`.npmrc` mapping the scope to GitHub Packages and authenticating with a GitHub token
that has `read:packages`:

```
@abycloud-co-uk:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install (provide your own `molstar` and `react` peers for the browser entry):

```bash
npm install @abycloud-co-uk/van-der-view
```

- **Agent-side** (no molstar needed):
  `import { commands, tools, adapters } from '@abycloud-co-uk/van-der-view'`
- **Browser-side** (needs the `molstar` + `react`/`react-dom` peers):
  `import { MolViewProvider, MolViewCanvas, useMolView } from '@abycloud-co-uk/van-der-view/browser'`

> GitHub Packages' npm registry requires authentication even for public packages. A
> token-free public npm release is planned for a stable version.
````

- [ ] **Step 6: Commit**

```bash
git add .npmrc .github/workflows/publish.yml README.md
git commit -m "ci: Release-triggered GitHub Packages publish + install docs"
```

---

### Task 4: rename the demo to the scoped package name

Keep the demo aliasing TS source (fast iteration), but make it import the real published name so it doubles as a usage example.

**Files:**
- Modify: `examples/demo/vite.config.ts`
- Modify: `examples/demo/tsconfig.json`
- Modify: `examples/demo/src/**` import statements

**Interfaces:**
- Consumes: the package name `@abycloud-co-uk/van-der-view` and subpath `./browser` from Task 2.

- [ ] **Step 1: Rename the import specifiers in the demo source**

Run (from the repo root; macOS BSD `sed -i ''`):
```bash
grep -rl "from 'van-der-view" examples/demo/src \
  | xargs sed -i '' "s|from 'van-der-view|from '@abycloud-co-uk/van-der-view|g"
```
This rewrites both `from 'van-der-view'` and `from 'van-der-view/browser'` (the pattern has no closing quote, so it matches both) across `main.tsx`, `App.tsx`, `ui.tsx`, and `panels/*`.

- [ ] **Step 2: Verify every demo import was renamed**

Run:
```bash
grep -rn "van-der-view" examples/demo/src
```
Expected: every match now reads `@abycloud-co-uk/van-der-view` (or `@abycloud-co-uk/van-der-view/browser`); there are **no** bare `'van-der-view'` import specifiers left.

- [ ] **Step 3: Update the Vite alias keys**

Edit `examples/demo/vite.config.ts` `resolve.alias` so the `find` keys use the scoped name (keep `/browser` first for longest-match, keep the same `replacement` source paths):

```ts
    alias: [
      { find: '@abycloud-co-uk/van-der-view/browser', replacement: fileURLToPath(new URL('../../src/browser.ts', import.meta.url)) },
      { find: '@abycloud-co-uk/van-der-view', replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    ],
```

- [ ] **Step 4: Update the tsconfig path keys**

Edit `examples/demo/tsconfig.json` `compilerOptions.paths` keys to the scoped name (values unchanged):

```jsonc
    "paths": {
      "@abycloud-co-uk/van-der-view": ["../../src/index.ts"],
      "@abycloud-co-uk/van-der-view/browser": ["../../src/browser.ts"]
    }
```

- [ ] **Step 5: Typecheck and build the demo against the renamed alias**

Run:
```bash
cd examples/demo && pnpm typecheck && pnpm build && cd ../..
```
Expected: demo `tsc --noEmit` exits 0 and `vite build` succeeds — the scoped specifiers resolve to TS source via the alias + paths.

- [ ] **Step 6: Commit**

```bash
git add examples/demo/vite.config.ts examples/demo/tsconfig.json examples/demo/src
git commit -m "demo: import the scoped package name @abycloud-co-uk/van-der-view"
```

---

## Final verification (whole branch, before PR)

Run all gates together from the repo root:
```bash
pnpm test && pnpm typecheck && pnpm verify:package && (cd examples/demo && pnpm typecheck && pnpm build)
```
Expected: 116 tests pass; root typecheck clean; `verify:package` passes (build + publint + attw + molstar-free guard + smoke); demo typechecks and builds.

Then dispatch the final whole-branch code review, and finish via superpowers:finishing-a-development-branch → Push + PR (the established pattern for this repo; the user merges). The actual GitHub Packages publish happens later when the user creates a Release.

## Out of scope (do not build)

Public npm publish (deferred to a stable version); dual CJS/ESM output; bundling molstar/react into `dist`; push-triggered CI (only the Release-triggered publish workflow); changesets/automated versioning; typedoc/API docs site; the demo consuming `dist` (it keeps the TS-source alias).
