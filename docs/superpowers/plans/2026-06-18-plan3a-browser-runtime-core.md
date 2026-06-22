# Plan 3a — Browser Runtime Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make van-der-view drive a real Mol\* instance in a real React app — a `<MolViewProvider>`/`<MolViewCanvas/>`/`useMolView()` mount, the live `ExecutorContext` adapter over Mol\*'s managers, the finished simple v1 commands, and XR state/events — with an SSR smoke test plus Node unit tests for everything off the GPU.

**Architecture:** A new `src/mol/` layer implements the Plan-2 `ExecutorContext` port against live Mol\* managers/builders (`adapter.ts`), wraps `canvas3d.xr` (`xr.ts`), and owns the plugin lifecycle (`create-mol-view.ts`). A new `src/react/` layer mounts it client-only: the React files carry **no static molstar import** — `canvas.tsx` lazy-`import()`s the mol layer inside `useEffect`, so the server bundle stays molstar-free (the SSR guard from `wiki/pages/headless-react.md`). The molstar-free agent-side barrel `src/index.ts` is untouched; the new molstar/React surface lives behind `src/browser.ts`.

**Tech Stack:** TypeScript (strict, `moduleResolution: Bundler`, extensionless relative imports), Mol\* `^5.10.1`, React `^19` (peer dep), Vitest (`node` + per-file `jsdom`). No build step yet (tests run on TS source); packaging is a later phase.

---

## Background the implementer needs

- The executor (`src/executor.ts`) is provider-agnostic and drives a high-level **port** `ExecutorContext` (`src/context.ts`). Plan 2 tested it against a **fake** port. 3a writes the **real** port impl over Mol\*.
- `ExecutorContext` (current, `src/context.ts`): `getStructure(): Structure | undefined`, `loadStructure(resolved): Promise<void>`, `highlight(loci): void`, `clearHighlight(): void`, `focus(loci, options?): void`, `resetCamera(): void`, `getSceneContext(): SceneContext`. `FocusOptions { durationMs?: number }`. `SceneContext { loaded: boolean; structures: { chains: string[] }[] }`.
- `ResolvedStructure` (`src/resolve-structure.ts`): `{ data?: string; url?: string; format: 'mmcif' | 'pdb'; isBinary?: boolean }`.
- **Verified Mol\* `^5.10.1` signatures** (checked against `node_modules/molstar/lib/**/*.d.ts` while writing this plan — do not re-derive, but a one-line re-check before use is cheap insurance):
  - `new PluginContext(DefaultPluginSpec())`; `await plugin.init(): Promise<void>`; `await plugin.initViewerAsync(canvas: HTMLCanvasElement, container: HTMLDivElement, canvas3dContext?): Promise<boolean>`; `plugin.dispose(options?): void`; `readonly canvas3d: Canvas3D | undefined` (`mol-plugin/context.d.ts`).
  - `plugin.canvas3d.xr` = `{ request(): Promise<void>; end(): Promise<void>; readonly isSupported: BehaviorSubject<boolean>; readonly isPresenting: BehaviorSubject<boolean>; readonly requestFailed: Subject<string> }` (`mol-canvas3d/canvas3d.d.ts:753`). Read state via `.value`; subscribe via `.subscribe(cb)` → returns a subscription with `.unsubscribe()`.
  - `plugin.builders.data.download({ url, isBinary? }, options?)` / `plugin.builders.data.rawData({ data })` (`mol-plugin-state/builder/data.d.ts`).
  - `plugin.builders.structure.parseTrajectory(data, format)` where `format` accepts `'mmcif'` and `'pdb'` (`mol-plugin-state/builder/structure.d.ts`).
  - `plugin.builders.structure.hierarchy.applyPreset(traj, 'default')` (`mol-plugin-state/builder/structure/hierarchy.d.ts`).
  - `plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data` → `Structure | undefined` (`mol-plugin-state/manager/structure/hierarchy-state.d.ts`).
  - `plugin.managers.interactivity.lociHighlights.highlightOnly({ loci })` (the arg is a `Representation.Loci` = `{ loci: Loci; repr? }`; `repr` optional) and `.clearHighlights()` (`mol-plugin-state/manager/interactivity.d.ts:99,101`).
  - `plugin.managers.camera.focusLoci(loci, options?)` where options include `durationMs`, `extraRadius`, `minRadius`, `zoomOut`, … (`mol-plugin-state/manager/camera.d.ts:48`). **For the v1 "zoom out a bit further" boolean, set `extraRadius` (≈8 Å), NOT the `zoomOut` field** — `zoomOut` is a fly-in animation toggle, `extraRadius` widens the final framed sphere. `plugin.managers.camera.reset()` (`camera.d.ts:69`).
  - **Preset selectors are pure-Node** (no plugin/canvas/WebGL/async) for the 7 v1 presets: `StructureSelectionQueries.<name>.query(new QueryContext(structure))` → `StructureSelection.toLociWithSourceUnits(sel)`. `StructureSelectionQueries` from `mol-plugin-state/helpers/structure-selection-query`; `QueryContext`/`StructureSelection` from `mol-model/structure`. The 7 names (`all`/`polymer`/`protein`/`nucleic`/`ligand`/`ion`/`water`) carry no `ensureCustomProperties`, so `.query` is safe to run headless. (Only `helix`/`beta` would need the plugin — not ours.)
  - Enumerate chain ids from a `Structure`: iterate `structure.units`, read `StructureProperties.chain.auth_asym_id(location)` per unit (`mol-model/structure/structure/properties.d.ts:49`).

- **SSR rule (do not violate):** `src/react/*.tsx` and `src/react/*.ts` must not statically `import` anything from `src/mol/*` or `molstar` **as a value**. Type-only `import type` is fine (erased). `canvas.tsx` reaches the mol layer via `await import('../mol/create-mol-view')` **inside `useEffect`**.

