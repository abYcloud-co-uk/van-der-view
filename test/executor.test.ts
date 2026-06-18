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
    setRepresentation: vi.fn((_loci: SE.Loci, _type: string) => {}),
    setColor: vi.fn((_loci: SE.Loci, _color: unknown) => {}),
    setVisibility: vi.fn((_loci: SE.Loci, _visible: boolean) => {}),
    addLabel: vi.fn((_loci: SE.Loci, _text: string) => {}),
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

describe('createExecutor — set-representation', () => {
  it('applies a representation to a resolved selection', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-representation',
      input: { selection: { chain: 'A' }, type: 'spacefill' },
    });
    expect(res.ok).toBe(true);
    const [loci, type] = (ctx.setRepresentation as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(StructureElement.Loci.size(loci)).toBe(8);
    expect(type).toBe('spacefill');
  });

  it('rejects an unknown representation type with invalid_input', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-representation',
      input: { selection: { chain: 'A' }, type: 'noodles' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
    expect(ctx.setRepresentation).not.toHaveBeenCalled();
  });

  it('returns empty_selection when nothing matches', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-representation',
      input: { selection: { chain: 'Z' }, type: 'cartoon' },
    });
    expect(errorOf(res).code).toBe('empty_selection');
    expect(ctx.setRepresentation).not.toHaveBeenCalled();
  });
});

describe('createExecutor — set-color', () => {
  it('colors a selection by scheme', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, scheme: 'b-factor' },
    });
    expect(res.ok).toBe(true);
    const [, color] = (ctx.setColor as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(color).toEqual({ scheme: 'b-factor' });
  });

  it('colors a selection by hex', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, color: '#1e90ff' },
    });
    expect(res.ok).toBe(true);
    const [, color] = (ctx.setColor as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(color).toEqual({ hex: '#1e90ff' });
  });

  it('rejects giving both scheme and color', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, scheme: 'chain', color: '#ffffff' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
    expect(ctx.setColor).not.toHaveBeenCalled();
  });

  it('rejects giving neither scheme nor color', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' } },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('rejects a malformed hex color', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, color: 'red' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('rejects an unknown color scheme', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, scheme: 'by-vibes' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });
});

describe('createExecutor — toggle-visibility', () => {
  it('hides a selection', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'toggle-visibility',
      input: { selection: { chain: 'A' }, visible: false },
    });
    expect(res.ok).toBe(true);
    const [loci, visible] = (ctx.setVisibility as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(StructureElement.Loci.size(loci)).toBe(8);
    expect(visible).toBe(false);
  });

  it('rejects a non-boolean visible with invalid_input', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'toggle-visibility',
      input: { selection: { chain: 'A' }, visible: 'no' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
    expect(ctx.setVisibility).not.toHaveBeenCalled();
  });
});

describe('createExecutor — measure-distance', () => {
  it('returns the distance (Å) between two selections in the result data', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'measure-distance',
      input: { from: { chain: 'A', residues: [1] }, to: { chain: 'B' } },
    });
    if (!res.ok) throw new Error('expected ok');
    // GLY A1 centroid (1,0,0); chain B centroid (0.5,5,0) → sqrt(0.25+25) ≈ 5.0249.
    expect((res.data as { distanceAngstrom: number }).distanceAngstrom).toBeCloseTo(5.0249, 3);
  });

  it('returns empty_selection if either endpoint matches nothing', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'measure-distance',
      input: { from: { chain: 'A' }, to: { chain: 'Z' } },
    });
    expect(errorOf(res).code).toBe('empty_selection');
  });

  it('returns invalid_input when an endpoint selection is missing', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'measure-distance',
      input: { from: { chain: 'A' } },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });
});

describe('createExecutor — add-label', () => {
  it('labels a selection', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'add-label',
      input: { selection: { chain: 'A', residues: [2] }, text: 'ALA2' },
    });
    expect(res.ok).toBe(true);
    const [, text] = (ctx.addLabel as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(text).toBe('ALA2');
  });

  it('rejects an empty/missing label text with invalid_input', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'add-label',
      input: { selection: { chain: 'A' }, text: '' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
    expect(ctx.addLabel).not.toHaveBeenCalled();
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

describe('createExecutor — hardening (review fixes)', () => {
  it('maps malformed selection contents to invalid_selection, not internal_error', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'highlight',
      input: { selection: { residues: 'notarray' } },
    });
    expect(errorOf(res).code).toBe('invalid_selection');
  });

  it('maps a non-string load id to invalid_input, not internal_error', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'load-structure',
      input: { source: 'pdb', id: 1234 },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('omits focus options entirely when no durationMs is supplied', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'focus',
      input: { selection: { chain: 'A' } },
    });
    expect(res.ok).toBe(true);
    const [, opts] = (ctx.focus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts).toBeUndefined();
  });

  it('does not alias live host scene state in get-scene-context', async () => {
    const scene = { loaded: true, structures: [{ chains: ['A', 'B'] }] };
    const ctx = fakeContext({ getSceneContext: () => scene });
    const res = await createExecutor(ctx).dispatch({ name: 'get-scene-context', input: {} });
    if (!res.ok) throw new Error('expected ok');
    (res.data as typeof scene).structures[0].chains.push('MUTANT');
    expect(scene.structures[0].chains).toEqual(['A', 'B']); // host state untouched
  });

  it('returns internal_error (no silent no-op load) when a resolver yields neither url nor data', async () => {
    const ctx = fakeContext();
    const resolveStructure = vi.fn(async () => ({ format: 'mmcif' as const }));
    const res = await createExecutor(ctx, { resolveStructure }).dispatch({
      name: 'load-structure',
      input: { source: 'pdb', id: '1crn' },
    });
    expect(errorOf(res).code).toBe('internal_error');
    expect(ctx.loadStructure).not.toHaveBeenCalled();
  });
});
