# ADR 0004: Chromium-first measured browser support

- Status: Accepted
- Date: 2026-06-21

## Context

WebGPU and ONNX operator support vary by browser, operating system, and GPU. Claiming universal support would undermine Emberbench's honest-compatibility principle.

## Decision

Target current Chrome and Edge first. Test Safari and Firefox during feasibility and publish measured support rather than inferred support. Unsupported configurations receive diagnostics and clear guidance.

## Consequences

The first release can become reliable sooner, while its architecture remains standards-based. Browser support expands only when end-to-end model workflows pass.
