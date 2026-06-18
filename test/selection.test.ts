import { beforeAll, describe, expect, it } from 'vitest';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';
import {
  MMCIF_AUTH_LABEL,
  PDB_TINY,
  buildStructureFromMmCIF,
  buildStructureFromPDB,
} from './fixtures/structures';
import { resolveSelection } from '../src/selection';

let pdb: Structure;
let cif: Structure;
beforeAll(async () => {
  pdb = await buildStructureFromPDB(PDB_TINY);
  cif = await buildStructureFromMmCIF(MMCIF_AUTH_LABEL);
});

const size = (l: StructureElement.Loci) => StructureElement.Loci.size(l);
const empty = (l: StructureElement.Loci) => StructureElement.Loci.isEmpty(l);

describe('resolveSelection — chain + residues', () => {
  it('selects a chain (auth)', () => {
    const loci = resolveSelection({ chain: 'A' }, pdb);
    expect(empty(loci)).toBe(false);
    expect(size(loci)).toBe(8);
  });

  it('selects a residue range within a chain (auth)', () => {
    const loci = resolveSelection({ chain: 'A', residues: [[1, 2]], numbering: 'auth' }, pdb);
    expect(size(loci)).toBe(6); // GLY1 (3) + ALA2 (3)
  });

  it('respects auth numbering on a divergent structure', () => {
    expect(size(resolveSelection({ residues: [[100, 101]], numbering: 'auth' }, cif))).toBe(4);
    expect(empty(resolveSelection({ residues: [[100, 101]], numbering: 'label' }, cif))).toBe(true);
  });

  it('respects label numbering on a divergent structure', () => {
    expect(size(resolveSelection({ residues: [[1, 2]], numbering: 'label' }, cif))).toBe(4);
    expect(empty(resolveSelection({ residues: [[1, 2]], numbering: 'auth' }, cif))).toBe(true);
  });

  it('supports a single residue (eq, not range)', () => {
    expect(size(resolveSelection({ residues: [1], numbering: 'label' }, cif))).toBe(2); // GLY label 1
  });

  it('defaults numbering to auth when omitted', () => {
    expect(size(resolveSelection({ residues: [[100, 101]] }, cif))).toBe(4);
  });
});
