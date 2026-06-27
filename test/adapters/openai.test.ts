import { describe, expect, it } from 'vitest';
import { VDV_COMMANDS } from '../../src/commands';
import { AdapterError } from '../../src/adapters/anthropic';
import { toCommand, toTools } from '../../src/adapters/openai';

describe('toTools (openai)', () => {
  it('maps every command spec to an OpenAI function tool def', () => {
    const tools = toTools(VDV_COMMANDS);
    expect(tools).toHaveLength(VDV_COMMANDS.length);
    expect(tools.every((t) => t.type === 'function')).toBe(true);
  });

  it('nests name/description/parameters under function and uses inputSchema as parameters', () => {
    const tools = toTools(VDV_COMMANDS);
    const highlight = tools.find((t) => t.function.name === 'highlight');
    expect(highlight).toMatchObject({
      type: 'function',
      function: {
        name: 'highlight',
        description: expect.any(String),
        parameters: { type: 'object' },
      },
    });
  });

  it('carries the full schema (properties + required) unchanged as parameters', () => {
    const tools = toTools(VDV_COMMANDS);
    for (const spec of VDV_COMMANDS) {
      const tool = tools.find((t) => t.function.name === spec.name);
      expect(tool?.function.parameters).toEqual(spec.inputSchema);
    }
  });

  it('throws AdapterError on duplicate command names', () => {
    const dup = VDV_COMMANDS[0];
    expect(() => toTools([dup, dup])).toThrow(AdapterError);
  });
});

describe('toCommand (openai)', () => {
  it('normalizes a well-formed function tool_call, JSON-parsing the arguments string', () => {
    const call = {
      id: 'call_123',
      type: 'function',
      function: {
        name: 'highlight',
        arguments: JSON.stringify({ selection: { chain: 'A', numbering: 'auth' } }),
      },
    };
    expect(toCommand(call)).toEqual({
      name: 'highlight',
      input: { selection: { chain: 'A', numbering: 'auth' } },
    });
  });

  it('treats an empty-string arguments as {} (e.g. reset-camera)', () => {
    const call = { id: 'c', type: 'function', function: { name: 'reset-camera', arguments: '' } };
    expect(toCommand(call)).toEqual({ name: 'reset-camera', input: {} });
  });

  it('treats absent arguments as {}', () => {
    const call = { id: 'c', type: 'function', function: { name: 'reset-camera' } };
    expect(toCommand(call)).toEqual({ name: 'reset-camera', input: {} });
  });

  it('throws AdapterError when the block is not a function tool_call', () => {
    expect(() => toCommand({ type: 'text', text: 'hi' })).toThrow(AdapterError);
  });

  it('throws AdapterError when the function object is missing', () => {
    expect(() => toCommand({ id: 'x', type: 'function' })).toThrow(AdapterError);
  });

  it('throws AdapterError when name is missing or empty', () => {
    expect(() => toCommand({ id: 'x', type: 'function', function: { arguments: '{}' } })).toThrow(AdapterError);
    expect(() =>
      toCommand({ id: 'x', type: 'function', function: { name: '', arguments: '{}' } }),
    ).toThrow(AdapterError);
  });

  it('throws AdapterError on invalid JSON in arguments', () => {
    expect(() =>
      toCommand({ id: 'x', type: 'function', function: { name: 'focus', arguments: '{ bad json' } }),
    ).toThrow(AdapterError);
  });

  it('throws AdapterError when arguments is a non-string', () => {
    expect(() =>
      toCommand({ id: 'x', type: 'function', function: { name: 'focus', arguments: { a: 1 } } }),
    ).toThrow(AdapterError);
  });

  it('throws AdapterError when arguments parse to a non-object (array / scalar)', () => {
    expect(() =>
      toCommand({ id: 'x', type: 'function', function: { name: 'focus', arguments: '[]' } }),
    ).toThrow(AdapterError);
    expect(() =>
      toCommand({ id: 'x', type: 'function', function: { name: 'focus', arguments: '42' } }),
    ).toThrow(AdapterError);
  });

  it('returns a caller-owned input (JSON.parse yields a fresh object)', () => {
    const call = {
      id: 'x',
      type: 'function',
      function: { name: 'highlight', arguments: JSON.stringify({ selection: { chain: 'A' } }) },
    };
    const cmd = toCommand(call);
    (cmd.input as { selection: { chain: string } }).selection.chain = 'B';
    // Source arguments string is untouched (it was a string), proving no aliasing.
    expect(call.function.arguments).toContain('"chain":"A"');
  });
});
