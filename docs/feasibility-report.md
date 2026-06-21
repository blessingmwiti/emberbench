# Emberbench Feasibility Report

This is a living record of browser, device, model, storage, and offline feasibility testing. Results describe tested configurations only; they are not universal compatibility claims.

## Current status

- Report started: 2026-06-21
- Phase: WebGPU capability probe
- Overall result: WebGPU initialization is feasible in the first tested Chromium environment.
- Text, vision, model-storage, and offline feasibility remain untested.

## Tested configurations

| Date       | Browser environment           | GPU report   | Result                                             |
| ---------- | ----------------------------- | ------------ | -------------------------------------------------- |
| 2026-06-21 | Codex in-app Chromium browser | Intel, Gen 9 | WebGPU adapter and device initialized successfully |

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

- Real text-model download, initialization, streaming, cancellation, and unload behavior
- WebGPU device loss during active inference
- Model cache reuse after a full offline restart
- Multi-gigabyte storage reliability and eviction
- Vision model preprocessing and inference
- Safari and Firefox behavior
- Windows and discrete-GPU behavior
- Hugging Face artifact inspection and CORS behavior

## Next experiment

Integrate Transformers.js in a worker with a very small instruct model, then measure download size, initialization time, first-token latency, throughput, cancellation, and unload behavior.
