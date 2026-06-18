import { beforeAll, describe, expect, it } from 'vitest';
import type { Structure } from 'molstar/lib/mol-model/structure';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PDB_TINY, buildStructureFromPDB } from './fixtures/structures';
import { resolveSelection } from '../src/selection';
import { centroidOfLoci, distanceBetweenLoci } from '../src/measure';

let pdb: Structure;
beforeAll(async () => { pdb = await buildStructureFromPDB(PDB_TINY); });

describe('centroidOfLoci', () => {
  it('averages the atom positions of a selection', () => {
    // GLY A1: N(0,0,0) CA(1,0,0) C(2,0,0) → centroid (1,0,0).
    const c = centroidOfLoci(resolveSelection({ chain: 'A', residues: [1] }, pdb));
    expect(Vec3.distance(c, Vec3.create(1, 0, 0))).toBeCloseTo(0, 6);
  });

  it('handles a multi-residue chain (chain B: (0,5,0),(1,5,0) → (0.5,5,0))', () => {
    const c = centroidOfLoci(resolveSelection({ chain: 'B' }, pdb));
    expect(Vec3.distance(c, Vec3.create(0.5, 5, 0))).toBeCloseTo(0, 6);
  });
});

describe('distanceBetweenLoci', () => {
  it('returns the centroid-to-centroid distance in Å', () => {
    const a = resolveSelection({ chain: 'A', residues: [1] }, pdb); // (1,0,0)
    const b = resolveSelection({ chain: 'B' }, pdb); // (0.5,5,0)
    // sqrt(0.5^2 + 5^2) = sqrt(25.25) ≈ 5.0249.
    expect(distanceBetweenLoci(a, b)).toBeCloseTo(5.0249, 3);
  });

  it('is zero for a selection measured against itself', () => {
    const a = resolveSelection({ chain: 'A' }, pdb);
    expect(distanceBetweenLoci(a, a)).toBeCloseTo(0, 6);
  });
});