---

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `package.json` | Modify | add react/react-dom peer + dev deps, jsdom dev dep |
| `tsconfig.json` | Modify | add `"jsx": "react-jsx"` |
| `src/commands.ts` | Modify | drop `highlight.style` (→ v1.1); `focus.zoomOut` number → boolean |
| `src/context.ts` | Modify | `FocusOptions += zoomOut?: boolean` |
| `src/executor.ts` | Modify | forward `zoomOut` into focus options |
| `src/selection.ts` | Modify | real preset selectors (replace `unsupported_selection`) |
| `src/mol/adapter.ts` | Create | `molstarExecutorContext(plugin): ExecutorContext` |
| `src/mol/xr.ts` | Create | `createXrApi(plugin): MolViewXR` |
| `src/mol/create-mol-view.ts` | Create | `createMolView(opts): Promise<MolView>` + `MolView`/`CreateMolViewOptions` types |
| `src/react/provider.tsx` | Create | `<MolViewProvider>` + context + `MolViewConfig` |
| `src/react/canvas.tsx` | Create | `<MolViewCanvas/>` (style-forwarding; lazy mount/dispose) |
| `src/react/use-mol-view.ts` | Create | `useMolView(): MolView \| undefined` |
| `src/browser.ts` | Create | molstar/React barrel (NOT re-exported from `src/index.ts`) |
| `test/fixtures/structures.ts` | Modify | add a HETATM fixture (ligand + water + ion) |
| `test/commands.test.ts` | Modify | style absent / zoomOut boolean |
| `test/executor.test.ts` | Modify | zoomOut forwarding; preset now supported |
| `test/selection.test.ts` | Modify | preset positive/empty tests |
| `test/xr.test.ts` | Create | XR wrapper unit tests (stub plugin) |
| `test/ssr.test.tsx` | Create | SSR `renderToString` smoke (jsdom) |

**Testability note (read once):** `adapter.ts`, `create-mol-view.ts`, and the React components touch the GPU/plugin and are **not** unit-testable in Node; they are gated by `pnpm typecheck` + code review, and verified by hand in **Plan 3b** (the Vite demo). The genuinely automated 3a tests are: the schema/executor/selection changes (Tasks 2–4), the XR wrappers via a stub (Task 6), and the SSR smoke (Task 9). This split is the locked testing strategy (`wiki/pages/testing-strategy.md`): automate off the GPU, verify rendering by hand.

---

## Task 1: Dependencies & TS/test config

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Install React + jsdom dev deps**

Run:
```bash
pnpm add -D react@^19 react-dom@^19 @types/react@^19 @types/react-dom@^19 jsdom
```
Expected: installs cleanly (the `@scarf/scarf` build gate in `pnpm-workspace.yaml` already keeps install green).

- [ ] **Step 2: Add React as a peer dependency**

Edit `package.json` — add a `peerDependencies` block (consumers provide React; we dev-install it for tests):
```json
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  },
```
Place it as a sibling of `"dependencies"`. Leave `"molstar": "^5.10.1"` in `dependencies` as-is.

- [ ] **Step 3: Enable JSX in tsconfig**

Edit `tsconfig.json` `compilerOptions` — add:
```json
    "jsx": "react-jsx",
```
(Keep everything else: `strict`, `moduleResolution: "Bundler"`, `lib: ["ES2022","DOM"]`, etc.)

- [ ] **Step 4: Verify the toolchain is still green**

Run: `pnpm typecheck && pnpm test`
Expected: `tsc` exits 0; Vitest shows the existing **73 passing** tests (no .tsx files exist yet, so nothing new runs).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json
git commit -m "$(cat <<'EOF'
chore(plan3a): add react/react-dom peer deps, jsdom, jsx tsconfig

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Schema cleanup — drop `highlight.style`, retype `focus.zoomOut`

The v1 executor never consumed `highlight.style` and only forwarded `focus.durationMs`. Stop advertising `style` to the LLM (it moves to the v1.1 representation cluster), and make `focus.zoomOut` a boolean (its real semantics: "frame a bit wider").

**Files:**
- Modify: `src/commands.ts`
- Modify: `test/commands.test.ts:62-65`

- [ ] **Step 1: Update the failing tests first**

In `test/commands.test.ts`, **replace** the `'exposes the v1 style param on highlight'` test (lines 62–65) with:
```ts
  it('does not advertise highlight.style in v1 (deferred to the v1.1 representation cluster)', () => {
    const highlight = VDV_COMMANDS.find((c) => c.name === 'highlight');
    expect(highlight?.inputSchema.properties).not.toHaveProperty('style');
  });

  it('types focus.zoomOut as a boolean', () => {
    const focus = VDV_COMMANDS.find((c) => c.name === 'focus');
    expect((focus?.inputSchema.properties.zoomOut as { type: string }).type).toBe('boolean');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- commands`
Expected: FAIL — `style` is still present; `zoomOut.type` is currently `'number'`.

- [ ] **Step 3: Edit `src/commands.ts`**

Delete the `styleSchema` const (lines 37–47) entirely. In the `highlight` command, change its `inputSchema.properties` from `{ selection: selectionSchema, style: styleSchema }` to:
```ts
      properties: { selection: selectionSchema },
```
In the `focus` command, change the `zoomOut` property to a boolean:
```ts
        zoomOut: { type: 'boolean', description: 'Frame the selection a bit wider (extra camera pull-back).' },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- commands`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: green (still 73 tests; two highlight/focus assertions changed in place).

- [ ] **Step 6: Commit**

