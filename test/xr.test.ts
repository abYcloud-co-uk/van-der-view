import { describe, expect, it, vi } from 'vitest';
import { createXrApi } from '../src/mol/xr';

/** A stub canvas3d.xr with controllable BehaviorSubject-like state. */
function fakeXr(supported: boolean, presenting: boolean) {
  const presentSubs = new Set<(b: boolean) => void>();
  const supportSubs = new Set<(b: boolean) => void>();
  return {
    isSupported: {
      value: supported,
      subscribe: (cb: (b: boolean) => void) => {
        supportSubs.add(cb);
        return { unsubscribe: () => supportSubs.delete(cb) };
      },
    },
    isPresenting: {
      value: presenting,
      subscribe: (cb: (b: boolean) => void) => {
        presentSubs.add(cb);
        return { unsubscribe: () => presentSubs.delete(cb) };
      },
    },
    request: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    requestFailed: { subscribe: () => ({ unsubscribe() {} }) },
    _fire: (b: boolean) => presentSubs.forEach((cb) => cb(b)),
    _fireSupported: (b: boolean) => supportSubs.forEach((cb) => cb(b)),
  };
}

describe('createXrApi — no canvas3d yet', () => {
  const xr = createXrApi({ canvas3d: undefined } as any);
  it('reports unsupported / not presenting without throwing', () => {
    expect(xr.isSupported()).toBe(false);
    expect(xr.isPresenting()).toBe(false);
  });
  it('request/end resolve as no-ops', async () => {
    await expect(xr.request()).resolves.toBeUndefined();
    await expect(xr.end()).resolves.toBeUndefined();
  });
  it('subscribe returns a no-op unsubscribe', () => {
    const off = xr.subscribe(() => {});
    expect(() => off()).not.toThrow();
  });
  it('subscribeSupported returns a no-op unsubscribe', () => {
    const off = xr.subscribeSupported(() => {});
    expect(() => off()).not.toThrow();
  });
});

describe('createXrApi — with canvas3d.xr', () => {
  it('reads state, forwards request/end, and streams isPresenting', async () => {
    const x = fakeXr(true, false);
    const xr = createXrApi({ canvas3d: { xr: x } } as any);
    expect(xr.isSupported()).toBe(true);
    expect(xr.isPresenting()).toBe(false);

    await xr.request();
    expect(x.request).toHaveBeenCalledOnce();
    await xr.end();
    expect(x.end).toHaveBeenCalledOnce();

    const seen: boolean[] = [];
    const off = xr.subscribe((b) => seen.push(b));
    x._fire(true);
    off();
    x._fire(false); // ignored after unsubscribe
    expect(seen).toEqual([true]);
  });

  it('streams isSupported via subscribeSupported and unsubscribes', () => {
    const x = fakeXr(false, false); // support starts false; the async probe flips it later
    const xr = createXrApi({ canvas3d: { xr: x } } as any);
    const seen: boolean[] = [];
    const off = xr.subscribeSupported((b) => seen.push(b));
    x._fireSupported(true); // WebXR probe resolves → supported flips true
    off();
    x._fireSupported(false); // ignored after unsubscribe
    expect(seen).toEqual([true]);
  });
});
