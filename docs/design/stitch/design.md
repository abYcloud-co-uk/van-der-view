---
name: Kinetic Precision
colors:
  surface: '#0e1416'
  surface-dim: '#0e1416'
  surface-bright: '#343a3c'
  surface-container-lowest: '#090f11'
  surface-container-low: '#171d1e'
  surface-container: '#1b2122'
  surface-container-high: '#252b2d'
  surface-container-highest: '#303638'
  on-surface: '#dee3e6'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dee3e6'
  inverse-on-surface: '#2b3133'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#c0c1ff'
  on-secondary: '#1000a9'
  secondary-container: '#3131c0'
  on-secondary-container: '#b0b2ff'
  tertiary: '#ffb873'
  on-tertiary: '#4b2800'
  tertiary-container: '#e89337'
  on-tertiary-container: '#5b3200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#ffdcbf'
  tertiary-fixed-dim: '#ffb873'
  on-tertiary-fixed: '#2d1600'
  on-tertiary-fixed-variant: '#6a3b00'
  background: '#0e1416'
  on-background: '#dee3e6'
  surface-variant: '#303638'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: 0em
  label-xs:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1440px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
  stack-xs: 4px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system is engineered for a high-performance, developer-centric audience. It bridges the gap between complex biochemical data visualization and modern software engineering. The brand personality is hyper-professional, authoritative, and technically precise.

The aesthetic leans heavily into **Modern Minimalism** with a **High-Contrast Dark Mode** foundation, reminiscent of world-class developer tools. It utilizes high-precision strokes, subtle luminous accents, and expansive dark surfaces to create a "command center" feel. The emotional response is one of absolute reliability and scientific rigor, where the interface stays out of the way of the 3D molecular data while providing powerful, reactive feedback.

## Colors
The palette is centered on deep-space blacks and slate tones to provide maximum contrast for 3D molecular renders.

- **Primary (Neon Teal):** Used for primary actions, success states, and active molecular selections. It represents the "logic" and "connectivity" of the library.
- **Secondary (Biochemistry Purple):** Used for AI-generated insights, data-heavy badges, and secondary highlights. It evokes the "reactive" and "biological" nature of the data.
- **Neutral/Surface:** A strict hierarchy of slates. The background is nearly black to ensure zero light pollution for 3D viewers. Surfaces use subtle shifts in value to indicate nesting.
- **Border/Stroke:** Zinc-inspired grays are used to define boundaries with hair-line precision (1px), maintaining a technical, blueprint-like quality.

## Typography
This design system uses a dual-font strategy to balance readability and technicality. 

**Geist** serves as the primary sans-serif for all UI elements and headlines. It provides a clean, neutral, and highly legible foundation. For headlines, we use tight letter spacing and heavier weights to create a sense of importance and structure.

**JetBrains Mono** is employed for code snippets, API documentation, and coordinate data. It reinforces the developer-first nature of the product, providing the monospaced clarity required for reading complex molecular strings or React props. 

All text should maintain high contrast against the dark background, with secondary text used sparingly for metadata to preserve visual hierarchy.

## Layout & Spacing
The layout follows a **Fixed-Fluid Hybrid** model. Content is contained within a 1440px max-width wrapper on desktop, while the 3D renderer components are encouraged to break the grid and span full-bleed where necessary.

The spacing rhythm is based on a **4px base unit**. This allows for the "tight spacing" characteristic of professional IDEs and data tools. 
- Use `stack-xs` and `stack-sm` for internal component padding (e.g., inside buttons or inputs).
- Use `stack-md` for spacing between related elements in a group.
- Use `stack-lg` for section-level separation.

On mobile, the 12-column grid collapses to a 4-column layout, and margins are reduced to 16px to maximize the viewport for the 3D molecular canvas.

## Elevation & Depth
In this design system, depth is not achieved through traditional shadows, but through **Tonal Layering** and **Illumination**.

1.  **Surfaces:** Background elements sit at the lowest level. Surface containers (cards, sidebars) use a slightly lighter slate (#1E293B) to appear closer to the user.
2.  **Borders:** Depth is defined by high-precision 1px strokes. Active or focused elements use the Primary Teal stroke to "pop" without needing a shadow.
3.  **Glassmorphism:** Overlays, such as floating toolbars or modals, utilize a backdrop-filter blur (20px) with a semi-transparent background. This allows the molecular structure to remain visible behind the UI, maintaining context.
4.  **Luminous Glow:** For high-priority elements like "Live" status indicators or AI processing states, a subtle outer glow using the primary or secondary color is permitted to simulate light emitting from the interface.

## Shapes
The shape language is "Soft" yet disciplined. A **0.25rem (4px)** radius is the standard for almost all UI components, including buttons, inputs, and cards. This creates a precision-engineered look that feels modern but avoids the "playfulness" of highly rounded or pill-shaped designs.

- **Standard (rounded):** 4px for most components.
- **Large (rounded-lg):** 8px for main layout containers or large modal windows.
- **Extra Large (rounded-xl):** 12px for specific high-level visual features like 3D viewport frames.

## Components
Consistent component execution is vital for the "Linear-style" professional finish.

- **Buttons:** High-contrast solid fills for primary actions using the Neon Teal. Ghost buttons use the subtle slate border with a hover state that brightens the text and border.
- **Inputs:** Dark backgrounds (#0B0F19) with a 1px slate border. On focus, the border transitions to Primary Teal with a zero-spread 2px glow. Labels are always monospaced and positioned above the field.
- **Cards:** No shadows. Instead, use a 1px border (#334155). For interactive cards, the border color should subtly shift to a lighter zinc on hover.
- **Chips/Badges:** Small, monospaced text. Use a low-opacity version of the Primary or Secondary color for the background, with the solid color for the text to ensure legibility.
- **Code Blocks:** Syntax highlighting should favor the Primary Teal and Secondary Purple. Use a slightly darker background than the main surface to distinguish code from prose.
- **3D Viewport Controls:** These should be floating, glassmorphic elements with minimal icons to ensure the molecular renderer remains the focal point.