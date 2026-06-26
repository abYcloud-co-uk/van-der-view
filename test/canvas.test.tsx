// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MolViewProvider, MolViewCanvas } from '../src/browser';
import { createMolView } from '../src/mol/create-mol-view';

// Mock the viewer factory so init fails — exercises the canvas's init-error path off-GPU
// (no real molstar / WebGL). Both the static and the canvas's dynamic import resolve here.
vi.mock('../src/mol/create-mol-view', () => ({
  createMolView: vi.fn(async () => {
    throw new Error('WebGL context creation failed');
  }),
}));

// Required for React's act() outside a dedicated test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MolViewCanvas — init-error surface (#24)', () => {
  it('calls onError with the failure when viewer initialization fails', async () => {
    // The canvas logs the failure too; keep test output pristine.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MolViewProvider>
          <MolViewCanvas onError={onError} />
        </MolViewProvider>,
      );
    });
    // Drain the effect's async init (dynamic import → createMolView rejects → .catch → onError).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onError).toHaveBeenCalledTimes(1);
    const arg = onError.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Error);
    expect((arg as Error).message).toContain('WebGL context creation failed');

    await act(async () => {
      root.unmount();
    });
    container.remove();
    errorSpy.mockRestore();
  });

  it('contains a throwing onError callback instead of letting it become an unhandled rejection (#3)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn(() => {
      throw new Error('callback boom');
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MolViewProvider>
          <MolViewCanvas onError={onError} />
        </MolViewProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onError).toHaveBeenCalledTimes(1);
    // The throw is contained (logged), not propagated off the effect's terminal promise chain.
    expect(
      errorSpy.mock.calls.some((call) => String(call[0]).includes('onError callback threw')),
    ).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    errorSpy.mockRestore();
  });
});

describe('MolViewCanvas — onHover (#29)', () => {
  it('wires onHover through subscribeHover and unsubscribes on unmount', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let hoverCb: ((info: unknown) => void) | undefined;
    const unsub = vi.fn();
    const fakeView = {
      dispose: vi.fn(),
      subscribeHover: vi.fn((cb: (info: unknown) => void) => { hoverCb = cb; return unsub; }),
    };
    vi.mocked(createMolView).mockResolvedValueOnce(
      fakeView as unknown as Awaited<ReturnType<typeof createMolView>>,
    );

    const onHover = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MolViewProvider>
          <MolViewCanvas onHover={onHover} />
        </MolViewProvider>,
      );
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(fakeView.subscribeHover).toHaveBeenCalledTimes(1);

    // The canvas passes a stable wrapper; firing it calls the host onHover with the same value.
    const info = { label: 'GLY 1', chain: 'A', loci: {} };
    act(() => { hoverCb!(info); });
    expect(onHover).toHaveBeenCalledWith(info);
    act(() => { hoverCb!(null); });
    expect(onHover).toHaveBeenLastCalledWith(null);

    await act(async () => { root.unmount(); });
    expect(unsub).toHaveBeenCalledTimes(1);
    container.remove();
    errorSpy.mockRestore();
  });

  it('does not subscribe to hover when no onHover is provided (no per-pointer-move work)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakeView = { dispose: vi.fn(), subscribeHover: vi.fn(() => vi.fn()) };
    vi.mocked(createMolView).mockResolvedValueOnce(
      fakeView as unknown as Awaited<ReturnType<typeof createMolView>>,
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MolViewProvider>
          <MolViewCanvas />
        </MolViewProvider>,
      );
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // No host callback → no hover subscription at all, so toHoverInfo never runs on pointer-move.
    expect(fakeView.subscribeHover).not.toHaveBeenCalled();

    await act(async () => { root.unmount(); });
    container.remove();
    errorSpy.mockRestore();
  });
});
