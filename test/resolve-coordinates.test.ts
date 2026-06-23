import { describe, expect, it } from 'vitest';
import { ResolveError } from '../src/errors';
import { defaultResolveCoordinates } from '../src/resolve-coordinates';

describe('defaultResolveCoordinates', () => {
  it('passes a coordinate url through with its format and isBinary', async () => {
    expect(
      await defaultResolveCoordinates({ source: 'url', url: 'https://x/c.xtc', format: 'xtc' }),
    ).toEqual({ url: 'https://x/c.xtc', format: 'xtc', isBinary: true });
  });

  it('accepts every supported coordinate format', async () => {
    for (const format of ['xtc', 'trr', 'dcd', 'nctraj'] as const) {
      const r = await defaultResolveCoordinates({ source: 'url', url: 'https://x/c', format });
      expect(r).toEqual({ url: 'https://x/c', format, isBinary: true });
    }
  });

  it('rejects a url source without a url', async () => {
    await expect(defaultResolveCoordinates({ source: 'url', format: 'xtc' })).rejects.toThrow(ResolveError);
  });

  it('rejects an unknown source', async () => {
    await expect(
      defaultResolveCoordinates({ source: 'file', url: 'x', format: 'xtc' } as any),
    ).rejects.toThrow(ResolveError);
  });

  it('rejects an invalid format value', async () => {
    await expect(
      defaultResolveCoordinates({ source: 'url', url: 'https://x/c', format: 'pdb' } as any),
    ).rejects.toThrow(ResolveError);
  });
});
