import { buildCompatibilityReport } from './compatibility';
import { parseHuggingFaceModelInput } from './parse-hugging-face-model';
import type { CompatibilityReport, HuggingFaceModelInfo } from './types';

export class HuggingFaceInspectionError extends Error {}

export async function inspectHuggingFaceModel(
  input: string,
  signal?: AbortSignal,
): Promise<CompatibilityReport> {
  const modelId = parseHuggingFaceModelInput(input);
  const encodedModelId = modelId.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(
    `https://huggingface.co/api/models/${encodedModelId}?blobs=true`,
    {
      headers: {
        Accept: 'application/json',
      },
      signal,
    },
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new HuggingFaceInspectionError(
        'This model does not exist publicly or requires Hugging Face authorization.',
      );
    }
    throw new HuggingFaceInspectionError(
      `Hugging Face inspection failed with status ${response.status}.`,
    );
  }

  const data = (await response.json()) as Partial<HuggingFaceModelInfo>;
  if (typeof data.id !== 'string') {
    throw new HuggingFaceInspectionError('Hugging Face returned incomplete model metadata.');
  }

  return buildCompatibilityReport(data as HuggingFaceModelInfo);
}