```bash
git add src/commands.ts test/commands.test.ts
git commit -m "$(cat <<'EOF'
feat(plan3a): drop highlight.style from v1 schema, type focus.zoomOut as boolean

highlight.style moves to the v1.1 representation cluster (overlaps
color/set-representation); the v1 executor never consumed it. zoomOut is a
boolean "frame wider" flag, mapped to camera extraRadius in the adapter.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Forward `focus.zoomOut` through the port

**Files:**
- Modify: `src/context.ts:5-7`
- Modify: `src/executor.ts:61-69`
- Modify: `test/executor.test.ts`

- [ ] **Step 1: Write the failing tests**

In `test/executor.test.ts`, inside the `describe('createExecutor — highlight/focus', …)` block, add:
```ts
  it('forwards focus.zoomOut as a boolean focus option', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'focus',
      input: { selection: { chain: 'A' }, zoomOut: true },
    });
    expect(res.ok).toBe(true);
    const [, opts] = (ctx.focus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts).toEqual({ zoomOut: true });
  });

  it('forwards both durationMs and zoomOut when given', async () => {
    const ctx = fakeContext();
    await createExecutor(ctx).dispatch({
      name: 'focus',
      input: { selection: { chain: 'A' }, durationMs: 250, zoomOut: true },
    });
    const [, opts] = (ctx.focus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts).toEqual({ durationMs: 250, zoomOut: true });
  });

  it('ignores a non-boolean zoomOut', async () => {
    const ctx = fakeContext();
    await createExecutor(ctx).dispatch({
      name: 'focus',
      input: { selection: { chain: 'A' }, zoomOut: 'yes' },
    });
    const [, opts] = (ctx.focus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts).toBeUndefined();
  });
```
(The existing `'focuses … passing durationMs through'` test asserts `opts` equals `{ durationMs: 250 }` and the hardening test asserts `opts` is `undefined` when nothing is supplied — both must still pass after this change.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- executor`
Expected: FAIL — `zoomOut` is currently dropped, so the new `opts` assertions don't match.

- [ ] **Step 3: Extend `FocusOptions` in `src/context.ts`**

```ts
/** Camera focus options (subset surfaced to the agent). */
export interface FocusOptions {
  durationMs?: number;
  zoomOut?: boolean;
}
```

- [ ] **Step 4: Forward `zoomOut` in `src/executor.ts`**

Replace the `focus` case body (lines 61–69) with:
```ts
        case 'focus': {
          const input = asObject(command.input);
          const loci = lociFor(ctx, requireSelection(input));
          if (StructureElement.Loci.isEmpty(loci)) return fail('empty_selection', 'selection matched no atoms.');
          const focusOptions: FocusOptions = {};
          if (typeof input.durationMs === 'number') focusOptions.durationMs = input.durationMs;
          if (typeof input.zoomOut === 'boolean') focusOptions.zoomOut = input.zoomOut;
          ctx.focus(loci, Object.keys(focusOptions).length > 0 ? focusOptions : undefined);
          return ok();
        }
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test -- executor`
Expected: PASS (new tests green; the existing `{ durationMs: 250 }` and `undefined` assertions still hold).

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/context.ts src/executor.ts test/executor.test.ts
git commit -m "$(cat <<'EOF'
feat(plan3a): forward focus.zoomOut through the executor port

FocusOptions gains zoomOut?: boolean; the executor forwards durationMs and/or
zoomOut, omitting the options object entirely when neither is supplied.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Real preset selectors

Replace the `unsupported_selection` stub in `resolveSelection` with real Mol\* preset queries, pure-Node-evaluated. Unknown preset still → `invalid_selection`; a known preset that matches nothing returns an empty loci (the executor turns that into `empty_selection`, as it already does for chain/residue selectors).

**Files:**
- Modify: `src/selection.ts:1-5,40-49`
- Modify: `test/fixtures/structures.ts` (add a HETATM fixture)
- Modify: `test/selection.test.ts`
- Modify: `test/executor.test.ts:98-105`

- [ ] **Step 1: Add a HETATM fixture**

Append to `test/fixtures/structures.ts`:
```ts
/**
 * 7 atoms, chain A: GLY (protein, 3) + HOH (water, 1) + NA (ion, 1) + LIG (ligand, 2).
 * Lets preset selectors assert positive water/ion/ligand matches that 1CRN/PDB_TINY lack.
 */
export const PDB_HET = `HEADER    HET FIXTURE
ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00  0.00           N
ATOM      2  CA  GLY A   1       1.000   0.000   0.000  1.00  0.00           C
ATOM      3  C   GLY A   1       2.000   0.000   0.000  1.00  0.00           C
HETATM    4  O   HOH A   2       5.000   0.000   0.000  1.00  0.00           O
HETATM    5 NA   NA  A   3       7.000   0.000   0.000  1.00  0.00          NA
HETATM    6  C1  LIG A   4       9.000   0.000   0.000  1.00  0.00           C
HETATM    7  C2  LIG A   4      10.000   0.000   0.000  1.00  0.00           C
END
`;
```

- [ ] **Step 2: Write the preset tests (selection)**

In `test/selection.test.ts`:

(a) add `PDB_HET` to the fixture import and build it in `beforeAll`:
```ts
import {
  MMCIF_AUTH_LABEL,
  PDB_TINY,
  PDB_HET,
  buildStructureFromMmCIF,
  buildStructureFromPDB,
} from './fixtures/structures';
```
```ts
let het: Structure;
beforeAll(async () => {
  pdb = await buildStructureFromPDB(PDB_TINY);
  cif = await buildStructureFromMmCIF(MMCIF_AUTH_LABEL);
  het = await buildStructureFromPDB(PDB_HET);
});
```

(b) **Delete** the test `'throws SelectionError for preset selectors (not yet supported)'` (the `{ preset: 'ligand' }` → throw test in the `guards` describe).

(c) **Replace** the test `'distinguishes an unknown preset (invalid) from a valid-but-unsupported one'` with:
```ts
  it('throws invalid_selection for an unknown preset', () => {
    const codeOf = (fn: () => unknown): string => {
      try { fn(); } catch (e) { return (e as SelectionError).code; }
      throw new Error('expected resolveSelection to throw');
    };
    expect(codeOf(() => resolveSelection({ preset: 'bogus' } as any, pdb))).toBe('invalid_selection');
  });
```

