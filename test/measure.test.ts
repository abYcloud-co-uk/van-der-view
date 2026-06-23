import { beforeAll, describe, expect, it } from 'vitest';
import type { Structure } from 'molstar/lib/mol-model/structure';
import { PDB_TINY, buildStructureFromPDB } from './fixtures/structures';
import { resolveSelection } from '../src/selection';
import { centroidOfLoci, distanceBetweenLoci } from '../src/measure';

let structure: Structure;
beforeAll(async () => { structure = await buildStructureFromPDB(PDB_TINY); });

describe('measure', () => {
  // PDB_TINY chain A residue 1 = GLY1 (N,CA,C at x=0,1,2) → centroid (1,0,0).
  it('centroidOfLoci returns the mean atom position', () => {
    const loci = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const c = centroidOfLoci(loci);
    expect(c[0]).toBeCloseTo(1, 6);
    expect(c[1]).toBeCloseTo(0, 6);
    expect(c[2]).toBeCloseTo(0, 6);
  });

  // GLY1 centroid (1,0,0) ↔ GLY3 centroid (5.5,0,0) → distance 4.5 Å.
  it('distanceBetweenLoci is the centroid-to-centroid distance', () => {
    const a = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const b = resolveSelection({ chain: 'A', residues: [3], numbering: 'auth' }, structure);
    expect(distanceBetweenLoci(a, b)).toBeCloseTo(4.5, 6);
  });

  it('centroidOfLoci throws on an empty loci', () => {
    const empty = resolveSelection({ chain: 'Z' }, structure);
    expect(() => centroidOfLoci(empty)).toThrow();
  });
});
