import { describe, expect, it } from 'vitest';
import { VDV_COMMANDS } from '../../src/commands';
import { toTools } from '../../src/adapters/anthropic';

describe('toTools', () => {
  it('maps every command spec to an Anthropic tool def', () => {
    const tools = toTools(VDV_COMMANDS);
    expect(tools).toHaveLength(VDV_COMMANDS.length);
  });

  it('renames inputSchema to input_schema and preserves name/description', () => {
    const tools = toTools(VDV_COMMANDS);
    const highlight = tools.find((t) => t.name === 'highlight');
    expect(highlight).toMatchObject({
      name: 'highlight',
      description: expect.any(String),
      input_schema: { type: 'object' },
    });
    expect(highlight).not.toHaveProperty('inputSchema');
  });
});
