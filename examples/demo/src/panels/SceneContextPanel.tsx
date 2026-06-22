import { useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import { Panel } from '../ui';

export function SceneContextPanel() {
  const viewer = useMolView();
  const [scene, setScene] = useState<unknown>();
  return (
    <Panel title="Scene context">
      <button disabled={!viewer} onClick={() => setScene(viewer!.getSceneContext())}>
        Refresh
      </button>
      <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', color: '#cde' }}>
        {scene ? JSON.stringify(scene, null, 2) : '(click refresh to read what the agent sees)'}
      </pre>
    </Panel>
  );
}
