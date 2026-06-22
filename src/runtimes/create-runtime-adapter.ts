import type { ModelManifest } from '../models/catalog/types';
import type { ModelRuntimeAdapter } from './core/types';
import { RuntimeError } from './core/errors';
import { TransformersTextWorkerAdapter } from './transformers/text-worker-adapter';
import { TransformersVisionWorkerAdapter } from './transformers/vision-worker-adapter';

export type RuntimeAdapterHandle = ModelRuntimeAdapter & {
  terminate(): void;
};

export function createRuntimeAdapter(manifest: ModelManifest): RuntimeAdapterHandle {
  if (manifest.requirements.task === 'text-generation') {
    return new TransformersTextWorkerAdapter();
  }
  if (manifest.requirements.task === 'image-to-text') {
    return new TransformersVisionWorkerAdapter();
  }

  throw new RuntimeError(
    'UNSUPPORTED_MODEL',
    `No runtime adapter is registered for ${manifest.requirements.task}.`,
  );
}
