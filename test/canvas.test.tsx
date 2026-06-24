// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MolViewProvider, MolViewCanvas } from '../src/browser';

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
});
