# Highlight Persistence Implementation Plan

> **Historical note:** Task 3's overpaint mechanism (`setStructureOverpaint`) was later
> superseded by Mol\*'s select-marking channel (`lociSelects.selectOnly`/`deselectAll`) after
> external review + user feedback found overpaint read as a solid recolor with no outline. The
> pivot also dissolved review findings #2 and #4. See the spec's "Revision — pivot to
> select-marking" section for full details.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `highlight` command persist across pointer hover/click/`focus` (replace semantics), and add a dispatchable `clear-highlight` command to remove it.

**Architecture:** Replace the transient `lociHighlights` (hover-marking) call in the Mol\* adapter with a persistent **overpaint** layer (a yellow color painted over existing geometry), mirroring the appearance model's sibling `setStructureTransparency` usage. Overpaint is highlight-exclusive in this adapter, so replace/clear is a wholesale `clearStructureOverpaint`. Add a `clear-highlight` command to the catalog + executor; make the `highlight`/`clearHighlight` port members async.

**Tech Stack:** TypeScript, Mol\* 5.10.1 (`mol-plugin-state/helpers/structure-overpaint`), Vitest (Node, off-GPU), tsc `--noEmit` (typecheck-gated for GPU-bound adapter code), Vite demo (manual GPU verification).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-01-highlight-persistence-design.md`. Closes issue #38.
- The `highlight` command's `inputSchema` MUST stay `{ selection }` — unchanged (host codegen untouched).
- No new error code. `ErrorCode` (`src/errors.ts`) is a closed union; the executor maps unknown throws → `internal_error`.
- Highlight color: `Color(0xffff00)` (yellow), deliberately distinct from Mol\*'s pink hover marker.
- `pnpm test` and `pnpm typecheck` MUST both pass at every commit (`tsconfig.json` includes both `src` and `test`, so the test fake is typechecked).
- Adapter code (`src/mol/adapter.ts`) is GPU-bound: NOT unit-tested; verified by `pnpm typecheck` + manual demo GPU pass (Task 4). This matches the repo convention.
- Commit after each task.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/commands.ts` | Add `clear-highlight` to `VDV_COMMANDS`; retouch `highlight` description | 1 |
| `test/commands.test.ts` | Catalog assertions for `clear-highlight` | 1 |
| `src/executor.ts` | `await ctx.highlight`; new `clear-highlight` case | 2 |
| `test/executor.test.ts` | Routing test for `clear-highlight`; update fake to async | 2, 3 |
| `src/context.ts` | `highlight`/`clearHighlight` port members → `Promise<void>` | 3 |
| `src/mol/adapter.ts` | Overpaint impl + `HIGHLIGHT_COLOR` + imports | 3 |
| `src/mol/create-mol-view.ts` | `MolView.clearHighlight(): Promise<void>` | 3 |
| `examples/demo/src/panels/CommandsPanel.tsx` | Command-bus `clear-highlight` control (GPU verification) | 4 |
| `wiki/pages/*.md`, `CLAUDE.md` | Docs sync | 5 |

---

### Task 1: Add `clear-highlight` to the command catalog

**Files:**
- Modify: `src/commands.ts` (the `VDV_COMMANDS` array ~line 79-88, the `highlight` entry)
- Test: `test/commands.test.ts:8-23` (names list) + a new case

**Interfaces:**
- Consumes: `CommandSpec` (`{ name: string; description: string; inputSchema: {...} }`), `VDV_COMMANDS` (deep-frozen `readonly CommandSpec[]`).
- Produces: a new catalog entry `{ name: 'clear-highlight', description: string, inputSchema: { type:'object', properties:{}, additionalProperties:false } }`. The Anthropic/OpenAI adapters map over `VDV_COMMANDS` generically, so this becomes a tool automatically (no adapter code change).

- [ ] **Step 1: Update the failing tests**

In `test/commands.test.ts`, add `'clear-highlight'` to the sorted names array (alphabetically right after `'add-label'`):

```ts
    expect(names).toEqual([
      'add-label',
      'clear-highlight',
      'focus',
      'get-scene-context',
      'highlight',
      'load-structure',
      'load-trajectory',
      'measure-distance',
      'play-trajectory',
      'reset-camera',
      'set-color',
      'set-frame',
      'set-representation',
      'stop-trajectory',
      'toggle-visibility',
    ]);
```

Then add a new test after the `'requires selection on highlight and focus'` test (after line 44):

```ts
  it('includes clear-highlight with an empty input schema', () => {
    const cmd = VDV_COMMANDS.find((c) => c.name === 'clear-highlight');
    expect(cmd).toBeDefined();
    expect(cmd?.inputSchema.properties).toEqual({});
    expect(cmd?.inputSchema.required).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test commands`
