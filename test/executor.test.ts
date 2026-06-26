import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure, StructureElement as SE } from 'molstar/lib/mol-model/structure';
import { PDB_TINY, buildStructureFromPDB } from './fixtures/structures';
import type { ExecutorContext, SceneContext } from '../src/context';
import { createExecutor } from '../src/executor';
import type { CommandResult } from '../src/types';
import { ExecutorError } from '../src/errors';
import type { LoadInput, ResolvedStructure } from '../src/resolve-structure';

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

/** A loadStructure fake that blocks on a manual gate, records each resolved arg, and
 *  (like the real adapter) honors abort only AFTER its await — so a load held here is
 *  "in-flight" until released, then bails if its signal was aborted meanwhile. */
function gatedLoad() {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const calls: unknown[] = [];
  const loadStructure = vi.fn(async (resolved: unknown, signal?: AbortSignal) => {
    calls.push(resolved);
    await gate;
    signal?.throwIfAborted();
  });
  return { loadStructure, release, calls };
}

/** Resolve the microtask + macrotask queue so a just-dispatched load reaches the gate. */
const flush = () => new Promise((r) => setTimeout(r, 0));

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
    expect(ctx.loadStructure).toHaveBeenCalledWith(
      { url: 'https://files.rcsb.org/download/1CRN.cif', format: 'mmcif' },
      expect.any(AbortSignal),
    );
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
    expect(ctx.loadStructure).toHaveBeenCalledWith({ data: 'INLINE', format: 'pdb' }, expect.any(AbortSignal));
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
    expect(ctx.loadTrajectory).toHaveBeenCalledWith(
      {
        topology: { url: 'https://x/top.pdb', format: 'pdb' },
        coordinates: { url: 'https://x/c.xtc', format: 'xtc', isBinary: true },
      },
      expect.any(AbortSignal),
    );
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
    expect(ctx.loadTrajectory).toHaveBeenCalledWith(
      {
        topology: { data: 'TOPDATA', format: 'pdb' },
        coordinates: { data: bytes, format: 'xtc', isBinary: true },
      },
      expect.any(AbortSignal),
    );
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

describe('createExecutor — concurrent dispatch serialization (#23)', () => {
  it('serializes concurrent load-structure dispatches so they never interleave', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const loadStructure = vi.fn(async (resolved: ResolvedStructure) => {
      order.push(`start:${resolved.data}`);
      // Gate the first load to test non-interleave; supersession means only one
      // load will actually call loadStructure when both are dispatched synchronously.
      await firstGate;
      order.push(`end:${resolved.data}`);
    });
    // Echo the inline data through so loadStructure sees 'A' / 'B'.
    const resolveStructure = vi.fn(
      async (input: LoadInput) => ({ data: (input as { data?: string }).data, format: 'mmcif' as const }),
    );
    const { dispatch } = createExecutor(fakeContext({ loadStructure }), { resolveStructure });

    const p1 = dispatch({ name: 'load-structure', input: { source: 'inline', data: 'A', format: 'mmcif' } });
    const p2 = dispatch({ name: 'load-structure', input: { source: 'inline', data: 'B', format: 'mmcif' } });

    // Drain microtasks: B superseded A before it entered loadStructure, so only B runs.
    // B starts (enters the gate); A returns superseded without calling loadStructure.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['start:B']);

    releaseFirst();
    await Promise.all([p1, p2]);
    // B ran to completion; A was superseded (never entered loadStructure).
    expect(order).toEqual(['start:B', 'end:B']);
    expect(loadStructure).toHaveBeenCalledTimes(1);
  });

  it('runs read-only commands immediately instead of queuing them behind an in-flight mutation (#4)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const loadStructure = vi.fn(async () => { await gate; }); // stays in-flight until released
    const resolveStructure = vi.fn(async () => ({ data: 'X', format: 'mmcif' as const }));
    const { dispatch } = createExecutor(fakeContext({ loadStructure }), { resolveStructure });

    const loadP = dispatch({ name: 'load-structure', input: { source: 'inline', data: 'X', format: 'mmcif' } });
    // A read dispatched while the load is stuck must resolve without waiting for it.
    const read = await Promise.race([
      dispatch({ name: 'get-scene-context', input: {} }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('read was queued behind the in-flight mutation')), 200),
      ),
    ]);
    expect(read).toMatchObject({ ok: true });

    release();
    await loadP;
  });
});

