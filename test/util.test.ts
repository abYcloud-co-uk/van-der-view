import { describe, expect, it } from 'vitest';
import { createSerializer } from '../src/util';

describe('createSerializer', () => {
  it('runs work in submission order without overlapping', async () => {
    const serialize = createSerializer();
    const order: string[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
    const a = serialize(async () => { order.push('a:start'); await gateA; order.push('a:end'); });
    const b = serialize(async () => { order.push('b:start'); order.push('b:end'); });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['a:start']); // b must wait for a to settle

    releaseA();
    await Promise.all([a, b]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('returns each work’s resolved value to its caller', async () => {
    const serialize = createSerializer();
    await expect(serialize(async () => 42)).resolves.toBe(42);
  });

  it('does not let a rejecting work poison the chain', async () => {
    const serialize = createSerializer();
    await expect(serialize(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(serialize(async () => 'ok')).resolves.toBe('ok'); // chain still usable
  });
});
