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

  it('exposes a working openai adapter (also used by DeepSeek)', () => {
    const cmd = adapters.openai.toCommand({
      id: 'call_1',
      type: 'function',
      function: { name: 'reset-camera', arguments: '{}' },
    });
    expect(cmd).toEqual({ name: 'reset-camera', input: {} });
  });
});
