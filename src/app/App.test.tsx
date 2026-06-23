import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App';

Object.defineProperty(navigator, 'storage', {
  configurable: true,
  value: {
    estimate: vi.fn().mockResolvedValue({ quota: 1024, usage: 256 }),
    persisted: vi.fn().mockResolvedValue(false),
  },
});

describe('App', () => {
  it('introduces the product and its three MVP workspaces', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /your device/i })).toBeInTheDocument();
    expect(screen.getByText('General Assistant')).toBeInTheDocument();
    expect(screen.getByText('Code Lab')).toBeInTheDocument();
    expect(screen.getByText('Vision Desk')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open workspace →' })).toHaveLength(3);
    expect(await screen.findByText('WebGPU is unavailable')).toBeInTheDocument();
  });
});
