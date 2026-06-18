# Browser-Side Executor Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the provider-agnostic **executor core** — `resolveSelection` (Selection→loci), `resolveStructure` (data sourcing), and `createExecutor().dispatch(Command)` with the v1 handlers — all unit-tested in **pure Node** (test focus **F2**). No React, no real canvas/WebGL.

**Architecture:** The executor depends on a small high-level **port** (`ExecutorContext`: `getStructure()` / `highlight(loci)` / `focus(loci)` / `loadStructure()` / `resetCamera()` / `getSceneContext()`), **not** on raw Mol\* managers. This keeps the whole executor + resolvers Node-testable against a fake port plus **real fixture `Structure`s** (built via the verified pure-Node parse path, src: `wiki/raw/0007`). The real `PluginContext`→`ExecutorContext` adapter and the visual/render verification are deferred to **Plan 3** (the React mount + demo). `resolveSelection` resolves selectors to loci using `mol-model`/`mol-script` only — verified to run with no WebGL/`three`.

**Tech Stack:** TypeScript (strict), Vitest (`node` env), molstar 5.10. `moduleResolution: Bundler`, extensionless relative imports. Run tests with `pnpm test` (or `pnpm test <path>`); the `@scarf/scarf` build gate is already handled in `pnpm-workspace.yaml`.

**Plan series (v1):** This is **Plan 2 of 3** (Plan 1 = agent-side core, merged). Plan 3 = React mount (`<MolViewProvider>`/`useMolView`/`createMolView`, attach-to-existing-plugin) + the `PluginContext`→`ExecutorContext` adapter + SSR `renderToString` smoke + the Vite demo + XR. Spec: `docs/superpowers/specs/2026-06-18-testing-strategy-design.md`. Verified Node-parse API: `wiki/raw/0007`, `wiki/pages/molstar-api.md`.

**Commits:** end every commit message with the `Co-Authored-By` trailer (repo convention).

**Scope notes / deferred (do NOT do here):**
- The executor is **not** added to the public barrel `src/index.ts` in this plan. Keeping the agent-side barrel (`commands`/`tools`/`adapters`) **molstar-free** serves the backend-LLM/thin-client consumers. The executor's public entry point is a packaging-phase decision (Plan 3 / packaging). Tests import directly from `src/*`.
- **Preset selectors** (`selection.preset`) resolve to a clear `unsupported_selection` error for now; full preset support (MolScript molecular-type queries) is a follow-up.
- The real Mol\* manager calls (`lociHighlights.highlightOnly`, `camera.focusLoci`, `builders.data.*`) live behind the `ExecutorContext` port and are implemented + visually verified in **Plan 3**.

---

## File structure

```
test/
  fixtures/structures.ts   # verified inline PDB + mmCIF + buildStructureFrom{PDB,MmCIF} (Node, no WebGL)
  selection.test.ts        # F2: resolveSelection vs fixtures (chain, ranges, auth-vs-label)
  resolve-structure.test.ts
  executor.test.ts         # dispatch + handlers vs a fake ExecutorContext + real fixture Structure
src/
  errors.ts                # ExecutorError, SelectionError, ResolveError
  selection.ts             # resolveSelection(selection, structure): StructureElement.Loci
  resolve-structure.ts     # LoadInput, ResolvedStructure, ResolveStructure, defaultResolveStructure
  context.ts               # ExecutorContext port, SceneContext, FocusOptions
  executor.ts              # ExecutorOptions, createExecutor(ctx, opts).dispatch(command)
```

---

## Task 1: Verified structure fixtures + Node parse helpers

**Files:**
- Create: `test/fixtures/structures.ts`
- Test: `test/fixtures/structures.test.ts`

These strings + helpers are copied verbatim from the passing Node-Structure spike (src: `wiki/raw/0007`). The PDB has 10 atoms / 2 chains (A=8, B=2) / 4 residues. The mmCIF has 4 atoms in chain A with **divergent** numbering (`label_seq_id` 1,2 vs `auth_seq_id` 100,101).

