import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure, StructureElement as SE } from 'molstar/lib/mol-model/structure';
import { PDB_TINY, buildStructureFromPDB } from './fixtures/structures';
import type { ExecutorContext, SceneContext } from '../src/context';
import { createExecutor } from '../src/executor';
import type { CommandResult } from '../src/types';
import { ExecutorError } from '../src/errors';

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
    loadTrajectory: vi.fn(async () => {}),
    playTrajectory: vi.fn(),
    stopTrajectory: vi.fn(),
    setFrame: vi.fn(),
    setRepresentation: vi.fn(),
    setColor: vi.fn(),
    setVisibility: vi.fn(),
    addLabel: vi.fn(),
    ...overrides,
  };
  return ctx;
}

/** A scene whose getSceneContext reports a loaded trajectory of `frameCount` frames. */
function trajectoryScene(frameCount: number): SceneContext {
  return { loaded: true, structures: [{ chains: ['A'] }], trajectory: { frameCount, currentFrame: 0, isPlaying: false } };
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

  it('resolves a supported preset selection via the port', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { preset: 'protein' } },
    });
    expect(res.ok).toBe(true);
    expect(ctx.highlight).toHaveBeenCalledOnce();
  });

  it('returns empty_selection for a preset that matches nothing', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'highlight',
      input: { selection: { preset: 'ligand' } }, // PDB_TINY has no ligand
    });
    expect(errorOf(res).code).toBe('empty_selection');
  });

  it('forwards focus.zoomOut as a numeric focus option', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'focus',
      input: { selection: { chain: 'A' }, zoomOut: 2 },
    });
    expect(res.ok).toBe(true);
    const [, opts] = (ctx.focus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts).toEqual({ zoomOut: 2 });
  });

  it('forwards both durationMs and zoomOut when given', async () => {
    const ctx = fakeContext();
    await createExecutor(ctx).dispatch({
      name: 'focus',
      input: { selection: { chain: 'A' }, durationMs: 250, zoomOut: 1.5 },
    });
    const [, opts] = (ctx.focus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts).toEqual({ durationMs: 250, zoomOut: 1.5 });
  });

  it('ignores a non-numeric zoomOut', async () => {
    const ctx = fakeContext();
    await createExecutor(ctx).dispatch({
      name: 'focus',
      input: { selection: { chain: 'A' }, zoomOut: true },
    });
    const [, opts] = (ctx.focus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts).toBeUndefined();
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

describe('createExecutor — trajectory cluster', () => {
  it('resolves topology + coordinates and calls loadTrajectory with both', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'load-trajectory',
      input: {
        topology: { source: 'url', url: 'https://x/top.pdb', format: 'pdb' },
        coordinates: { source: 'url', url: 'https://x/c.xtc', format: 'xtc' },
      },
    });
    expect(res.ok).toBe(true);
    expect(ctx.loadTrajectory).toHaveBeenCalledWith({
      topology: { url: 'https://x/top.pdb', format: 'pdb' },
      coordinates: { url: 'https://x/c.xtc', format: 'xtc', isBinary: true },
    });
  });

  it('uses a host resolveCoordinates override', async () => {
    const ctx = fakeContext();
    const bytes = new Uint8Array([1, 2, 3]);
    const resolveCoordinates = vi.fn(async () => ({ data: bytes, format: 'xtc' as const, isBinary: true as const }));
    const res = await createExecutor(ctx, { resolveCoordinates }).dispatch({
      name: 'load-trajectory',
      input: {
        topology: { source: 'inline', data: 'TOPDATA', format: 'pdb' },
        coordinates: { source: 'url', url: 'https://x/c.xtc', format: 'xtc' },
      },
    });
    expect(res.ok).toBe(true);
    expect(resolveCoordinates).toHaveBeenCalledOnce();
    expect(ctx.loadTrajectory).toHaveBeenCalledWith({
      topology: { data: 'TOPDATA', format: 'pdb' },
      coordinates: { data: bytes, format: 'xtc', isBinary: true },
    });
  });

  it('returns invalid_input when topology is missing', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'load-trajectory',
      input: { coordinates: { source: 'url', url: 'https://x/c.xtc', format: 'xtc' } },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('returns invalid_input when coordinates is missing', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'load-trajectory',
      input: { topology: { source: 'pdb', id: '1crn' } },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('surfaces a trajectory_mismatch thrown by the adapter', async () => {
    const ctx = fakeContext({
      loadTrajectory: vi.fn(async () => {
        throw new ExecutorError('trajectory_mismatch', 'Frame element count mismatch, got 7 but expected 10.');
      }),
    });
    const res = await createExecutor(ctx).dispatch({
      name: 'load-trajectory',
      input: {
        topology: { source: 'pdb', id: '1crn' },
        coordinates: { source: 'url', url: 'https://x/c.xtc', format: 'xtc' },
      },
    });
    expect(errorOf(res).code).toBe('trajectory_mismatch');
  });

  it('returns no_trajectory for play/stop/set-frame when none is loaded', async () => {
    const exec = createExecutor(fakeContext()); // default scene has no trajectory
    expect(errorOf(await exec.dispatch({ name: 'play-trajectory', input: {} })).code).toBe('no_trajectory');
    expect(errorOf(await exec.dispatch({ name: 'stop-trajectory', input: {} })).code).toBe('no_trajectory');
    expect(errorOf(await exec.dispatch({ name: 'set-frame', input: { index: 999 } })).code).toBe('no_trajectory');
  });

  it('plays with fps/loop forwarded to the port', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    const res = await createExecutor(ctx).dispatch({
      name: 'play-trajectory',
      input: { fps: 15, loop: false },
    });
    expect(res.ok).toBe(true);
    expect(ctx.playTrajectory).toHaveBeenCalledWith({ fps: 15, loop: false });
  });

  it('plays with undefined options when none are given', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    await createExecutor(ctx).dispatch({ name: 'play-trajectory', input: {} });
    expect(ctx.playTrajectory).toHaveBeenCalledWith(undefined);
  });

  it('stops the loaded trajectory', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    const res = await createExecutor(ctx).dispatch({ name: 'stop-trajectory', input: {} });
    expect(res.ok).toBe(true);
    expect(ctx.stopTrajectory).toHaveBeenCalledOnce();
  });

  it('seeks to a valid frame index', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    const res = await createExecutor(ctx).dispatch({ name: 'set-frame', input: { index: 42 } });
    expect(res.ok).toBe(true);
    expect(ctx.setFrame).toHaveBeenCalledWith(42);
  });

  it('rejects an out-of-range frame index with invalid_input', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    const res = await createExecutor(ctx).dispatch({ name: 'set-frame', input: { index: 309 } });
    expect(errorOf(res).code).toBe('invalid_input');
    expect(ctx.setFrame).not.toHaveBeenCalled();
  });

  it('rejects a non-integer frame index with invalid_input', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    const res = await createExecutor(ctx).dispatch({ name: 'set-frame', input: { index: 1.5 } });
    expect(errorOf(res).code).toBe('invalid_input');
    expect(ctx.setFrame).not.toHaveBeenCalled();
  });

  it('rejects play on a single-frame trajectory with invalid_input', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(1) });
    const res = await createExecutor(ctx).dispatch({ name: 'play-trajectory', input: {} });
    expect(errorOf(res).code).toBe('invalid_input');
    expect(ctx.playTrajectory).not.toHaveBeenCalled();
  });

  it('rejects a non-positive or non-finite fps with invalid_input', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    for (const fps of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = await createExecutor(ctx).dispatch({ name: 'play-trajectory', input: { fps } });
      expect(errorOf(res).code).toBe('invalid_input');
    }
    expect(ctx.playTrajectory).not.toHaveBeenCalled();
  });
});