Expected: FAIL — names array missing `clear-highlight`; `cmd` is `undefined`.

- [ ] **Step 3: Add the catalog entry and retouch the highlight description**

In `src/commands.ts`, replace the `highlight` entry (lines ~79-88) with the retouched description AND a new `clear-highlight` entry immediately after it:

```ts
  {
    name: 'highlight',
    description:
      'Highlight a selection of residues, a chain, or a ligand. Persists until replaced by another highlight or removed with clear-highlight.',
    inputSchema: {
      type: 'object',
      properties: { selection: selectionSchema },
      required: ['selection'],
      additionalProperties: false,
    },
  },
  {
    name: 'clear-highlight',
    description: 'Remove the current persistent highlight, if any.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test commands && pnpm typecheck`
Expected: PASS (command + adapter tests use `VDV_COMMANDS.length` dynamically, so they still pass).

- [ ] **Step 5: Commit**

```bash
git add src/commands.ts test/commands.test.ts
git commit -m "feat(commands): add clear-highlight command; highlight now persists"
```

---

### Task 2: Route `clear-highlight` and await `highlight` in the executor

**Files:**
- Modify: `src/executor.ts` (the `highlight` case ~lines 227-232)
- Test: `test/executor.test.ts` (new cases in the `highlight/focus` describe block)

**Interfaces:**
- Consumes: `ctx.highlight(loci)` and `ctx.clearHighlight()` from `ExecutorContext` (still `void` at this task; `await` on `void` is a no-op that stays valid when they become `Promise<void>` in Task 3). `ok()` / `fail(code, message)` result helpers.
- Produces: dispatch handling for `command.name === 'clear-highlight'` returning `ok()` with no selection required. `clear-highlight` is neither `readOnly` nor `sceneReplacing`, so `dispatch` already serializes it FIFO — no edit to those sets.

- [ ] **Step 1: Write the failing tests**

In `test/executor.test.ts`, add these two tests inside the `describe('createExecutor — highlight/focus', ...)` block (e.g. after the `'highlights a resolved selection via the port'` test at line 97):

```ts
  it('clears the highlight via the port for clear-highlight', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({ name: 'clear-highlight', input: {} });
    expect(res.ok).toBe(true);
    expect(ctx.clearHighlight).toHaveBeenCalledOnce();
  });

  it('clear-highlight needs no structure or selection', async () => {
    const ctx = fakeContext({ getStructure: () => undefined });
    const res = await createExecutor(ctx).dispatch({ name: 'clear-highlight', input: {} });
    expect(res.ok).toBe(true);
    expect(ctx.clearHighlight).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test executor`
Expected: FAIL — `clear-highlight` currently returns `{ ok: false, error: { code: 'unknown_command' } }`, so `res.ok` is `false` and `ctx.clearHighlight` is never called.

- [ ] **Step 3: Add the executor case and await the highlight call**

In `src/executor.ts`, replace the `highlight` case (lines ~227-232) with the awaited version plus the new `clear-highlight` case:

```ts
        case 'highlight': {
          const loci = lociFor(ctx, requireSelection(asObject(command.input)));
          if (StructureElement.Loci.isEmpty(loci)) return fail('empty_selection', 'selection matched no atoms.');
          await ctx.highlight(loci);
          return ok();
        }
        case 'clear-highlight': {
          await ctx.clearHighlight();
          return ok();
        }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test executor && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/executor.ts test/executor.test.ts
git commit -m "feat(executor): route clear-highlight; await highlight"
```

---

### Task 3: Persistent overpaint (port + adapter + handle)

**Files:**
- Modify: `src/context.ts:43-44` (port signatures)
- Modify: `src/mol/adapter.ts` (imports ~line 14, a new `HIGHLIGHT_COLOR` const, the `highlight`/`clearHighlight` methods ~lines 272-278)
- Modify: `src/mol/create-mol-view.ts:29` (`MolView.clearHighlight` return type)
- Modify: `test/executor.test.ts:19-20` (fake returns promises, to keep typecheck green)

**Interfaces:**
- Consumes: `plugin` (`PluginContext`), the adapter-local `serialize` (`createSerializer()` at `adapter.ts:146`), `presetComponents()` (`adapter.ts:151` — returns the FULL component list: preset + vdv), `Color` (already imported `adapter.ts:11`), and Mol\*'s `setStructureOverpaint` / `clearStructureOverpaint`.
- Produces: `highlight(loci): Promise<void>` and `clearHighlight(): Promise<void>` on `ExecutorContext`, the real overpaint-backed adapter impl, and `MolView.clearHighlight(): Promise<void>`.

- [ ] **Step 1: Change the port signatures**

In `src/context.ts`, replace lines 43-44:

