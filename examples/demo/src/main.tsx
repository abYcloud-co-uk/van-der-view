import { createRoot } from 'react-dom/client';
import { MolViewProvider } from '@abycloud-co-uk/van-der-view/browser';
import { App } from './App';
// Design system: canonical tokens first, then the demo theme that consumes them.
import '../../../docs/design/tokens.css';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <MolViewProvider>
    <App />
  </MolViewProvider>,
);