- [ ] **Step 1: Write `test/fixtures/structures.ts`**

```ts
import { Task } from 'molstar/lib/mol-task';
import { parsePDB } from 'molstar/lib/mol-io/reader/pdb/parser';
import { trajectoryFromPDB } from 'molstar/lib/mol-model-formats/structure/pdb';
import { CIF } from 'molstar/lib/mol-io/reader/cif';
import { trajectoryFromMmCIF } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Structure } from 'molstar/lib/mol-model/structure';
import type { Trajectory } from 'molstar/lib/mol-model/structure';

/** 10 atoms; chain A (8 atoms, residues GLY1/ALA2/GLY3), chain B (2 atoms, GLY1). */
export const PDB_TINY = `HEADER    SPIKE
ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00  0.00           N
ATOM      2  CA  GLY A   1       1.000   0.000   0.000  1.00  0.00           C
ATOM      3  C   GLY A   1       2.000   0.000   0.000  1.00  0.00           C
ATOM      4  N   ALA A   2       3.000   0.000   0.000  1.00  0.00           N
ATOM      5  CA  ALA A   2       4.000   0.000   0.000  1.00  0.00           C
ATOM      6  CB  ALA A   2       4.500   1.000   0.000  1.00  0.00           C
ATOM      7  N   GLY A   3       5.000   0.000   0.000  1.00  0.00           N
ATOM      8  CA  GLY A   3       6.000   0.000   0.000  1.00  0.00           C
ATOM      9  N   GLY B   1       0.000   5.000   0.000  1.00  0.00           N
ATOM     10  CA  GLY B   1       1.000   5.000   0.000  1.00  0.00           C
TER      11      GLY B   1
END
`;

/** 4 atoms, chain A; label_seq_id 1,2 but auth_seq_id 100,101 (divergent numbering). */
export const MMCIF_AUTH_LABEL = `data_spike
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
ATOM 1 N  N  GLY A 1 A 100 0.000 0.000 0.000 1.00 0.00
ATOM 2 C  CA GLY A 1 A 100 1.000 0.000 0.000 1.00 0.00
ATOM 3 N  N  ALA A 2 A 101 3.000 0.000 0.000 1.00 0.00
ATOM 4 C  CA ALA A 2 A 101 4.000 0.000 0.000 1.00 0.00
`;

async function modelFromTrajectory(traj: Trajectory) {
  const frame = traj.getFrameAtIndex(0); // Model | Task<Model>
  return Task.is(frame) ? await frame.run() : frame;
}

/** Build a Structure from PDB text in pure Node (no plugin/canvas/WebGL). */
export async function buildStructureFromPDB(pdb: string): Promise<Structure> {
  const parsed = await parsePDB(pdb, 'fixture').run();
  if (parsed.isError) throw new Error(`PDB parse failed: ${parsed.message}`);
  const traj = await trajectoryFromPDB(parsed.result).run();
  return Structure.ofModel(await modelFromTrajectory(traj)); // sync, no RuntimeContext
}

/** Build a Structure from mmCIF text in pure Node. */
export async function buildStructureFromMmCIF(cif: string): Promise<Structure> {
  const parsed = await CIF.parse(cif).run();
  if (parsed.isError) throw new Error(`CIF parse failed: ${parsed.message}`);
  const traj = await trajectoryFromMmCIF(parsed.result.blocks[0]).run();
  return Structure.ofModel(await modelFromTrajectory(traj));
}
```

- [ ] **Step 2: Write the test** — `test/fixtures/structures.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MMCIF_AUTH_LABEL,
  PDB_TINY,
  buildStructureFromMmCIF,
  buildStructureFromPDB,
} from './structures';

describe('structure fixtures', () => {
  it('parses the PDB fixture to a 10-atom Structure in Node', async () => {
    const s = await buildStructureFromPDB(PDB_TINY);
    expect(s.elementCount).toBe(10);
  });

  it('parses the mmCIF fixture to a 4-atom Structure in Node', async () => {
    const s = await buildStructureFromMmCIF(MMCIF_AUTH_LABEL);
    expect(s.elementCount).toBe(4);
  });
});
```

