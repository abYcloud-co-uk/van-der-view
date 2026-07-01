# Highlight Persistence — Design Spec

**Status:** Approved (brainstorm 2026-07-01)
**Branch:** `fix/highlight-persistence` (off `main` @ `52d9900`)
**Closes:** issue #38 (highlight is transient — cleared by any pointer hover; make it persistent)

## 1. Goal

Make the `highlight` command **persistent**: it must survive pointer hover, click,
`focus`, and every other command, and only disappear when explicitly replaced or
cleared (or when the scene is reloaded). Today `highlight` writes to Mol\*'s hover
marking channel, which the built-in hover behavior overwrites on the next pointer
move — so any mouse movement over the canvas wipes it.

Two changes, both **minimal-scope**:

- **Persistent highlight via overpaint** — replace the `lociHighlights` call with a
  persistent **overpaint** layer (a highlight color painted over the existing
  representation), mirroring the appearance model's use of the sibling transparency
  helper. **Replace semantics**: a new `highlight` clears the prior one (no stacking).
- **New `clear-highlight` command** — add a dispatchable `clear-highlight` so an
  agent/host on the command bus can remove a highlight. Today clearing is only
  reachable via the `MolView.clearHighlight()` handle method, not the command bus.

**Out of scope (YAGNI):** configurable highlight color/style (`highlight.style`,
deferred to v1.1b), multiple simultaneous highlights (additive), and highlighting
atoms no representation draws (see §4 limitation). The `highlight` command's input
schema stays `{ selection }` — **unchanged**, so host codegen/tools are untouched.

## 2. Verified facts (firsthand, 2026-07-01, molstar 5.10.1)

- `adapter.ts:272-278` — `highlight(loci)` calls
  `plugin.managers.interactivity.lociHighlights.highlightOnly({ loci })`;
  `clearHighlight()` calls `lociHighlights.clearHighlights()`. Both are **synchronous
  `void`**. `lociHighlights` is the same hover-marking channel Mol\*'s built-in hover
  behavior (from `DefaultPluginSpec`) writes on every pointer move — hence transient.
- `context.ts:43-44` — port members today: `highlight(loci): void`,
  `clearHighlight(): void`.
- `mol/create-mol-view.ts:29,81` — `MolView.clearHighlight(): void`, wired as
  `() => ctx.clearHighlight()`. `highlight` is **not** on the handle (command-bus only).
- `types.ts:4-7` — `Command = { name: string; input: unknown }`. `name` is a plain
  `string` — **there is no command-name literal union to extend**. Adding a command =
  a new `case` in the executor switch + a `VDV_COMMANDS` entry. Nothing else.
- `executor.ts:227-232` — `case 'highlight'` resolves the loci, returns
  `empty_selection` on an empty match, then calls `ctx.highlight(loci)` (not awaited)
  and returns `ok()`.
- `executor.ts:304-317` — `dispatch` routes commands: `readOnly`
  (`get-scene-context`/`measure-distance`) run immediately; `sceneReplacing`
  (`load-structure`/`load-trajectory`) get supersession; **everything else is a
  non-load mutation → serialized FIFO** via `createSerializer()`. `highlight` already
  falls in this last bucket; `clear-highlight` will too. Neither needs a set edit.
- `adapter.ts:146` — the adapter owns one `serialize = createSerializer()` shared by
  all appearance mutators (`setRepresentation`/`setColor`/`setVisibility`/`addLabel`),
  because they share plugin state (the component tree, the transparency cell).
- `adapter.ts:151-161` — `presetComponents()` = `structures[0].components`, which
  contains **both** the preset's components **and** the vdv components (that's what
  `presetOnlyComponents()` filters against). So it is the full "everything currently
  drawn" list.
