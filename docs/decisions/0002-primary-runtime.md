# ADR 0002: Use Transformers.js as the primary runtime

- Status: Accepted
- Date: 2026-06-21

## Context

The MVP must cover text, vision, and later audio or embeddings through one browser-compatible runtime while using WebGPU where practical.

## Decision

Use Transformers.js backed by ONNX Runtime Web as the primary runtime. Hide it behind a common adapter contract. Evaluate WebLLM later for models where measurements justify a second runtime.

## Consequences

The MVP has one principal integration path across several modalities. Model support remains constrained by browser-ready artifacts and runtime operator support.