- [ ] **Step 3: Run** `pnpm test test/fixtures/structures.test.ts` → expect 2 pass. (If a fixture fails to parse, the strings were altered — re-copy exactly.)
- [ ] **Step 4: Typecheck** `pnpm typecheck` → exit 0.
- [ ] **Step 5: Commit**

```bash
git add test/fixtures/structures.ts test/fixtures/structures.test.ts
git commit -m "test: verified Node structure fixtures (PDB + mmCIF)"
```

---

## Task 2: Errors + `resolveSelection` (chain + residues, auth/label) — F2 core

**Files:**
- Create: `src/errors.ts`, `src/selection.ts`
- Test: `test/selection.test.ts`

- [ ] **Step 1: Write the failing test** — `test/selection.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';
import {
  MMCIF_AUTH_LABEL,
  PDB_TINY,
  buildStructureFromMmCIF,
  buildStructureFromPDB,
} from './fixtures/structures';
import { resolveSelection } from '../src/selection';

let pdb: Structure;
let cif: Structure;
beforeAll(async () => {
  pdb = await buildStructureFromPDB(PDB_TINY);
  cif = await buildStructureFromMmCIF(MMCIF_AUTH_LABEL);
});

const size = (l: StructureElement.Loci) => StructureElement.Loci.size(l);
const empty = (l: StructureElement.Loci) => StructureElement.Loci.isEmpty(l);

describe('resolveSelection — chain + residues', () => {
  it('selects a chain (auth)', () => {
    const loci = resolveSelection({ chain: 'A' }, pdb);
    expect(empty(loci)).toBe(false);
    expect(size(loci)).toBe(8);
  });

  it('selects a residue range within a chain (auth)', () => {
    const loci = resolveSelection({ chain: 'A', residues: [[1, 2]], numbering: 'auth' }, pdb);
    expect(size(loci)).toBe(6); // GLY1 (3) + ALA2 (3)
  });

  it('respects auth numbering on a divergent structure', () => {
    expect(size(resolveSelection({ residues: [[100, 101]], numbering: 'auth' }, cif))).toBe(4);
    expect(empty(resolveSelection({ residues: [[100, 101]], numbering: 'label' }, cif))).toBe(true);
  });

  it('respects label numbering on a divergent structure', () => {
    expect(size(resolveSelection({ residues: [[1, 2]], numbering: 'label' }, cif))).toBe(4);
    expect(empty(resolveSelection({ residues: [[1, 2]], numbering: 'auth' }, cif))).toBe(true);
  });

  it('supports a single residue (eq, not range)', () => {
    expect(size(resolveSelection({ residues: [1], numbering: 'label' }, cif))).toBe(2); // GLY label 1
  });

  it('defaults numbering to auth when omitted', () => {
    expect(size(resolveSelection({ residues: [[100, 101]] }, cif))).toBe(4);
  });
});
```

- [ ] **Step 2: Run** `pnpm test test/selection.test.ts` → FAIL (no `../src/selection`).

- [ ] **Step 3: Write `src/errors.ts`**

```ts
/** An executor-level failure carrying a stable `code` for the CommandResult error. */
export class ExecutorError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A selector could not be resolved (unsupported/invalid selection). */
export class SelectionError extends ExecutorError {}

/** A load source could not be resolved to data/url. */
export class ResolveError extends ExecutorError {}
```

- [ ] **Step 4: Write `src/selection.ts`**

