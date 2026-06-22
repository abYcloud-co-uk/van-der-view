# Plan 3b — Vite Demo + Manual XR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-only Vite + React demo app (`examples/demo/`, no LLM/chat) that drives the real Plan-3a Mol\* adapter on a GPU through all five panels, plus a manual XR checklist — the manual verification layer for the browser runtime core.

**Architecture:** `examples/demo` is a **pnpm workspace member** (so its `vite`/`react` dev-deps install) that consumes the library through **Vite `resolve.alias`** to TS source (`van-der-view` → `src/index.ts`, `van-der-view/browser` → `src/browser.ts`) — *not* a `workspace:*` dependency, so no packaging is pulled forward. A `<MolViewProvider>` wraps an `<App/>` that renders `<MolViewCanvas/>` beside a column of six panels, each wired through `useMolView()`.

**Tech Stack:** Vite 7, `@vitejs/plugin-react` 5, React 19, TypeScript 6 (bundler resolution), pnpm workspaces. The library (molstar 5.10.1) is reached via the alias; molstar loads lazily inside `<MolViewCanvas/>`'s effect.

## Global Constraints

- **No `src/` edits.** This plan is purely additive (`examples/demo/**`, `pnpm-workspace.yaml`). The only reason to touch `src/` is a 3a bug surfaced by the manual run — out of this plan's scope; if found, fix on this branch with a noted commit.
- **No automated tests** — this is the manual layer by design. The per-task gate is `pnpm --filter van-der-view-demo typecheck` (and `build` on structural tasks). The library's existing **88 tests must stay green** (they are unaffected — no `src/` changes).
- **Library consumed via alias only**, never `workspace:*` and never a relative `../../src` import in demo code. Demo code imports `van-der-view` and `van-der-view/browser`.
- **Demo tsconfig is separate** from the library's `pnpm typecheck`; demo code never gates library CI.
- **Fixtures:** 1CRN at `examples/demo/src/fixtures/1crn.pdb`, imported via `?raw` → `inline` source; 1HSG via the `pdb` source (id `1hsg`).
- **Demo package name:** `van-der-view-demo`. **Commit prefix:** `feat(plan3b):` / `chore(plan3b):` / `docs(plan3b):`.
- Library surface (consume, do not modify):
  - `van-der-view/browser`: `MolViewProvider`, `MolViewCanvas` (forwards `style`/`className`/`data-*` to its container div), `useMolView(): MolView | undefined`.
  - `MolView`: `dispatch(command: Command): Promise<CommandResult>`, `getSceneContext(): SceneContext`, `clearHighlight(): void`, `xr: MolViewXR`, `plugin`, `handleResize(): void`, `dispose(): void`.
  - `MolViewXR`: `isSupported(): boolean`, `isPresenting(): boolean`, `request(): Promise<void>`, `end(): Promise<void>`, `subscribe(cb: (presenting: boolean) => void): () => void`.
  - `van-der-view`: `adapters` (`adapters.anthropic.toCommand(toolCall: unknown): Command`, throws `AdapterError`), `commands`, and the types `Command` (`{ name: string; input: unknown }`), `CommandResult` (`{ ok: true; data?: unknown } | { ok: false; error: { code: string; message: string } }`).

---

## File Structure

```
pnpm-workspace.yaml                    # MODIFY: add packages: ['examples/*']
examples/demo/
  package.json                         # name van-der-view-demo; vite/react deps + scripts
  vite.config.ts                       # react plugin + the two resolve.alias entries
  tsconfig.json                        # demo-local; paths mirror the aliases; types: vite/client
  index.html                           # #root + module script → /src/main.tsx
  CHECKLIST.md                         # manual smoke + XR/emulator checklist
  src/
    vite-env.d.ts                      # /// <reference types="vite/client" /> (declares ?raw)
    main.tsx                           # createRoot → <MolViewProvider><App/></MolViewProvider>
    App.tsx                            # layout: <MolViewCanvas/> + panel column (grows per task)
    ui.tsx                             # shared <Panel> + <ResultView> (DRY)
    fixtures.ts                        # ?raw import of fixtures/1crn.pdb + the 1HSG id
    fixtures/
      1crn.pdb                         # bundled crambin fixture (downloaded in Task 2)
    panels/
      LoadPanel.tsx
      CommandsPanel.tsx
      SceneContextPanel.tsx
      StepperPanel.tsx
      PasteToolUsePanel.tsx
      XrPanel.tsx
```

