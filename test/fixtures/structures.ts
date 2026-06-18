import { Task } from 'molstar/lib/mol-task';
import { parsePDB } from 'molstar/lib/mol-io/reader/pdb/parser';
import { trajectoryFromPDB } from 'molstar/lib/mol-model-formats/structure/pdb';
import { CIF } from 'molstar/lib/mol-io/reader/cif';
import { trajectoryFromMmCIF } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Structure } from 'molstar/lib/mol-model/structure';
import type { Trajectory } from 'molstar/lib/mol-model/structure';

/** 10 atoms; chain A (8 atoms, residues GLY1/ALA2/GLY3), chain B (2 atoms, GLY1). */
export const PDB_TINY = `HEADER    SPIKE
ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00  0.00           N
ATOM      2  CA  GLY A   1       1.000   0.000   0.000  1.00  0.00           C
ATOM      3  C   GLY A   1       2.000   0.000   0.000  1.00  0.00           C
ATOM      4  N   ALA A   2       3.000   0.000   0.000  1.00  0.00           N
ATOM      5  CA  ALA A   2       4.000   0.000   0.000  1.00  0.00           C
ATOM      6  CB  ALA A   2       4.500   1.000   0.000  1.00  0.00           C
ATOM      7  N   GLY A   3       5.000   0.000   0.000  1.00  0.00           N
ATOM      8  CA  GLY A   3       6.000   0.000   0.000  1.00  0.00           C
ATOM      9  N   GLY B   1       0.000   5.000   0.000  1.00  0.00           N
ATOM     10  CA  GLY B   1       1.000   5.000   0.000  1.00  0.00           C
TER      11      GLY B   1
END
`;

/** 4 atoms, chain A; label_seq_id 1,2 but auth_seq_id 100,101 (divergent numbering). */
export const MMCIF_AUTH_LABEL = `data_spike
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
ATOM 1 N  N  GLY A 1 A 100 0.000 0.000 0.000 1.00 0.00
ATOM 2 C  CA GLY A 1 A 100 1.000 0.000 0.000 1.00 0.00
ATOM 3 N  N  ALA A 2 A 101 3.000 0.000 0.000 1.00 0.00
ATOM 4 C  CA ALA A 2 A 101 4.000 0.000 0.000 1.00 0.00
`;

async function modelFromTrajectory(traj: Trajectory) {
  const frame = traj.getFrameAtIndex(0); // Model | Task<Model>
  return Task.is(frame) ? await frame.run() : frame;
}

/** Build a Structure from PDB text in pure Node (no plugin/canvas/WebGL). */
export async function buildStructureFromPDB(pdb: string): Promise<Structure> {
  const parsed = await parsePDB(pdb, 'fixture').run();
  if (parsed.isError) throw new Error(`PDB parse failed: ${parsed.message}`);
  const traj = await trajectoryFromPDB(parsed.result).run();
  return Structure.ofModel(await modelFromTrajectory(traj)); // sync, no RuntimeContext
}

/** Build a Structure from mmCIF text in pure Node. */
export async function buildStructureFromMmCIF(cif: string): Promise<Structure> {
  const parsed = await CIF.parse(cif).run();
  if (parsed.isError) throw new Error(`CIF parse failed: ${parsed.message}`);
  const traj = await trajectoryFromMmCIF(parsed.result.blocks[0]).run();
  return Structure.ofModel(await modelFromTrajectory(traj));
}