```ts
import { Script } from 'molstar/lib/mol-script/script';
import { Structure, StructureElement, StructureSelection } from 'molstar/lib/mol-model/structure';
import type { Selection } from './types';
import { SelectionError } from './errors';

/**
 * Resolve our LLM-friendly Selection to a Mol* loci against a loaded Structure.
 * Pure data-model (no plugin/WebGL). Throws SelectionError for unsupported/invalid
 * selectors; an empty (no-match) loci is returned, not thrown — the caller decides.
 */
export function resolveSelection(selection: Selection, structure: Structure): StructureElement.Loci {
  if (selection.preset !== undefined) {
    throw new SelectionError(
      'unsupported_selection',
      `preset selectors are not supported yet (got "${selection.preset}").`,
    );
  }
  const hasResidues = selection.residues !== undefined && selection.residues.length > 0;
  if (selection.chain === undefined && !hasResidues) {
    throw new SelectionError('invalid_selection', 'selection must include a chain and/or residues.');
  }

  const numbering = selection.numbering ?? 'auth';
  const asymProp = numbering === 'auth' ? 'auth_asym_id' : 'label_asym_id';
  const seqProp = numbering === 'auth' ? 'auth_seq_id' : 'label_seq_id';

  // MolScript's builder is loosely typed (Expression); `as any` on the params is expected.
  const sel = Script.getStructureSelection((b) => {
    const tests: Record<string, unknown> = {};
    if (selection.chain !== undefined) {
      tests['chain-test'] = b.core.rel.eq([b.ammp(asymProp), selection.chain]);
    }
    if (hasResidues) {
      const rt = selection.residues!.map((r) =>
        Array.isArray(r)
          ? b.core.rel.inRange([b.ammp(seqProp), r[0], r[1]]) // inRange(value, min, max)
          : b.core.rel.eq([b.ammp(seqProp), r]),
      );
      tests['residue-test'] = rt.length === 1 ? rt[0] : b.core.logic.or(rt);
    }
    return b.struct.generator.atomGroups(tests as any);
  }, structure);

  return StructureSelection.toLociWithSourceUnits(sel);
}
```

- [ ] **Step 5: Run** `pnpm test test/selection.test.ts` → expect all pass (6 assertions across cases). If `b.core.logic.or` or a builder path errors, confirm the symbol against `node_modules/molstar/lib/mol-script/language/builder.d.ts` (the single-residue path avoids `or`).
- [ ] **Step 6: Typecheck** `pnpm typecheck` → exit 0.
- [ ] **Step 7: Commit**

```bash
git add src/errors.ts src/selection.ts test/selection.test.ts
git commit -m "feat: resolveSelection (Selection -> loci, auth/label) [F2]"
```

---

## Task 3: `resolveSelection` guard cases (preset / invalid)

**Files:**
- Modify: `test/selection.test.ts`

(The guards are already implemented in Task 2; this task locks them with tests.)

- [ ] **Step 1: Append tests** to `test/selection.test.ts`:

```ts
import { SelectionError } from '../src/errors';

describe('resolveSelection — guards', () => {
  it('throws SelectionError for preset selectors (not yet supported)', () => {
    expect(() => resolveSelection({ preset: 'ligand' }, pdb)).toThrow(SelectionError);
  });

  it('throws SelectionError for an empty selection (no chain, no residues)', () => {
    expect(() => resolveSelection({}, pdb)).toThrow(SelectionError);
  });

  it('returns an empty loci for a chain that does not exist (caller decides)', () => {
    const loci = resolveSelection({ chain: 'Z' }, pdb);
    expect(StructureElement.Loci.isEmpty(loci)).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `pnpm test test/selection.test.ts` → expect all pass (no impl change needed).
- [ ] **Step 3: Commit**

```bash
git add test/selection.test.ts
git commit -m "test: lock resolveSelection preset/invalid/no-match guards"
```

---

## Task 4: `resolveStructure` (data sourcing + conditional validation)

**Files:**
- Create: `src/resolve-structure.ts`
- Test: `test/resolve-structure.test.ts`

This implements the data-sourcing delta (inline + host-overridable) **and** the conditional-requirement enforcement deferred from the Plan-1 review (pdb→id, url→url, inline→data) — surfaced as a structured `ResolveError`.

- [ ] **Step 1: Write the failing test** — `test/resolve-structure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ResolveError } from '../src/errors';
import { defaultResolveStructure } from '../src/resolve-structure';

