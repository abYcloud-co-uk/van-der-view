import { useState } from 'react';
import { useMolView } from '@abycloud-co-uk/van-der-view/browser';
import type { CommandResult } from '@abycloud-co-uk/van-der-view';
import type { SceneContext } from '@abycloud-co-uk/van-der-view/browser';
import { Panel, ResultView } from '../ui';

/**
 * Manual trajectory panel. There is no bundled coordinate fixture (an XTC is large and
 * binary), so paste URLs to a locally-served topology + coordinate file — e.g. serve the
 * gitignored MD_Data/ folder with `npx serve MD_Data/5GGS` and use its printed origin:
 *   topology:    http://localhost:3000/5GGS_nowat.pdb   (format: pdb)
 *   coordinates: http://localhost:3000/5GGS_nowat.xtc   (format: xtc)
 */
export function TrajectoryPanel() {
  const viewer = useMolView();
  const disabled = !viewer;
  const [topologyUrl, setTopologyUrl] = useState('http://localhost:3000/5GGS_nowat.pdb');
  const [coordsUrl, setCoordsUrl] = useState('http://localhost:3000/5GGS_nowat.xtc');
  const [result, setResult] = useState<CommandResult>();
  const [scene, setScene] = useState<SceneContext>();

  const run = async (command: Parameters<NonNullable<typeof viewer>['dispatch']>[0]) => {
    if (!viewer) return;
    setResult(await viewer.dispatch(command));
    const ctx = await viewer.dispatch({ name: 'get-scene-context', input: {} });
    if (ctx.ok) setScene(ctx.data as SceneContext);
  };

  // Derive the slider position from the scene's read-model (not a parallel local state) so
  // it stays in sync after Play advances frames or a new (shorter) trajectory is loaded.
  const frameCount = scene?.trajectory?.frameCount ?? 1;
  const currentFrame = scene?.trajectory?.currentFrame ?? 0;

  return (
    <Panel title="Trajectory">
      <div style={{ display: 'grid', gap: 4 }}>
        <input value={topologyUrl} onChange={(e) => setTopologyUrl(e.target.value)} placeholder="topology .pdb URL" />
        <input value={coordsUrl} onChange={(e) => setCoordsUrl(e.target.value)} placeholder="coordinates .xtc URL" />
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <button
          disabled={disabled}
          onClick={() =>
            run({
              name: 'load-trajectory',
              input: {
                topology: { source: 'url', url: topologyUrl, format: 'pdb' },
                coordinates: { source: 'url', url: coordsUrl, format: 'xtc' },
              },
            })
          }
        >
          Load trajectory
        </button>
        <button disabled={disabled} onClick={() => run({ name: 'play-trajectory', input: { fps: 15 } })}>
          Play
        </button>
        <button disabled={disabled} onClick={() => run({ name: 'stop-trajectory', input: {} })}>
          Stop
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 12 }}>
          frame {currentFrame} / {frameCount - 1}
          <input
            type="range"
            min={0}
            max={Math.max(0, frameCount - 1)}
            value={currentFrame}
            disabled={disabled}
            onChange={(e) => void run({ name: 'set-frame', input: { index: Number(e.target.value) } })}
            style={{ width: '100%' }}
          />
        </label>
      </div>
      <ResultView result={result} />
      <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', color: '#cde' }}>
        {scene?.trajectory ? JSON.stringify(scene.trajectory, null, 2) : '(load a trajectory to see frame state)'}
      </pre>
    </Panel>
  );
}
