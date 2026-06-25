# Hover Surface — Design Spec

**Status:** Approved (brainstorm 2026-06-24)
**Branch:** `feat/hover-surface` (off `main` @ `a4bbabc`)
**Closes:** issue #29 (hover-only; click split to a follow-up — see §7)

## 1. Goal

Expose the hovered-structure info from `MolView` so a host can render its own
tooltip on the bare canvas, without reaching into Mol\* internals through the
`plugin` escape hatch.

Two surfaces, both new:

- **Root:** `MolView.subscribeHover(cb: (info: HoverInfo | null) => void): () => void`
  — composable, returns an unsubscribe; same shape as the existing `xr` wrapper.
- **Sugar:** a `<MolViewCanvas onHover={...}>` prop — internally subscribes and
  unsubscribes on unmount.

The data already exists: vdv mounts with `DefaultPluginSpec` (`create-mol-view.ts:49`),
which registers `HighlightLoci`, so `plugin.behaviors.interaction.hover` (an rxjs
`BehaviorSubject<InteractivityManager.HoverEvent>`) **already fires** on every
pointer move — it is the Subject driving the existing hover-highlight. Exposing it
is one extra listener: no second pick pass, no new render loop.

## 2. Verified facts (firsthand, 2026-06-24, molstar 5.10.1)

- `MolView` (`src/mol/create-mol-view.ts:25`) exposes `dispatch`/`getSceneContext`/
  `clearHighlight`/`xr`/`plugin`/`handleResize`/`dispose` — **no hover surface**.
- `MolViewCanvas` (`src/react/canvas.tsx`) exposes only `onError`.
- `plugin.behaviors.interaction.hover` is `BehaviorSubject<InteractivityManager.HoverEvent>`
  (`mol-plugin/context.d.ts:82`). `HoverEvent` (`mol-plugin-state/manager/interactivity.d.ts:46`):
  ```ts
  interface HoverEvent {
    current: Representation.Loci;  // real loci is current.loci, a general Loci
    buttons; button; modifiers;
    page?: Vec2;       // screen coords (pageX/pageY) — present on pointer-driven events
    position?: Vec3;   // 3D world coords — not surfaced (YAGNI)
  }
  ```
- `lociLabel(loci, options?)` (`mol-theme/label.d.ts:19`) returns a `string`;
  `LabelOptions.htmlStyling: boolean` toggles HTML markup. `label.js` imports only
  `mol-model`/`mol-math`/`mol-util` (incl. `stripTags`) — **no WebGL/canvas**, so it
  runs in Node.
- Node loci-building fixtures already exist: `test/fixtures/structures.ts`
  `buildStructureFromPDB(PDB_TINY)` + `src/selection.ts` `resolveSelection` produce a
  real `StructureElement.Loci` off-GPU (the pattern `test/measure.test.ts` uses).

## 3. Architecture

Mirror the existing layering: a **pure, molstar-dependent extraction module** beside
`measure.ts`/`selection.ts` (Node-tested), wired by the GPU-bound runtime
(typecheck-gated + GPU-verified).

| Unit | Location | Responsibility | GPU? | Test |
|---|---|---|---|---|
| `toHoverInfo` + `HoverInfo` | **new** `src/hover.ts` | `HoverEvent → HoverInfo \| null` (pure) | no | **Node unit** |
| `subscribeHover` | `src/mol/create-mol-view.ts` (`MolView` member) | subscribe the hover Subject, map via `toHoverInfo`, return unsubscribe | yes | typecheck + GPU |
| `onHover` prop | `src/react/canvas.tsx` (`MolViewCanvasProps`) | subscribe via `subscribeHover`, unsubscribe on cleanup, ref-stable | no* | jsdom (mock view) + GPU |
| export | `src/browser.ts` | `export type { HoverInfo }` | — | — |
| demo tooltip | `examples/demo/` | render an overlay from `onHover` → GPU acceptance | yes | manual |

\* the prop wiring is testable in jsdom by mocking `createMolView` to return a fake
view with a `subscribeHover` stub.

**Rejected alternatives:** (2) inline everything in `create-mol-view.ts` — entangles
the extraction with the subscription, pushing testable logic behind the GPU gate;
(3) route through the `ExecutorContext` port — wrong layer (hover is an event stream,
not an agent command; would force a fake-port event surface for no benefit).

## 4. Data flow / types

```ts
// src/hover.ts
export interface HoverInfo {
  /** lociLabel(loci, { htmlStyling: false }) — plain text, matches the native viewport tooltip content. */
  label: string;
  chain?: string;        // StructureProperties.chain.auth_asym_id
  residueName?: string;  // StructureProperties.residue.auth_comp_id, e.g. 'GLY'
  residueNumber?: number;// StructureProperties.residue.auth_seq_id
  /** Only set when the hovered loci is a single atom (size === 1); omitted at residue/chain granularity. */
  atomName?: string;     // StructureProperties.atom.auth_atom_id, e.g. 'CA'
  /** event.page (pageX/pageY); may be absent on non-pointer emits. */
  screen?: { x: number; y: number };
  /** event.current.loci — the general molstar Loci, for advanced hosts. */
  loci: Loci;
}

export function toHoverInfo(event: InteractivityManager.HoverEvent): HoverInfo | null;
```

Rules:

