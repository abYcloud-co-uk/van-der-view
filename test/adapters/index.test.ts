import { describe, expect, it } from 'vitest';
import { adapters } from '../../src/adapters/index';

describe('adapters registry', () => {
  it('exposes a working anthropic adapter', () => {
    const cmd = adapters.anthropic.toCommand({
      type: 'tool_use',
      id: 'x',
      name: 'reset-camera',
      input: {},
    });
    expect(cmd).toEqual({ name: 'reset-camera', input: {} });
  });

  it('throws clearly for the unimplemented openai adapter (toCommand)', () => {
    expect(() => adapters.openai.toCommand({})).toThrow(/openai.*not implemented/i);
  });

  it('throws clearly for the unimplemented openai adapter (toTools)', () => {
    expect(() => adapters.openai.toTools([])).toThrow(/openai.*not implemented/i);
  });
});
