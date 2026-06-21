import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { AppErrorBoundary } from './app/AppErrorBoundary';
import { clearDevelopmentServiceWorkers, registerServiceWorker } from './pwa/service-worker';
import './styles.css';

const rootElement = document.querySelector<HTMLDivElement>('#root');

if (!rootElement) {
  throw new Error('Emberbench could not find its application root.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD) {
  void registerServiceWorker().catch((error: unknown) => {
    console.error('Emberbench could not prepare offline mode.', error);
  });
} else {
  void clearDevelopmentServiceWorkers().catch((error: unknown) => {
    console.warn('Emberbench could not clear a stale development service worker.', error);
  });
}
