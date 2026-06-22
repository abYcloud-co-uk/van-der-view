import { describe, expect, it } from 'vitest';
import { VDV_COMMANDS } from '../src/commands';
import { COORDINATE_FORMATS, COORDINATE_SOURCES, LOAD_SOURCES, NUMBERINGS, SELECTION_PRESETS } from '../src/types';

describe('VDV_COMMANDS', () => {
  it('contains the v1 commands plus the trajectory cluster', () => {
    const names = VDV_COMMANDS.map((c) => c.name).sort();
    expect(names).toEqual([
      'focus',
      'get-scene-context',
      'highlight',
      'load-structure',
      'load-trajectory',
      'play-trajectory',
      'reset-camera',
      'set-frame',
      'stop-trajectory',
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

  it('does not advertise highlight.style in v1 (deferred to the v1.1 representation cluster)', () => {
    const highlight = VDV_COMMANDS.find((c) => c.name === 'highlight');
    expect(highlight?.inputSchema.properties).not.toHaveProperty('style');
  });

  it('types focus.zoomOut as a number', () => {
    const focus = VDV_COMMANDS.find((c) => c.name === 'focus');
    expect((focus?.inputSchema.properties.zoomOut as { type: string }).type).toBe('number');
  });
});

describe('VDV_COMMANDS — trajectory cluster', () => {
  const byName = (n: string) => VDV_COMMANDS.find((c) => c.name === n);

  it('requires topology and coordinates on load-trajectory', () => {
    const cmd = byName('load-trajectory');
    expect(cmd?.inputSchema.required).toEqual(['topology', 'coordinates']);
  });

  it('reuses the structure source shape for the topology and derives coordinate enums', () => {
    const cmd = byName('load-trajectory');
    const props = cmd?.inputSchema.properties as {
      topology: { properties: { source: { enum: string[] } } };
      coordinates: { properties: { source: { enum: string[] }; format: { enum: string[] } } };
    };
    expect(props.topology.properties.source.enum).toEqual([...LOAD_SOURCES]);
    expect(props.coordinates.properties.source.enum).toEqual([...COORDINATE_SOURCES]);
    expect(props.coordinates.properties.format.enum).toEqual([...COORDINATE_FORMATS]);
  });

  it('requires index on set-frame', () => {
    expect(byName('set-frame')?.inputSchema.required).toEqual(['index']);
  });

  it('gives play-trajectory optional fps/loop and no required fields', () => {
    const cmd = byName('play-trajectory');
    expect(cmd?.inputSchema.required ?? []).toEqual([]);
    expect(cmd?.inputSchema.properties).toHaveProperty('fps');
    expect(cmd?.inputSchema.properties).toHaveProperty('loop');
  });

  it('freezes the new command schemas against mutation', () => {
    expect(Object.isFrozen(byName('load-trajectory')?.inputSchema)).toBe(true);
  });
});
