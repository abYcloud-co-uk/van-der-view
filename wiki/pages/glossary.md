---
title: Glossary
slug: glossary
type: concept
status: stable
sources: [raw/0001-molstar-research.md, raw/0002-molviewspec-research.md]
updated: 2026-07-01
links: [molstar-api, molviewspec]
---

# Glossary

> Shared vocabulary for the van-der-view wiki. Terms are sourced from the Mol* and
> MolViewSpec research (src: raw/0001, raw/0002).

| Term | Meaning |
|---|---|
| **Mol\* / molstar** | The WebGL molecular visualization toolkit we drive. See [[molstar-api]]. |
| **MolViewSpec (MVS)** | Viewer-independent declarative JSON standard for molecular scenes. See [[molviewspec]]. |
| **`.mvsj` / `.mvsx`** | MVS serializations: plain JSON / ZIP bundle with assets. |
| **PluginContext** | The headless Mol* plugin instance — no React UI. The thing van-der-view holds. |
| **Canvas3D** | Mol*'s raw WebGL rendering core; exposes `canvas3d.xr` for WebXR. |
| **loci** | A *location* in a structure — a set of atoms/residues/elements (`StructureElement.Loci`). The unit highlight/focus/select operate on. |
| **selection vs highlight** | *Selection* is persistent (`structure.selection`); Mol\*'s *highlight channel* (`interactivity.lociHighlights`) is transient/hover-style. The vdv **`highlight` command** no longer maps to that channel — since fix #38 it paints a persistent **overpaint** layer (`setStructureOverpaint`) that survives hover/click/focus and is removed only by `clear-highlight` or a scene reload. |
| **component** | (MVS) a selected substructure that representations/colors attach to. |
| **representation** | The visual style of a component: `cartoon`, `ball_and_stick`, `spacefill`, `surface`, … |
| **MolScript** | Mol*'s query language for building selections programmatically (`Script.getStructureSelection`). |
| **ComponentExpression** | (MVS) the object form of a selector (`label_asym_id`, `auth_seq_id`, ranges, …). |
| **assembly** | A biologically meaningful arrangement of chains (vs. the raw deposited `model`). An MVS `structure.type`. |
| **auth vs label numbering** | `auth_seq_id`/`auth_asym_id` = author/PDB numbering (what users cite); `label_seq_id`/`label_asym_id` = canonical entity numbering. ⚠️ Mixing them silently selects the wrong residues. |
| **focus (camera)** | Frame the camera on a target. Imperative: `managers.camera.focusLoci`. Declarative: MVS `focus` node. |
| **WebXR** | Browser VR/AR API. Native in Mol* via `canvas3d.xr`. See [[molstar-webxr]]. |
| **headless** | Rendering/control with no imposed UI — van-der-view's core requirement. |
| **van-der-view** | This project: the agent↔renderer bridge. See [[project-overview]]. |

## See also
- [[molstar-api]] · [[molviewspec]] · [[molstar-webxr]] · [[command-schema]]

## Open questions
- (none — grow as new terms appear)
