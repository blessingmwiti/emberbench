import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { install, listModels, removeModel, terminate } = vi.hoisted(() => ({
  install: vi.fn(),
  listModels: vi.fn(),
  removeModel: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock('../storage/database', () => ({
  INSTALLED_MODELS_CHANGED_EVENT: 'emberbench:installed-models-changed',
  installedModels: {
    list: listModels,
  },
}));

vi.mock('../storage/remove-installed-model', () => ({
  removeInstalledModel: removeModel,
}));

vi.mock('../storage/download-preflight', () => ({
  runDownloadPreflight: () => Promise.resolve({ message: 'Ready.', status: 'ready' }),
}));

vi.mock('../runtimes/create-runtime-adapter', () => ({
  createRuntimeAdapter: () => ({ terminate }),
}));

vi.mock('../storage/install-model', () => ({
  installModel: install,
}));

import { DownloadCenter } from './DownloadCenter';

describe('DownloadCenter', () => {
  beforeEach(() => {
    listModels.mockReset();
    removeModel.mockReset();
    install.mockReset();
    terminate.mockReset();
  });

  it('shows interrupted progress with a recovery action', async () => {
    listModels.mockResolvedValue([
      {
        cachedFiles: 2,
        createdAt: '2026-06-22T04:00:00.000Z',
        downloadAttempt: 2,
        downloadArtifact: 'onnx/model_q4.onnx_data',
        downloadArtifactProgress: 0.31,
        downloadLoadedBytes: 57_000_000,
        downloadProgress: 0.33,
        expectedBytes: 173_700_000,
        lastError: 'The page closed before the download completed.',
        modelId: 'smollm2-135m-q4',
        schemaVersion: 1,
        sourceModelId: 'onnx-community/SmolLM2-135M-ONNX',
        sourceRevision: 'd0ae6834f1df45e0e95b5fdae95e536f9ca7cd3f',
        status: 'failed',
        totalFiles: 6,
        updatedAt: '2026-06-22T04:01:00.000Z',
      },
    ]);

    render(<DownloadCenter />);

    expect(await screen.findByRole('heading', { name: 'SmolLM2 135M' })).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Attempt 2', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('onnx/model_q4.onnx_data')).toBeInTheDocument();
    expect(screen.getByText('31%', { exact: false })).toBeInTheDocument();
    install.mockResolvedValue({});
    fireEvent.click(screen.getByRole('button', { name: 'Retry download' }));
    await waitFor(() => expect(install).toHaveBeenCalledOnce());
    expect(terminate).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Remove cached files');
    removeModel.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Remove model files' }));
    await waitFor(() => expect(removeModel).toHaveBeenCalledOnce());
  });

  it('offers the model catalog when no download records exist', async () => {
    listModels.mockResolvedValue([]);
    render(<DownloadCenter />);

    expect(await screen.findByText('No model downloads yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse models' })).toHaveAttribute('href', '#/models');
  });
});
