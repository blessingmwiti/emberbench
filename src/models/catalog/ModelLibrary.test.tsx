import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstalledModel } from './types';

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  listModels: vi.fn(),
  removeModel: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock('../../storage/database', () => ({
  appSettings: {
    get: () => Promise.resolve({ runtimePreference: 'auto' }),
  },
  INSTALLED_MODELS_CHANGED_EVENT: 'emberbench:installed-models-changed',
  installedModels: {
    list: mocks.listModels,
  },
}));

vi.mock('../../storage/remove-installed-model', () => ({
  removeInstalledModel: mocks.removeModel,
}));

vi.mock('../../storage/download-preflight', () => ({
  runDownloadPreflight: () => Promise.resolve({ message: 'Ready.', status: 'ready' }),
}));

vi.mock('../../runtimes/create-runtime-adapter', () => ({
  createRuntimeAdapter: () => ({ terminate: mocks.terminate }),
}));

vi.mock('../../storage/install-model', () => ({
  installModel: mocks.install,
}));

import { createInstalledModel, transitionInstalledModel } from '../installed-model';
import { ModelLibrary } from './ModelLibrary';
import { findCuratedModel } from './registry';

function installedFixture(): InstalledModel {
  const model = findCuratedModel('smollm2-135m-q4');
  if (!model) throw new Error('Model library fixture is missing.');
  const verifying = transitionInstalledModel(createInstalledModel(model), 'verifying', {
    cachedFiles: 6,
    totalFiles: 6,
  });
  return transitionInstalledModel(verifying, 'installed');
}

function cardFor(name: string) {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('article');
  if (!card) throw new Error(`Could not find card for ${name}.`);
  return within(card);
}

describe('ModelLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates offline availability after a local model is removed', async () => {
    let records: InstalledModel[] = [installedFixture()];
    mocks.listModels.mockImplementation(() => Promise.resolve(records));
    mocks.removeModel.mockImplementation(() => {
      records = [];
      window.dispatchEvent(new Event('emberbench:installed-models-changed'));
      return Promise.resolve();
    });

    render(<ModelLibrary diagnostic={null} />);

    expect(await screen.findByRole('heading', { name: 'SmolLM2 135M' })).toBeInTheDocument();
    expect(cardFor('SmolLM2 135M').getByText('Available offline')).toBeInTheDocument();

    fireEvent.click(cardFor('SmolLM2 135M').getByRole('button', { name: 'Remove local copy' }));
    fireEvent.click(cardFor('SmolLM2 135M').getByRole('button', { name: 'Remove model files' }));

    await waitFor(() => expect(mocks.removeModel).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(cardFor('SmolLM2 135M').getByText('Online only')).toBeInTheDocument(),
    );
    expect(cardFor('SmolLM2 135M').queryByText('Available offline')).not.toBeInTheDocument();
  });
});
