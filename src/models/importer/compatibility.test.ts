import { describe, expect, it } from 'vitest';

import { buildCompatibilityReport } from './compatibility';
import type { HuggingFaceModelInfo } from './types';

const baseInfo: HuggingFaceModelInfo = {
  config: {
    architectures: ['LlamaForCausalLM'],
    model_type: 'llama',
  },
  id: 'owner/model',
  pipeline_tag: 'text-generation',
  sha: 'abc123',
  siblings: [
    { rfilename: 'config.json', size: 100 },
    { rfilename: 'tokenizer.json', size: 200 },
  ],
};

describe('buildCompatibilityReport', () => {
  it('marks complete ONNX repositories ready', () => {
    const report = buildCompatibilityReport({
      ...baseInfo,
      siblings: [
        ...(baseInfo.siblings ?? []),
        { rfilename: 'onnx/model_q4.onnx', size: 1_000 },
        { rfilename: 'onnx/model_q4.onnx_data', size: 9_000 },
      ],
    });

    expect(report.outcome).toBe('ready');
    expect(report.files.quantizedOnnx).toBe(1);
    expect(report.pinnedRevision).toBe('abc123');
    expect(report.recommendation?.dtype).toBe('q4');
    expect(report.recommendation?.sizeBytes).toBe(10_000);
  });

  it('marks recognized architectures without ONNX as convertible', () => {
    expect(buildCompatibilityReport(baseInfo).outcome).toBe('conversion-required');
  });

  it('rejects custom code and gated repositories', () => {
    const report = buildCompatibilityReport({
      ...baseInfo,
      config: {
        ...baseInfo.config,
        auto_map: { AutoModel: 'custom.Model' },
      },
      gated: true,
    });

    expect(report.outcome).toBe('unsupported');
    expect(report.reasons).toHaveLength(2);
  });
});
