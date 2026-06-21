import { useEffect, useState } from 'react';

import { subscribeToServiceWorker, type ServiceWorkerState } from './service-worker';

const initialState: ServiceWorkerState = {
  applyUpdate: null,
  status: 'installing',
};

export function PwaStatus() {
  const [workerState, setWorkerState] = useState(initialState);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const unsubscribe = subscribeToServiceWorker(setWorkerState);
    const updateConnection = () => setOnline(navigator.onLine);

    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);

    return () => {
      unsubscribe();
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  if (workerState.status === 'update-available') {
    return (
      <button
        className="pwa-pill pwa-pill--update"
        onClick={() => workerState.applyUpdate?.()}
        type="button"
      >
        Update ready · reload
      </button>
    );
  }

  const shellReady = workerState.status === 'ready';
  const label = !online
    ? 'Offline'
    : shellReady
      ? 'App shell cached'
      : workerState.status === 'unsupported'
        ? 'Offline unsupported'
        : 'Preparing offline';

  return (
    <div className={`pwa-pill ${!online ? 'pwa-pill--offline' : ''}`}>
      <span aria-hidden="true">●</span>
      {label}
    </div>
  );
}
