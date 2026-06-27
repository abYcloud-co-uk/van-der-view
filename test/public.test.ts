import { describe, expect, it } from 'vitest';
import { adapters, commands, tools } from '../src/index';

describe('public surface', () => {
  it('exposes the command catalog', () => {
    expect(commands.map((c) => c.name)).toContain('load-structure');
  });

  it('exposes ready-made anthropic tools, one per command', () => {
    expect(tools.anthropic).toHaveLength(commands.length);
    expect(tools.anthropic.every((t) => 'input_schema' in t)).toBe(true);
  });

  it('exposes ready-made openai tools, one per command', () => {
    expect(tools.openai).toHaveLength(commands.length);
    expect(tools.openai.every((t) => t.type === 'function' && 'parameters' in t.function)).toBe(true);
  });

  it('exposes the adapters registry', () => {
    expect(typeof adapters.anthropic.toCommand).toBe('function');
  });
});
