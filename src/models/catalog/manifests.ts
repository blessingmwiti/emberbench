import { validateModelManifest } from './validate-manifest';

export const curatedModels = [
  validateModelManifest({
    artifacts: [
      {
        path: 'onnx/model_q4.onnx',
        precision: 'q4',
        role: 'model',
        sizeBytes: 275_214,
      },
      {
        path: 'onnx/model_q4.onnx_data',
        precision: 'q4',
        role: 'model',
        sizeBytes: 181_839_104,
      },
    ],
    capabilities: ['chat', 'summarization', 'writing'],
    description:
      'A tiny text-generation model for validating private chat, streaming, caching, and offline behavior.',
    id: 'smollm2-135m-q4',
    license: {
      id: 'apache-2.0',
      sourceUrl: 'https://huggingface.co/HuggingFaceTB/SmolLM2-135M',
    },
    name: 'SmolLM2 135M',
    requirements: {
      deviceTier: 'basic',
      runtime: 'transformers-js',
      task: 'text-generation',
    },
    schemaVersion: 1,
    source: {
      baseModelId: 'HuggingFaceTB/SmolLM2-135M',
      modelId: 'onnx-community/SmolLM2-135M-ONNX',
      provider: 'huggingface',
      revision: 'd0ae6834f1df45e0e95b5fdae95e536f9ca7cd3f',
    },
    status: 'experimental',
    workspaces: ['assistant'],
  }),
  validateModelManifest({
    artifacts: [
      {
        path: 'onnx/encoder_model_quantized.onnx',
        precision: 'q8',
        role: 'model',
        sizeBytes: 87_453_213,
      },
      {
        path: 'onnx/decoder_model_merged_quantized.onnx',
        precision: 'q8',
        role: 'model',
        sizeBytes: 158_599_996,
      },
    ],
    capabilities: ['image-captioning'],
    description:
      'A compact vision encoder-decoder used to prove local image preprocessing and caption generation.',
    id: 'vit-gpt2-captioning-q8',
    license: {
      id: 'apache-2.0',
      sourceUrl: 'https://huggingface.co/nlpconnect/vit-gpt2-image-captioning',
    },
    name: 'ViT-GPT2 Captioner',
    requirements: {
      deviceTier: 'standard',
      runtime: 'transformers-js',
      task: 'image-to-text',
    },
    schemaVersion: 1,
    source: {
      baseModelId: 'nlpconnect/vit-gpt2-image-captioning',
      modelId: 'Xenova/vit-gpt2-image-captioning',
      provider: 'huggingface',
      revision: '215b4edcb7ec1fad5905a18a03f7b2007f6fabd0',
    },
    status: 'experimental',
    workspaces: ['vision'],
  }),
];
