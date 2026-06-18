import type { CommandSpec } from './types';

/** JSON Schema fragment for a Selection (shared by highlight/focus). */
const selectionSchema = {
  type: 'object',
  description: 'A residue/chain/ligand selector. Give chain/residues + numbering, OR a preset.',
  properties: {
    chain: { type: 'string', description: 'Chain id, e.g. "A".' },
    residues: {
      type: 'array',
      description: 'Residue numbers; each item is a number or a [start, end] range.',
      items: {
        oneOf: [
          { type: 'number' },
          { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        ],
      },
    },
    numbering: {
      type: 'string',
      enum: ['auth', 'label'],
      description: 'auth = PDB author numbering (what users cite); label = entity numbering.',
    },
    preset: {
      type: 'string',
      enum: ['all', 'polymer', 'protein', 'nucleic', 'ligand', 'ion', 'water'],
      description: 'A named group, used instead of chain/residues.',
    },
  },
  additionalProperties: false,
};

/** The canonical v1 command catalog (provider-neutral). */
export const VDV_COMMANDS: CommandSpec[] = [
  {
    name: 'load-structure',
    description: 'Load a molecular structure into the viewer by PDB id or URL.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['pdb', 'url', 'inline'], description: 'Where to load from.' },
        id: { type: 'string', description: 'PDB id, when source is "pdb" (e.g. "1CRN").' },
        url: { type: 'string', description: 'Structure URL, when source is "url".' },
        data: { type: 'string', description: 'Raw structure text, when source is "inline".' },
        format: { type: 'string', enum: ['mmcif', 'pdb'], description: 'File format (default mmcif).' },
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
        zoomOut: { type: 'number', description: 'Extra zoom-out factor.' },
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
];
