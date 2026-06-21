# Emberbench Feasibility Report

This is a living record of browser, device, model, storage, and offline feasibility testing. Results describe tested configurations only; they are not universal compatibility claims.

## Current status

- Report started: 2026-06-21
- Phase: WebGPU capability and text-generation probe
- Overall result: WebGPU initialization and worker-based text generation are feasible in the first tested Chromium environment.
- Vision and fully offline feasibility remain untested.

## Tested configurations

| Date       | Browser environment           | GPU report   | Result                                                      |
| ---------- | ----------------------------- | ------------ | ----------------------------------------------------------- |
| 2026-06-21 | Codex in-app Chromium browser | Intel, Gen 9 | WebGPU adapter and device initialized successfully          |
| 2026-06-21 | Codex in-app Chromium browser | Intel, Gen 9 | SmolLM2 loaded, streamed, cancelled, unloaded, and reloaded |

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
- Model cache reuse after a full offline restart
- Multi-gigabyte storage reliability and eviction
- Vision model preprocessing and inference
- Safari and Firefox behavior
- Windows and discrete-GPU behavior
- Hugging Face artifact inspection and CORS behavior

## Next experiment

Test model cache reuse with the network disabled, then begin the first compact vision-model spike.
