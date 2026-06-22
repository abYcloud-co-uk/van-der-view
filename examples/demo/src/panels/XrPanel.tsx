import { useEffect, useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import { Panel } from '../ui';

export function XrPanel() {
  const viewer = useMolView();
  const [presenting, setPresenting] = useState(false);
  const supported = viewer?.xr.isSupported() ?? false;

  useEffect(() => {
    if (!viewer) return;
    setPresenting(viewer.xr.isPresenting());
    return viewer.xr.subscribe(setPresenting);
  }, [viewer]);

  return (
    <Panel title="WebXR">
      {!viewer ? (
        <div style={{ fontSize: 12, color: '#999' }}>initializing…</div>
      ) : supported ? (
        <button onClick={() => void (presenting ? viewer.xr.end() : viewer.xr.request())}>
          {presenting ? 'Exit XR' : 'Enter XR'}
        </button>
      ) : (
        <div style={{ fontSize: 12, color: '#fb7' }}>
          WebXR not available here. See <code>CHECKLIST.md</code> for the Immersive Web Emulator path.
        </div>
      )}
    </Panel>
  );
}
