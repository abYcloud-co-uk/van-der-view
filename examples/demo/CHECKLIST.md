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

## Trajectory (MD playback)

Needs a locally-served topology + coordinate file. The `MD_Data/` folder is gitignored
(large, not bundled); serve it and paste the URLs into the **Trajectory** panel:

```bash
npx serve MD_Data/5GGS      # prints an origin, e.g. http://localhost:3000
```

1. **Load trajectory** — paste the `*_nowat.pdb` (topology) + `*_nowat.xtc` (coordinates)
   URLs, formats pdb/xtc → "Load trajectory". The complex renders and the readout shows a
   real `frameCount` (≈309 for the MD_Data systems).
2. **Play / Stop** — "Play" animates the frames (loops by default); "Stop" halts.
3. **Seek** — drag the frame slider; the structure jumps to that frame and `currentFrame`
   follows. **Drag while playing →** playback **stops** and jumps to the dragged frame
   (the seek halts the animation so it isn't immediately overwritten on the next tick).
4. **`isPlaying` is live** — after "Stop" (or after a playback ends on its own), the readout's
   `isPlaying` reads **`false`**. It's read from Mol\*'s animation manager, not a stale local flag.
5. **A failed load keeps the prior scene** — load a normal structure first (e.g. "Load 1CRN"),
   then in the Trajectory panel pair a topology with a coordinate file from a *different* system
   (e.g. **5GGS `.pdb` + 1N8Z `.xtc`** — different atom counts) → a `trajectory_mismatch` error
   appears **and the previously-loaded structure stays on screen** (the viewer is not blanked).

> **MD_Data chain-id caveat (data, not library):** the `*_interactions.json` files label the
> antigen chain `Z`, but the `*_nowat` viewer files label it `A`. Use the viewer files' ids
> when selecting chains.

> **fps validation:** the panel's Play uses `fps: 15`. The library rejects `fps <= 0` / NaN with
> an `invalid_input` result (a 0 fps would otherwise freeze playback), and rejects `play` on a
> single-frame trajectory (`frameCount <= 1`, nothing to animate).

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
