import { useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import type { SceneContext } from 'van-der-view/browser';
import { Panel } from '../ui';

export function SceneContextPanel() {
  const viewer = useMolView();
  const [scene, setScene] = useState<SceneContext>();

  const refresh = async () => {
    if (!viewer) return;
    // Go through the same command the agent uses (get-scene-context), not the imperative
    // getSceneContext() escape hatch — this exercises the CommandResult envelope and the
    // executor's defensive copy of the scene, which is the path that actually ships.
    const res = await viewer.dispatch({ name: 'get-scene-context', input: {} });
    if (res.ok) setScene(res.data as SceneContext);
  };

  return (
    <Panel title="Scene context">
      <button disabled={!viewer} onClick={() => void refresh()}>
        Refresh
      </button>
      <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', color: '#cde' }}>
        {scene ? JSON.stringify(scene, null, 2) : '(click refresh to read what the agent sees)'}
      </pre>
    </Panel>
  );
}
