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
import { resolveSelection } from './selection';

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
          if (typeof input.zoomOut === 'boolean') focusOptions.zoomOut = input.zoomOut;
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
