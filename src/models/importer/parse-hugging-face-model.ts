const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class HuggingFaceModelInputError extends Error {}

function validateModelId(owner: string, model: string) {
  if (!SEGMENT_PATTERN.test(owner) || !SEGMENT_PATTERN.test(model)) {
    throw new HuggingFaceModelInputError(
      'Use a Hugging Face model identifier in the form owner/model.',
    );
  }

  return `${owner}/${model}`;
}

export function parseHuggingFaceModelInput(input: string): string {
  const normalized = input.trim();
  if (!normalized) {
    throw new HuggingFaceModelInputError('Enter a Hugging Face model URL or owner/model identifier.');
  }

  if (!normalized.includes('://')) {
    const segments = normalized.replace(/^\/+|\/+$/g, '').split('/');
    if (segments.length !== 2) {
      throw new HuggingFaceModelInputError(
        'Use a Hugging Face model identifier in the form owner/model.',
      );
    }
    return validateModelId(segments[0] ?? '', segments[1] ?? '');
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new HuggingFaceModelInputError('The model URL is not valid.');
  }

  if (url.protocol !== 'https:' || url.hostname !== 'huggingface.co') {
    throw new HuggingFaceModelInputError('Only https://huggingface.co model URLs are accepted.');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new HuggingFaceModelInputError('The URL does not identify a Hugging Face model.');
  }

  return validateModelId(segments[0] ?? '', segments[1] ?? '');
}
