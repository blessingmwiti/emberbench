import type { TransformersRuntimeDevice } from '../runtimes/transformers/runtime-device';
import type { WorkspaceSession } from '../workspaces/session';
import type { VisionImageMetadata } from './preprocess-image';

export interface VisionSessionSnapshot {
  caption: string;
  durationMs: number | null;
  imageMetadata: VisionImageMetadata | null;
  loadTimeMs: number | null;
  modelId: string;
  runtimeDevice: TransformersRuntimeDevice;
  schemaVersion: 1;
}

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseNullableNumber(value: unknown) {
  return value === null || validNumber(value) ? value : undefined;
}

function parseImageMetadata(value: unknown): VisionImageMetadata | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const metadata = value as Partial<VisionImageMetadata> & { blob?: unknown };
  if (
    'blob' in metadata ||
    !validNumber(metadata.height) ||
    !validNumber(metadata.originalBytes) ||
    !validNumber(metadata.processedBytes) ||
    !validNumber(metadata.width) ||
    typeof metadata.resized !== 'boolean'
  ) {
    return undefined;
  }
  return {
    height: metadata.height,
    originalBytes: metadata.originalBytes,
    processedBytes: metadata.processedBytes,
    resized: metadata.resized,
    width: metadata.width,
  };
}

export function serializeVisionSessionSnapshot(snapshot: VisionSessionSnapshot) {
  return JSON.stringify(snapshot);
}

export function deserializeVisionSessionSnapshot(value: string): VisionSessionSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<VisionSessionSnapshot>;
    const loadTimeMs = parseNullableNumber(parsed.loadTimeMs);
    const durationMs = parseNullableNumber(parsed.durationMs);
    const imageMetadata = parseImageMetadata(parsed.imageMetadata);
    if (
      parsed.schemaVersion !== 1 ||
      typeof parsed.caption !== 'string' ||
      parsed.caption.trim().length === 0 ||
      typeof parsed.modelId !== 'string' ||
      !['webgpu', 'wasm'].includes(parsed.runtimeDevice ?? '') ||
      loadTimeMs === undefined ||
      durationMs === undefined ||
      imageMetadata === undefined
    ) {
      return null;
    }
    return {
      caption: parsed.caption,
      durationMs,
      imageMetadata,
      loadTimeMs,
      modelId: parsed.modelId,
      runtimeDevice: parsed.runtimeDevice as TransformersRuntimeDevice,
      schemaVersion: 1,
    };
  } catch {
    return null;
  }
}

export function latestVisionSnapshot(sessions: WorkspaceSession[]) {
  for (const session of sessions) {
    if (session.workspace !== 'vision') continue;
    const message = [...session.messages].reverse().find((item) => item.role === 'assistant');
    if (!message) continue;
    const snapshot = deserializeVisionSessionSnapshot(message.content);
    if (snapshot) return { session, snapshot };
  }
  return null;
}

export function visionSessionTitle(caption: string) {
  return caption.trim().slice(0, 60) || 'Vision result';
}
