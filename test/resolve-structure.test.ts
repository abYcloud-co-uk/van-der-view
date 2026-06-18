import { describe, expect, it } from 'vitest';
import { ResolveError } from '../src/errors';
import { defaultResolveStructure } from '../src/resolve-structure';

describe('defaultResolveStructure', () => {
  it('maps a PDB id to an RCSB mmCIF url', async () => {
    expect(await defaultResolveStructure({ source: 'pdb', id: '1crn' })).toEqual({
      url: 'https://files.rcsb.org/download/1CRN.cif',
      format: 'mmcif',
    });
  });

  it('passes a url through with its format', async () => {
    expect(
      await defaultResolveStructure({ source: 'url', url: 'https://x/y.pdb', format: 'pdb' }),
    ).toEqual({ url: 'https://x/y.pdb', format: 'pdb' });
  });

  it('passes inline data through (default mmcif)', async () => {
    expect(await defaultResolveStructure({ source: 'inline', data: 'DATA' })).toEqual({
      data: 'DATA',
      format: 'mmcif',
    });
  });

  it('rejects pdb without id', async () => {
    await expect(defaultResolveStructure({ source: 'pdb' })).rejects.toThrow(ResolveError);
  });

  it('rejects url without url', async () => {
    await expect(defaultResolveStructure({ source: 'url' })).rejects.toThrow(ResolveError);
  });

  it('rejects inline without data', async () => {
    await expect(defaultResolveStructure({ source: 'inline' })).rejects.toThrow(ResolveError);
  });
});