- `mol-plugin-state/helpers/structure-overpaint.js` — verified API:
  - `setStructureOverpaint(plugin, components, color, lociGetter, types?)` — appends an
    overpaint layer (`color` is a `Color`; `color === -1` means a clear layer).
  - `clearStructureOverpaint(plugin, components, types?)` — **deletes the overpaint
    node(s)** on those components (all layers). Iterates each component's
    representations via `eachRepr`.
  - Overpaint is a **state-tree representation modifier** — a completely different
    mechanism from the render-time marking overlay (hover/select) and from the camera,
    so hover/click/focus never touch it.
  - **Overpaint is currently unused anywhere else in this codebase** (`set-color` puts
    color on the component's representation; preset-hiding uses the *transparency* node).
    So overpaint is **highlight-exclusive** → replace/clear is a wholesale
    `clearStructureOverpaint(...)`, no last-loci tracking needed.
- `adapter.ts:256-257,330-331` — `loadStructure`/`loadTrajectory` call `plugin.clear()`
  + `components.clear()`, which drops all state-tree nodes including overpaint. So a
  reload naturally removes any highlight — **no extra code**.
- Mol\*'s default hover-marking color is `Color.fromNormalizedRgb(1.0, 0.4, 0.6)` =
  `rgb(255,102,153)` **pink** (`mol-gl/renderer.js:36`), *not* yellow. Our overpaint
  color is our own choice.
- `errors.ts` — `ErrorCode` is a closed union; the executor maps `ExecutorError → its
  code`, everything else → `internal_error`. **No new error code is needed.**

## 3. Design

### 3.1 Highlight color

A module-level constant in `adapter.ts`:

```ts
import { Color } from 'molstar/lib/mol-util/color';
const HIGHLIGHT_COLOR = Color(0xffff00); // yellow — distinct from Mol*'s pink hover marker
```

Yellow is chosen deliberately so a **persistent** highlight is visually
distinguishable from the **transient** pink hover marker that still appears on
pointer-over. Exact value may be nudged during the GPU pass.

### 3.2 Port (`context.ts`)

```ts
highlight(loci: StructureElement.Loci): Promise<void>;  // was: void
clearHighlight(): Promise<void>;                         // was: void
```

Overpaint commits are async; the executor will `await` them.

### 3.3 Adapter (`mol/adapter.ts`)

Both go through the existing shared appearance `serialize` so a highlight's overpaint
commit cannot interleave with a `set-color`'s representation rebuild on shared state:

```ts
highlight(loci) {
  return serialize(async () => {
    // Overpaint is highlight-exclusive here, so a wholesale clear IS the replace step
    // (no last-loci tracking). Target the full component list (preset + vdv) so a
    // highlight shows over a selection that set-color previously recolored, too.
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

New imports: `clearStructureOverpaint`, `setStructureOverpaint` from
`molstar/lib/mol-plugin-state/helpers/structure-overpaint`; `Color` is already imported.

### 3.4 Command catalog (`commands.ts`)

Add to `VDV_COMMANDS` (no input):

```ts
{
  name: 'clear-highlight',
  description: 'Remove the current persistent highlight, if any.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
},
```

The `highlight` entry's `inputSchema` is **unchanged**; only its `description` is
retouched from "Transiently highlight…" to reflect that it now persists until
replaced or cleared.

### 3.5 Executor (`executor.ts`)

```ts
case 'highlight': {
  const loci = lociFor(ctx, requireSelection(asObject(command.input)));
  if (StructureElement.Loci.isEmpty(loci)) return fail('empty_selection', 'selection matched no atoms.');
  await ctx.highlight(loci);   // now awaited
  return ok();
}
case 'clear-highlight': {
  await ctx.clearHighlight();
  return ok();
}
```

`clear-highlight` takes no input and needs no selection. It is neither `readOnly`
nor `sceneReplacing`, so `dispatch` already serializes it FIFO alongside `highlight`
and the other mutators — **no edit to those sets**.

### 3.6 Handle (`mol/create-mol-view.ts`)

`MolView.clearHighlight(): void → Promise<void>` (interface + the existing
`() => ctx.clearHighlight()` wiring now returns the promise). Callers that ignore the
return value are unaffected. `highlight` remains command-bus-only (not added to the
handle).

## 4. Behavior & semantics

- **Persistent.** Overpaint lives on the state tree; hover/click/`focus` act on the
  render-time marking overlay and the camera, never on overpaint → the highlight
  survives all of them.
- **Replace.** A second `highlight` wholesale-clears overpaint then repaints the new
  loci → only the latest selection is highlighted (no stacking). Matches issue
  acceptance.
- **Cleared by:** `clear-highlight` (command) / `MolView.clearHighlight()`; a new
  `highlight`; or a scene reload (`load-structure`/`load-trajectory` → `plugin.clear()`).
- **Composition with `set-color`.** Overpaint paints **over** a representation's base
  color, so on overlapping atoms the highlight visually wins; clearing the highlight
  restores the underlying color. Documented precedence: highlight > set-color, and
  highlight is non-destructive to it.
- **Limitation (accepted).** Overpaint colors **existing geometry only**. A highlight
  on atoms no representation draws (e.g. waters absent from the `default` preset) will
  not show. Acceptable for the common cartoon/ball-and-stick case; a dedicated
  highlight representation would be the heavier alternative (out of scope).
- **Hover-over-a-highlight visual.** Hovering the highlighted atoms momentarily
  composites the pink hover marker over the yellow overpaint; moving away leaves the
  persistent yellow. Expected; the color choice keeps the two distinguishable.

## 5. Error handling

No new error codes. `highlight` on an empty selection still returns the existing
`empty_selection`. `clear-highlight` is idempotent — clearing with nothing
highlighted is a no-op `ok()`. A throwing overpaint commit propagates to the
executor's existing `try/catch` → `internal_error`.

## 6. Testing

- **Node-testable (executor, via a fake `ExecutorContext`):**
  - `highlight` is now awaited (fake resolves a promise; empty-selection still short
    circuits before the call).
  - new `clear-highlight` case dispatches `ctx.clearHighlight()` and returns `ok()`
    with no selection required.
  - `VDV_COMMANDS` contains a `clear-highlight` entry with an empty input schema; the
    `highlight` entry's schema is unchanged.
  - `dispatch` serializes `clear-highlight` on the FIFO mutation path (not a read, not
    superseding).
- **GPU / demo (typecheck-gated + hand-verified):** the overpaint adapter code. Demo
  gets a "Clear highlight" control; verify the highlight persists across hover, click,
  and `focus`, that a second `highlight` replaces the first, and that `clear-highlight`
  removes it. Verify a highlight over a `set-color`'d selection still shows.

## 7. Docs / wiki

- `wiki/pages/command-schema.md` — `highlight` row: realization now overpaint (was
  `lociHighlights.highlightOnly`), semantics now persistent; add a `clear-highlight`
  row. Keep the `highlight.style` (v1.1b) notes.
- `wiki/pages/molstar-appearance.md` — note overpaint is now used (by highlight),
  distinct from the transparency-based preset hiding.
- `wiki/pages/agent-command-flow.md` — port signatures (`highlight`/`clearHighlight`
  now `Promise<void>`) and the `highlight` → overpaint mapping.
- `wiki/pages/glossary.md` — the "highlight is transient/hover-style" line is now
  outdated for the *command* (the vdv `highlight` command is persistent; Mol\*'s
  `lociHighlights` channel is still the transient hover one — clarify the distinction).
- `CLAUDE.md` — status bullet for the highlight-persistence fix.

## 8. Files touched (summary)

| File | Change |
|---|---|
| `src/context.ts` | `highlight`/`clearHighlight` → `Promise<void>` |
| `src/mol/adapter.ts` | overpaint impl + `HIGHLIGHT_COLOR`; new imports |
| `src/commands.ts` | add `clear-highlight`; retouch `highlight` description |
| `src/executor.ts` | `await ctx.highlight`; new `clear-highlight` case |
| `src/mol/create-mol-view.ts` | `MolView.clearHighlight(): Promise<void>` |
| tests | executor + command-catalog cases (Node) |
| `examples/demo/` | "Clear highlight" control (GPU verification) |
| `wiki/`, `CLAUDE.md` | docs sync |
