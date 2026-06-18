import type { AnthropicTool, AnthropicToolUse, Command, CommandSpec } from '../types';

/** Thrown when a provider tool-call block is structurally malformed. */
export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterError';
  }
}

/** OUTBOUND: canonical command specs → Anthropic tool definitions. */
export function toTools(commands: CommandSpec[]): AnthropicTool[] {
  return commands.map((c) => ({
    name: c.name,
    description: c.description,
    input_schema: c.inputSchema,
  }));
}

/** INBOUND: an Anthropic tool_use block → a normalized Command. */
export function toCommand(toolCall: unknown): Command {
  if (
    typeof toolCall !== 'object' ||
    toolCall === null ||
    (toolCall as { type?: unknown }).type !== 'tool_use'
  ) {
    throw new AdapterError('Expected an Anthropic tool_use block.');
  }
  const block = toolCall as Partial<AnthropicToolUse>;
  if (typeof block.name !== 'string' || block.name.length === 0) {
    throw new AdapterError('tool_use block is missing a string "name".');
  }
  if (
    typeof block.input !== 'object' ||
    block.input === null ||
    Array.isArray(block.input)
  ) {
    throw new AdapterError(`tool_use block "${block.name}" has a non-object "input".`);
  }
  return { name: block.name, input: block.input };
}