describe('createExecutor — supersession (#27)', () => {
  it('supersedes earlier in-flight and queued loads; only the latest survives', async () => {
    const { loadStructure, release, calls } = gatedLoad();
    const exec = createExecutor(fakeContext({ loadStructure }));
    const pA = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await flush();                                   // A enters the gate → in-flight
    const pB = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1hsg' } });
    const pC = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '4hhb' } });
    release();
    const [rA, rB, rC] = await Promise.all([pA, pB, pC]);
    expect(errorOf(rA).code).toBe('superseded');     // in-flight: aborted at throwIfAborted
    expect(errorOf(rB).code).toBe('superseded');     // queued: bailed at execute top
    expect(rC.ok).toBe(true);                        // survivor
    expect(loadStructure).toHaveBeenCalledTimes(2);  // A (in-flight) + C; B never called
  });

  it('threads an AbortSignal into ctx.loadStructure', async () => {
    const ctx = fakeContext();
    await createExecutor(ctx).dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    expect(ctx.loadStructure).toHaveBeenCalledWith(
      { url: 'https://files.rcsb.org/download/1CRN.cif', format: 'mmcif' },
      expect.any(AbortSignal),
    );
  });

  it('does NOT supersede a non-load mutation queued before a load — it runs in FIFO (#1)', async () => {
    // Only loads supersede other loads. A set-color queued before a load is NOT dropped — it runs.
    const { loadStructure, release } = gatedLoad();
    const ctx = fakeContext({ loadStructure });
    const exec = createExecutor(ctx);
    const pLoad1 = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await flush();                                   // load1 in-flight
    const pColor = exec.dispatch({ name: 'set-color', input: { selection: { chain: 'A' }, color: '#ff0000' } });
    const pLoad2 = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1hsg' } });
    release();
    const [r1, rColor, r2] = await Promise.all([pLoad1, pColor, pLoad2]);
    expect(errorOf(r1).code).toBe('superseded');     // load1 (a load) IS superseded by load2
    expect(rColor.ok).toBe(true);                    // the mutation is NOT superseded — it runs
    expect(ctx.setColor).toHaveBeenCalledTimes(1);
    expect(r2.ok).toBe(true);                        // load2 survives
  });

  it('applies a mutation queued before a redundant same-structure load (does not drop it) (#1)', async () => {
    // The headline regression: a mutation followed by a redundant load of the displayed structure.
    // The load dedups to a no-op; the mutation must still be applied (not silently dropped).
    const ctx = fakeContext();
    const exec = createExecutor(ctx);
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } }); // 1crn displayed
    const pColor = exec.dispatch({ name: 'set-color', input: { selection: { chain: 'A' }, color: '#ff0000' } });
    const pLoad = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } }); // redundant
    const [rColor, rLoad] = await Promise.all([pColor, pLoad]);
    expect(rColor.ok).toBe(true);
    expect(ctx.setColor).toHaveBeenCalledTimes(1);     // applied, NOT dropped
    expect(rLoad.ok).toBe(true);
    expect(ctx.loadStructure).toHaveBeenCalledTimes(1); // the redundant load deduped (no 2nd ctx call)
  });

  it('reports superseded (not ok) when the abort lands after loadStructure resolves (#5)', async () => {
    // Resolves NORMALLY after the gate (no throwIfAborted) — simulates an abort landing during the
    // final applyPreset, the one adapter step with no checkpoint after it. The post-await re-check
    // must still report superseded and not stamp lastLoadedKey for a structure about to be replaced.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const loadStructure = vi.fn(async () => { await gate; });
    const exec = createExecutor(fakeContext({ loadStructure }));
    const pA = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await flush();                                   // A in-flight (in the fake, awaiting the gate)
    const pB = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1hsg' } }); // aborts A
    release();
    const [rA, rB] = await Promise.all([pA, pB]);
    expect(errorOf(rA).code).toBe('superseded');      // post-await re-check caught the abort
    expect(rB.ok).toBe(true);
  });

  it('lets get-scene-context bypass the queue during an in-flight load', async () => {
    const { loadStructure, release } = gatedLoad();
    const exec = createExecutor(fakeContext({ loadStructure }));
    const pLoad = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await flush();                                   // load in-flight (gated)
    const read = await exec.dispatch({ name: 'get-scene-context', input: {} });
    expect(read.ok).toBe(true);                      // resolved now, not blocked behind the load
    release();
    await pLoad;
  });
});

describe('createExecutor — dedup-on-same (#27)', () => {
  it('dedups a reload of the currently-displayed source (no second loadStructure)', async () => {
    const ctx = fakeContext();
    const exec = createExecutor(ctx);
    const r1 = await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    const r2 = await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(ctx.loadStructure).toHaveBeenCalledTimes(1); // second was a dedup no-op
  });

  it('does not dedup when a different load came in between (key invalidated)', async () => {
    const ctx = fakeContext();
    const exec = createExecutor(ctx);
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1hsg' } });
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    expect(ctx.loadStructure).toHaveBeenCalledTimes(3);
  });

  it('never dedups inline-data loads (no stable url identity)', async () => {
    const ctx = fakeContext();
    const resolveStructure = vi.fn(async () => ({ data: 'INLINE', format: 'pdb' as const }));
    const exec = createExecutor(ctx, { resolveStructure });
    await exec.dispatch({ name: 'load-structure', input: { source: 'inline', data: 'INLINE', format: 'pdb' } });
    await exec.dispatch({ name: 'load-structure', input: { source: 'inline', data: 'INLINE', format: 'pdb' } });
    expect(ctx.loadStructure).toHaveBeenCalledTimes(2);
  });

  it('does not dedup the load that supersedes an in-flight same-source load (scene was cleared)', async () => {
    const { loadStructure, release } = gatedLoad();
    const exec = createExecutor(fakeContext({ loadStructure }));
    const pB = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await flush();                                    // B in-flight: it already committed (key → undefined)
    const pA2 = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    release();
    const [rB, rA2] = await Promise.all([pB, pA2]);
    expect(errorOf(rB).code).toBe('superseded');
    expect(rA2.ok).toBe(true);
    expect(loadStructure).toHaveBeenCalledTimes(2);   // A2 reloaded; did NOT wrongly dedup into a blank scene
  });

  it('clears the dedup key after a trajectory load (a later same-url structure reloads)', async () => {
    const ctx = fakeContext();
    const exec = createExecutor(ctx);
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await exec.dispatch({
      name: 'load-trajectory',
      input: {
        topology: { source: 'url', url: 'https://x/top.pdb', format: 'pdb' },
        coordinates: { source: 'url', url: 'https://x/c.xtc', format: 'xtc' },
      },
    });
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    expect(ctx.loadStructure).toHaveBeenCalledTimes(2); // the post-trajectory 1crn is NOT deduped
  });
});
