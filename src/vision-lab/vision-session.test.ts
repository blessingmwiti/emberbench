import { describe, expect, it } from 'vitest';

import {
  deserializeVisionSessionSnapshot,
  latestVisionSnapshot,
  serializeVisionSessionSnapshot,
  visionSessionTitle,
  type VisionSessionSnapshot,
} from './vision-session';

const snapshot: VisionSessionSnapshot = {
  caption: 'a small illustrated house',
  durationMs: 1534,
  imageMetadata: {
    height: 420,
    originalBytes: 20_000,
    processedBytes: 12_600,
    resized: false,
    width: 640,
  },
  loadTimeMs: 2450,
  modelId: 'vit-gpt2-captioning-q8',
  runtimeDevice: 'webgpu',
  schemaVersion: 1,
};

describe('Vision session metadata snapshots', () => {
  it('round-trips caption metadata without storing image blobs', () => {
    const serialized = serializeVisionSessionSnapshot(snapshot);
    expect(serialized).not.toContain('blob');
    expect(deserializeVisionSessionSnapshot(serialized)).toEqual(snapshot);
  });

  it('rejects snapshots that contain blob-like image data', () => {
    expect(
      deserializeVisionSessionSnapshot(
        JSON.stringify({
          ...snapshot,
          imageMetadata: { ...snapshot.imageMetadata, blob: {} },
        }),
      ),
    ).toBeNull();
  });

  it('finds the newest valid Vision snapshot from workspace sessions', () => {
    expect(
      latestVisionSnapshot([
        {
          createdAt: '2026-06-24T00:00:00.000Z',
          id: 'assistant-session',
          messages: [],
          modelId: null,
          schemaVersion: 1,
          title: 'Assistant',
          updatedAt: '2026-06-24T00:00:00.000Z',
          workspace: 'assistant',
        },
        {
          createdAt: '2026-06-24T00:01:00.000Z',
          id: 'vision-session',
          messages: [
            {
              content: serializeVisionSessionSnapshot(snapshot),
              createdAt: '2026-06-24T00:01:00.000Z',
              id: 'message',
              role: 'assistant',
            },
          ],
          modelId: snapshot.modelId,
          schemaVersion: 1,
          title: 'Vision',
          updatedAt: '2026-06-24T00:01:00.000Z',
          workspace: 'vision',
        },
      ])?.snapshot,
    ).toEqual(snapshot);
  });

  it('creates short safe titles from captions', () => {
    expect(visionSessionTitle('  a concise caption  ')).toBe('a concise caption');
    expect(visionSessionTitle('')).toBe('Vision result');
  });
});