(d) add a new describe for preset resolution:
```ts
describe('resolveSelection — presets', () => {
  it('selects everything with the "all" preset', () => {
    expect(size(resolveSelection({ preset: 'all' }, pdb))).toBe(10);
  });

  it('selects protein/polymer on an all-protein structure', () => {
    expect(empty(resolveSelection({ preset: 'protein' }, pdb))).toBe(false);
    expect(empty(resolveSelection({ preset: 'polymer' }, pdb))).toBe(false);
  });

  it('returns empty for absent categories on an all-protein structure', () => {
    expect(empty(resolveSelection({ preset: 'nucleic' }, pdb))).toBe(true);
    expect(empty(resolveSelection({ preset: 'water' }, pdb))).toBe(true);
    expect(empty(resolveSelection({ preset: 'ligand' }, pdb))).toBe(true);
    expect(empty(resolveSelection({ preset: 'ion' }, pdb))).toBe(true);
  });

  it('selects water/ligand/ion on a HETATM-bearing structure', () => {
    expect(empty(resolveSelection({ preset: 'water' }, het))).toBe(false);
    expect(empty(resolveSelection({ preset: 'ligand' }, het))).toBe(false);
    expect(empty(resolveSelection({ preset: 'ion' }, het))).toBe(false);
  });
});
```
**Note on assertions:** the het-category tests use `empty(...) === false` (not exact counts) because Mol\*'s entity classification of a synthetic PDB is a heuristic. If the first run shows a category misclassified (e.g. the lone GLY not treated as polymer, or `NA`/`LIG` not landing in ion/ligand), **do not fight the classifier**: adjust the fixture toward canonical names (`HOH` for water is reliable) and, if a category genuinely can't be produced from a tiny fixture, lock that one assertion to the observed result and leave a code comment explaining it. The `all`/`protein`/`polymer`/`nucleic` assertions on `PDB_TINY` (pure ATOM amino acids) are expected stable.

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test -- selection`
Expected: FAIL — `resolveSelection` still throws `unsupported_selection` for any preset.

- [ ] **Step 4: Implement preset selectors in `src/selection.ts`**

Add imports (top of file):
```ts
import { QueryContext } from 'molstar/lib/mol-model/structure';
import { StructureSelectionQueries } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import type { SelectionPreset } from './types';
```
(Keep the existing `Script`, `Structure`/`StructureElement`/`StructureSelection`, types, `NUMBERINGS`/`SELECTION_PRESETS`, `SelectionError` imports.)

Add a preset→query map above `resolveSelection`:
```ts
/** The 7 v1 presets → Mol*'s own selection queries. All are pure (no plugin/WebGL/async). */
const PRESET_QUERIES: Record<SelectionPreset, { query: (ctx: QueryContext) => StructureSelection }> = {
  all: StructureSelectionQueries.all,
  polymer: StructureSelectionQueries.polymer,
  protein: StructureSelectionQueries.protein,
  nucleic: StructureSelectionQueries.nucleic,
  ligand: StructureSelectionQueries.ligand,
  ion: StructureSelectionQueries.ion,
  water: StructureSelectionQueries.water,
};
```
Replace the preset branch in `resolveSelection` (lines 41–49) with:
```ts
  if (selection.preset !== undefined) {
    if (!SELECTION_PRESETS.includes(selection.preset)) {
      throw new SelectionError('invalid_selection', `unknown selection preset "${String(selection.preset)}".`);
    }
    const sel = PRESET_QUERIES[selection.preset].query(new QueryContext(structure));
    return StructureSelection.toLociWithSourceUnits(sel);
  }
```
(`StructureSelection` is already imported.)

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test -- selection`
Expected: PASS. If the import of `mol-plugin-state/helpers/structure-selection-query` fails to load in Node, or a query throws headless, **fall back to hand-written MolScript** (pure `mol-script`, no plugin-state import) — replace `PRESET_QUERIES` with an expression map built from `MolScriptBuilder as MS` and resolve via `Script.getStructureSelection(expr, structure)`. Verbatim expressions (transcribed from molstar source) for `all`/`polymer`/`protein`/`nucleic`/`water`/`ion`:
```ts
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
const PRESET_EXPR = {
  all:     MS.struct.generator.all(),
  polymer: MS.struct.modifier.union([ MS.struct.generator.atomGroups({ 'entity-test': MS.core.logic.and([
    MS.core.rel.eq([MS.ammp('entityType'), 'polymer']),
    MS.core.str.match([ MS.re('(polypeptide|cyclic-pseudo-peptide|peptide-like|nucleotide|peptide nucleic acid)','i'), MS.ammp('entitySubtype') ]) ]) }) ]),
  protein: MS.struct.modifier.union([ MS.struct.generator.atomGroups({ 'entity-test': MS.core.logic.and([
    MS.core.rel.eq([MS.ammp('entityType'), 'polymer']),
    MS.core.str.match([ MS.re('(polypeptide|cyclic-pseudo-peptide|peptide-like)','i'), MS.ammp('entitySubtype') ]) ]) }) ]),
  nucleic: MS.struct.modifier.union([ MS.struct.generator.atomGroups({ 'entity-test': MS.core.logic.and([
    MS.core.rel.eq([MS.ammp('entityType'), 'polymer']),
    MS.core.str.match([ MS.re('(nucleotide|peptide nucleic acid)','i'), MS.ammp('entitySubtype') ]) ]) }) ]),
  water:   MS.struct.modifier.union([ MS.struct.generator.atomGroups({ 'entity-test': MS.core.rel.eq([MS.ammp('entityType'), 'water']) }) ]),
  ion:     MS.struct.modifier.union([ MS.struct.generator.atomGroups({ 'entity-test': MS.core.rel.eq([MS.ammp('entitySubtype'), 'ion']) }) ]),
};
```
For `ligand` in the fallback, prefer `StructureSelectionQueries.ligand.expression` (its definition uses set combinators that are error-prone to retype) resolved via `Script.getStructureSelection(StructureSelectionQueries.ligand.expression, structure)` — i.e. reuse the expression even if you hand-roll the others. Document in a code comment which path (query reuse vs hand-rolled) you landed on and why.

- [ ] **Step 6: Update the executor preset test**

