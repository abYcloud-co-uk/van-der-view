import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type { Command, CommandResult, Selection } from './types';
import { err, ok } from './types';
import { COLOR_SCHEMES, REPRESENTATION_TYPES } from './types';
import type { ColorScheme, MeasureDistanceResult, RepresentationType } from './types';
import { isPlainObject } from './util';
import type { ExecutorContext, FocusOptions, PlayTrajectoryOptions } from './context';
import type { ColorSpec } from './context';
import { ExecutorError } from './errors';
import type { ErrorCode } from './errors';
import { defaultResolveStructure } from './resolve-structure';
import type { LoadInput, ResolveStructure } from './resolve-structure';
import { defaultResolveCoordinates } from './resolve-coordinates';
import type { ResolveCoordinates } from './resolve-coordinates';
import type { CoordinatesInput } from './types';
import { resolveSelection } from './selection';
import { distanceBetweenLoci } from './measure';

export interface ExecutorOptions {
  /** Host hook to fetch auth-protected / internal structures. Defaults to RCSB/url/inline. */
  resolveStructure?: ResolveStructure;
  /** Host hook to fetch a binary coordinate stream. Defaults to URL passthrough. */
  resolveCoordinates?: ResolveCoordinates;
}

/** err() with the code constrained to the shared ErrorCode union (catches typos / divergence). */
const fail = (code: ErrorCode, message: string): CommandResult => err(code, message);

function asObject(input: unknown): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new ExecutorError('invalid_input', 'command input must be an object.');
  }
  return input;
}

function requireSelection(input: Record<string, unknown>): Selection {
  if (!isPlainObject(input.selection)) {
    throw new ExecutorError('invalid_input', 'expected a "selection" object.');
  }
  return input.selection as Selection;
}

function lociFor(ctx: ExecutorContext, selection: Selection): StructureElement.Loci {
  const structure: Structure | undefined = ctx.getStructure();
  if (!structure) throw new ExecutorError('no_structure', 'no structure is loaded.');
  return resolveSelection(selection, structure);
}

/** Pull a required Selection object out of `input[key]` (e.g. "from"/"to"). */
function requireSelectionAt(input: Record<string, unknown>, key: string): Selection {
  if (!isPlainObject(input[key])) {
    throw new ExecutorError('invalid_input', `expected a "${key}" selection object.`);
  }
  return input[key] as Selection;
}

/** Resolve a selection to a loci, throwing empty_selection if it matched nothing. */
function nonEmptyLociFor(ctx: ExecutorContext, selection: Selection): StructureElement.Loci {
  const loci = lociFor(ctx, selection);
  if (StructureElement.Loci.isEmpty(loci)) {
    throw new ExecutorError('empty_selection', 'selection matched no atoms.');
  }
  return loci;
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

export function createExecutor(ctx: ExecutorContext, options: ExecutorOptions = {}) {
  const resolveStructure = options.resolveStructure ?? defaultResolveStructure;
  const resolveCoordinates = options.resolveCoordinates ?? defaultResolveCoordinates;

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
        case 'load-trajectory': {
          const input = asObject(command.input);
          if (!isPlainObject(input.topology)) {
            throw new ExecutorError('invalid_input', 'load-trajectory requires a "topology" object.');
          }
          if (!isPlainObject(input.coordinates)) {
            throw new ExecutorError('invalid_input', 'load-trajectory requires a "coordinates" object.');
          }
          const topology = await resolveStructure(input.topology as unknown as LoadInput);
          if (topology.url === undefined && topology.data === undefined) {
            throw new ExecutorError('internal_error', 'resolveStructure returned neither a url nor inline data.');
          }
          const coordinates = await resolveCoordinates(input.coordinates as unknown as CoordinatesInput);
          if (coordinates.url === undefined && coordinates.data === undefined) {
            throw new ExecutorError('internal_error', 'resolveCoordinates returned neither a url nor bytes.');
          }
          await ctx.loadTrajectory({ topology, coordinates });
          return ok();
        }
        case 'play-trajectory': {
          const input = asObject(command.input);
          const traj = ctx.getSceneContext().trajectory;
          if (traj === undefined) {
            throw new ExecutorError('no_trajectory', 'no trajectory is loaded.');
          }
          // Mol*'s AnimateModelIndex can't animate a single frame (canApply requires
          // frameCount > 1) — without this guard play would return ok with no motion.
          if (traj.frameCount <= 1) {
            throw new ExecutorError('invalid_input', `trajectory has ${traj.frameCount} frame(s); nothing to animate.`);
          }
          const playOptions: PlayTrajectoryOptions = {};
          if (input.fps !== undefined) {
            // fps:0 makes Mol* compute an infinite duration → playback freezes silently;
            // reject non-positive / non-finite values instead of forwarding them.
            if (typeof input.fps !== 'number' || !Number.isFinite(input.fps) || input.fps <= 0) {
              throw new ExecutorError('invalid_input', 'play-trajectory "fps" must be a finite number greater than 0.');
            }
            playOptions.fps = input.fps;
          }
          if (typeof input.loop === 'boolean') playOptions.loop = input.loop;
          ctx.playTrajectory(Object.keys(playOptions).length > 0 ? playOptions : undefined);
          return ok();
        }
        case 'stop-trajectory': {
          if (ctx.getSceneContext().trajectory === undefined) {
            throw new ExecutorError('no_trajectory', 'no trajectory is loaded.');
          }
          ctx.stopTrajectory();
          return ok();
        }
        case 'set-frame': {
          const input = asObject(command.input);
          const traj = ctx.getSceneContext().trajectory;
          if (traj === undefined) {
            throw new ExecutorError('no_trajectory', 'no trajectory is loaded.');
          }
          const index = input.index;
          if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= traj.frameCount) {
            throw new ExecutorError('invalid_input', `set-frame "index" must be an integer in [0, ${traj.frameCount}).`);
          }
          ctx.setFrame(index);
          return ok();
        }
        case 'highlight': {
          const loci = lociFor(ctx, requireSelection(asObject(command.input)));
          if (StructureElement.Loci.isEmpty(loci)) return fail('empty_selection', 'selection matched no atoms.');
          ctx.highlight(loci);
          return ok();
        }
        case 'focus': {
          const input = asObject(command.input);
          const loci = lociFor(ctx, requireSelection(input));
          if (StructureElement.Loci.isEmpty(loci)) return fail('empty_selection', 'selection matched no atoms.');
          const focusOptions: FocusOptions = {};
          if (typeof input.durationMs === 'number') focusOptions.durationMs = input.durationMs;
          if (typeof input.zoomOut === 'number') focusOptions.zoomOut = input.zoomOut;
          ctx.focus(loci, Object.keys(focusOptions).length > 0 ? focusOptions : undefined);
          return ok();
        }
        case 'set-representation': {
          const input = asObject(command.input);
          const loci = nonEmptyLociFor(ctx, requireSelection(input));
          const type = requireEnum<RepresentationType>(input, 'type', REPRESENTATION_TYPES);
          ctx.setRepresentation(loci, type);
          return ok();
        }
        case 'set-color': {
          const input = asObject(command.input);
          // Validate the color spec first so a bad color fails before resolving the loci.
          const color = requireColorSpec(input);
          const loci = nonEmptyLociFor(ctx, requireSelection(input));
          ctx.setColor(loci, color);
          return ok();
        }
        case 'toggle-visibility': {
          const input = asObject(command.input);
          const visible = requireBoolean(input, 'visible');
          const loci = nonEmptyLociFor(ctx, requireSelection(input));
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
          const loci = nonEmptyLociFor(ctx, requireSelection(input));
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
