import type { ModelManifest } from '../models/catalog/types';
import type { DeviceDiagnostic, DeviceTierRecommendation } from './types';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const TIER_ORDER = {
  basic: 0,
  standard: 1,
  performance: 2,
} as const;

export function recommendDeviceTier(
  diagnostic: DeviceDiagnostic | null,
): DeviceTierRecommendation | null {
  if (!diagnostic) {
    return null;
  }
  if (!diagnostic.runtime.webGpu || !diagnostic.webGpu.limits) {
    return {
      reason: diagnostic.webGpu.error ?? 'WebGPU initialization did not succeed.',
      tier: 'unsupported',
    };
  }

  const { maxBufferSize, maxStorageBufferBindingSize } = diagnostic.webGpu.limits;
  const freeStorage =
    diagnostic.storage.quotaBytes !== null && diagnostic.storage.usageBytes !== null
      ? diagnostic.storage.quotaBytes - diagnostic.storage.usageBytes
      : null;

  if (
    maxBufferSize >= GIB &&
    maxStorageBufferBindingSize >= 512 * MIB &&
    (freeStorage === null || freeStorage >= 4 * GIB)
  ) {
    return {
      reason: 'Large WebGPU buffers and at least 4 GB of browser storage are available.',
      tier: 'performance',
    };
  }
  if (
    maxBufferSize >= 512 * MIB &&
    maxStorageBufferBindingSize >= 256 * MIB &&
    (freeStorage === null || freeStorage >= GIB)
  ) {
    return {
      reason: 'WebGPU buffer limits and browser storage meet the Standard threshold.',
      tier: 'standard',
    };
  }
  return {
    reason: 'WebGPU works, but exposed buffer limits call for compact models.',
    tier: 'basic',
  };
}

export type ModelDeviceFit =
  | 'recommended'
  | 'exceeds-tier'
  | 'insufficient-storage'
  | 'unsupported';

export function compareModelWithDevice(
  model: ModelManifest,
  diagnostic: DeviceDiagnostic | null,
  recommendation: DeviceTierRecommendation | null,
): ModelDeviceFit | null {
  if (!diagnostic || !recommendation) {
    return null;
  }
  if (recommendation.tier === 'unsupported') {
    return 'unsupported';
  }

  if (diagnostic.storage.quotaBytes !== null && diagnostic.storage.usageBytes !== null) {
    const freeStorage = diagnostic.storage.quotaBytes - diagnostic.storage.usageBytes;
    const expectedBytes = model.artifacts.reduce(
      (total, artifact) => total + artifact.sizeBytes,
      0,
    );
    if (freeStorage < expectedBytes * 1.25) {
      return 'insufficient-storage';
    }
  }

  return TIER_ORDER[model.requirements.deviceTier] <= TIER_ORDER[recommendation.tier]
    ? 'recommended'
    : 'exceeds-tier';
}