Each panel file owns one panel; they share `ui.tsx` and `fixtures.ts`. `App.tsx` is the composition root — every panel task adds one import + one element to it.

---

## Task 1: Scaffold the workspace + a building canvas

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `examples/demo/package.json`, `examples/demo/vite.config.ts`, `examples/demo/tsconfig.json`, `examples/demo/index.html`, `examples/demo/src/vite-env.d.ts`, `examples/demo/src/main.tsx`, `examples/demo/src/App.tsx`, `examples/demo/src/ui.tsx`

**Interfaces:**
- Produces: the `van-der-view` / `van-der-view/browser` aliases (Vite + tsconfig `paths`); `ui.tsx` exporting `Panel({ title, children })` and `ResultView({ result })`; an `App()` with a `{/* PANELS */}` insertion marker.
- Consumes: the library surface in Global Constraints.

- [ ] **Step 1: Register the demo as a workspace member**

Modify `pnpm-workspace.yaml` — add a `packages:` key (keep the existing `allowBuilds`/`strictDepBuilds`):

```yaml
packages:
  - 'examples/*'
```

- [ ] **Step 2: Create `examples/demo/package.json`**

```json
{
  "name": "van-der-view-demo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "molstar": "^5.10.1",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^6.0.3",
    "vite": "^7.0.0"
  }
}
```

> If `vite@^7` / `@vitejs/plugin-react@^5` fail to resolve in this environment, instead run `pnpm --filter van-der-view-demo add -D vite @vitejs/plugin-react` to let pnpm pick current versions, then continue.

- [ ] **Step 3: Create `examples/demo/vite.config.ts`** (array-form aliases — `/browser` MUST precede the bare name)

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'van-der-view/browser', replacement: fileURLToPath(new URL('../../src/browser.ts', import.meta.url)) },
      { find: 'van-der-view', replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    ],
  },
});
```

- [ ] **Step 4: Create `examples/demo/tsconfig.json`** (`paths` mirror the aliases; `vite/client` declares `?raw`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": {
      "van-der-view": ["../../src/index.ts"],
      "van-der-view/browser": ["../../src/browser.ts"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create `examples/demo/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>van-der-view demo</title>
  </head>
  <body style="margin: 0">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `examples/demo/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 7: Create `examples/demo/src/ui.tsx`** (shared panel chrome + result formatter)

```tsx
import type { ReactNode } from 'react';
import type { CommandResult } from 'van-der-view';

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: '1px solid #333', borderRadius: 6, padding: 12, marginBottom: 12 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9bd' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ResultView({ result }: { result: CommandResult | undefined }) {
  if (!result) return null;
  const text = result.ok
    ? `ok${result.data !== undefined ? ' ' + JSON.stringify(result.data) : ''}`
    : `error ${result.error.code}: ${result.error.message}`;
  return (
    <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', color: result.ok ? '#7d8' : '#f88' }}>
      {text}
    </pre>
  );
}
```

- [ ] **Step 8: Create `examples/demo/src/App.tsx`** (canvas + empty panel column with the insertion marker)

```tsx
import { MolViewCanvas } from 'van-der-view/browser';

