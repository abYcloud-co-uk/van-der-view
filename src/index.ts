import { adapters } from './adapters/index';
import { VDV_COMMANDS } from './commands';
import { deepFreeze } from './util';

export * from './types';
export { AdapterError } from './adapters/anthropic';
export { adapters };

/** The canonical command catalog. */
export const commands = VDV_COMMANDS;

/** Ready-made provider tool definitions, built from the adapter registry. */
export const tools = {
  anthropic: deepFreeze(adapters.anthropic.toTools(VDV_COMMANDS)),
};
