import { useEffect, useState } from 'react';

export const APP_ROUTES = ['home', 'assistant', 'code', 'models', 'downloads', 'settings'] as const;

export type AppRoute = (typeof APP_ROUTES)[number];

export function parseAppRoute(hash: string): AppRoute {
  const route = hash.replace(/^#\/?/, '').split(/[?#]/, 1)[0];
  return APP_ROUTES.includes(route as AppRoute) ? (route as AppRoute) : 'home';
}

function readCurrentRoute() {
  return parseAppRoute(window.location.hash);
}

export function useAppRoute(): AppRoute {
  const [route, setRoute] = useState(readCurrentRoute);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(readCurrentRoute());
      if (window.location.hash.startsWith('#/')) {
        window.scrollTo({ left: 0, top: 0 });
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return route;
}

export function routeHref(route: AppRoute) {
  return route === 'home' ? '#/' : `#/${route}`;
}
