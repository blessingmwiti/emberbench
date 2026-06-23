import { describe, expect, it } from 'vitest';

import { parseAppRoute, routeHref } from './routing';

describe('application routing', () => {
  it('parses known hash routes and treats unknown routes as home', () => {
    expect(parseAppRoute('#/models')).toBe('models');
    expect(parseAppRoute('#downloads')).toBe('downloads');
    expect(parseAppRoute('#/settings?from=downloads')).toBe('settings');
    expect(parseAppRoute('#/code')).toBe('code');
    expect(parseAppRoute('#/vision')).toBe('vision');
    expect(parseAppRoute('#/unknown')).toBe('home');
    expect(parseAppRoute('')).toBe('home');
  });

  it('creates static-hosting-safe route links', () => {
    expect(routeHref('home')).toBe('#/');
    expect(routeHref('models')).toBe('#/models');
    expect(routeHref('code')).toBe('#/code');
    expect(routeHref('vision')).toBe('#/vision');
  });
});
