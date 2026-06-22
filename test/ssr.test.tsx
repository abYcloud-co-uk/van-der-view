// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MolViewProvider, MolViewCanvas } from '../src/browser';

describe('SSR safety', () => {
  it('renders the canvas placeholder server-side without touching WebGL or molstar', () => {
    const html = renderToString(
      <MolViewProvider>
        <MolViewCanvas data-testid="vdv-canvas" />
      </MolViewProvider>,
    );
    // Placeholder is emitted (container div with forwarded prop + the canvas).
    expect(html).toContain('data-testid="vdv-canvas"');
    expect(html).toContain('<canvas');
    // molstar mounts only inside useEffect (not run during renderToString) → no molstar artifacts.
    expect(html.toLowerCase()).not.toContain('molstar');
  });

  it('forwards style to the container', () => {
    const html = renderToString(
      <MolViewProvider>
        <MolViewCanvas style={{ height: 480 }} />
      </MolViewProvider>,
    );
    expect(html).toMatch(/height:\s*480px/);
  });
});
