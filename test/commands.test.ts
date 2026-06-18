import { describe, expect, it } from 'vitest';
import { VDV_COMMANDS } from '../src/commands';
import { LOAD_SOURCES, NUMBERINGS, SELECTION_PRESETS } from '../src/types';

describe('VDV_COMMANDS', () => {
  it('contains exactly the v1 commands', () => {
    const names = VDV_COMMANDS.map((c) => c.name).sort();
    expect(names).toEqual([
      'focus',
      'get-scene-context',
      'highlight',
      'load-structure',
      'reset-camera',
    ]);
  });

  it('gives every command a non-empty description and an object input schema', () => {
    for (const c of VDV_COMMANDS) {
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.inputSchema.type).toBe('object');
      expect(typeof c.inputSchema.properties).toBe('object');
    }
  });

  it('requires source on load-structure', () => {
    const load = VDV_COMMANDS.find((c) => c.name === 'load-structure');
    expect(load?.inputSchema.required).toContain('source');
  });

  it('requires selection on highlight and focus', () => {
    for (const name of ['highlight', 'focus']) {
      const cmd = VDV_COMMANDS.find((c) => c.name === name);
      expect(cmd?.inputSchema.required).toContain('selection');
    }
  });

  it('freezes the catalog and its shared schemas against mutation', () => {
    expect(Object.isFrozen(VDV_COMMANDS)).toBe(true);
    const highlight = VDV_COMMANDS.find((c) => c.name === 'highlight');
    expect(Object.isFrozen(highlight?.inputSchema)).toBe(true);
  });

  it('derives schema enums from the shared const arrays (no drift)', () => {
    const load = VDV_COMMANDS.find((c) => c.name === 'load-structure');
    expect((load?.inputSchema.properties.source as { enum: string[] }).enum).toEqual([...LOAD_SOURCES]);
    const sel = VDV_COMMANDS.find((c) => c.name === 'highlight')?.inputSchema.properties
      .selection as { properties: { numbering: { enum: string[] }; preset: { enum: string[] } } };
    expect(sel.properties.numbering.enum).toEqual([...NUMBERINGS]);
    expect(sel.properties.preset.enum).toEqual([...SELECTION_PRESETS]);
  });

  it('constrains residues to a non-empty list of integers and rejects empty selections', () => {
    const sel = VDV_COMMANDS.find((c) => c.name === 'focus')?.inputSchema.properties.selection as {
      minProperties: number;
      properties: { residues: { minItems: number; items: { oneOf: { type: string }[] } } };
    };
    expect(sel.minProperties).toBe(1);
    expect(sel.properties.residues.minItems).toBe(1);
    expect(sel.properties.residues.items.oneOf[0].type).toBe('integer');
  });

  it('exposes the v1 style param on highlight', () => {
    const highlight = VDV_COMMANDS.find((c) => c.name === 'highlight');
    expect(highlight?.inputSchema.properties).toHaveProperty('style');
  });
});
