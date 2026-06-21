# Emberbench Feasibility Report

This is a living record of browser, device, model, storage, and offline feasibility testing. Results describe tested configurations only; they are not universal compatibility claims.

## Current status

- Report started: 2026-06-21
- Phase: WebGPU, multimodal, and offline feasibility
- Overall result: WebGPU initialization and worker-based text generation are feasible in the first tested Chromium environment.
- Browser-cached text reuse, basic vision inference, and service-worker-backed offline launch are feasible.

## Tested configurations

| Date       | Browser environment           | GPU report   | Result                                                                     |
| ---------- | ----------------------------- | ------------ | -------------------------------------------------------------------------- |
| 2026-06-21 | Codex in-app Chromium browser | Intel, Gen 9 | WebGPU adapter and device initialized successfully                         |
| 2026-06-21 | Codex in-app Chromium browser | Intel, Gen 9 | SmolLM2 loaded, streamed, cancelled, unloaded, and reloaded                |
| 2026-06-21 | Codex in-app Chromium browser | Intel, Gen 9 | Cached-only SmolLM2 inference completed with Hugging Face requests blocked |
| 2026-06-21 | Codex in-app Chromium browser | Intel, Gen 9 | Quantized ViT-GPT2 captioned a browser-created PNG                         |
| 2026-06-21 | Codex in-app Chromium browser | Intel, Gen 9 | Production shell reloaded and SmolLM2 ran after the origin server stopped  |

## Observed browser signals

- Secure context: yes
- WebGPU API: available
- Adapter: available
- Reported vendor: Intel
- Reported architecture: Gen 9
- Device feature count: 1
- Storage quota reported by browser: 10 GB
- Persistent storage: not granted
- Console errors during diagnostic rerun: none
- Horizontal overflow at a 390 × 844 viewport: none
- Remote page assets after removing hosted fonts: none

These values are observations from one environment, not minimum requirements.

## Text-generation spike

### Configuration

- Runtime: Transformers.js 4.2.0
- Model: `onnx-community/SmolLM2-135M-ONNX`
- Precision: Q4
- Execution: WebGPU inside a dedicated worker
- Generation: deterministic, 64 new tokens

### Measurements

| Measurement                                            | Observed value |
| ------------------------------------------------------ | -------------: |
| Cached browser storage after model installation        |       198.2 MB |
| First download, initialization, and WebGPU compilation |        33.81 s |
| Cached unload/reload                                   |         1.76 s |
| Time to first token                                    |         1.95 s |
| 64-token generation                                    |        11.43 s |
| Approximate throughput including first-token latency   |   5.6 tokens/s |

### Verified behavior

- Model downloading begins only after an explicit user action.
- Progress events reach the main interface.
- The interface remains responsive while the worker loads and runs the model.
- Generated text streams incrementally.
- Generation can be interrupted and returns the model to a ready state.
- The model can be disposed and loaded again.
- Cached loading is substantially faster than first loading.
- No browser warnings or errors were observed during the tested run.

### Cache-only verification

Transformers.js reported that every required SmolLM2 pipeline file was cached. Emberbench then installed a worker-level guard that rejected all requests to `huggingface.co`, loaded the model from browser cache, and completed a 64-token generation.

| Measurement             | Observed value |
| ----------------------- | -------------: |
| Cache-only model reload |         2.63 s |
| Cache-only first token  |         429 ms |
| Cache-only 64-token run |        11.65 s |

This proves that the model no longer needs Hugging Face after caching. The following production restart test verifies the application shell separately.

### Full offline restart verification

The production application registered a versioned service worker that precached all nine shell assets, including the text and vision workers and the ONNX Runtime WebAssembly fallback.

The origin preview server was then stopped completely. Emberbench reloaded successfully from the service worker, loaded SmolLM2 while all Hugging Face requests were blocked, and completed a 64-token WebGPU generation.

| Measurement                     | Observed value |
| ------------------------------- | -------------: |
| Offline production model reload |         2.97 s |
| Offline time to first token     |         437 ms |
| Offline 64-token generation     |        13.53 s |

No browser warnings or errors were observed. `navigator.onLine` remained true because the browser still had general internet connectivity; the stronger test conditions were that the application origin was unavailable and the model worker rejected Hugging Face access.

## Vision spike

### Configuration

- Runtime: Transformers.js 4.2.0
- Model: `Xenova/vit-gpt2-image-captioning`
- Precision: Q8
- Execution: WebGPU inside a dedicated worker
- Input: browser-generated PNG containing a simple house, car, sun, grass, and sky

### Measurements

| Measurement                                | Observed value |
| ------------------------------------------ | -------------: |
| Combined browser storage after both models |       434.8 MB |
| First vision download and initialization   |        52.97 s |
| Cached vision reload                       |         6.87 s |
| Caption generation                         |        13.48 s |

Generated caption:

> a small toy house with a red and blue house

The caption is imperfect but recognizes the primary visual subject. Image preprocessing, worker transfer, WebGPU inference, result handling, and unload behavior are therefore feasible.

## Implemented probe behavior

- Detects missing `navigator.gpu`.
- Requests a high-performance adapter.
- Handles a missing adapter.
- Requests a GPU device.
- Reports privacy-safe adapter fields when available.
- Reports selected WebGPU limits and feature count.
- Detects initialization errors.
- Reports online, secure-context, storage quota, usage, and persistence state.
- Does not claim to know exact usable GPU memory.

## Open feasibility risks

- WebGPU device loss during active inference
- PWA installation behavior outside the in-app Chromium environment
- Multi-gigabyte storage reliability and eviction
- Higher-quality captioning, OCR, and visual-question-answering models
- Safari and Firefox behavior
- Windows and discrete-GPU behavior
- Hugging Face artifact inspection and CORS behavior

## Next experiment

Add persistent-storage controls and inspect browser-cache file completeness in the model manager.
