# van-der-view Design System — "Kinetic Precision"

> The visual language for van-der-view's surfaces: the web demo/sandbox now, and
> the spatial/VR UI later. Dark, high-contrast, developer-tool aesthetic — the UI
> stays out of the way of the 3D molecular render and gives powerful, reactive
> feedback.

**Source of truth:** generated with the Google Stitch MCP (project *"Van-der-view
Molecular AI Canvas"*) and captured in [`stitch/design.md`](stitch/design.md) +
[`stitch/screen_*.png`](stitch/). The machine-readable tokens live in
[`tokens.css`](tokens.css) — **consume those variables; never hardcode hex.** This
document is the human-facing rationale + component specs synthesized from that source.

## Brand & personality
Hyper-professional, authoritative, technically precise — a "command center" for an
AI agent driving biochemical data. Modern minimalism on a high-contrast dark
foundation (think world-class developer tools / Linear). Emotional target:
absolute reliability and scientific rigor.

## Color
Deep-space near-blacks maximize contrast for 3D renders; color is spent
deliberately. (Tokens: `--vdv-color-*`.)

| Role | Token | Use |
|---|---|---|
| Primary — **neon teal** | `--vdv-color-primary` `#4cd7f6` | primary actions, **OK / success**, active molecular selection |
| Secondary — **biochem purple** | `--vdv-color-secondary` `#c0c1ff` | **AI / agent** output, insights, data badges |
| Tertiary — amber | `--vdv-color-tertiary` `#ffb873` | warnings, secondary highlights |
| Error | `--vdv-color-error` `#ffb4ab` | failed `CommandResult`, destructive |
| Surfaces | `--vdv-color-surface*` `#0e1416 → #343a3c` | tonal hierarchy (see Elevation) |
| Text | `--vdv-color-on-surface` / `-variant` | primary / muted-metadata text |
| Borders | `--vdv-color-outline-variant` `#3d494c` | hairline 1px strokes |

Semantic aliases map app state onto the palette: `--vdv-color-ok` = teal,
`--vdv-color-danger` = error, `--vdv-color-agent` = purple. Note this intentionally
moves the demo's old green "ok" to **teal**, matching the system.

## Typography
Dual-font strategy (tokens: `--vdv-font-sans`, `--vdv-font-mono`, `--vdv-text-*`):
- **Geist** — all UI and headlines. Headlines use tight tracking + heavier weight.
- **JetBrains Mono** — code, API/props, coordinate data, **command names & tool-call chips**.

Scale: `display-lg` 48/700, `headline-lg` 32/600, `headline-md` 24/600,
`body-md` 16/400, `code-sm` 14 mono, `label-xs` 12/600 uppercase eyebrow.
Keep high contrast; reserve `on-surface-variant` for metadata to preserve hierarchy.

## Layout & spacing
Fixed-fluid hybrid: content within `--vdv-container-max` (1440px); the 3D renderer
may break the grid and go full-bleed. Rhythm is a **4px base unit**
(`--vdv-space-*`): `xs/sm` for internal padding, `md` between related elements,
`lg` for section separation. Desktop margins 40px; mobile 16px.

## Elevation & depth — no shadows
Depth comes from **tonal layering** + **illumination**, not drop shadows:
1. **Surfaces** — background lowest; cards/sidebars step up via lighter slate
   (`surface-container` → `surface-high`).
2. **Borders** — hairline 1px (`--vdv-border-hairline`); focused elements switch the
   stroke to teal.
3. **Glassmorphism** — floating toolbars/overlays use `--vdv-glass-bg` +
   `backdrop-filter: blur(var(--vdv-glass-blur))` so the molecule stays visible behind UI.
4. **Luminous glow** — live/active/AI-processing states may use `--vdv-glow-soft`;
   focus rings use `--vdv-glow-primary`.

## Shape
Disciplined, not playful: **4px** (`--vdv-radius`) for buttons/inputs/cards; **8px**
(`-lg`) for layout containers/modals; **12px** (`-xl`) for the 3D viewport frame.

## Components (specs for this redesign)
- **App shell** — full-viewport flex: full-bleed 3D canvas as the primary surface;
  the **Agent chat** as the primary right rail; existing functional panels collapse
  into a secondary **"Dev tools"** drawer.
- **Button** — *Primary*: solid teal fill, `--vdv-radius`, `on-primary` text. *Ghost*:
  transparent + 1px outline-variant border; hover brightens text + border to teal.
- **Input** — `surface-lowest` bg, 1px outline-variant border; on focus, border →
  teal with `--vdv-glow-primary`. Labels are **monospaced, above** the field.
- **Panel / card** — no shadow; `surface-container` + 1px border; interactive cards
  brighten border on hover. Section eyebrow uses `label-xs` uppercase.
- **Chat transcript** — user vs agent distinguished by alignment + accent (`on-surface`
  for user, `--vdv-color-agent` purple eyebrow for agent). Comfortable `body-md`.
- **Tool-call chip** — monospaced (`code-sm`); command name in teal, args muted; a
  low-opacity primary/secondary background; OK result tinted teal, error tinted
  `--vdv-color-error`. This is the agent's visible "action receipt".
- **Mic / push-to-talk** — ghost icon button; while listening, teal border +
  `--vdv-glow-soft` pulse.
- **3D viewport controls** — floating, glassmorphic, minimal icons; never compete
  with the render.
- **Code block** — `surface-lowest` bg; syntax favors teal + purple.

## Spatial / VR UI addendum (guides the later XR work)
The web language above carries into VR; spatial specifics:
- **Panels as floating glass slabs** in world space — same `--vdv-glass-bg` + blur,
  `xl` radius, hairline edge; place ~0.6–1.0 m from the user, billboarded toward gaze.
- **Depth via parallax & glow**, not shadow — the molecule is the focal object; UI
  recedes (dimmer surface) until gazed at, then the teal stroke/glow brings it forward.
- **Reticle / gaze cursor** in teal; hovered targets get `--vdv-glow-primary`. Keep
  hit targets large; tool-call chips become readable wrist/HUD cards.
- **Controller affordances** mirror Mol*'s defaults (trigger = pinch-scale, B = exit).
- **Hard rule:** entering XR needs a real user gesture (a click affordance) — a voice
  command cannot start a session; voice drives the agent *inside* XR. (See
  `wiki/pages/molstar-webxr.md`.) Exit can be programmatic.

## Usage
Web: import `tokens.css` once, then style with the variables (see
`examples/demo/src/theme.css`). Keep this doc and `tokens.css` in sync with
`stitch/design.md`; regenerate via the Stitch MCP and re-synthesize when the visual
language changes.
