// ── Command envelope (locked: wiki command-schema) ──────────────────────────

/** A normalized command the executor consumes. Provider-agnostic. */
export interface Command {
  name: string;
  input: unknown;
}

/** Result of dispatching a command; fed back to the agent as a tool_result. */
export type CommandResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } };

/** Build a success result. */
export const ok = (data?: unknown): CommandResult => ({ ok: true, data });

/** Build a failure result. */
export const err = (code: string, message: string): CommandResult => ({
  ok: false,
  error: { code, message },
});

// ── Selection (LLM-friendly; modeled on MVS ComponentExpression) ────────────

/** Which residue numbering a Selection uses. auth = PDB author, label = entity. */
export const NUMBERINGS = ['auth', 'label'] as const;
export type Numbering = (typeof NUMBERINGS)[number];

/** A named group of atoms, used instead of chain/residues. */
export const SELECTION_PRESETS = [
  'all', 'polymer', 'protein', 'nucleic', 'ligand', 'ion', 'water',
] as const;
export type SelectionPreset = (typeof SELECTION_PRESETS)[number];

/** A single residue number, or an inclusive [start, end] range. */
export type ResidueRef = number | [number, number];

/**
 * A residue/chain/ligand selector. Either give `chain`/`residues` (+`numbering`)
 * OR a `preset`. auth vs label numbering is explicit — mixing them silently
 * selects the wrong residues.
 */
export interface Selection {
  chain?: string;
  residues?: ResidueRef[];
  numbering?: Numbering;
  preset?: SelectionPreset;
}

// ── Structure loading (load-structure) ─────────────────────────────────────

/** Where load-structure pulls a structure from. */
export const LOAD_SOURCES = ['pdb', 'url', 'inline'] as const;
export type LoadSource = (typeof LOAD_SOURCES)[number];

/** Structure file formats van-der-view parses. */
export const STRUCTURE_FORMATS = ['mmcif', 'pdb'] as const;
export type StructureFormat = (typeof STRUCTURE_FORMATS)[number];

// ── Trajectory coordinates (load-trajectory) ────────────────────────────────

/** Binary per-frame coordinate stream formats van-der-view loads, paired with a topology. */
export const COORDINATE_FORMATS = ['xtc', 'trr', 'dcd', 'nctraj'] as const;
export type CoordinateFormat = (typeof COORDINATE_FORMATS)[number];

/**
 * Where load-trajectory pulls a coordinate stream from. Agent-facing: url only — binary
 * streams can't be text-inlined; raw bytes arrive via a host resolveCoordinates override.
 */
export const COORDINATE_SOURCES = ['url'] as const;
export type CoordinateSource = (typeof COORDINATE_SOURCES)[number];

/** Normalized "coordinates" field of the load-trajectory command. */
export interface CoordinatesInput {
  source: CoordinateSource;
  url?: string;
  format: CoordinateFormat;
}

// ── Command specs + JSON Schema ─────────────────────────────────────────────

/** A minimal JSON Schema object — enough for tool input schemas. */
export interface JSONSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/** The canonical, provider-neutral definition of one command. */
export interface CommandSpec {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/** A per-provider-family shim between the LLM wire format and our Command. */
export interface ProviderAdapter<TTool = unknown> {
  toTools(commands: readonly CommandSpec[]): TTool[];
  toCommand(toolCall: unknown): Command;
}

// ── Anthropic wire shapes (verified via the claude-api skill) ───────────────

/** An Anthropic tool definition (the output shape of toTools). */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

/** An Anthropic tool_use content block (the input shape of toCommand). */
export interface AnthropicToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