In `test/executor.test.ts`, **replace** the test `'surfaces unsupported_selection from preset selectors'` (lines 98–105) with:
```ts
  it('resolves a supported preset selection via the port', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { preset: 'protein' } },
    });
    expect(res.ok).toBe(true);
    expect(ctx.highlight).toHaveBeenCalledOnce();
  });

  it('returns empty_selection for a preset that matches nothing', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { preset: 'ligand' } }, // PDB_TINY has no ligand
    });
    expect(errorOf(res).code).toBe('empty_selection');
  });
```
(The executor test's `structure` is built from `PDB_TINY` — all protein, no ligand — so `protein` matches and `ligand` is empty.)

- [ ] **Step 7: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: green. Note the new total test count for the PR description.

- [ ] **Step 8: Commit**

```bash
git add src/selection.ts test/fixtures/structures.ts test/selection.test.ts test/executor.test.ts
git commit -m "$(cat <<'EOF'
feat(plan3a): real preset selectors (all/polymer/protein/nucleic/ligand/ion/water)

resolveSelection now resolves the 7 v1 presets via Mol*'s own pure-Node selection
queries instead of returning unsupported_selection. Unknown preset still ->
invalid_selection; a preset matching nothing -> empty loci (-> empty_selection at
the executor). Adds a HETATM fixture for positive water/ligand/ion coverage.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The real Mol\* adapter

`molstarExecutorContext(plugin)` implements the 7-member `ExecutorContext` port over live Mol\* managers/builders. **No Node unit test** (needs the plugin/GPU) — gated by `pnpm typecheck`, reviewed for signature correctness, and verified by hand in 3b.

**Files:**
- Create: `src/mol/adapter.ts`

- [ ] **Step 1: Write `src/mol/adapter.ts`**

```ts
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type { ExecutorContext, FocusOptions, SceneContext } from '../context';
import type { ResolvedStructure } from '../resolve-structure';

/** Extra camera pull-back (Å) applied when a focus command sets zoomOut. */
const ZOOM_OUT_EXTRA_RADIUS = 8;

/** Distinct chain ids (auth) of a Structure, in first-seen order. */
function chainsOf(structure: Structure): string[] {
  const seen = new Set<string>();
  const loc = StructureElement.Location.create(structure);
  for (const unit of structure.units) {
    loc.unit = unit;
    loc.element = unit.elements[0];
    seen.add(StructureProperties.chain.auth_asym_id(loc));
  }
  return [...seen];
}

/**
 * The real ExecutorContext: drives a live Mol* plugin behind the Plan-2 port, so
 * the provider-agnostic executor never touches Mol* managers directly.
 */
export function molstarExecutorContext(plugin: PluginContext): ExecutorContext {
  const getStructure = (): Structure | undefined =>
    plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;

  return {
    getStructure,

    async loadStructure(resolved: ResolvedStructure): Promise<void> {
      const data =
        resolved.url !== undefined
          ? await plugin.builders.data.download(
              { url: resolved.url, isBinary: resolved.isBinary },
              { state: { isGhost: true } },
            )
          : await plugin.builders.data.rawData({ data: resolved.data! });
      const trajectory = await plugin.builders.structure.parseTrajectory(data, resolved.format);
      await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');
    },

    highlight(loci) {
      plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
    },

    clearHighlight() {
      plugin.managers.interactivity.lociHighlights.clearHighlights();
    },

    focus(loci, options?: FocusOptions) {
      plugin.managers.camera.focusLoci(loci, {
        durationMs: options?.durationMs,
        extraRadius: options?.zoomOut ? ZOOM_OUT_EXTRA_RADIUS : 0,
      });
    },

    resetCamera() {
      plugin.managers.camera.reset();
    },

    getSceneContext(): SceneContext {
      const structures = plugin.managers.structure.hierarchy.current.structures;
      return {
        loaded: structures.length > 0,
        structures: structures
          .map((ref) => ref.cell.obj?.data)
          .filter((s): s is Structure => s !== undefined)
          .map((s) => ({ chains: chainsOf(s) })),
      };
    },
  };
}
```

- [ ] **Step 2: Verify the two less-certain signatures**

Grep the installed types to confirm before trusting the code:
```bash
grep -rn "Location" node_modules/molstar/lib/mol-model/structure/structure/element/location.d.ts | head
grep -rn "auth_asym_id" node_modules/molstar/lib/mol-model/structure/structure/properties.d.ts
```
Expected: `StructureElement.Location.create(structure?, unit?, element?)` exists and `StructureProperties.chain.auth_asym_id` is a `Property<string>`. If `Location.create`'s shape differs, adapt the `chainsOf` loop accordingly (the goal — distinct `auth_asym_id` per unit — is unchanged).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0. (`focusLoci` takes a `Partial<options>`, so passing `durationMs: undefined` is valid.) If `download`'s `options` arg rejects `{ state: { isGhost: true } }`, drop the second arg — it is a cosmetic state-tree flag, not load-critical.

- [ ] **Step 4: Run the suite (no new tests, must stay green)**

Run: `pnpm test`
Expected: green (adapter has no unit test; it must not break compilation of the suite).

- [ ] **Step 5: Commit**

```bash
git add src/mol/adapter.ts
git commit -m "$(cat <<'EOF'
feat(plan3a): real ExecutorContext adapter over live Mol* managers

molstarExecutorContext wires the 7-member port to builders.data/structure,
interactivity.lociHighlights, and managers.camera; zoomOut maps to camera
extraRadius. Typecheck-gated; rendered behavior verified by hand in Plan 3b.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: XR wrappers

Thin, null-safe wrappers over `plugin.canvas3d.xr` so a host can read XR state and subscribe without the `viewer.plugin` escape hatch. **Unit-tested in Node with a stub plugin** (no real canvas3d needed).

**Files:**
- Create: `src/mol/xr.ts`
- Create: `test/xr.test.ts`

- [ ] **Step 1: Write the failing test**

`test/xr.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createXrApi } from '../src/mol/xr';

/** A stub canvas3d.xr with controllable BehaviorSubject-like state. */
function fakeXr(supported: boolean, presenting: boolean) {
  const subs = new Set<(b: boolean) => void>();
  return {
    isSupported: { value: supported, subscribe: () => ({ unsubscribe() {} }) },
    isPresenting: {
      value: presenting,
      subscribe: (cb: (b: boolean) => void) => {
        subs.add(cb);
        return { unsubscribe: () => subs.delete(cb) };
      },
    },
    request: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    requestFailed: { subscribe: () => ({ unsubscribe() {} }) },
    _fire: (b: boolean) => subs.forEach((cb) => cb(b)),
  };
}

describe('createXrApi — no canvas3d yet', () => {
  const xr = createXrApi({ canvas3d: undefined } as any);
  it('reports unsupported / not presenting without throwing', () => {
    expect(xr.isSupported()).toBe(false);
    expect(xr.isPresenting()).toBe(false);
  });
  it('request/end resolve as no-ops', async () => {
    await expect(xr.request()).resolves.toBeUndefined();
    await expect(xr.end()).resolves.toBeUndefined();
  });
  it('subscribe returns a no-op unsubscribe', () => {
    const off = xr.subscribe(() => {});
    expect(() => off()).not.toThrow();
  });
});

describe('createXrApi — with canvas3d.xr', () => {
  it('reads state, forwards request/end, and streams isPresenting', async () => {
    const x = fakeXr(true, false);
    const xr = createXrApi({ canvas3d: { xr: x } } as any);
    expect(xr.isSupported()).toBe(true);
    expect(xr.isPresenting()).toBe(false);

    await xr.request();
    expect(x.request).toHaveBeenCalledOnce();
    await xr.end();
    expect(x.end).toHaveBeenCalledOnce();

    const seen: boolean[] = [];
    const off = xr.subscribe((b) => seen.push(b));
    x._fire(true);
    off();
    x._fire(false); // ignored after unsubscribe
    expect(seen).toEqual([true]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- xr`
Expected: FAIL — `src/mol/xr.ts` does not exist.

- [ ] **Step 3: Write `src/mol/xr.ts`**

```ts
import type { PluginContext } from 'molstar/lib/mol-plugin/context';

/** Host-facing XR state/control — thin wrappers over plugin.canvas3d.xr. */
export interface MolViewXR {
  isSupported(): boolean;
  isPresenting(): boolean;
  request(): Promise<void>; // must be called from a real user gesture (WebXR rule)
  end(): Promise<void>;
  subscribe(cb: (presenting: boolean) => void): () => void;
}

/**
 * Wrap a plugin's XR manager. canvas3d only exists after initViewerAsync, so every
 * accessor is null-safe: before init (or where XR is absent) state reads false and
 * controls are no-ops.
 */
export function createXrApi(plugin: PluginContext): MolViewXR {
  const xr = () => plugin.canvas3d?.xr;
  return {
    isSupported: () => xr()?.isSupported.value ?? false,
    isPresenting: () => xr()?.isPresenting.value ?? false,
    request: async () => { await xr()?.request(); },
    end: async () => { await xr()?.end(); },
    subscribe: (cb) => {
      const sub = xr()?.isPresenting.subscribe(cb);
      return () => sub?.unsubscribe();
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- xr`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/mol/xr.ts test/xr.test.ts
git commit -m "$(cat <<'EOF'
feat(plan3a): null-safe XR wrappers over canvas3d.xr

createXrApi exposes isSupported/isPresenting/request/end/subscribe; safe before
initViewerAsync (canvas3d undefined) — state reads false, controls no-op. Unit
tested with a stub plugin.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `createMolView` — the imperative core

Owns the plugin lifecycle (create+init+dispose, or attach to a host plugin and never dispose it), and assembles the executor + adapter + XR into a `MolView`. **No Node unit test** (init needs WebGL) — typecheck-gated; verified by hand in 3b.

**Files:**
- Create: `src/mol/create-mol-view.ts`

- [ ] **Step 1: Write `src/mol/create-mol-view.ts`**

```ts
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { DefaultPluginSpec } from 'molstar/lib/mol-plugin/spec';
import type { Command, CommandResult } from '../types';
import type { SceneContext } from '../context';
import type { ResolveStructure } from '../resolve-structure';
import { createExecutor } from '../executor';
import { molstarExecutorContext } from './adapter';
import { createXrApi, type MolViewXR } from './xr';

export interface CreateMolViewOptions {
  /** Canvas to render into. Required unless an already-initialized `plugin` is given. */
  canvas?: HTMLCanvasElement;
  /** Container the canvas fills (sized by the host via CSS). Required unless `plugin` is given. */
  container?: HTMLDivElement;
  /** Attach to a plugin the host already mounted; van-der-view will NOT dispose it. */
  plugin?: PluginContext;
  /** Host hook to fetch auth-protected / internal structures. Defaults to RCSB/url/inline. */
  resolveStructure?: ResolveStructure;
}

/** The mounted viewer handle returned to the host. */
export interface MolView {
  dispatch(command: Command): Promise<CommandResult>;
  getSceneContext(): SceneContext;
  clearHighlight(): void;
  xr: MolViewXR;
  /** Escape hatch: the underlying Mol* plugin. */
  plugin: PluginContext;
  /** Re-fit the canvas after a container resize (ResizeObserver covers the common cases). */
  handleResize(): void;
  /** Dispose the plugin — only if van-der-view created it (a host-provided plugin is left alone). */
  dispose(): void;
}

/**
 * Create (or attach to) a Mol* plugin and wire it to the provider-agnostic executor.
 * Pure imperative core — the React layer (canvas.tsx) calls this inside useEffect.
 */
export async function createMolView(opts: CreateMolViewOptions): Promise<MolView> {
  const ownsPlugin = opts.plugin === undefined;
  let plugin = opts.plugin;
  if (plugin === undefined) {
    if (!opts.canvas || !opts.container) {
      throw new Error('createMolView requires { canvas, container } unless an initialized plugin is provided.');
    }
    plugin = new PluginContext(DefaultPluginSpec());
    await plugin.init();
    await plugin.initViewerAsync(opts.canvas, opts.container);
  }

  const ctx = molstarExecutorContext(plugin);
  const { dispatch } = createExecutor(ctx, { resolveStructure: opts.resolveStructure });
  const xr = createXrApi(plugin);
  const bound = plugin;

  return {
    dispatch,
    getSceneContext: () => ctx.getSceneContext(),
    clearHighlight: () => ctx.clearHighlight(),
    xr,
    plugin: bound,
    handleResize: () => bound.canvas3d?.handleResize(),
    dispose: () => {
      if (ownsPlugin) bound.dispose();
    },
  };
}
```

- [ ] **Step 2: Verify `canvas3d.handleResize`**

Run: `grep -rn "handleResize" node_modules/molstar/lib/mol-canvas3d/canvas3d.d.ts`
Expected: a `handleResize(): void` member on `Canvas3D`. If the name differs, use the actual resize method (the intent is "tell Mol\* the container changed size"); if none exists, make `handleResize` a no-op and note it for the 3b demo.

- [ ] **Step 3: Typecheck + suite**

Run: `pnpm typecheck && pnpm test`
Expected: green (no new tests; must compile).

- [ ] **Step 4: Commit**

```bash
git add src/mol/create-mol-view.ts
git commit -m "$(cat <<'EOF'
feat(plan3a): createMolView — plugin lifecycle + executor/adapter/xr assembly

Creates+owns a Mol* plugin (or attaches to a host plugin and never disposes it),
wires the real ExecutorContext to createExecutor, and returns a MolView
(dispatch/getSceneContext/clearHighlight/xr/plugin/handleResize/dispose).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: React layer + browser barrel

Provider + hook + style-forwarding `<MolViewCanvas/>`. **SSR-critical:** these files carry no static molstar/mol-layer value import — `canvas.tsx` lazy-imports `create-mol-view` inside `useEffect`. Typecheck-gated; the SSR behavior is tested in Task 9.

**Files:**
- Create: `src/react/provider.tsx`
- Create: `src/react/use-mol-view.ts`
- Create: `src/react/canvas.tsx`
- Create: `src/browser.ts`

- [ ] **Step 1: Write `src/react/provider.tsx`**

```tsx
'use client';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PluginContext } from 'molstar/lib/mol-plugin/context'; // type-only → erased at runtime
import type { MolView, CreateMolViewOptions } from '../mol/create-mol-view';

