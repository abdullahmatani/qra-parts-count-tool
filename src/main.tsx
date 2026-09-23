import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import '@/lib/zod-config';
import '@/i18n';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
  const { loadDemoProject } = await import('./dev/demo');
  loadDemoProject();
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
