import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import '@/lib/zod-config';
import '@/i18n';
import { App } from './App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { stopWorker as stopTraceWorker } from './features/trace/auto-trace-protocol';
import { installAutosave } from './services/autosave';
import { registerSessionHook } from './services/session';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
  const { loadDemoProject } = await import('./dev/demo');
  loadDemoProject();
}

installAutosave(registerSessionHook);
// The sheet the auto trace worker holds belongs to the project.
registerSessionHook({ onEnd: stopTraceWorker });

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
