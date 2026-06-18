import { describe, expect, it } from 'vitest';
import { VDV_COMMANDS } from '../../src/commands';
import { AdapterError, toCommand, toTools } from '../../src/adapters/anthropic';

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

describe('toCommand', () => {
  it('normalizes a well-formed tool_use block into a Command', () => {
    const block = {
      type: 'tool_use',
      id: 'toolu_123',
      name: 'highlight',
      input: { selection: { chain: 'A', numbering: 'auth' } },
    };
    expect(toCommand(block)).toEqual({
      name: 'highlight',
      input: { selection: { chain: 'A', numbering: 'auth' } },
    });
  });

  it('keeps an empty-object input (e.g. reset-camera)', () => {
    const block = { type: 'tool_use', id: 'toolu_1', name: 'reset-camera', input: {} };
    expect(toCommand(block)).toEqual({ name: 'reset-camera', input: {} });
  });

  it('throws AdapterError when the block is not a tool_use', () => {
    expect(() => toCommand({ type: 'text', text: 'hi' })).toThrow(AdapterError);
  });

  it('throws AdapterError when name is missing', () => {
    expect(() => toCommand({ type: 'tool_use', id: 'x', input: {} })).toThrow(AdapterError);
  });

  it('throws AdapterError when input is not an object', () => {
    expect(() =>
      toCommand({ type: 'tool_use', id: 'x', name: 'focus', input: '[]' }),
    ).toThrow(AdapterError);
  });

  it('throws AdapterError when input is an array', () => {
    expect(() =>
      toCommand({ type: 'tool_use', id: 'x', name: 'focus', input: [] }),
    ).toThrow(AdapterError);
  });

  it('throws AdapterError when input is null', () => {
    expect(() => toCommand({ type: 'tool_use', id: 'x', name: 'focus', input: null })).toThrow(AdapterError);
  });

  it('throws AdapterError when name is an empty string', () => {
    expect(() => toCommand({ type: 'tool_use', id: 'x', name: '', input: {} })).toThrow(AdapterError);
  });
});
