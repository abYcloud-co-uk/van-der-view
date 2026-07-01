import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Structure } from 'molstar/lib/mol-model/structure';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { Vec2 } from 'molstar/lib/mol-math/linear-algebra';
import type { InteractivityManager } from 'molstar/lib/mol-plugin-state/manager/interactivity';
import { PDB_TINY, buildStructureFromPDB } from './fixtures/structures';
import { resolveSelection } from '../src/selection';
import {
  subscribeHoverEvents,
  toHoverInfo,
  viewportFromCanvasRelative,
  type HoverInfo,
  type HoverSource,
} from '../src/hover';

let structure: Structure;
beforeAll(async () => { structure = await buildStructureFromPDB(PDB_TINY); });

// Minimal HoverEvent: toHoverInfo reads only `current.loci` and `page`.
function hoverEvent(loci: unknown, page?: [number, number]): InteractivityManager.HoverEvent {
  return {
    current: { loci, repr: undefined },
    ...(page ? { page: Vec2.create(page[0], page[1]) } : {}),
  } as unknown as InteractivityManager.HoverEvent;
}

// A single-atom loci = first element of the first unit. PDB_TINY's first atom is N of GLY A 1.
function singleAtomLoci(s: Structure) {
  return StructureElement.Loci(s, [
    { unit: s.units[0], indices: OrderedSet.ofSingleton(0 as StructureElement.UnitIndex) },
  ]);
}

describe('toHoverInfo', () => {
  it('returns null for an empty loci (pointer over empty space)', () => {
    const empty = resolveSelection({ chain: 'Z' }, structure); // matches nothing
    expect(toHoverInfo(hoverEvent(empty))).toBeNull();
  });

  it('gives a plain-text (tag-free) label for a structure loci', () => {
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const info = toHoverInfo(hoverEvent(residue)) as HoverInfo;
    expect(info.label.length).toBeGreaterThan(0);
    expect(info.label).not.toMatch(/<[^>]+>/); // no HTML tags
  });

  it('fills chain/residue fields for a structure loci, omitting atomName at residue granularity', () => {
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure); // GLY1 = 3 atoms
    const info = toHoverInfo(hoverEvent(residue)) as HoverInfo;
    expect(info.chain).toBe('A');
    expect(info.residueName).toBe('GLY');
    expect(info.residueNumber).toBe(1);
    expect(info.atomName).toBeUndefined(); // 3-atom loci → not a single atom
  });

  it('sets atomName only when the loci is a single atom', () => {
    const info = toHoverInfo(hoverEvent(singleAtomLoci(structure))) as HoverInfo;
    expect(info.chain).toBe('A');
    expect(info.residueName).toBe('GLY');
    expect(info.residueNumber).toBe(1);
    expect(info.atomName).toBe('N'); // first atom of GLY A 1
  });

  it('derives screen coords from event.page, omitting them when absent', () => {
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    expect(toHoverInfo(hoverEvent(residue, [120, 340]))!.screen).toEqual({ x: 120, y: 340 });
    expect(toHoverInfo(hoverEvent(residue))!.screen).toBeUndefined();
  });

  it('always carries the raw loci', () => {
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    expect(toHoverInfo(hoverEvent(residue))!.loci).toBe(residue);
  });
});

describe('viewportFromCanvasRelative', () => {
  it('adds the canvas rect offset to a canvas-relative point (inset canvas)', () => {
    expect(viewportFromCanvasRelative({ left: 200, top: 120 }, { x: 30, y: 40 })).toEqual({ x: 230, y: 160 });
  });

  it('is identity for a canvas at the viewport origin', () => {
    expect(viewportFromCanvasRelative({ left: 0, top: 0 }, { x: 55, y: 66 })).toEqual({ x: 55, y: 66 });
  });
});

function fakeSource() {
  let observer: ((e: InteractivityManager.HoverEvent) => void) | undefined;
  const unsubscribe = vi.fn();
  const source: HoverSource = {
    subscribe: (o) => { observer = o; return { unsubscribe }; },
  };
  return { source, unsubscribe, emit: (e: InteractivityManager.HoverEvent) => observer!(e) };
}

