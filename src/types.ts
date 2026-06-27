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

// ── OpenAI-compatible wire shapes (also used by DeepSeek) ───────────────────
// DeepSeek's API is OpenAI-compatible, so the same adapter serves both. The one
// divergence from Anthropic: tool args arrive as a JSON *string* in
// `function.arguments`, which the adapter must JSON.parse.

/** An OpenAI-compatible tool (function) definition (the output of toTools). */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/** An OpenAI-compatible tool_call (the input shape of toCommand). */
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON-encoded arguments — a *string*, parsed by the adapter. */
    arguments: string;
  };
}

// ── Appearance (set-representation / set-color) ─────────────────────────────

/**
 * The Mol* representation types van-der-view exposes — how a selection is drawn.
 * cartoon = ribbon/helix schematic; ball-and-stick = atoms+bonds; spacefill =
 * van der Waals spheres; molecular-surface / gaussian-surface = a smooth surface;
 * point / line = lightweight wireframe; ellipsoid = anisotropic thermal ellipsoids.
 */
export const REPRESENTATION_TYPES = [
  'cartoon', 'ball-and-stick', 'spacefill', 'molecular-surface',
  'gaussian-surface', 'point', 'line', 'ellipsoid',
] as const;
export type RepresentationType = (typeof REPRESENTATION_TYPES)[number];

/**
 * Built-in, data-driven color schemes (the alternative to a single solid color).
 * 'element' = by atom type (CPK); 'chain' = a distinct color per chain;
 * 'residue-index' = rainbow N→C; 'secondary-structure' = helix/sheet/coil;
 * 'b-factor' = by atomic uncertainty/flexibility; 'hydrophobicity'; 'sequence-id'.
 */
export const COLOR_SCHEMES = [
  'element', 'chain', 'residue-index', 'secondary-structure',
  'b-factor', 'hydrophobicity', 'sequence-id',
] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** Change how a selection is drawn. */
export interface SetRepresentationInput {
  selection: Selection;
  type: RepresentationType;
}

/**
 * Recolor a selection. Exactly one of `scheme` (data-driven) or `color` (a single
 * hex like "#ff0000") is required — enforced by the executor, not the JSON Schema.
 */
export interface SetColorInput {
  selection: Selection;
  scheme?: ColorScheme;
  color?: string;
}

/** Show or hide a selection. */
export interface ToggleVisibilityInput {
  selection: Selection;
  visible: boolean;
}

/** Measure the distance between the geometric centers of two selections. */
export interface MeasureDistanceInput {
  from: Selection;
  to: Selection;
}

/** The data payload returned in CommandResult for a successful measure-distance. */
export interface MeasureDistanceResult {
  distanceAngstrom: number;
}

/** Place a 3D text label at the center of a selection. */
export interface AddLabelInput {
  selection: Selection;
  text: string;
}