describe('defaultResolveStructure', () => {
  it('maps a PDB id to an RCSB mmCIF url', async () => {
    expect(await defaultResolveStructure({ source: 'pdb', id: '1crn' })).toEqual({
      url: 'https://files.rcsb.org/download/1CRN.cif',
      format: 'mmcif',
    });
  });

  it('passes a url through with its format', async () => {
    expect(
      await defaultResolveStructure({ source: 'url', url: 'https://x/y.pdb', format: 'pdb' }),
    ).toEqual({ url: 'https://x/y.pdb', format: 'pdb' });
  });

  it('passes inline data through (default mmcif)', async () => {
    expect(await defaultResolveStructure({ source: 'inline', data: 'DATA' })).toEqual({
      data: 'DATA',
      format: 'mmcif',
    });
  });

  it('rejects pdb without id', async () => {
    await expect(defaultResolveStructure({ source: 'pdb' })).rejects.toThrow(ResolveError);
  });

  it('rejects url without url', async () => {
    await expect(defaultResolveStructure({ source: 'url' })).rejects.toThrow(ResolveError);
  });

  it('rejects inline without data', async () => {
    await expect(defaultResolveStructure({ source: 'inline' })).rejects.toThrow(ResolveError);
  });
});
```

- [ ] **Step 2: Run** `pnpm test test/resolve-structure.test.ts` → FAIL (no module).

- [ ] **Step 3: Write `src/resolve-structure.ts`**

```ts
import type { LoadSource, StructureFormat } from './types';
import { ResolveError } from './errors';

/** Normalized input of the load-structure command. */
export interface LoadInput {
  source: LoadSource;
  id?: string;
  url?: string;
  data?: string;
  format?: StructureFormat;
}

/** What a resolver returns: either inline text or a URL, plus the format. */
export interface ResolvedStructure {
  data?: string;
  url?: string;
  format: StructureFormat;
  isBinary?: boolean;
}

/** Host-overridable hook that turns a LoadInput into fetchable data (e.g. auth/S3). */
export type ResolveStructure = (input: LoadInput) => Promise<ResolvedStructure>;

const rcsbCif = (id: string) => `https://files.rcsb.org/download/${id.toUpperCase()}.cif`;

