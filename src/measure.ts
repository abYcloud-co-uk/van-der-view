import { StructureElement } from 'molstar/lib/mol-model/structure';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';

/**
 * Geometric centroid (mean atom position, in Å) of a StructureElement.Loci.
 * Pure data-model — no plugin/canvas/WebGL — so it is Node-unit-testable, just
 * like `resolveSelection`. Throws on an empty loci; the executor resolves a
 * selection and rejects empties (→ empty_selection) before measuring.
 */
export function centroidOfLoci(loci: StructureElement.Loci): Vec3 {
  const sum = Vec3.zero();
  const pos = Vec3.zero();
  let n = 0;
  StructureElement.Loci.forEachLocation(loci, (loc) => {
    StructureElement.Location.position(pos, loc);
    Vec3.add(sum, sum, pos);
    n += 1;
  });
  if (n === 0) throw new Error('cannot take the centroid of an empty selection.');
  return Vec3.scale(sum, sum, 1 / n);
}

/**
 * Straight-line distance in Å between the centroids of two selections' loci.
 * OPEN: this measures center-to-center; per-atom nearest/specific-atom distances
 * and angle/dihedral measurements are deferred (see command-schema open questions).
 */
export function distanceBetweenLoci(
  a: StructureElement.Loci,
  b: StructureElement.Loci,
): number {
  return Vec3.distance(centroidOfLoci(a), centroidOfLoci(b));
}