/** Host configuration passed to createMolView by the canvas. */
export type MolViewConfig = Pick<CreateMolViewOptions, 'resolveStructure'>;

interface MolViewContextValue {
  view: MolView | undefined;
  config: MolViewConfig;
  plugin?: PluginContext;
  registerView: (view: MolView | undefined) => void;
}

const MolViewCtx = createContext<MolViewContextValue | null>(null);

export interface MolViewProviderProps {
  config?: MolViewConfig;
  /** Attach to a plugin the host already mounted (vdv will not dispose it). */
  plugin?: PluginContext;
  children: ReactNode;
}

export function MolViewProvider({ config, plugin, children }: MolViewProviderProps) {
  const [view, setView] = useState<MolView | undefined>(undefined);
  const cfg = config ?? {};
  const value = useMemo<MolViewContextValue>(
    () => ({ view, config: cfg, plugin, registerView: setView }),
    [view, cfg, plugin],
  );
  return <MolViewCtx.Provider value={value}>{children}</MolViewCtx.Provider>;
}

export function useMolViewContext(): MolViewContextValue {
  const ctx = useContext(MolViewCtx);
  if (ctx === null) throw new Error('useMolView/<MolViewCanvas> must be used within <MolViewProvider>.');
  return ctx;
}
```

- [ ] **Step 2: Write `src/react/use-mol-view.ts`**

```tsx
'use client';
import type { MolView } from '../mol/create-mol-view';
import { useMolViewContext } from './provider';

