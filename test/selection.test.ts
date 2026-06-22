import { beforeAll, describe, expect, it } from 'vitest';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';
import {
  MMCIF_AUTH_LABEL,
  PDB_HET,
  PDB_NUCLEIC,
  PDB_TINY,
  buildStructureFromMmCIF,
  buildStructureFromPDB,
} from './fixtures/structures';
import { resolveSelection } from '../src/selection';
import { SelectionError } from '../src/errors';

let pdb: Structure;
let cif: Structure;
let het: Structure;
let nucleic: Structure;
beforeAll(async () => {
  pdb = await buildStructureFromPDB(PDB_TINY);
  cif = await buildStructureFromMmCIF(MMCIF_AUTH_LABEL);
  het = await buildStructureFromPDB(PDB_HET);
  nucleic = await buildStructureFromPDB(PDB_NUCLEIC);
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

describe('resolveSelection — presets', () => {
  it('selects everything with the "all" preset', () => {
    expect(size(resolveSelection({ preset: 'all' }, pdb))).toBe(10);
  });

  it('selects protein/polymer on an all-protein structure', () => {
    expect(empty(resolveSelection({ preset: 'protein' }, pdb))).toBe(false);
    expect(empty(resolveSelection({ preset: 'polymer' }, pdb))).toBe(false);
  });

  it('returns empty for absent categories on an all-protein structure', () => {
    expect(empty(resolveSelection({ preset: 'nucleic' }, pdb))).toBe(true);
    expect(empty(resolveSelection({ preset: 'water' }, pdb))).toBe(true);
    expect(empty(resolveSelection({ preset: 'ligand' }, pdb))).toBe(true);
    expect(empty(resolveSelection({ preset: 'ion' }, pdb))).toBe(true);
  });

  it('selects water/ligand/ion on a HETATM-bearing structure', () => {
    expect(empty(resolveSelection({ preset: 'water' }, het))).toBe(false);
    expect(empty(resolveSelection({ preset: 'ligand' }, het))).toBe(false);
    expect(empty(resolveSelection({ preset: 'ion' }, het))).toBe(false);
  });

  it('selects nucleic on a DNA-bearing structure', () => {
    expect(empty(resolveSelection({ preset: 'nucleic' }, nucleic))).toBe(false);
  });
});

describe('resolveSelection — guards', () => {
  it('throws SelectionError for an empty selection (no chain, no residues)', () => {
    expect(() => resolveSelection({}, pdb)).toThrow(SelectionError);
  });

  it('returns an empty loci for a chain that does not exist (caller decides)', () => {
    const loci = resolveSelection({ chain: 'Z' }, pdb);
    expect(StructureElement.Loci.isEmpty(loci)).toBe(true);
  });
});

describe('resolveSelection — input validation', () => {
  it('rejects a non-string chain instead of silently matching nothing', () => {
    expect(() => resolveSelection({ chain: 1 } as any, pdb)).toThrow(SelectionError);
    expect(() => resolveSelection({ chain: {} } as any, pdb)).toThrow(SelectionError);
  });

  it('rejects an invalid numbering value instead of silently using label', () => {
    // 'AUTH' !== 'auth'; the old code fell through to label and selected the wrong residues.
    expect(() => resolveSelection({ residues: [[100, 101]], numbering: 'AUTH' } as any, cif)).toThrow(
      SelectionError,
    );
  });

  it('rejects non-array residues', () => {
    expect(() => resolveSelection({ residues: 'nope' } as any, pdb)).toThrow(SelectionError);
  });

  it('rejects a malformed residue range (wrong arity / non-number)', () => {
    expect(() => resolveSelection({ residues: [[1]] } as any, pdb)).toThrow(SelectionError);
    expect(() => resolveSelection({ residues: [['a', 'b']] } as any, pdb)).toThrow(SelectionError);
  });

  it('normalizes a reversed residue range', () => {
    // [2, 1] should still select residues 1–2 (6 atoms), not match nothing.
    expect(size(resolveSelection({ chain: 'A', residues: [[2, 1]], numbering: 'auth' }, pdb))).toBe(6);
  });

  it('throws invalid_selection for an unknown preset', () => {
    const codeOf = (fn: () => unknown): string => {
      try {
        fn();
      } catch (e) {
        return (e as SelectionError).code;
      }
      throw new Error('expected resolveSelection to throw');
    };
    expect(codeOf(() => resolveSelection({ preset: 'bogus' } as any, pdb))).toBe('invalid_selection');
  });
});
