import { describe, expect, it } from 'vitest';
import { VDV_COMMANDS } from '../src/commands';
import { COLOR_SCHEMES, COORDINATE_FORMATS, COORDINATE_SOURCES, LOAD_SOURCES, NUMBERINGS, REPRESENTATION_TYPES, SELECTION_PRESETS } from '../src/types';

describe('VDV_COMMANDS', () => {
  it('contains the v1 commands plus the trajectory cluster', () => {
    const names = VDV_COMMANDS.map((c) => c.name).sort();
    expect(names).toEqual([
      'add-label',
      'clear-highlight',
      'focus',
      'get-scene-context',
      'highlight',
      'load-structure',
      'load-trajectory',
      'measure-distance',
      'play-trajectory',
      'reset-camera',
      'set-color',
      'set-frame',
      'set-representation',
      'stop-trajectory',
      'toggle-visibility',
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

  it('includes clear-highlight with an empty input schema', () => {
    const cmd = VDV_COMMANDS.find((c) => c.name === 'clear-highlight');
    expect(cmd).toBeDefined();
    expect(cmd?.inputSchema.properties).toEqual({});
    expect(cmd?.inputSchema.required).toBeUndefined();
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

describe('VDV_COMMANDS — representation cluster (v1.1a)', () => {
  const byName = (n: string) => VDV_COMMANDS.find((c) => c.name === n);

  it('set-representation requires selection + type, type enum from REPRESENTATION_TYPES', () => {
    const cmd = byName('set-representation');
    expect(cmd?.inputSchema.required).toEqual(['selection', 'type']);
    expect((cmd?.inputSchema.properties.type as { enum: string[] }).enum).toEqual([...REPRESENTATION_TYPES]);
  });

  it('set-color requires only selection and exposes scheme + color', () => {
    const cmd = byName('set-color');
    expect(cmd?.inputSchema.required).toEqual(['selection']);
    expect((cmd?.inputSchema.properties.scheme as { enum: string[] }).enum).toEqual([...COLOR_SCHEMES]);
    expect(cmd?.inputSchema.properties.color).toBeDefined();
  });

  it('toggle-visibility requires selection + visible', () => {
    expect(byName('toggle-visibility')?.inputSchema.required).toEqual(['selection', 'visible']);
  });

  it('measure-distance requires from + to', () => {
    expect(byName('measure-distance')?.inputSchema.required).toEqual(['from', 'to']);
  });

  it('add-label requires selection + text', () => {
    expect(byName('add-label')?.inputSchema.required).toEqual(['selection', 'text']);
  });
});
