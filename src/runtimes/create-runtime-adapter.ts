import type { ModelManifest } from '../models/catalog/types';
import type { ModelRuntimeAdapter } from './core/types';
import { RuntimeError } from './core/errors';
import { TransformersTextWorkerAdapter } from './transformers/text-worker-adapter';
import { TransformersVisionWorkerAdapter } from './transformers/vision-worker-adapter';
import {
  discoverTransformersRuntimeDevice,
  type TransformersRuntimeDevice,
} from './transformers/runtime-device';

export type RuntimeAdapterHandle = ModelRuntimeAdapter & {
  terminate(): void;
};

export function createRuntimeAdapter(
  manifest: ModelManifest,
  device: TransformersRuntimeDevice = discoverTransformersRuntimeDevice(),
): RuntimeAdapterHandle {
  if (manifest.requirements.task === 'text-generation') {
    return new TransformersTextWorkerAdapter(undefined, device);
  }
  if (manifest.requirements.task === 'image-to-text') {
    return new TransformersVisionWorkerAdapter(undefined, device);
  }

  throw new RuntimeError(
    'UNSUPPORTED_MODEL',
    `No runtime adapter is registered for ${manifest.requirements.task}.`,
  );
}
