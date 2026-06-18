---
source_id: 0007
title: Node-Structure spike — pure-Node parse + selection→loci works (no WebGL); pnpm build-gate gotcha
origin: "dev session 2026-06-18 — spike run against molstar 5.10.1 (subagent), verifying testing-strategy §7"
fetched: 2026-06-18
type: user-note
supersedes: null
---

# Node-Structure spike (2026-06-18)

Resolves the load-bearing open question in [[testing-strategy]] §7: **can we build a
Mol\* `Structure` and resolve `Selection → loci` in pure Node (no `PluginContext`, no
`Canvas3D`, no WebGL/headless-gl)?**

## VERDICT: YES (verified, molstar 5.10.1)
Built a `Structure` from inline PDB/mmCIF and resolved chain + residue-range selections
to loci in **pure Node** — no plugin, no canvas, no WebGL, and `three`/`gl` were neither
installed nor transitively required. The **auth-vs-label** distinction was proven (swapped
ranges return empty loci). ~1.5 s wall (mostly module import; the build+select is sub-ms).
⇒ **F2 selection tests are fast automated Node unit tests**, not headless-gl.

## Verified API (molstar 5.10.1)
```ts
import { Task } from 'molstar/lib/mol-task';
import { parsePDB } from 'molstar/lib/mol-io/reader/pdb/parser';
import { trajectoryFromPDB } from 'molstar/lib/mol-model-formats/structure/pdb';
import { CIF } from 'molstar/lib/mol-io/reader/cif';
import { trajectoryFromMmCIF } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Structure, StructureSelection, StructureElement } from 'molstar/lib/mol-model/structure';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { Script } from 'molstar/lib/mol-script/script';

// parse → Structure (single model ⇒ no RuntimeContext):
const parsed = await parsePDB(pdb, id).run();              // Task<ReaderResult>
const traj = await trajectoryFromPDB(parsed.result).run();
const frame = traj.getFrameAtIndex(0);                     // Model | Task<Model>
const model = Task.is(frame) ? await frame.run() : frame;
const structure = Structure.ofModel(model);                // sync, no ctx
// mmCIF: CIF.parse(cif).run() → result.blocks[0] → trajectoryFromMmCIF(frame).run()

// select → loci:
const sel = Script.getStructureSelection((b) => b.struct.generator.atomGroups({
  'chain-test':   b.core.rel.eq([b.ammp('auth_asym_id'), 'A']),
  'residue-test': b.core.rel.inRange([b.ammp('auth_seq_id'), 100, 120]), // inRange(value, min, max)
}), structure);
const loci = StructureSelection.toLociWithSourceUnits(sel); // StructureElement.Loci
StructureElement.Loci.isEmpty(loci); StructureElement.Loci.size(loci);
```
- `MS.ammp('<prop>')` = atom-property accessor; `auth_seq_id` and `label_seq_id` both available.
- `Structure.ofModel(model)` is **synchronous** (no RuntimeContext); `Structure.ofTrajectory`
  needs one — go via a single model to avoid it.
- PDB carries one numbering only; use **mmCIF** to exercise divergent auth-vs-label.

## pnpm build-gate gotcha (CI-relevant)
molstar transitively pulls **@scarf/scarf** (download telemetry) with a postinstall script.
pnpm 11 treats the unapproved/ignored build as a **hard error** (`ERR_PNPM_IGNORED_BUILDS`)
that fails `pnpm install` AND the pre-run deps check (so `pnpm test` / `pnpm typecheck`
abort before running). Fix committed in **`pnpm-workspace.yaml`**:
`allowBuilds: { '@scarf/scarf': false }` + `strictDepBuilds: false` (decline the telemetry
script; keep the gate non-fatal). Do **not** use `ignore-scripts=true` — esbuild (Vitest)
needs its postinstall.
