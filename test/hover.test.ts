import { beforeAll, describe, expect, it } from 'vitest';
import type { Structure } from 'molstar/lib/mol-model/structure';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { Vec2 } from 'molstar/lib/mol-math/linear-algebra';
import type { InteractivityManager } from 'molstar/lib/mol-plugin-state/manager/interactivity';
import { PDB_TINY, buildStructureFromPDB } from './fixtures/structures';
import { resolveSelection } from '../src/selection';
import { toHoverInfo, type HoverInfo } from '../src/hover';

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
