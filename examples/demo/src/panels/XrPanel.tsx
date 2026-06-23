import { useEffect, useState } from 'react';
import { useMolView } from '@abycloud-co-uk/van-der-view/browser';
import { Panel } from '../ui';

export function XrPanel() {
  const viewer = useMolView();
  const [presenting, setPresenting] = useState(false);
  // `supported` lives in state and is driven by subscribeSupported: Mol*'s xr.isSupported
  // starts false and flips true only after the async WebXR probe resolves, so a one-shot
  // read at render would leave the panel stuck on "not available" on a real headset.
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (!viewer) return;
    setPresenting(viewer.xr.isPresenting());
    setSupported(viewer.xr.isSupported());
    const offPresenting = viewer.xr.subscribe(setPresenting);
    const offSupported = viewer.xr.subscribeSupported(setSupported);
    return () => {
      offPresenting();
      offSupported();
    };
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