describe('createExecutor — representation cluster (v1.1a)', () => {
  it('set-representation resolves the selection and forwards the type', async () => {
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

  it('set-representation rejects an unknown type with invalid_input', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-representation',
      input: { selection: { chain: 'A' }, type: 'wireframe' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
    expect(ctx.setRepresentation).not.toHaveBeenCalled();
  });

  it('set-color forwards a scheme spec', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, scheme: 'b-factor' },
    });
    expect(res.ok).toBe(true);
    expect((ctx.setColor as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ scheme: 'b-factor' });
  });

  it('set-color forwards a hex spec', async () => {
    const ctx = fakeContext();
    await createExecutor(ctx).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, color: '#1e90ff' },
    });
    expect((ctx.setColor as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ hex: '#1e90ff' });
  });

  it('set-color rejects both scheme and color', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, scheme: 'chain', color: '#1e90ff' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
    expect(ctx.setColor).not.toHaveBeenCalled();
  });

  it('set-color rejects neither scheme nor color', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({ name: 'set-color', input: { selection: { chain: 'A' } } });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('set-color treats an explicit null as absent (LLM fills every schema property)', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, scheme: null, color: '#ff0000' },
    });
    expect(res.ok).toBe(true);
    expect((ctx.setColor as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ hex: '#ff0000' });
  });

  it('set-color treats a null color as absent and forwards the scheme', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, scheme: 'chain', color: null },
    });
    expect(res.ok).toBe(true);
    expect((ctx.setColor as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ scheme: 'chain' });
  });

  it('set-color rejects a non-hex color', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, color: 'red' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('set-color rejects a non-hex color before the structure lookup', async () => {
    const ctx = fakeContext({ getStructure: () => undefined });
    const res = await createExecutor(ctx).dispatch({
      name: 'set-color',
      input: { selection: { chain: 'A' }, color: 'red' },
    });
    expect(errorOf(res).code).toBe('invalid_input'); // not 'no_structure'
  });

  it('toggle-visibility forwards the boolean', async () => {
    const ctx = fakeContext();
    await createExecutor(ctx).dispatch({
      name: 'toggle-visibility',
      input: { selection: { chain: 'A' }, visible: false },
    });
    expect((ctx.setVisibility as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(false);
  });

  it('toggle-visibility rejects a missing/non-boolean visible', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'toggle-visibility',
      input: { selection: { chain: 'A' } },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('measure-distance returns the centroid distance and calls no port member', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'measure-distance',
      input: { from: { chain: 'A', residues: [1], numbering: 'auth' }, to: { chain: 'A', residues: [3], numbering: 'auth' } },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.data as { distanceAngstrom: number }).distanceAngstrom).toBeCloseTo(4.5, 6);
    expect(ctx.setRepresentation).not.toHaveBeenCalled();
    expect(ctx.setColor).not.toHaveBeenCalled();
    expect(ctx.setVisibility).not.toHaveBeenCalled();
    expect(ctx.addLabel).not.toHaveBeenCalled();
  });

  it('measure-distance returns empty_selection when an end matches nothing', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'measure-distance',
      input: { from: { chain: 'A' }, to: { chain: 'Z' } },
    });
    expect(errorOf(res).code).toBe('empty_selection');
  });

  it('add-label forwards the text', async () => {
    const ctx = fakeContext();
    await createExecutor(ctx).dispatch({
      name: 'add-label',
      input: { selection: { chain: 'A' }, text: 'chain A' },
    });
    expect((ctx.addLabel as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('chain A');
  });

  it('add-label rejects empty text', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'add-label',
      input: { selection: { chain: 'A' }, text: '' },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('the cluster reports no_structure when none is loaded', async () => {
    const ctx = fakeContext({ getStructure: () => undefined });
    const res = await createExecutor(ctx).dispatch({
      name: 'set-representation',
      input: { selection: { chain: 'A' }, type: 'cartoon' },
    });
    expect(errorOf(res).code).toBe('no_structure');
  });

  it('reports internal_error when a mutator port member rejects', async () => {
    // The port is now async + awaited, so a failed GPU op surfaces as a reported
    // error rather than a silent ok() (findings 1/7).
    const ctx = fakeContext({ setRepresentation: vi.fn(async () => { throw new Error('gpu boom'); }) });
    const res = await createExecutor(ctx).dispatch({
      name: 'set-representation', input: { selection: { chain: 'A' }, type: 'cartoon' },
    });
    expect(errorOf(res).code).toBe('internal_error');
  });
});
