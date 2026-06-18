import { StructureElement } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type { Command, CommandResult, Selection } from './types';
import { err, ok } from './types';
import type { ExecutorContext } from './context';
import { ExecutorError } from './errors';
import { defaultResolveStructure } from './resolve-structure';
import type { LoadInput, ResolveStructure } from './resolve-structure';
import { resolveSelection } from './selection';

export interface ExecutorOptions {
  /** Host hook to fetch auth-protected / internal structures. Defaults to RCSB/url/inline. */
  resolveStructure?: ResolveStructure;
}

function asObject(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ExecutorError('invalid_input', 'command input must be an object.');
  }
  return input as Record<string, unknown>;
}

function requireSelection(input: Record<string, unknown>): Selection {
  const sel = input.selection;
  if (typeof sel !== 'object' || sel === null || Array.isArray(sel)) {
    throw new ExecutorError('invalid_input', 'expected a "selection" object.');
  }
  return sel as Selection;
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
          await ctx.loadStructure(resolved);
          return ok();
        }
        case 'highlight': {
          const loci = lociFor(ctx, requireSelection(asObject(command.input)));
          if (StructureElement.Loci.isEmpty(loci)) return err('empty_selection', 'selection matched no atoms.');
          ctx.highlight(loci);
          return ok();
        }
        case 'focus': {
          const input = asObject(command.input);
          const loci = lociFor(ctx, requireSelection(input));
          if (StructureElement.Loci.isEmpty(loci)) return err('empty_selection', 'selection matched no atoms.');
          ctx.focus(loci, { durationMs: typeof input.durationMs === 'number' ? input.durationMs : undefined });
          return ok();
        }
        case 'get-scene-context':
          return ok(ctx.getSceneContext());
        case 'reset-camera':
          ctx.resetCamera();
          return ok();
        default:
          return err('unknown_command', `unknown command "${command.name}".`);
      }
    } catch (e) {
      if (e instanceof ExecutorError) return err(e.code, e.message);
      return err('internal_error', e instanceof Error ? e.message : String(e));
    }
  }

  return { dispatch };
}
