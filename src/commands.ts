import type { CommandSpec } from './types';
import { COORDINATE_FORMATS, COORDINATE_SOURCES, LOAD_SOURCES, NUMBERINGS, SELECTION_PRESETS, STRUCTURE_FORMATS } from './types';
import { deepFreeze } from './util';

/** JSON Schema fragment for a Selection (shared by highlight/focus). */
const selectionSchema = {
  type: 'object',
  description: 'A residue/chain/ligand selector. Give chain/residues + numbering, OR a preset.',
  minProperties: 1,
  properties: {
    chain: { type: 'string', description: 'Chain id, e.g. "A".' },
    residues: {
      type: 'array',
      minItems: 1,
      description: 'Residue numbers; each item is an integer or an [start, end] integer range.',
      items: {
        oneOf: [
          { type: 'integer' },
          { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
        ],
      },
    },
    numbering: {
      type: 'string',
      enum: [...NUMBERINGS],
      description: 'auth = PDB author numbering (what users cite); label = entity numbering.',
    },
    preset: {
      type: 'string',
      enum: [...SELECTION_PRESETS],
      description: 'A named group, used instead of chain/residues.',
    },
  },
  additionalProperties: false,
};

/** JSON Schema fragment for a structure source (shared by load-structure + load-trajectory topology). */
const structureSourceSchema = Object.freeze({
  type: 'object',
  properties: {
    source: { type: 'string', enum: [...LOAD_SOURCES], description: 'Where to load from.' },
    id: { type: 'string', description: 'PDB id, when source is "pdb" (e.g. "1CRN").' },
    url: { type: 'string', description: 'Structure URL, when source is "url".' },
    data: { type: 'string', description: 'Raw structure text, when source is "inline".' },
    format: {
      type: 'string',
      enum: [...STRUCTURE_FORMATS],
      default: 'mmcif',
      description: 'File format (default mmcif).',
    },
  },
  required: ['source'],
  additionalProperties: false,
});

/** JSON Schema fragment for a binary coordinate stream (load-trajectory). */
const coordinatesSchema = Object.freeze({
  type: 'object',
  description: 'A binary per-frame coordinate stream (XTC/TRR/DCD/NCTRAJ) paired with the topology.',
  properties: {
    source: { type: 'string', enum: [...COORDINATE_SOURCES], description: 'Where to load coordinates from (url only).' },
    url: { type: 'string', description: 'Coordinate file URL.' },
    format: { type: 'string', enum: [...COORDINATE_FORMATS], description: 'Coordinate stream format.' },
  },
  required: ['source', 'url', 'format'],
  additionalProperties: false,
});

/**
 * The canonical v1 command catalog (provider-neutral). Deep-frozen: it is an
 * exported singleton and must not be mutated by consumers.
 */
export const VDV_COMMANDS: readonly CommandSpec[] = deepFreeze<CommandSpec[]>([
  {
    name: 'load-structure',
    description: 'Load a molecular structure into the viewer by PDB id, URL, or inline text.',
    inputSchema: structureSourceSchema,
  },
  {
    name: 'highlight',
    description: 'Transiently highlight a selection of residues, a chain, or a ligand.',
    inputSchema: {
      type: 'object',
      properties: { selection: selectionSchema },
      required: ['selection'],
      additionalProperties: false,
    },
  },
  {
    name: 'focus',
    description: 'Move the camera to focus on a selection.',
    inputSchema: {
      type: 'object',
      properties: {
        selection: selectionSchema,
        durationMs: { type: 'number', description: 'Camera animation duration in ms.' },
        zoomOut: {
          type: 'number',
          description: 'Zoom-out factor: 1 fits the selection, 2 frames about twice as wide for context.',
        },
      },
      required: ['selection'],
      additionalProperties: false,
    },
  },
  {
    name: 'get-scene-context',
    description:
      'Read the current scene: loaded structures, chains, and what is selected. Call this before guessing selectors.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'reset-camera',
    description: 'Reset the camera to the default view.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'load-trajectory',
    description:
      'Load an MD trajectory: a topology (model) plus a separate binary coordinate stream (XTC/TRR/DCD/NCTRAJ). Use this, not load-structure, when you have a coordinate file to animate.',
    inputSchema: {
      type: 'object',
      properties: {
        topology: structureSourceSchema,
        coordinates: coordinatesSchema,
      },
      required: ['topology', 'coordinates'],
      additionalProperties: false,
    },
  },
  {
    name: 'play-trajectory',
    description: 'Start animating the loaded trajectory (loops by default).',
    inputSchema: {
      type: 'object',
      properties: {
        fps: { type: 'number', exclusiveMinimum: 0, description: 'Target frames per second (must be > 0; default ~30).' },
        loop: { type: 'boolean', description: 'Loop continuously (true, default) or play once (false).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'stop-trajectory',
    description: 'Stop trajectory animation.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'set-frame',
    description: 'Jump the loaded trajectory to a specific 0-based frame index.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: '0-based frame index (0 .. frameCount-1).' },
      },
      required: ['index'],
      additionalProperties: false,
    },
  },
]);