/** Default resolver: PDB id -> RCSB mmCIF; plain url; inline text. */
export const defaultResolveStructure: ResolveStructure = async (input) => {
  const format: StructureFormat = input.format ?? 'mmcif';
  switch (input.source) {
    case 'pdb':
      if (!input.id) throw new ResolveError('invalid_input', 'load-structure source "pdb" requires "id".');
      return { url: rcsbCif(input.id), format: 'mmcif' };
    case 'url':
      if (!input.url) throw new ResolveError('invalid_input', 'load-structure source "url" requires "url".');
      return { url: input.url, format };
    case 'inline':
      if (!input.data) throw new ResolveError('invalid_input', 'load-structure source "inline" requires "data".');
      return { data: input.data, format };
    default:
      throw new ResolveError('invalid_input', `unknown load-structure source "${String(input.source)}".`);
  }
};
```

- [ ] **Step 4: Run** `pnpm test test/resolve-structure.test.ts` → expect 6 pass.
- [ ] **Step 5: Typecheck** → exit 0.
- [ ] **Step 6: Commit**

```bash
git add src/resolve-structure.ts test/resolve-structure.test.ts
git commit -m "feat: defaultResolveStructure (pdb/url/inline + conditional validation)"
```

---

## Task 5: `ExecutorContext` port + executor routing

**Files:**
- Create: `src/context.ts`, `src/executor.ts`
- Test: `test/executor.test.ts`

- [ ] **Step 1: Write `src/context.ts`**

```ts
import type { Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import type { ResolvedStructure } from './resolve-structure';

/** Camera focus options (subset surfaced to the agent). */
export interface FocusOptions {
  durationMs?: number;
}

/** Minimal read-model of the scene, returned by get-scene-context. */
export interface SceneContext {
  loaded: boolean;
  structures: { chains: string[] }[];
}

/**
 * The high-level port the executor drives. A real Mol* plugin adapter (Plan 3) or a
 * test fake implements this — so the executor never touches Mol* managers directly.
 */
export interface ExecutorContext {
  getStructure(): Structure | undefined;
  loadStructure(resolved: ResolvedStructure): Promise<void>;
  highlight(loci: StructureElement.Loci): void;
  clearHighlight(): void;
  focus(loci: StructureElement.Loci, options?: FocusOptions): void;
  resetCamera(): void;
  getSceneContext(): SceneContext;
}
```

- [ ] **Step 2: Write the failing test** — `test/executor.test.ts` (a fake context + routing cases):

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure, StructureElement as SE } from 'molstar/lib/mol-model/structure';
import { PDB_TINY, buildStructureFromPDB } from './fixtures/structures';
import type { ExecutorContext, SceneContext } from '../src/context';
import { createExecutor } from '../src/executor';
import type { CommandResult } from '../src/types';

let structure: Structure | undefined;
beforeAll(async () => { structure = await buildStructureFromPDB(PDB_TINY); });

function fakeContext(overrides: Partial<ExecutorContext> = {}) {
  const scene: SceneContext = { loaded: true, structures: [{ chains: ['A', 'B'] }] };
  const ctx: ExecutorContext = {
    getStructure: () => structure,
    loadStructure: vi.fn(async () => {}),
    highlight: vi.fn((_loci: SE.Loci) => {}),
    clearHighlight: vi.fn(),
    focus: vi.fn((_loci: SE.Loci) => {}),
    resetCamera: vi.fn(),
    getSceneContext: () => scene,
    ...overrides,
  };
  return ctx;
}

/** Narrow a CommandResult to its error (throws if it was ok). */
function errorOf(res: CommandResult) {
  if (res.ok) throw new Error('expected an error result, got ok');
  return res.error;
}

describe('createExecutor — routing', () => {
  it('returns ok for get-scene-context with the scene data', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({ name: 'get-scene-context', input: {} });
    expect(res).toEqual({ ok: true, data: { loaded: true, structures: [{ chains: ['A', 'B'] }] } });
  });

  it('calls resetCamera and returns ok for reset-camera', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({ name: 'reset-camera', input: {} });
    expect(res.ok).toBe(true);
    expect(ctx.resetCamera).toHaveBeenCalledOnce();
  });

  it('returns an error for an unknown command', async () => {
    const res = await createExecutor(fakeContext()).dispatch({ name: 'nope', input: {} });
    expect(res).toEqual({ ok: false, error: { code: 'unknown_command', message: expect.any(String) } });
  });
});
```

- [ ] **Step 3: Run** `pnpm test test/executor.test.ts` → FAIL (no `../src/executor`).

- [ ] **Step 4: Write `src/executor.ts`**

```ts
import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type { Command, CommandResult, Selection } from './types';
import { err, ok } from './types';
import type { ExecutorContext } from './context';
import { ExecutorError } from './errors';
import { defaultResolveStructure } from './resolve-structure';
import type { LoadInput, ResolveStructure } from './resolve-structure';
import { resolveSelection } from './selection';

export interface ExecutorOptions {
  /** Host hook to fetch auth-protected / internal structures. Defaults to RCSB/url/inline. */
  resolveStructure?: ResolveStructure;
}

function asObject(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ExecutorError('invalid_input', 'command input must be an object.');
  }
  return input as Record<string, unknown>;
}

function requireSelection(input: Record<string, unknown>): Selection {
  const sel = input.selection;
  if (typeof sel !== 'object' || sel === null || Array.isArray(sel)) {
    throw new ExecutorError('invalid_input', 'expected a "selection" object.');
  }
  return sel as Selection;
}

function lociFor(ctx: ExecutorContext, selection: Selection): StructureElement.Loci {
  const structure: Structure | undefined = ctx.getStructure();
  if (!structure) throw new ExecutorError('no_structure', 'no structure is loaded.');
  return resolveSelection(selection, structure);
}

export function createExecutor(ctx: ExecutorContext, options: ExecutorOptions = {}) {
  const resolveStructure = options.resolveStructure ?? defaultResolveStructure;

  async function dispatch(command: Command): Promise<CommandResult> {
    try {
      switch (command.name) {
        case 'load-structure': {
          const resolved = await resolveStructure(asObject(command.input) as LoadInput);
          await ctx.loadStructure(resolved);
          return ok();
        }
        case 'highlight': {
          const loci = lociFor(ctx, requireSelection(asObject(command.input)));
          if (StructureElement.Loci.isEmpty(loci)) return err('empty_selection', 'selection matched no atoms.');
          ctx.highlight(loci);
          return ok();
        }
        case 'focus': {
          const input = asObject(command.input);
          const loci = lociFor(ctx, requireSelection(input));
          if (StructureElement.Loci.isEmpty(loci)) return err('empty_selection', 'selection matched no atoms.');
          ctx.focus(loci, { durationMs: typeof input.durationMs === 'number' ? input.durationMs : undefined });
          return ok();
        }
        case 'get-scene-context':
          return ok(ctx.getSceneContext());
        case 'reset-camera':
          ctx.resetCamera();
          return ok();
        default:
          return err('unknown_command', `unknown command "${command.name}".`);
      }
    } catch (e) {
      if (e instanceof ExecutorError) return err(e.code, e.message);
      return err('internal_error', e instanceof Error ? e.message : String(e));
    }
  }

  return { dispatch };
}
```

- [ ] **Step 5: Run** `pnpm test test/executor.test.ts` → expect 3 pass.
- [ ] **Step 6: Typecheck** → exit 0.
- [ ] **Step 7: Commit**

```bash
git add src/context.ts src/executor.ts test/executor.test.ts
git commit -m "feat: ExecutorContext port + createExecutor routing"
```

---

## Task 6: `highlight` + `focus` handlers (selection → port)

**Files:**
- Modify: `test/executor.test.ts`

(The handlers are implemented in Task 5; this task locks their selection + error behavior against the fake port + a real fixture Structure.)

- [ ] **Step 1: Append tests** to `test/executor.test.ts`:

```ts
describe('createExecutor — highlight/focus', () => {
  it('highlights a resolved selection via the port', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { chain: 'A' } },
    });
    expect(res.ok).toBe(true);
    expect(ctx.highlight).toHaveBeenCalledOnce();
    const loci = (ctx.highlight as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(StructureElement.Loci.size(loci)).toBe(8); // chain A
  });

  it('focuses a resolved selection, passing durationMs through', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'focus',
      input: { selection: { chain: 'A', residues: [[1, 2]], numbering: 'auth' }, durationMs: 250 },
    });
    expect(res.ok).toBe(true);
    expect(ctx.focus).toHaveBeenCalledOnce();
    const [loci, opts] = (ctx.focus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(StructureElement.Loci.size(loci)).toBe(6);
    expect(opts).toEqual({ durationMs: 250 });
  });

  it('returns empty_selection when nothing matches', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { chain: 'Z' } },
    });
    expect(res).toEqual({ ok: false, error: { code: 'empty_selection', message: expect.any(String) } });
    expect(ctx.highlight).not.toHaveBeenCalled();
  });

  it('returns no_structure when none is loaded', async () => {
    const ctx = fakeContext({ getStructure: () => undefined });
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { chain: 'A' } },
    });
    expect(errorOf(res).code).toBe('no_structure');
  });

  it('surfaces unsupported_selection from preset selectors', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { preset: 'ligand' } },
    });
    expect(errorOf(res).code).toBe('unsupported_selection');
  });
});
```

- [ ] **Step 2: Run** `pnpm test test/executor.test.ts` → expect all pass.
- [ ] **Step 3: Typecheck** → exit 0 (resolve any `error?.code` narrowing per the note).
- [ ] **Step 4: Commit**

```bash
git add test/executor.test.ts
git commit -m "test: highlight/focus handler selection + error paths"
```

---

## Task 7: `load-structure` handler + malformed-input coverage

**Files:**
- Modify: `test/executor.test.ts`

- [ ] **Step 1: Append tests** to `test/executor.test.ts`:

```ts
describe('createExecutor — load-structure + input validation', () => {
  it('resolves a PDB id and calls loadStructure with the RCSB url', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'load-structure',
      input: { source: 'pdb', id: '1crn' },
    });
    expect(res.ok).toBe(true);
    expect(ctx.loadStructure).toHaveBeenCalledWith({
      url: 'https://files.rcsb.org/download/1CRN.cif',
      format: 'mmcif',
    });
  });

  it('uses a host resolveStructure override when provided', async () => {
    const ctx = fakeContext();
    const resolveStructure = vi.fn(async () => ({ data: 'INLINE', format: 'pdb' as const }));
    const res = await createExecutor(ctx, { resolveStructure }).dispatch({
      name: 'load-structure',
      input: { source: 'inline', data: 'INLINE', format: 'pdb' },
    });
    expect(res.ok).toBe(true);
    expect(resolveStructure).toHaveBeenCalledOnce();
    expect(ctx.loadStructure).toHaveBeenCalledWith({ data: 'INLINE', format: 'pdb' });
  });

  it('returns invalid_input for load-structure missing required fields', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'load-structure',
      input: { source: 'pdb' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('returns invalid_input when input is not an object', async () => {
    const res = await createExecutor(fakeContext()).dispatch({ name: 'highlight', input: '[]' });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('returns invalid_input when selection is missing', async () => {
    const res = await createExecutor(fakeContext()).dispatch({ name: 'highlight', input: {} });
    expect(errorOf(res).code).toBe('invalid_input');
  });
});
```

- [ ] **Step 2: Run** the full suite `pnpm test` → expect everything green (fixtures, selection, resolve-structure, executor, plus the unchanged Plan-1 suite).
- [ ] **Step 3: Typecheck** `pnpm typecheck` → exit 0.
- [ ] **Step 4: Commit**

```bash
git add test/executor.test.ts
git commit -m "test: load-structure handler + malformed-input -> CommandResult error"
```

---

## Done criteria

- `pnpm test` green: **F2** is covered — `resolveSelection` maps chain/residue/auth-vs-label selectors to the correct loci against real fixture `Structure`s built in pure Node; the executor routes every v1 command, resolves selections, and returns structured `CommandResult` errors (`unknown_command`, `invalid_input`, `no_structure`, `empty_selection`, `unsupported_selection`) for the failure paths.
- `pnpm typecheck` clean.
- The agent-side barrel (`src/index.ts`) is unchanged and still molstar-free.

## Handoffs to Plan 3 (not in scope here)

- The real `PluginContext` → `ExecutorContext` adapter: `getStructure` from `plugin.managers.structure.hierarchy.current`, `highlight` via `interactivity.lociHighlights.highlightOnly({ loci })`, `focus` via `managers.camera.focusLoci(loci, opts)`, `loadStructure` via `builders.data.download`/`rawData` + `parseTrajectory` + `applyPreset`, `resetCamera` via `managers.camera.reset()`, `getSceneContext` from the hierarchy. **Verify each signature against `node_modules/molstar/lib/**/*.d.ts`** and confirm visually in the demo.
- Preset selectors (`unsupported_selection` today) → real MolScript molecular-type queries.
- `ExecutorContext.clearHighlight()` is declared on the port but **unwired** in Plan 2 (no v1 command, no caller). Wire it to `interactivity.lociHighlights.clearHighlights()` in the adapter, and decide whether to surface a `clear-highlight` command.
- The v1 command schema advertises `highlight.style` and `focus.zoomOut` (`src/commands.ts`), but the Plan-2 executor **drops** them (highlight uses only `selection`; focus forwards only `durationMs`). Implement them when the real representation/camera calls land — `style` via `builders.structure.representation`/`updateRepresentationsTheme`, `zoomOut` via the `focusLoci` options.
- Public entry point for the executor (subpath export vs main barrel) — packaging decision.
```
