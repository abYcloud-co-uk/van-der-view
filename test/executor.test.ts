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