describe('subscribeHoverEvents', () => {
  it('maps events through toHoverInfo and delivers them to the callback', async () => {
    const structure = await buildStructureFromPDB(PDB_TINY);
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const { source, emit } = fakeSource();
    const cb = vi.fn();
    subscribeHoverEvents(source, cb);

    emit(hoverEvent(residue));
    expect(cb).toHaveBeenCalledTimes(1);
    expect((cb.mock.calls[0][0] as HoverInfo).chain).toBe('A');

    const empty = resolveSelection({ chain: 'Z' }, structure);
    emit(hoverEvent(empty));
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1][0]).toBeNull();
  });

  it('suppresses a leading null seed but delivers a non-null seed and later nulls', async () => {
    const structure = await buildStructureFromPDB(PDB_TINY);
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const empty = resolveSelection({ chain: 'Z' }, structure);

    // A BehaviorSubject replays its seed synchronously on subscribe; when that seed is "nothing
    // hovered" (the usual case at mount) it must NOT reach the host as a phantom event...
    const a = fakeSource();
    const cbA = vi.fn();
    subscribeHoverEvents(a.source, cbA);
    a.emit(hoverEvent(empty)); // the seed replay
    expect(cbA).not.toHaveBeenCalled();
    a.emit(hoverEvent(residue)); // a real hover
    expect(cbA).toHaveBeenCalledTimes(1);
    a.emit(hoverEvent(empty)); // pointer leaves → a real null, delivered
    expect(cbA).toHaveBeenCalledTimes(2);
    expect(cbA.mock.calls[1][0]).toBeNull();

    // ...but a seed that already carries a hover (subscribed mid-hover) IS delivered.
    const b = fakeSource();
    const cbB = vi.fn();
    subscribeHoverEvents(b.source, cbB);
    b.emit(hoverEvent(residue));
    expect(cbB).toHaveBeenCalledTimes(1);
  });

  it('contains a throwing callback (so it cannot break the shared hover Subject)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const structure = await buildStructureFromPDB(PDB_TINY);
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const { source, emit } = fakeSource();
    subscribeHoverEvents(source, () => { throw new Error('host boom'); });

    expect(() => emit(hoverEvent(residue))).not.toThrow();
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('callback threw'))).toBe(true);
    errorSpy.mockRestore();
  });

  it('returns an unsubscribe that tears down the source subscription', () => {
    const { source, unsubscribe } = fakeSource();
    const off = subscribeHoverEvents(source, vi.fn());
    expect(unsubscribe).not.toHaveBeenCalled();
    off();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('applies transformScreen to a delivered info.screen (canvas-relative → viewport)', async () => {
    const structure = await buildStructureFromPDB(PDB_TINY);
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const { source, emit } = fakeSource();
    const cb = vi.fn();
    subscribeHoverEvents(source, cb, (p) => ({ x: p.x + 200, y: p.y + 120 }));
    emit(hoverEvent(residue, [30, 40]));
    expect((cb.mock.calls[0][0] as HoverInfo).screen).toEqual({ x: 230, y: 160 });
  });

  it('does not apply transformScreen when there is no screen, and passes through raw when no transform', async () => {
    const structure = await buildStructureFromPDB(PDB_TINY);
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);

    // transform given, but the event carries no page → no screen → transform not applied, no throw
    const withXform = fakeSource();
    const cbX = vi.fn();
    subscribeHoverEvents(withXform.source, cbX, (p) => ({ x: p.x + 1, y: p.y + 1 }));
    withXform.emit(hoverEvent(residue)); // no page
    expect((cbX.mock.calls[0][0] as HoverInfo).screen).toBeUndefined();

    // no transform (default) → screen passes through canvas-relative (unchanged contract)
    const noXform = fakeSource();
    const cbN = vi.fn();
    subscribeHoverEvents(noXform.source, cbN);
    noXform.emit(hoverEvent(residue, [30, 40]));
    expect((cbN.mock.calls[0][0] as HoverInfo).screen).toEqual({ x: 30, y: 40 });
  });
});
