import type { CompatibilityReport, HuggingFaceModelInfo, HuggingFaceSibling } from './types';
import type { DataType } from '@huggingface/transformers';

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

const SUPPORTED_PIPELINE_TASKS = new Set([
  'automatic-speech-recognition',
  'feature-extraction',
  'image-classification',
  'image-to-text',
  'text-generation',
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

function inferDtype(filename: string): DataType {
  if (/quantized/i.test(filename)) {
    return 'q8';
  }
  const match = filename.match(/(?:^|[_-])(q4f16|q4|q8|bnb4|int8|uint8|fp16)(?:[_.-]|$)/i);
  if (!match?.[1]) {
    return 'fp32';
  }
  return match[1].toLowerCase() as DataType;
}

function chooseRecommendedArtifact(files: HuggingFaceSibling[]) {
  const priority = ['q4', 'q4f16', 'q8', 'quantized', 'int8', 'uint8', 'fp16', 'bnb4'];
  const graphFiles = files.filter((file) => /\.onnx$/i.test(file.rfilename));

  const graph =
    graphFiles
      .map((file) => {
        const lowerName = file.rfilename.toLowerCase();
        const rank = priority.findIndex((precision) => lowerName.includes(precision));
        return {
          file,
          rank: rank === -1 ? priority.length : rank,
        };
      })
      .sort((a, b) => a.rank - b.rank || (a.file.size ?? 0) - (b.file.size ?? 0))[0]?.file ?? null;

  if (!graph) {
    return null;
  }

  const externalData = files.find((file) => file.rfilename === `${graph.rfilename}_data`);

  return {
    dtype: inferDtype(graph.rfilename),
    files: [graph, ...(externalData ? [externalData] : [])],
  };
}

export function buildCompatibilityReport(info: HuggingFaceModelInfo): CompatibilityReport {
  const siblings = info.siblings ?? [];
  const onnxArtifacts = siblings.filter((file) => /\.onnx(?:_data)?$/i.test(file.rfilename));
  const onnxFiles = siblings.filter((file) => /\.onnx$/i.test(file.rfilename));
  const quantizedOnnxFiles = onnxFiles.filter((file) =>
    /(?:q4|q8|quantized|bnb4|int8|uint8|fp16|q4f16)/i.test(file.rfilename),
  );
  const tokenizerFiles = siblings.filter((file) => includesFilename(file, TOKENIZER_FILES));
  const processorFiles = siblings.filter((file) => includesFilename(file, PROCESSOR_FILES));
  const hasConfig = siblings.some((file) => file.rfilename === 'config.json');
  const architecture = info.config?.model_type ?? info.config?.architectures?.[0] ?? null;
  const modelType = info.config?.model_type ?? null;
  const gated = Boolean(info.gated);
  const recommendedArtifact = chooseRecommendedArtifact(onnxArtifacts);
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
  if (info.pipeline_tag && !SUPPORTED_PIPELINE_TASKS.has(info.pipeline_tag)) {
    reasons.push(
      `The ${info.pipeline_tag} task is not supported by Emberbench's initial runtime adapter.`,
    );
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
    recommendation: recommendedArtifact
      ? {
          dtype: recommendedArtifact.dtype,
          files: recommendedArtifact.files.map((file) => file.rfilename),
          sizeBytes: totalSize(recommendedArtifact.files),
        }
      : null,
    reasons,
    sizes: {
      onnxBytes: totalSize(onnxArtifacts),
      quantizedOnnxBytes: totalSize(quantizedOnnxFiles),
      repositoryBytes: totalSize(siblings),
    },
    sourceUrl: `https://huggingface.co/${info.id}`,
  };
}
