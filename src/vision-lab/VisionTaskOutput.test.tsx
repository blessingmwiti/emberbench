import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VisionTaskOutput } from './VisionTaskOutput';

const emptyCache = { cached: false, files: [] };

describe('VisionTaskOutput', () => {
  it('renders the waiting structured output state', () => {
    render(
      <VisionTaskOutput
        cacheInspected={false}
        cacheStatus={emptyCache}
        caption=""
        durationMs={null}
        imageMetadata={null}
        installStatus="Not recorded"
        loadTimeMs={null}
        runtimeDevice="webgpu"
        storageMessage={null}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Caption' })).toBeInTheDocument();
    expect(screen.getByText('Waiting for analysis')).toBeInTheDocument();
    expect(screen.getByText('The generated image caption will appear here.')).toBeInTheDocument();
    expect(screen.getByText('No image prepared')).toBeInTheDocument();
  });

  it('renders generated caption details without storing the image', () => {
    render(
      <VisionTaskOutput
        cacheInspected
        cacheStatus={{
          cached: true,
          files: [
            { cached: true, file: 'model.onnx' },
            { cached: false, file: 'tokenizer.json' },
          ],
        }}
        caption="a small illustrated house"
        durationMs={1534}
        imageMetadata={{
          height: 420,
          originalBytes: 500_000,
          processedBytes: 12_600,
          resized: false,
          width: 640,
        }}
        installStatus="installed"
        loadTimeMs={2450}
        runtimeDevice="wasm"
        storageMessage="Storage is local."
      />,
    );

    expect(screen.getByText('Generated locally')).toBeInTheDocument();
    expect(screen.getByText('a small illustrated house')).toBeInTheDocument();
    expect(screen.getByText('1.53 s')).toBeInTheDocument();
    expect(screen.getByText('WebAssembly worker')).toBeInTheDocument();
    expect(screen.getByText('640×420 PNG · 12.3 KB')).toBeInTheDocument();
    expect(screen.getByText('1/2 files')).toBeInTheDocument();
    expect(screen.getByText('Storage is local.')).toBeInTheDocument();
  });
});
