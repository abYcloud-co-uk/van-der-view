import { Task } from 'molstar/lib/mol-task';
import { parsePDB } from 'molstar/lib/mol-io/reader/pdb/parser';
import { trajectoryFromPDB } from 'molstar/lib/mol-model-formats/structure/pdb';
import { CIF } from 'molstar/lib/mol-io/reader/cif';
import { trajectoryFromMmCIF } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Structure } from 'molstar/lib/mol-model/structure';
import type { Trajectory, Model } from 'molstar/lib/mol-model/structure';

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

/** Build a single Model from PDB text in pure Node (the frame-0 model of the trajectory). */
export async function buildModelFromPDB(pdb: string): Promise<Model> {
  const parsed = await parsePDB(pdb, 'fixture').run();
  if (parsed.isError) throw new Error(`PDB parse failed: ${parsed.message}`);
  const traj = await trajectoryFromPDB(parsed.result).run();
  return modelFromTrajectory(traj);
}

/** Build a Structure from PDB text in pure Node (no plugin/canvas/WebGL). */
export async function buildStructureFromPDB(pdb: string): Promise<Structure> {
  return Structure.ofModel(await buildModelFromPDB(pdb)); // sync, no RuntimeContext
}

/**
 * 7 atoms, chain A: GLY (protein, 3) + HOH (water, 1) + NA (ion, 1) + LIG (ligand, 2).
 * Lets preset selectors assert positive water/ion/ligand matches that 1CRN/PDB_TINY lack.
 */
export const PDB_HET = `HEADER    HET FIXTURE
ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00  0.00           N
ATOM      2  CA  GLY A   1       1.000   0.000   0.000  1.00  0.00           C
ATOM      3  C   GLY A   1       2.000   0.000   0.000  1.00  0.00           C
HETATM    4  O   HOH A   2       5.000   0.000   0.000  1.00  0.00           O
HETATM    5 NA   NA  A   3       7.000   0.000   0.000  1.00  0.00          NA
HETATM    6  C1  LIG A   4       9.000   0.000   0.000  1.00  0.00           C
HETATM    7  C2  LIG A   4      10.000   0.000   0.000  1.00  0.00           C
END
`;

/**
 * 2 linked DNA residues (DA→DT), chain B, with real sugar-phosphate backbone atoms
 * (P/OP1/OP2/O5'/C5'/C4'/C3'/O3'/...) so Mol* recognizes a nucleic *polymer*. A lone
 * nucleotide is usually NOT classified as nucleic; the inter-residue O3'→P linkage is
 * what makes the chain a polymer. Lets the nucleic preset assert a positive match.
 */
export const PDB_NUCLEIC = `HEADER    DNA FIXTURE
ATOM      1  O5'  DA B   1      -0.213  10.812   8.907  1.00  0.00           O
ATOM      2  C5'  DA B   1       0.994  11.317   9.494  1.00  0.00           C
ATOM      3  C4'  DA B   1       2.026  10.222   9.650  1.00  0.00           C
ATOM      4  O4'  DA B   1       1.498   9.131  10.444  1.00  0.00           O
ATOM      5  C3'  DA B   1       2.508   9.598   8.345  1.00  0.00           C
ATOM      6  O3'  DA B   1       3.870   9.190   8.466  1.00  0.00           O
ATOM      7  C2'  DA B   1       1.567   8.404   8.193  1.00  0.00           C
ATOM      8  C1'  DA B   1       1.293   8.013   9.642  1.00  0.00           C
ATOM      9  N9   DA B   1       0.116   7.151   9.789  1.00  0.00           N
ATOM     10  P    DT B   2       4.678   8.971   7.090  1.00  0.00           P
ATOM     11  OP1  DT B   2       6.099   8.795   7.480  1.00  0.00           O
ATOM     12  OP2  DT B   2       4.022   7.918   6.275  1.00  0.00           O
ATOM     13  O5'  DT B   2       4.591  10.371   6.314  1.00  0.00           O
ATOM     14  C5'  DT B   2       5.221  11.527   6.873  1.00  0.00           C
ATOM     15  C4'  DT B   2       4.890  12.748   6.043  1.00  0.00           C
ATOM     16  O4'  DT B   2       3.474  13.022   6.135  1.00  0.00           O
ATOM     17  C3'  DT B   2       5.222  12.616   4.561  1.00  0.00           C
ATOM     18  O3'  DT B   2       6.394  13.367   4.270  1.00  0.00           O
ATOM     19  C2'  DT B   2       3.972  13.149   3.879  1.00  0.00           C
ATOM     20  C1'  DT B   2       2.967  13.069   5.021  1.00  0.00           C
ATOM     21  N1   DT B   2       1.671  12.512   4.609  1.00  0.00           N
TER      22       DT B   2
END
`;

/** Build a Structure from mmCIF text in pure Node. */
export async function buildStructureFromMmCIF(cif: string): Promise<Structure> {
  const parsed = await CIF.parse(cif).run();
  if (parsed.isError) throw new Error(`CIF parse failed: ${parsed.message}`);
  const traj = await trajectoryFromMmCIF(parsed.result.blocks[0]).run();
  return Structure.ofModel(await modelFromTrajectory(traj));
}
