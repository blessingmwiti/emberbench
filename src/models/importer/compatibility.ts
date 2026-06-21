import type {
  CompatibilityReport,
  HuggingFaceModelInfo,
  HuggingFaceSibling,
} from './types';

const SUPPORTED_MODEL_TYPES = new Set([
  'gpt2',
  'llama',
  'phi3',
  'qwen2',
  'qwen3',
  'vit',
  'vision-encoder-decoder',
  'whisper',
]);

const TOKENIZER_FILES = [
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.json',
  'vocab.txt',
  'merges.txt',
  'spiece.model',
  'sentencepiece.bpe.model',
];

const PROCESSOR_FILES = [
  'preprocessor_config.json',
  'processor_config.json',
  'feature_extractor_config.json',
];

function includesFilename(file: HuggingFaceSibling, candidates: string[]) {
  const filename = file.rfilename.split('/').at(-1) ?? file.rfilename;
  return candidates.includes(filename);
}

function totalSize(files: HuggingFaceSibling[]) {
  return files.reduce((total, file) => total + (file.size ?? 0), 0);
}

export function buildCompatibilityReport(info: HuggingFaceModelInfo): CompatibilityReport {
  const siblings = info.siblings ?? [];
  const onnxFiles = siblings.filter((file) => /\.onnx(?:_data)?$/i.test(file.rfilename));
  const quantizedOnnxFiles = onnxFiles.filter((file) =>
    /(?:q4|q8|quantized|bnb4|int8|uint8|fp16|q4f16)/i.test(file.rfilename),
  );
  const tokenizerFiles = siblings.filter((file) => includesFilename(file, TOKENIZER_FILES));
  const processorFiles = siblings.filter((file) => includesFilename(file, PROCESSOR_FILES));
  const hasConfig = siblings.some((file) => file.rfilename === 'config.json');
  const architecture =
    info.config?.model_type ?? info.config?.architectures?.[0] ?? null;
  const modelType = info.config?.model_type ?? null;
  const gated = Boolean(info.gated);
  const reasons: string[] = [];
  const details: string[] = [];

  if (info.private) {
    reasons.push('The repository is private and cannot be inspected anonymously.');
  }
  if (gated) {
    reasons.push('The repository is gated and requires Hugging Face authorization.');
  }
  if (info.disabled) {
    reasons.push('The repository is disabled on Hugging Face.');
  }
  if (info.config?.auto_map) {
    reasons.push('The model declares custom runtime code, which Emberbench will not execute.');
  }
  if (!hasConfig) {
    reasons.push('The repository does not contain config.json.');
  }

  let outcome: CompatibilityReport['outcome'];

  if (reasons.length > 0) {
    outcome = 'unsupported';
  } else if (onnxFiles.length > 0) {
    outcome = 'ready';
    details.push(
      `${onnxFiles.length} browser-oriented ONNX artifact${onnxFiles.length === 1 ? '' : 's'} found.`,
    );
    if (quantizedOnnxFiles.length > 0) {
      details.push(
        `${quantizedOnnxFiles.length} reduced-precision ONNX artifact${quantizedOnnxFiles.length === 1 ? '' : 's'} found.`,
      );
    }
    if (tokenizerFiles.length === 0 && processorFiles.length === 0) {
      reasons.push('No tokenizer or processor assets were recognized.');
      outcome = 'unsupported';
    }
  } else if (modelType && SUPPORTED_MODEL_TYPES.has(modelType)) {
    outcome = 'conversion-required';
    reasons.push('The architecture is recognized, but browser-ready ONNX artifacts are missing.');
  } else {
    outcome = 'unsupported';
    reasons.push(
      modelType
        ? `The ${modelType} architecture is not in Emberbench's initial compatibility allowlist.`
        : 'The repository does not declare a recognized model architecture.',
    );
  }

  if (info.library_name === 'transformers.js') {
    details.push('The repository declares Transformers.js as its library.');
  }

  return {
    architecture,
    details,
    files: {
      config: hasConfig,
      onnx: onnxFiles.length,
      processors: processorFiles.length,
      quantizedOnnx: quantizedOnnxFiles.length,
      tokenizers: tokenizerFiles.length,
    },
    gated,
    library: info.library_name ?? null,
    modelId: info.id,
    outcome,
    pipelineTag: info.pipeline_tag ?? null,
    pinnedRevision: info.sha ?? null,
    reasons,
    sizes: {
      onnxBytes: totalSize(onnxFiles),
      quantizedOnnxBytes: totalSize(quantizedOnnxFiles),
      repositoryBytes: totalSize(siblings),
    },
    sourceUrl: `https://huggingface.co/${info.id}`,
  };
}
