import { createRoot } from 'react-dom/client';
import { MolViewProvider } from '@abycloud-co-uk/van-der-view/browser';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <MolViewProvider>
    <App />
  </MolViewProvider>,
);