```ts
  highlight(loci: StructureElement.Loci): Promise<void>;
  clearHighlight(): Promise<void>;
```

- [ ] **Step 2: Verify typecheck now fails (the adapter/handle/fake are out of sync)**

Run: `pnpm typecheck`
Expected: FAIL — `adapter.ts`'s sync `highlight`/`clearHighlight` (return `void`) no longer satisfy `Promise<void>`; the test fake's `highlight: vi.fn((_loci) => {})` likewise; `create-mol-view.ts`'s `MolView` interface still declares `void`. (These are fixed in the next steps; they must all land in this one commit.)

- [ ] **Step 3: Add the overpaint import and the highlight color constant**

In `src/mol/adapter.ts`, add after the existing `setStructureTransparency` import (line 14):

```ts
import { setStructureOverpaint, clearStructureOverpaint } from 'molstar/lib/mol-plugin-state/helpers/structure-overpaint';
```

Add a module-level constant near `SCHEME_TO_THEME` (after line 60):

```ts
/** Persistent highlight color — yellow, deliberately distinct from Mol*'s pink hover marker
 *  (rgb 255,102,153) so a sticky highlight reads differently from a transient hover. */
const HIGHLIGHT_COLOR = Color(0xffff00);
```

- [ ] **Step 4: Replace the adapter's highlight/clearHighlight with the overpaint impl**

In `src/mol/adapter.ts`, replace the `highlight`/`clearHighlight` methods (lines ~272-278):

```ts
    highlight(loci) {
      return serialize(async () => {
        // Overpaint is highlight-exclusive in this adapter (set-color colors the vdv
        // component's representation; preset-hiding uses the transparency node), so a
        // wholesale clear IS the replace step — no last-loci tracking needed. Target the
        // full component list (preset + vdv) so a highlight also shows over a selection
        // that set-color previously recolored. Overpaint colors *existing* geometry only,
        // so atoms no representation draws won't show the highlight (documented limitation).
        await clearStructureOverpaint(plugin, presetComponents());
        await setStructureOverpaint(plugin, presetComponents(), HIGHLIGHT_COLOR, async () => loci);
      });
    },

    clearHighlight() {
      return serialize(async () => {
        await clearStructureOverpaint(plugin, presetComponents());
      });
    },
```

- [ ] **Step 5: Update the MolView handle return type**

In `src/mol/create-mol-view.ts`, change the interface member (line 29):

```ts
  clearHighlight(): Promise<void>;
```

The wiring at line 81 (`clearHighlight: () => ctx.clearHighlight()`) is unchanged — it now returns the promise automatically.

- [ ] **Step 6: Update the test fake so it satisfies the async port**

In `test/executor.test.ts`, change the fake's highlight/clearHighlight (lines 19-20):

```ts
    highlight: vi.fn(async (_loci: SE.Loci) => {}),
    clearHighlight: vi.fn(async () => {}),
```

- [ ] **Step 7: Run typecheck + full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — all signatures aligned; existing highlight/clear-highlight tests still green (the spies still record calls; `StructureElement.Loci.size(loci)` extraction from `mock.calls` is unaffected).

- [ ] **Step 8: Commit**

```bash
git add src/context.ts src/mol/adapter.ts src/mol/create-mol-view.ts test/executor.test.ts
git commit -m "feat(adapter): persistent highlight via overpaint (async port)"
```

---

### Task 4: Demo control + GPU verification

**Files:**
- Modify: `examples/demo/src/panels/CommandsPanel.tsx`

**Interfaces:**
- Consumes: `viewer.dispatch(command)` (the command bus) and `viewer.clearHighlight()` (the handle). `Command` / `CommandResult` from the public barrel.
- Produces: a command-bus `clear-highlight` button (exercises the new command path end-to-end on a real GPU).

- [ ] **Step 1: Replace the Clear-highlight control with both a command-bus and a handle button**

In `examples/demo/src/panels/CommandsPanel.tsx`, replace the single Clear-highlight button (lines 20-22) with:

```tsx
      <button disabled={disabled} onClick={() => run({ name: 'clear-highlight', input: {} })}>
        Clear highlight (command)
      </button>{' '}
      <button disabled={disabled} onClick={() => void viewer!.clearHighlight()}>
        Clear highlight (handle)
      </button>
```

- [ ] **Step 2: Typecheck the demo**

Run: `pnpm typecheck`
Expected: PASS (`void viewer!.clearHighlight()` discards the returned promise cleanly).

- [ ] **Step 3: Manual GPU verification**

