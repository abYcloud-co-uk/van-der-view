import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure, StructureElement as SE } from 'molstar/lib/mol-model/structure';
import { PDB_TINY, buildStructureFromPDB } from './fixtures/structures';
import type { ExecutorContext, SceneContext } from '../src/context';
import { createExecutor } from '../src/executor';
import type { CommandResult } from '../src/types';

let structure: Structure | undefined;
beforeAll(async () => { structure = await buildStructureFromPDB(PDB_TINY); });

function fakeContext(overrides: Partial<ExecutorContext> = {}) {
  const scene: SceneContext = { loaded: true, structures: [{ chains: ['A', 'B'] }] };
  const ctx: ExecutorContext = {
    getStructure: () => structure,
    loadStructure: vi.fn(async () => {}),
    highlight: vi.fn((_loci: SE.Loci) => {}),
    clearHighlight: vi.fn(),
    focus: vi.fn((_loci: SE.Loci) => {}),
    resetCamera: vi.fn(),
    getSceneContext: () => scene,
    ...overrides,
  };
  return ctx;
}

/** Narrow a CommandResult to its error (throws if it was ok). */
function errorOf(res: CommandResult) {
  if (res.ok) throw new Error('expected an error result, got ok');
  return res.error;
}

describe('createExecutor — routing', () => {
  it('returns ok for get-scene-context with the scene data', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({ name: 'get-scene-context', input: {} });
    expect(res).toEqual({ ok: true, data: { loaded: true, structures: [{ chains: ['A', 'B'] }] } });
  });

  it('calls resetCamera and returns ok for reset-camera', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({ name: 'reset-camera', input: {} });
    expect(res.ok).toBe(true);
    expect(ctx.resetCamera).toHaveBeenCalledOnce();
  });

  it('returns an error for an unknown command', async () => {
    const res = await createExecutor(fakeContext()).dispatch({ name: 'nope', input: {} });
    expect(res).toEqual({ ok: false, error: { code: 'unknown_command', message: expect.any(String) } });
  });
});

describe('createExecutor — highlight/focus', () => {
  it('highlights a resolved selection via the port', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { chain: 'A' } },
    });
    expect(res.ok).toBe(true);
    expect(ctx.highlight).toHaveBeenCalledOnce();
    const loci = (ctx.highlight as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(StructureElement.Loci.size(loci)).toBe(8); // chain A
  });

  it('focuses a resolved selection, passing durationMs through', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'focus',
      input: { selection: { chain: 'A', residues: [[1, 2]], numbering: 'auth' }, durationMs: 250 },
    });
    expect(res.ok).toBe(true);
    expect(ctx.focus).toHaveBeenCalledOnce();
    const [loci, opts] = (ctx.focus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(StructureElement.Loci.size(loci)).toBe(6);
    expect(opts).toEqual({ durationMs: 250 });
  });

  it('returns empty_selection when nothing matches', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { chain: 'Z' } },
    });
    expect(res).toEqual({ ok: false, error: { code: 'empty_selection', message: expect.any(String) } });
    expect(ctx.highlight).not.toHaveBeenCalled();
  });

  it('returns no_structure when none is loaded', async () => {
    const ctx = fakeContext({ getStructure: () => undefined });
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { chain: 'A' } },
    });
    expect(errorOf(res).code).toBe('no_structure');
  });

  it('surfaces unsupported_selection from preset selectors', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { preset: 'ligand' } },
    });
    expect(errorOf(res).code).toBe('unsupported_selection');
  });
});

describe('createExecutor — load-structure + input validation', () => {
  it('resolves a PDB id and calls loadStructure with the RCSB url', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'load-structure',
      input: { source: 'pdb', id: '1crn' },
    });
    expect(res.ok).toBe(true);
    expect(ctx.loadStructure).toHaveBeenCalledWith({
      url: 'https://files.rcsb.org/download/1CRN.cif',
      format: 'mmcif',
    });
  });

  it('uses a host resolveStructure override when provided', async () => {
    const ctx = fakeContext();
    const resolveStructure = vi.fn(async () => ({ data: 'INLINE', format: 'pdb' as const }));
    const res = await createExecutor(ctx, { resolveStructure }).dispatch({
      name: 'load-structure',
      input: { source: 'inline', data: 'INLINE', format: 'pdb' },
    });
    expect(res.ok).toBe(true);
    expect(resolveStructure).toHaveBeenCalledOnce();
    expect(ctx.loadStructure).toHaveBeenCalledWith({ data: 'INLINE', format: 'pdb' });
  });

  it('returns invalid_input for load-structure missing required fields', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'load-structure',
      input: { source: 'pdb' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('returns invalid_input when input is not an object', async () => {
    const res = await createExecutor(fakeContext()).dispatch({ name: 'highlight', input: '[]' });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('returns invalid_input when selection is missing', async () => {
    const res = await createExecutor(fakeContext()).dispatch({ name: 'highlight', input: {} });
    expect(errorOf(res).code).toBe('invalid_input');
  });
});