/** The mounted viewer, or undefined until <MolViewCanvas/> has mounted and initialized. */
export function useMolView(): MolView | undefined {
  return useMolViewContext().view;
}
```

- [ ] **Step 3: Write `src/react/canvas.tsx`**

```tsx
'use client';
import { useEffect, useRef, type CSSProperties, type HTMLAttributes } from 'react';
import { useMolViewContext } from './provider';

/**
 * Renders the Mol* canvas inside a host-sizable container. Style/className/data-*
 * are forwarded to the container <div>, so the host controls size with normal CSS
 * (give the container a real height — a 0-height container yields a 0-size canvas).
 *
 * SSR-safe: molstar is reached only via a dynamic import inside useEffect, which
 * does not run during renderToString — so nothing touches WebGL/window server-side.
 */
export function MolViewCanvas(props: HTMLAttributes<HTMLDivElement>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctx = useMolViewContext();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Initialize once on mount; capture latest config/plugin via ref to avoid re-mount churn.
  useEffect(() => {
    let disposed = false;
    let created: { dispose(): void } | undefined;
    void (async () => {
      const { createMolView } = await import('../mol/create-mol-view');
      if (disposed || !canvasRef.current || !containerRef.current) return;
      const { config, plugin, registerView } = ctxRef.current;
      const view = await createMolView({
        canvas: canvasRef.current,
        container: containerRef.current,
        plugin,
        resolveStructure: config.resolveStructure,
      });
      if (disposed) { view.dispose(); return; }
      created = view;
      registerView(view);
    })();
    return () => {
      disposed = true;
      ctxRef.current.registerView(undefined);
      created?.dispose();
    };
  }, []);

  const { style, ...rest } = props;
  const containerStyle: CSSProperties = { position: 'relative', ...style };
  return (
    <div ref={containerRef} style={containerStyle} {...rest}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
```

- [ ] **Step 4: Write `src/browser.ts`**

```ts
// Molstar/React surface for van-der-view. Intentionally NOT re-exported from
// src/index.ts (the agent-side barrel stays molstar-free). Only the React layer is
// re-exported as values here, so importing this module pulls no molstar at module
// load — the mol layer (and molstar) loads lazily inside <MolViewCanvas/>'s effect.
export { MolViewProvider } from './react/provider';
export type { MolViewConfig, MolViewProviderProps } from './react/provider';
export { MolViewCanvas } from './react/canvas';
export { useMolView } from './react/use-mol-view';
export type { MolView, CreateMolViewOptions } from './mol/create-mol-view';
export type { MolViewXR } from './mol/xr';
```

- [ ] **Step 5: Typecheck + suite**

Run: `pnpm typecheck && pnpm test`
Expected: green. (No new tests yet; .tsx files must compile under `react-jsx`.)

- [ ] **Step 6: Verify no static molstar in the React/browser value graph**

Run:
```bash
grep -nE "^import [^t].*molstar|^import .*from '\.\./mol/" src/react/provider.tsx src/react/canvas.tsx src/react/use-mol-view.ts src/browser.ts
```
Expected: the ONLY matches are `import type …` lines (type-only, erased). No value import of `molstar` or `../mol/*` outside `import type`. `canvas.tsx`'s `await import('../mol/create-mol-view')` is a dynamic import (not matched). If any value import shows up, convert it to `import type` or move it into the effect.

- [ ] **Step 7: Commit**

```bash
git add src/react/provider.tsx src/react/use-mol-view.ts src/react/canvas.tsx src/browser.ts
git commit -m "$(cat <<'EOF'
feat(plan3a): React mount — MolViewProvider, useMolView, <MolViewCanvas/>

Provider holds the MolView in context; the style-forwarding canvas lazy-imports
the mol layer inside useEffect (keeping molstar out of the server bundle),
createMolView on mount, dispose on unmount. browser.ts barrels the React surface
+ public types; src/index.ts stays molstar-free.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: SSR smoke test

The one automated test for the React mount: `renderToString` of the provider+canvas must not throw, must emit the container/canvas placeholder, and must not pull molstar server-side.

**Files:**
- Create: `test/ssr.test.tsx`

- [ ] **Step 1: Write the test**

`test/ssr.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MolViewProvider, MolViewCanvas } from '../src/browser';

describe('SSR safety', () => {
  it('renders the canvas placeholder server-side without touching WebGL or molstar', () => {
    const html = renderToString(
      <MolViewProvider>
        <MolViewCanvas data-testid="vdv-canvas" />
      </MolViewProvider>,
    );
    // Placeholder is emitted (container div with forwarded prop + the canvas).
    expect(html).toContain('data-testid="vdv-canvas"');
    expect(html).toContain('<canvas');
    // molstar mounts only inside useEffect (not run during renderToString) → no molstar artifacts.
    expect(html.toLowerCase()).not.toContain('molstar');
  });

  it('forwards style to the container', () => {
    const html = renderToString(
      <MolViewProvider>
        <MolViewCanvas style={{ height: 480 }} />
      </MolViewProvider>,
    );
    expect(html).toMatch(/height:\s*480px/);
  });
});
```

- [ ] **Step 2: Run to verify it passes (the guard already holds)**

Run: `pnpm test -- ssr`
Expected: PASS. (`useEffect` doesn't run under `renderToString`, so no dynamic molstar import fires; the browser barrel pulls no molstar as a value.) If it FAILS with a molstar/WebGL/window error, the SSR guard is broken — a value import of the mol layer or molstar leaked into the React/browser static graph (re-check Task 8 Step 6) — fix that, do not weaken the test.

- [ ] **Step 3: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: green. Record the final test count for the PR description.

- [ ] **Step 4: Commit**

```bash
git add test/ssr.test.tsx
git commit -m "$(cat <<'EOF'
test(plan3a): SSR renderToString smoke for the React mount

Asserts <MolViewProvider><MolViewCanvas/> renders the placeholder server-side
(jsdom) without throwing, forwards style to the container, and pulls no molstar
into the server output — the headless-react SSR guard.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## After all tasks

- [ ] **Final whole-implementation review** (subagent-driven-development: dispatch a final code reviewer over the full 3a diff vs `main`).
- [ ] **Docs sync (post-merge, mirrors Plan 2):** these are intentionally *not* TDD tasks; do them as a follow-up after 3a merges, via `/wiki-ingest` and the memory file:
  - `wiki/pages/command-schema.md` — `highlight.style` is now v1.1 (not v1); preset selectors are implemented (resolve the "preset → unsupported_selection" open question); `focus.zoomOut` is a boolean → camera `extraRadius`.
  - `wiki/pages/headless-react.md` — resolve "one wrapper vs hooks-only": vdv ships `<MolViewCanvas/>` + provider + hook; record the lazy-import-in-useEffect SSR guard as realized + tested.
  - `wiki/pages/testing-strategy.md` — mark the SSR smoke ✅ implemented; presets ✅ Node-tested; note adapter/createMolView/React are typecheck-gated + manual (3b).
  - `wiki/pages/agent-command-flow.md` / `project-overview.md` — the real `PluginContext`→`ExecutorContext` adapter has landed; Plan 3b (Vite demo + manual XR) is next.
  - `CLAUDE.md` Status section + the memory file `plan-2-executor-merged.md` (or a new `plan-3a-*` memory) — 3a landed; 3b next.
- [ ] **Finish the branch** with superpowers:finishing-a-development-branch (verify tests, then PR).

## Out of scope (carried to 3b / later, do NOT build here)

- The Vite demo (`examples/demo/`) and the manual XR/visual checklist → **Plan 3b**.
- `highlight.style` + the v1.1 representation cluster (`color`, `set-representation`, `load-scene`, the `toggle-xr` command).
- Host-defined/open `ErrorCode`; multi-model selection scoping; schema-driven validation refactor; `dispatch(rawProviderBlock)` overload.
- Package `exports` map, build step, peer-dep finalization → packaging phase.
- Residues-without-chain selection stays documented as "matches that residue number in all chains" — no code change.