Run the demo on a GPU (`pnpm --dir examples/demo dev`, open in a WebGL browser). Verify:
1. Load a structure (LoadPanel), then click **Highlight chain A** → chain A turns yellow.
2. Move the pointer over the canvas / hover residues / click atoms / **Focus chain A** → the yellow highlight **remains** (regression check for #38).
3. Click **Highlight ligand** → the chain-A highlight is gone, only the ligand is yellow (replace semantics).
4. Click **Clear highlight (command)** → highlight removed; the `ResultView` shows `{ ok: true }`.
5. Highlight again, then **set-color** chain A (RepresentationPanel) a different color, then highlight residues within chain A → the highlight shows yellow over the recolored cartoon; **Clear highlight (handle)** restores the set-color.

- [ ] **Step 4: Commit**

```bash
git add examples/demo/src/panels/CommandsPanel.tsx
git commit -m "demo: dispatch clear-highlight via the command bus; verify persistence"
```

---

### Task 5: Docs / wiki sync

**Files:**
- Modify: `wiki/pages/command-schema.md`, `wiki/pages/molstar-appearance.md`, `wiki/pages/agent-command-flow.md`, `wiki/pages/glossary.md`, `wiki/index.md` (if hooks change), `CLAUDE.md`

**Interfaces:** none (documentation). Verified by internal consistency + link check.

- [ ] **Step 1: Update `wiki/pages/command-schema.md`**

- The `highlight` row (line ~66): change the realization from `interactivity.lociHighlights.highlightOnly({ loci })` to `overpaint (setStructureOverpaint), replace semantics — persistent`.
- Add a `clear-highlight` row: `| clear-highlight | v1 | {} | clearStructureOverpaint |`.
- Keep the `highlight.style` (v1.1b) rows/notes as-is.

- [ ] **Step 2: Update `wiki/pages/molstar-appearance.md`**

Add a short note (Key facts or Details) that **overpaint** (`setStructureOverpaint`/`clearStructureOverpaint`) is now used by the persistent `highlight` command — highlight-exclusive, painted over existing geometry, distinct from the transparency-based preset hiding and from color-on-representation. Note the "existing geometry only" limitation.

- [ ] **Step 3: Update `wiki/pages/agent-command-flow.md`**

Update the port sketch (line ~83) to `highlight(loci): Promise<void>; clearHighlight(): Promise<void>;` and the mapping (line ~104-105) from `lociHighlights.highlightOnly` to the overpaint helpers.

- [ ] **Step 4: Update `wiki/pages/glossary.md`**

Clarify the `selection vs highlight` entry (line ~24): the vdv **`highlight` command** is now persistent (overpaint), while Mol\*'s `interactivity.lociHighlights` channel is still the transient hover one — the command no longer maps to that channel.

- [ ] **Step 5: Update `CLAUDE.md`**

Add a status bullet under the Status section for the highlight-persistence fix (issue #38): persistent overpaint-based highlight + `clear-highlight` command, async port, yellow default color, no schema change, no new error code. Update the suite test count if it changed (was **186 tests**; add the new command + executor + adapter-fake tests).

- [ ] **Step 6: Verify docs + full gate**

Run: `pnpm typecheck && pnpm test`
Expected: PASS. Optionally run the `/wiki-lint` skill to confirm no broken `[[links]]`/index drift.

- [ ] **Step 7: Commit**

```bash
git add wiki/ CLAUDE.md
git commit -m "docs: sync wiki + CLAUDE.md for persistent highlight (#38)"
```

---

## Self-Review

**1. Spec coverage** (against `2026-07-01-highlight-persistence-design.md`):
- §3.1 highlight color → Task 3 Step 3 (`HIGHLIGHT_COLOR = Color(0xffff00)`). ✓
- §3.2 port async → Task 3 Step 1. ✓
- §3.3 adapter overpaint impl → Task 3 Steps 3-4. ✓
- §3.4 catalog `clear-highlight` + description → Task 1. ✓
- §3.5 executor await + case → Task 2. ✓
- §3.6 handle return type → Task 3 Step 5. ✓
- §4 behavior (persist/replace/clear/compose/limitation) → asserted in Task 4 GPU steps; encoded in adapter comments. ✓
- §5 error handling (no new code, empty_selection unchanged, idempotent clear) → Task 2 (clear needs no selection); no error-code edits anywhere. ✓
- §6 testing (Node executor + catalog; GPU/demo) → Tasks 1, 2, 4. ✓
- §7 docs → Task 5. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows the actual code; every run step gives an exact command + expected result. ✓

**3. Type consistency:** `highlight(loci): Promise<void>` / `clearHighlight(): Promise<void>` used identically in context.ts (Task 3), the adapter impl (Task 3), the fake (Task 3), and awaited in the executor (Task 2). `presetComponents()`, `HIGHLIGHT_COLOR`, `setStructureOverpaint`/`clearStructureOverpaint` names are consistent across steps. Command name `clear-highlight` is identical in the catalog, executor case, tests, and demo. ✓
