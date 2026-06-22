import type { CommandSpec } from './types';
import { LOAD_SOURCES, NUMBERINGS, SELECTION_PRESETS, STRUCTURE_FORMATS } from './types';
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

/**
 * The canonical v1 command catalog (provider-neutral). Deep-frozen: it is an
 * exported singleton and must not be mutated by consumers.
 */
export const VDV_COMMANDS: readonly CommandSpec[] = deepFreeze<CommandSpec[]>([
  {
    name: 'load-structure',
    description: 'Load a molecular structure into the viewer by PDB id, URL, or inline text.',
    inputSchema: {
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
    },
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
        zoomOut: { type: 'boolean', description: 'Frame the selection a bit wider (extra camera pull-back).' },
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
]);
