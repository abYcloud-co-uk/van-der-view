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
   _Note:_ 1CRN is bundled (offline), but **1HSG is fetched live from RCSB**
   (`files.rcsb.org`, cross-origin) — if RCSB is unreachable or blocks CORS for your origin,
   that button surfaces a network error instead of the structure; 1CRN still works offline.
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
