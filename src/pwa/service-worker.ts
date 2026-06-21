export type ServiceWorkerStatus = 'unsupported' | 'installing' | 'ready' | 'update-available';

export interface ServiceWorkerState {
  applyUpdate: (() => void) | null;
  status: ServiceWorkerStatus;
}

const listeners = new Set<(state: ServiceWorkerState) => void>();

let state: ServiceWorkerState = {
  applyUpdate: null,
  status: 'installing',
};

function publish(nextState: ServiceWorkerState) {
  state = nextState;
  for (const listener of listeners) {
    listener(state);
  }
}

function exposeUpdate(registration: ServiceWorkerRegistration) {
  if (!registration.waiting) {
    return;
  }

  publish({
    applyUpdate: () => registration.waiting?.postMessage({ type: 'SKIP_WAITING' }),
    status: 'update-available',
  });
}

export function subscribeToServiceWorker(listener: (nextState: ServiceWorkerState) => void) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    publish({ applyUpdate: null, status: 'unsupported' });
    return;
  }

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    window.location.reload();
  });

  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
  });

  exposeUpdate(registration);

  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;
    if (!installingWorker) {
      return;
    }

    publish({ applyUpdate: null, status: 'installing' });
    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          exposeUpdate(registration);
        } else {
          publish({ applyUpdate: null, status: 'ready' });
        }
      }
    });
  });

  if (registration.active && !registration.waiting) {
    publish({ applyUpdate: null, status: 'ready' });
  }
}

export async function clearDevelopmentServiceWorkers() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => registration.scope === `${window.location.origin}/`)
        .map((registration) => registration.unregister()),
    );
  }

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith('emberbench-shell-')).map((key) => caches.delete(key)),
    );
  }
}