export function App() {
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#111', color: '#eee' }}>
      <MolViewCanvas style={{ flex: 1, height: '100vh' }} />
      <div style={{ width: 380, overflowY: 'auto', padding: 16, background: '#181818', borderLeft: '1px solid #333' }}>
        <h1 style={{ fontSize: 16, marginTop: 0 }}>van-der-view demo</h1>
        {/* PANELS */}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create `examples/demo/src/main.tsx`** (no `StrictMode` — avoids double mount/dispose of the WebGL context in dev)

```tsx
import { createRoot } from 'react-dom/client';
import { MolViewProvider } from 'van-der-view/browser';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <MolViewProvider>
    <App />
  </MolViewProvider>,
);
```

- [ ] **Step 10: Install the workspace**

Run: `pnpm install`
Expected: completes; `examples/demo` linked as `van-der-view-demo` (no `@scarf` hard-fail).

- [ ] **Step 11: Typecheck the demo**

Run: `pnpm --filter van-der-view-demo typecheck`
Expected: PASS (no errors).

- [ ] **Step 12: Build the demo (proves the whole alias→molstar graph compiles)**

Run: `pnpm --filter van-der-view-demo build`
Expected: SUCCESS — Vite emits `examples/demo/dist/` (a large molstar chunk is normal).

- [ ] **Step 13: Commit**

```bash
git add pnpm-workspace.yaml examples/demo/package.json examples/demo/vite.config.ts examples/demo/tsconfig.json examples/demo/index.html examples/demo/src/vite-env.d.ts examples/demo/src/ui.tsx examples/demo/src/App.tsx examples/demo/src/main.tsx pnpm-lock.yaml
git commit -m "feat(plan3b): scaffold examples/demo Vite app (alias-wired, building canvas)"
```

---

## Task 2: Fixtures + LoadPanel

**Files:**
- Create: `examples/demo/src/fixtures/1crn.pdb`, `examples/demo/src/fixtures.ts`, `examples/demo/src/panels/LoadPanel.tsx`
- Modify: `examples/demo/src/App.tsx`

**Interfaces:**
- Consumes: `Panel`, `ResultView` from `../ui`; `useMolView` from `van-der-view/browser`; `CommandResult` from `van-der-view`.
- Produces: `FIXTURE_1CRN: string`, `FIXTURE_1HSG_ID: string` from `./fixtures`; `LoadPanel()` component.

- [ ] **Step 1: Download the 1CRN fixture**

Run: `curl -sL https://files.rcsb.org/download/1CRN.pdb -o examples/demo/src/fixtures/1crn.pdb`
Verify: `head -1 examples/demo/src/fixtures/1crn.pdb` starts with `HEADER` and the file is non-empty.

> If this environment has no network, save the 1CRN PDB text to that path by hand before continuing (any valid PDB with a chain `A` works; crambin is the intended fixture).

- [ ] **Step 2: Create `examples/demo/src/fixtures.ts`**

```ts
import CRN_PDB from './fixtures/1crn.pdb?raw';

/** Crambin (46 residues, chain A, no ligand), loaded via the inline source. */
export const FIXTURE_1CRN: string = CRN_PDB;

/** HIV-1 protease + indinavir, loaded via the pdb source (RCSB download). */
export const FIXTURE_1HSG_ID = '1hsg';
```

- [ ] **Step 3: Create `examples/demo/src/panels/LoadPanel.tsx`**

```tsx
import { useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import type { CommandResult } from 'van-der-view';
import { Panel, ResultView } from '../ui';
import { FIXTURE_1CRN, FIXTURE_1HSG_ID } from '../fixtures';

export function LoadPanel() {
  const viewer = useMolView();
  const [result, setResult] = useState<CommandResult>();
  const disabled = !viewer;
  return (
    <Panel title="Load">
      <button
        disabled={disabled}
        onClick={async () =>
          setResult(
            await viewer!.dispatch({
              name: 'load-structure',
              input: { source: 'inline', data: FIXTURE_1CRN, format: 'pdb' },
            }),
          )
        }
      >
        Load 1CRN (inline)
      </button>{' '}
      <button
        disabled={disabled}
        onClick={async () =>
          setResult(
            await viewer!.dispatch({ name: 'load-structure', input: { source: 'pdb', id: FIXTURE_1HSG_ID } }),
          )
        }
      >
        Load 1HSG (pdb)
      </button>
      <ResultView result={result} />
    </Panel>
  );
}
```

- [ ] **Step 4: Mount LoadPanel in `App.tsx`**

Add the import at the top of `examples/demo/src/App.tsx`:

```tsx
import { LoadPanel } from './panels/LoadPanel';
```

Replace the `{/* PANELS */}` line with:

```tsx
        <LoadPanel />
        {/* PANELS */}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter van-der-view-demo typecheck`
Expected: PASS — the `?raw` import resolves to `string` (via `vite/client`).

- [ ] **Step 6: Commit**

```bash
git add examples/demo/src/fixtures/1crn.pdb examples/demo/src/fixtures.ts examples/demo/src/panels/LoadPanel.tsx examples/demo/src/App.tsx
git commit -m "feat(plan3b): LoadPanel + 1CRN/1HSG fixtures (inline + pdb sources)"
```

---

## Task 3: CommandsPanel (highlight / focus + zoomOut slider / reset / clear)

**Files:**
- Create: `examples/demo/src/panels/CommandsPanel.tsx`
- Modify: `examples/demo/src/App.tsx`

**Interfaces:**
- Consumes: `Panel`, `ResultView`, `useMolView`, `CommandResult`.
- Produces: `CommandsPanel()`.

- [ ] **Step 1: Create `examples/demo/src/panels/CommandsPanel.tsx`**

```tsx
import { useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import type { Command, CommandResult } from 'van-der-view';
import { Panel, ResultView } from '../ui';

export function CommandsPanel() {
  const viewer = useMolView();
  const [result, setResult] = useState<CommandResult>();
  const [zoomOut, setZoomOut] = useState(1);
  const disabled = !viewer;
  const run = async (command: Command) => setResult(await viewer!.dispatch(command));
  return (
    <Panel title="Commands">
      <button disabled={disabled} onClick={() => run({ name: 'highlight', input: { selection: { chain: 'A' } } })}>
        Highlight chain A
      </button>{' '}
      <button disabled={disabled} onClick={() => run({ name: 'highlight', input: { selection: { preset: 'ligand' } } })}>
        Highlight ligand
      </button>{' '}
      <button disabled={disabled} onClick={() => viewer!.clearHighlight()}>
        Clear highlight
      </button>
      <hr style={{ borderColor: '#333' }} />
      <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
        zoomOut factor: {zoomOut.toFixed(1)}
        <input
          type="range"
          min={1}
          max={4}
          step={0.1}
          value={zoomOut}
          onChange={(e) => setZoomOut(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </label>
      <button
        disabled={disabled}
        onClick={() => run({ name: 'focus', input: { selection: { chain: 'A' }, zoomOut, durationMs: 250 } })}
      >
        Focus chain A
      </button>{' '}
      <button disabled={disabled} onClick={() => run({ name: 'reset-camera', input: {} })}>
        Reset camera
      </button>
      <ResultView result={result} />
    </Panel>
  );
}
```

- [ ] **Step 2: Mount in `App.tsx`** — add import and insert above the marker

```tsx
import { CommandsPanel } from './panels/CommandsPanel';
```

```tsx
        <CommandsPanel />
        {/* PANELS */}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter van-der-view-demo typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add examples/demo/src/panels/CommandsPanel.tsx examples/demo/src/App.tsx
git commit -m "feat(plan3b): CommandsPanel with highlight/focus/reset + zoomOut slider"
```

---

## Task 4: SceneContextPanel

**Files:**
- Create: `examples/demo/src/panels/SceneContextPanel.tsx`
- Modify: `examples/demo/src/App.tsx`

**Interfaces:**
- Consumes: `Panel`, `useMolView`. (`getSceneContext()` returns `SceneContext`; rendered as JSON, so no type import needed.)
- Produces: `SceneContextPanel()`.

- [ ] **Step 1: Create `examples/demo/src/panels/SceneContextPanel.tsx`**

```tsx
import { useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import { Panel } from '../ui';

export function SceneContextPanel() {
  const viewer = useMolView();
  const [scene, setScene] = useState<unknown>();
  return (
    <Panel title="Scene context">
      <button disabled={!viewer} onClick={() => setScene(viewer!.getSceneContext())}>
        Refresh
      </button>
      <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', color: '#cde' }}>
        {scene ? JSON.stringify(scene, null, 2) : '(click refresh to read what the agent sees)'}
      </pre>
    </Panel>
  );
}
```

- [ ] **Step 2: Mount in `App.tsx`** — add import and insert above the marker

```tsx
import { SceneContextPanel } from './panels/SceneContextPanel';
```

```tsx
        <SceneContextPanel />
        {/* PANELS */}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter van-der-view-demo typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add examples/demo/src/panels/SceneContextPanel.tsx examples/demo/src/App.tsx
git commit -m "feat(plan3b): SceneContextPanel (getSceneContext readout)"
```

---

## Task 5: StepperPanel

**Files:**
- Create: `examples/demo/src/panels/StepperPanel.tsx`
- Modify: `examples/demo/src/App.tsx`

**Interfaces:**
- Consumes: `Panel`, `ResultView`, `useMolView`, `Command`, `CommandResult`, `FIXTURE_1CRN`.
- Produces: `StepperPanel()`.

- [ ] **Step 1: Create `examples/demo/src/panels/StepperPanel.tsx`** (Next button + global Enter key; the no-deps effect keeps the handler's closure fresh)

```tsx
import { useEffect, useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import type { Command, CommandResult } from 'van-der-view';
import { Panel, ResultView } from '../ui';
import { FIXTURE_1CRN } from '../fixtures';

const SEQUENCE: Command[] = [
  { name: 'load-structure', input: { source: 'inline', data: FIXTURE_1CRN, format: 'pdb' } },
  { name: 'highlight', input: { selection: { chain: 'A' } } },
  { name: 'focus', input: { selection: { chain: 'A' }, zoomOut: 2 } },
  { name: 'reset-camera', input: {} },
];

export function StepperPanel() {
  const viewer = useMolView();
  const [i, setI] = useState(0);
  const [result, setResult] = useState<CommandResult>();
  const pos = i % SEQUENCE.length;

  const next = async () => {
    if (!viewer) return;
    setResult(await viewer.dispatch(SEQUENCE[pos]));
    setI((n) => n + 1);
  };

  // No dependency array: re-bind each render so the listener always closes over
  // the current `viewer`/`pos`. Cheap for a single-key demo handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') void next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Panel title="Sequence stepper">
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        step {pos} / {SEQUENCE.length}: <code>{SEQUENCE[pos].name}</code>
      </div>
      <button disabled={!viewer} onClick={() => void next()}>
        Next ▶ (or press Enter)
      </button>
      <ResultView result={result} />
    </Panel>
  );
}
```

- [ ] **Step 2: Mount in `App.tsx`** — add import and insert above the marker

```tsx
import { StepperPanel } from './panels/StepperPanel';
```

```tsx
        <StepperPanel />
        {/* PANELS */}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter van-der-view-demo typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add examples/demo/src/panels/StepperPanel.tsx examples/demo/src/App.tsx
git commit -m "feat(plan3b): StepperPanel (Next/Enter fires a preset command sequence)"
```

---

## Task 6: PasteToolUsePanel

**Files:**
- Create: `examples/demo/src/panels/PasteToolUsePanel.tsx`
- Modify: `examples/demo/src/App.tsx`

**Interfaces:**
- Consumes: `Panel`, `ResultView`, `useMolView`, `adapters`, `Command`, `CommandResult`.
- Produces: `PasteToolUsePanel()`.

- [ ] **Step 1: Create `examples/demo/src/panels/PasteToolUsePanel.tsx`** (JSON.parse + `toCommand` both guarded; `AdapterError` message shown)

```tsx
import { useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import { adapters } from 'van-der-view';
import type { Command, CommandResult } from 'van-der-view';
import { Panel, ResultView } from '../ui';

const SAMPLE = JSON.stringify(
  { type: 'tool_use', id: 'toolu_demo', name: 'highlight', input: { selection: { chain: 'A' } } },
  null,
  2,
);

export function PasteToolUsePanel() {
  const viewer = useMolView();
  const [text, setText] = useState(SAMPLE);
  const [command, setCommand] = useState<Command>();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<CommandResult>();

  const run = async () => {
    setError(undefined);
    setCommand(undefined);
    setResult(undefined);
    let cmd: Command;
    try {
      cmd = adapters.anthropic.toCommand(JSON.parse(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setCommand(cmd);
    if (viewer) setResult(await viewer.dispatch(cmd));
  };

  return (
    <Panel title="Paste tool_use">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12 }}
      />
      <button disabled={!viewer} onClick={() => void run()}>
        toCommand → dispatch
      </button>
      {error && <pre style={{ margin: '8px 0 0', fontSize: 12, color: '#f88', whiteSpace: 'pre-wrap' }}>{error}</pre>}
      {command && (
        <pre style={{ margin: '8px 0 0', fontSize: 12, color: '#9bd', whiteSpace: 'pre-wrap' }}>
          Command: {JSON.stringify(command)}
        </pre>
      )}
      <ResultView result={result} />
    </Panel>
  );
}
```

- [ ] **Step 2: Mount in `App.tsx`** — add import and insert above the marker

```tsx
import { PasteToolUsePanel } from './panels/PasteToolUsePanel';
```

```tsx
        <PasteToolUsePanel />
        {/* PANELS */}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter van-der-view-demo typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add examples/demo/src/panels/PasteToolUsePanel.tsx examples/demo/src/App.tsx
git commit -m "feat(plan3b): PasteToolUsePanel (Anthropic tool_use → toCommand → dispatch)"
```

---

## Task 7: XrPanel

**Files:**
- Create: `examples/demo/src/panels/XrPanel.tsx`
- Modify: `examples/demo/src/App.tsx`

**Interfaces:**
- Consumes: `Panel`, `useMolView`, and `MolView.xr` (`isSupported()`, `isPresenting()`, `request()`, `end()`, `subscribe(cb)`).
- Produces: `XrPanel()`.

- [ ] **Step 1: Create `examples/demo/src/panels/XrPanel.tsx`** (button calls `request()`/`end()` directly in the click handler — the WebXR user-gesture rule; gated on `isSupported()`)

```tsx
import { useEffect, useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import { Panel } from '../ui';

export function XrPanel() {
  const viewer = useMolView();
  const [presenting, setPresenting] = useState(false);
  const supported = viewer?.xr.isSupported() ?? false;

  useEffect(() => {
    if (!viewer) return;
    setPresenting(viewer.xr.isPresenting());
    return viewer.xr.subscribe(setPresenting);
  }, [viewer]);

  return (
    <Panel title="WebXR">
      {!viewer ? (
        <div style={{ fontSize: 12, color: '#999' }}>initializing…</div>
      ) : supported ? (
        <button onClick={() => void (presenting ? viewer.xr.end() : viewer.xr.request())}>
          {presenting ? 'Exit XR' : 'Enter XR'}
        </button>
      ) : (
        <div style={{ fontSize: 12, color: '#fb7' }}>
          WebXR not available here. See <code>CHECKLIST.md</code> for the Immersive Web Emulator path.
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 2: Mount in `App.tsx`** — add import and insert above the marker

```tsx
import { XrPanel } from './panels/XrPanel';
```

```tsx
        <XrPanel />
        {/* PANELS */}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter van-der-view-demo typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add examples/demo/src/panels/XrPanel.tsx examples/demo/src/App.tsx
git commit -m "feat(plan3b): XrPanel (gesture-gated Enter/Exit XR, isSupported gating)"
```

---

## Task 8: Manual checklist + final gate

**Files:**
- Create: `examples/demo/CHECKLIST.md`

**Interfaces:**
- Consumes: nothing new. Final integration gate over the whole demo.

- [ ] **Step 1: Create `examples/demo/CHECKLIST.md`**

````markdown
# van-der-view demo — manual smoke checklist (Plan 3b)

Client-only Vite app that drives the real Plan-3a Mol\* adapter. No LLM/chat.

## Run

```bash
pnpm install                              # from the repo root, once
pnpm --filter van-der-view-demo dev       # opens Vite dev server
```

Open the printed URL. The left pane is the Mol\* canvas; the right column is the panels.

## Smoke steps (eyeball each)

1. **Canvas paints** — left pane is a non-zero, dark 3D viewport.
2. **Load** — "Load 1CRN (inline)" → crambin renders (cartoon). "Load 1HSG (pdb)" →
   the scene is **replaced** (1CRN gone, protease + ligand shown). Confirms `clear()`-on-load.
3. **Highlight** — "Highlight chain A" shows a transient highlight; "Highlight ligand"
   (after loading 1HSG) highlights the ligand; "Clear highlight" removes it.
4. **Focus + zoomOut** — drag the **zoomOut** slider 1 → 4 and click "Focus chain A" at a
   few values; confirm the camera frames tighter at 1 and pulls back further as it rises.
   **Record a comfortable default** to feed back into the docs.
5. **Reset camera** — returns to the default framing.
6. **Scene context** — "Refresh" shows `loaded: true` and the expected `chains` for the
   loaded structure; it matches what's on screen.
7. **Stepper** — click "Next" (or press Enter) repeatedly; commands fire one at a time and
   loop load → highlight → focus → reset.
8. **Paste tool_use** — edit the sample block (or paste real Claude output); "toCommand →
   dispatch" shows the normalized `Command` then renders. A malformed block shows a clean
   adapter error, not a crash.
9. **Error surfacing** — try highlight before loading → an `empty_selection`/`no_structure`
   result line appears (no silent failure).

## WebXR

The XR panel enables "Enter XR" only when `xr.isSupported()` is true.

- **Real headset:** open the dev URL over **https** (or `localhost`) on a WebXR browser
  (e.g. Quest browser). Enter → stereo render → run a command from the panel while presenting
  → Exit (button, GamepadB, or headset removal).
- **No headset — Immersive Web Emulator:** install the *Immersive Web Emulator* browser
  extension (Chromium), open its DevTools tab to add a virtual VR device, reload the demo,
  then "Enter XR" → confirm the stereo view → a dispatched command applies → "Exit XR".

> WebXR `request()` must run from a real user gesture — the button calls it directly in the
> click handler. The agent can never self-enter XR.

## Build gate

```bash
pnpm --filter van-der-view-demo build     # production bundle compiles (large molstar chunk is normal)
```
````

- [ ] **Step 2: Full demo build (whole graph, all panels)**

Run: `pnpm --filter van-der-view-demo build`
Expected: SUCCESS.

- [ ] **Step 3: Demo typecheck**

Run: `pnpm --filter van-der-view-demo typecheck`
Expected: PASS.

- [ ] **Step 4: Confirm the library suite is still green (unchanged by this plan)**

Run: `pnpm test && pnpm typecheck`
Expected: 88 tests pass; library typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add examples/demo/CHECKLIST.md
git commit -m "docs(plan3b): manual smoke + WebXR/emulator checklist"
```

---

## Manual verification (handoff to the developer)

The automated gate above (typecheck + build + library suite green) is all that can be
verified without a GPU. The **real verification is the developer running `CHECKLIST.md`** on
a machine with WebGL (and a headset or the Immersive Web Emulator for the XR step). Any
defect that traces to Plan-3a GPU code (e.g. the adapter, `createMolView`, the canvas mount)
is fixed on this branch with a noted commit — that feedback loop is the purpose of this
manual layer. Feed the eyeballed `focus.zoomOut` comfortable default back into the docs.

## Self-review notes (done during authoring)

- **Spec coverage:** all five panels (Tasks 2–7), both fixtures (Task 2), the workspace+alias
  wiring (Task 1), the separate demo tsconfig (Task 1), the checklist + emulator path (Task 8),
  and the zoomOut-by-eye slider (Task 3) each map to a task.
- **No placeholders:** every step ships real code/commands; the only intentional manual hook
  is the offline-fixture fallback in Task 2 (network-dependent), explicitly flagged.
- **Type consistency:** panels consume `Command`/`CommandResult` exactly as exported from
  `van-der-view`; `MolViewXR` methods (`isSupported`/`isPresenting`/`request`/`end`/`subscribe`)
  match `src/mol/xr.ts`; `useMolView()` is treated as possibly-`undefined` everywhere.
