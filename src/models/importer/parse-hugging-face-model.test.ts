import { describe, expect, it } from 'vitest';

import {
  HuggingFaceModelInputError,
  parseHuggingFaceModelInput,
} from './parse-hugging-face-model';

describe('parseHuggingFaceModelInput', () => {
  it('accepts owner/model identifiers', () => {
    expect(parseHuggingFaceModelInput('onnx-community/SmolLM2-135M-ONNX')).toBe(
      'onnx-community/SmolLM2-135M-ONNX',
    );
  });

  it('normalizes model, revision, and file URLs', () => {
    expect(
      parseHuggingFaceModelInput(
        'https://huggingface.co/onnx-community/SmolLM2-135M-ONNX/tree/main',
      ),
    ).toBe('onnx-community/SmolLM2-135M-ONNX');
    expect(
      parseHuggingFaceModelInput(
        'https://huggingface.co/onnx-community/SmolLM2-135M-ONNX/blob/main/config.json',
      ),
    ).toBe('onnx-community/SmolLM2-135M-ONNX');
  });

  it('rejects other hosts and malformed identifiers', () => {
    expect(() => parseHuggingFaceModelInput('https://example.com/owner/model')).toThrow(
      HuggingFaceModelInputError,
    );
    expect(() => parseHuggingFaceModelInput('owner/model/extra')).toThrow(
      HuggingFaceModelInputError,
    );
    expect(() => parseHuggingFaceModelInput('owner')).toThrow(HuggingFaceModelInputError);
  });
});
