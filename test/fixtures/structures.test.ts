import { describe, expect, it } from 'vitest';
import {
  MMCIF_AUTH_LABEL,
  PDB_TINY,
  buildStructureFromMmCIF,
  buildStructureFromPDB,
} from './structures';

describe('structure fixtures', () => {
  it('parses the PDB fixture to a 10-atom Structure in Node', async () => {
    const s = await buildStructureFromPDB(PDB_TINY);
    expect(s.elementCount).toBe(10);
  });

  it('parses the mmCIF fixture to a 4-atom Structure in Node', async () => {
    const s = await buildStructureFromMmCIF(MMCIF_AUTH_LABEL);
    expect(s.elementCount).toBe(4);
  });
});
