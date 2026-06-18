import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type {
  Command,
  CommandResult,
  ColorScheme,
  MeasureDistanceResult,
  RepresentationType,
  Selection,
} from './types';
import { COLOR_SCHEMES, REPRESENTATION_TYPES, err, ok } from './types';
import { isPlainObject } from './util';
import type { ColorSpec, ExecutorContext, FocusOptions } from './context';
import { ExecutorError } from './errors';
import type { ErrorCode } from './errors';
import { defaultResolveStructure } from './resolve-structure';
import type { LoadInput, ResolveStructure } from './resolve-structure';
import { resolveSelection } from './selection';
import { distanceBetweenLoci } from './measure';

export interface ExecutorOptions {
  /** Host hook to fetch auth-protected / internal structures. Defaults to RCSB/url/inline. */
  resolveStructure?: ResolveStructure;
}

/** err() with the code constrained to the shared ErrorCode union (catches typos / divergence). */
const fail = (code: ErrorCode, message: string): CommandResult => err(code, message);

function asObject(input: unknown): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new ExecutorError('invalid_input', 'command input must be an object.');
  }
  return input;
}

/** Pull a required Selection object out of `input[key]` (default key "selection"). */
function requireSelectionAt(input: Record<string, unknown>, key = 'selection'): Selection {
  if (!isPlainObject(input[key])) {
    throw new ExecutorError('invalid_input', `expected a "${key}" selection object.`);
  }
  return input[key] as Selection;
}

/** Require a non-empty string field on the (LLM-supplied) input. */
function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ExecutorError('invalid_input', `expected a non-empty string "${key}".`);
  }
  return value;
}

/** Require a boolean field. */
function requireBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== 'boolean') {
    throw new ExecutorError('invalid_input', `expected a boolean "${key}".`);
  }
  return value;
}

/** Require a string field constrained to one of `allowed`. */
function requireEnum<T extends string>(
  input: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const value = input[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ExecutorError('invalid_input', `"${key}" must be one of ${allowed.join(', ')}.`);
  }
  return value as T;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Validate set-color's input down to exactly one of `scheme` or a hex `color`. */
function requireColorSpec(input: Record<string, unknown>): ColorSpec {
  const hasScheme = input.scheme !== undefined;
  const hasColor = input.color !== undefined;
  if (hasScheme === hasColor) {
    throw new ExecutorError('invalid_input', 'set-color requires exactly one of "scheme" or "color".');
  }
  if (hasScheme) {
    return { scheme: requireEnum<ColorScheme>(input, 'scheme', COLOR_SCHEMES) };
  }
  const color = requireString(input, 'color');
  if (!HEX_COLOR.test(color)) {
    throw new ExecutorError('invalid_input', '"color" must be a 6-digit hex string, e.g. "#ff0000".');
  }
  return { hex: color };
}

function lociFor(ctx: ExecutorContext, selection: Selection): StructureElement.Loci {
  const structure: Structure | undefined = ctx.getStructure();
  if (!structure) throw new ExecutorError('no_structure', 'no structure is loaded.');
  return resolveSelection(selection, structure);
}

/** Resolve a selection to a loci, throwing empty_selection if it matched nothing. */
function nonEmptyLociFor(ctx: ExecutorContext, selection: Selection): StructureElement.Loci {
  const loci = lociFor(ctx, selection);
  if (StructureElement.Loci.isEmpty(loci)) {
    throw new ExecutorError('empty_selection', 'selection matched no atoms.');
  }
  return loci;
}

export function createExecutor(ctx: ExecutorContext, options: ExecutorOptions = {}) {
  const resolveStructure = options.resolveStructure ?? defaultResolveStructure;

  async function dispatch(command: Command): Promise<CommandResult> {
    try {
      switch (command.name) {
        case 'load-structure': {
          const resolved = await resolveStructure(asObject(command.input) as unknown as LoadInput);
          if (resolved.url === undefined && resolved.data === undefined) {
            throw new ExecutorError('internal_error', 'resolveStructure returned neither a url nor inline data.');
          }
          await ctx.loadStructure(resolved);
          return ok();
        }
        case 'highlight': {
          const loci = lociFor(ctx, requireSelectionAt(asObject(command.input)));
          if (StructureElement.Loci.isEmpty(loci)) return fail('empty_selection', 'selection matched no atoms.');
          ctx.highlight(loci);
          return ok();
        }
        case 'focus': {
          const input = asObject(command.input);
          const loci = lociFor(ctx, requireSelectionAt(input));
          if (StructureElement.Loci.isEmpty(loci)) return fail('empty_selection', 'selection matched no atoms.');
          const focusOptions: FocusOptions | undefined =
            typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : undefined;
          ctx.focus(loci, focusOptions);
          return ok();
        }
        case 'set-representation': {
          const input = asObject(command.input);
          const loci = nonEmptyLociFor(ctx, requireSelectionAt(input));
          const type = requireEnum<RepresentationType>(input, 'type', REPRESENTATION_TYPES);
          ctx.setRepresentation(loci, type);
          return ok();
        }
        case 'set-color': {
          const input = asObject(command.input);
          // Validate the color spec first so a bad color fails before resolving the loci.
          const color = requireColorSpec(input);
          const loci = nonEmptyLociFor(ctx, requireSelectionAt(input));
          ctx.setColor(loci, color);
          return ok();
        }
        case 'toggle-visibility': {
          const input = asObject(command.input);
          const visible = requireBoolean(input, 'visible');
          const loci = nonEmptyLociFor(ctx, requireSelectionAt(input));
          ctx.setVisibility(loci, visible);
          return ok();
        }
        case 'measure-distance': {
          const input = asObject(command.input);
          const from = nonEmptyLociFor(ctx, requireSelectionAt(input, 'from'));
          const to = nonEmptyLociFor(ctx, requireSelectionAt(input, 'to'));
          const distanceAngstrom = distanceBetweenLoci(from, to);
          return ok({ distanceAngstrom } satisfies MeasureDistanceResult);
        }
        case 'add-label': {
          const input = asObject(command.input);
          const text = requireString(input, 'text');
          const loci = nonEmptyLociFor(ctx, requireSelectionAt(input));
          ctx.addLabel(loci, text);
          return ok();
        }
        case 'get-scene-context':
          // Defensive copy: CommandResult.data must not alias live host scene state.
          return ok(structuredClone(ctx.getSceneContext()));
        case 'reset-camera':
          ctx.resetCamera();
          return ok();
        default:
          return fail('unknown_command', `unknown command "${command.name}".`);
      }
    } catch (e) {
      if (e instanceof ExecutorError) return fail(e.code, e.message);
      return fail('internal_error', e instanceof Error ? e.message : String(e));
    }
  }

  return { dispatch };
}
