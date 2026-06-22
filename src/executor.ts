import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type { Command, CommandResult, Selection } from './types';
import { err, ok } from './types';
import { isPlainObject } from './util';
import type { ExecutorContext, FocusOptions } from './context';
import { ExecutorError } from './errors';
import type { ErrorCode } from './errors';
import { defaultResolveStructure } from './resolve-structure';
import type { LoadInput, ResolveStructure } from './resolve-structure';
import { defaultResolveCoordinates } from './resolve-coordinates';
import type { ResolveCoordinates } from './resolve-coordinates';
import type { CoordinatesInput } from './types';
import { resolveSelection } from './selection';

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
          if (ctx.getSceneContext().trajectory === undefined) {
            throw new ExecutorError('no_trajectory', 'no trajectory is loaded.');
          }
          const playOptions: { fps?: number; loop?: boolean } = {};
          if (typeof input.fps === 'number') playOptions.fps = input.fps;
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
