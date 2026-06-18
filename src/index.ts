import { toTools } from './adapters/anthropic';
import { VDV_COMMANDS } from './commands';

export * from './types';
export { VDV_COMMANDS } from './commands';
export { adapters } from './adapters/index';
export { AdapterError } from './adapters/anthropic';

/** The canonical command catalog. */
export const commands = VDV_COMMANDS;

/** Ready-made provider tool definitions. */
export const tools = {
  anthropic: toTools(VDV_COMMANDS),
};
