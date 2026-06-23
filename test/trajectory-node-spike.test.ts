import { describe, expect, it } from 'vitest';
import { Model } from 'molstar/lib/mol-model/structure';
import { Coordinates, Time } from 'molstar/lib/mol-model/structure/coordinates';
import type { Frame } from 'molstar/lib/mol-model/structure/coordinates';
import { PDB_TINY, buildModelFromPDB } from './fixtures/structures';

/** A zeroed coordinate frame of `n` atoms (positions are irrelevant to the count check). */
function frame(n: number): Frame {
  return {
    elementCount: n,
    time: Time(0, 'step'),
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    xyzOrdering: { isIdentity: true },
  };
}

const coords = (counts: number[]) =>
  Coordinates.create(counts.map(frame), Time(1, 'step'), Time(0, 'step'));

describe('Node trajectory spike — model + coordinates fusion (pure Node)', () => {
  it('fuses a model with matching frames into a trajectory of frameCount N', async () => {
    const model = await buildModelFromPDB(PDB_TINY); // 10 atoms
    const trajectory = Model.trajectoryFromModelAndCoordinates(model, coords([10, 10, 10]));
    expect(trajectory.frameCount).toBe(3);
  });

  it('throws on an atom-count mismatch between topology and coordinates', async () => {
    const model = await buildModelFromPDB(PDB_TINY); // 10 atoms
    expect(() => Model.trajectoryFromModelAndCoordinates(model, coords([7]))).toThrow(
      /element count mismatch/i,
    );
  });
});