1. `Loci.isEmpty(event.current.loci)` (pointer left / empty space) → return **`null`**.
2. `label` is always computed via `lociLabel(loci, { htmlStyling: false })` — works for
   any loci kind (structure, volume, shape).
3. Structured fields (`chain`/`residueName`/`residueNumber`) are filled **only** when
   `StructureElement.Loci.is(loci)`; for non-structure loci, only `label` + `loci`.
4. `atomName` is set **only** when `StructureElement.Loci.size(loci) === 1`. Mol\*'s
   default hover granularity is `residue`, so a typical hover loci spans a whole
   residue — emitting the first atom's name then would be misleading. Single-atom
   (element-granularity) hovers get `atomName`; coarser ones omit it.
5. `screen` is `{ x: page[0], y: page[1] }` when `event.page` is present, else omitted.
6. The structured fields read the **first** element/location of the loci
   (`StructureElement.Location` at the first unit's first index) — at residue
   granularity all elements share chain/residue, so the first is representative.

### Subscription wiring (`create-mol-view.ts`)

```ts
subscribeHover(cb) {
  const sub = bound.behaviors.interaction.hover.subscribe((e) => {
    let info: HoverInfo | null = null;
    try { info = toHoverInfo(e); }
    catch (err) { console.error('[van-der-view] subscribeHover: toHoverInfo failed:', err); }
    try { cb(info); }
    catch (err) { console.error('[van-der-view] subscribeHover callback threw:', err); }
  });
  return () => sub.unsubscribe();
}
```

`subscribeHover` is added to the `MolView` interface (`src/mol/create-mol-view.ts:25`)
and the returned object. A `BehaviorSubject` replays its current value synchronously on
subscribe, so the callback fires once immediately with the current state (usually
`null`); documented on the method.

### Prop wiring (`canvas.tsx`)

```ts
export interface MolViewCanvasProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onError?: (error: Error) => void;
  onHover?: (info: HoverInfo | null) => void;
}
```

In the existing `[plugin]`-keyed init effect, after `registerView(view)`:
`const unsub = view.subscribeHover((info) => onHoverRef.current?.(info));` — `onHover`
is held in a ref (`onHoverRef`, like `onErrorRef`) so a changing identity does not
re-run the init effect, and the subscription is created unconditionally (one cheap
listener) so a later-added `onHover` works without a re-init. Cleanup calls `unsub()`
before `created?.dispose()`; on the `disposed`-race path (view created after unmount)
the view is disposed and no subscription leaks.

## 5. Error handling

- **Protect the shared Subject.** Both `toHoverInfo(e)` and `cb(info)` are wrapped in
  `try/catch` + `console.error` inside `subscribeHover`. A throwing host callback that
  escaped would propagate through rxjs and break the hover `BehaviorSubject` — which is
  the *same* Subject driving Mol\*'s own highlight — so containment here protects core
  rendering, not just the host. The canvas `onHover` path goes through `subscribeHover`,
  so one containment point covers both surfaces (same posture as #24's `onError`).
- **Unsubscribe.** A host-provided plugin is never disposed by vdv, so the canvas must
  explicitly `unsub()` on cleanup; for a vdv-owned plugin, `dispose()` tears down the
  Subject anyway, but `unsub()` is still called (idempotent, harmless).

No new error codes, no change to `dispatch`/`CommandResult`.

## 6. Testing

- **`test/hover.test.ts` (new, Node).** Build a real loci via
  `buildStructureFromPDB(PDB_TINY)` + `resolveSelection`, wrap in a hand-built
  `HoverEvent`, assert: `label` is non-empty and tag-free; `chain`/`residueName`/
  `residueNumber` match the fixture; `atomName` present for a single-atom loci and
  absent for a residue/multi-atom loci; `screen` derived from `page`; empty loci →
  `null`. `lociLabel` confirmed Node-safe (§2).
- **`test/canvas.test.tsx` (extend).** With `createMolView` mocked to return a fake
  view exposing a `subscribeHover` stub: `onHover` is wired through and the returned
  unsubscribe is called on unmount. (Containment of a throwing host callback is **not**
  retested here — it lives in `subscribeHoverEvents` and is covered by `test/hover.test.ts`;
  the canvas's fake `subscribeHover` stub has no containment, so the canvas test scope is
  wiring + lifecycle only.)
- **GPU-bound** (real Subject + picking, demo tooltip): typecheck-gated + manual
  verification in the demo.
- Suite: **149 → 159** (hover.ts +9, canvas onHover +1).

## 7. Scope

**In:** `src/hover.ts` (`toHoverInfo` + `HoverInfo`), `MolView.subscribeHover`,
`MolViewCanvas` `onHover` prop, `HoverInfo` export from `src/browser.ts`, a demo
tooltip overlay, the tests above.

**Out (deferred):**

- **Click** (`onClick`/`subscribeClick`, `ClickInfo`) — `interaction.click` is the
  symmetric Subject and `toHoverInfo`'s extraction is reusable, but there is no
  current consumer need. Split to a follow-up issue; the extraction module is built to
  be reused so adding click later is small and non-breaking.
- **3D world position** (`event.position`) — not surfaced; advanced hosts can derive it
  from `loci`.
- **HTML-styled label** — `label` is plain text by decision; the structured fields let
  a host reproduce or exceed the native styling.
- No changes to `SceneContext`, the agent-side barrel, the `ExecutorContext` port, or
  the command catalog. The molstar-free entry (`src/index.ts`) is untouched.
