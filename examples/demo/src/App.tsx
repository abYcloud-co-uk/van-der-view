import { MolViewCanvas } from 'van-der-view/browser';
import { LoadPanel } from './panels/LoadPanel';
import { CommandsPanel } from './panels/CommandsPanel';
import { SceneContextPanel } from './panels/SceneContextPanel';

export function App() {
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#111', color: '#eee' }}>
      <MolViewCanvas style={{ flex: 1, height: '100vh' }} />
      <div style={{ width: 380, overflowY: 'auto', padding: 16, background: '#181818', borderLeft: '1px solid #333' }}>
        <h1 style={{ fontSize: 16, marginTop: 0 }}>van-der-view demo</h1>
        <LoadPanel />
        <CommandsPanel />
        <SceneContextPanel />
        {/* PANELS */}
      </div>
    </div>
  );
}
