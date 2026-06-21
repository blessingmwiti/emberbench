# ADR 0007: Isolate inference engines behind a common runtime contract

- Status: Accepted
- Date: 2026-06-21

## Context

Emberbench currently proves text and vision through Transformers.js workers. Workspaces must not depend on that engine's pipeline classes, progress shapes, or raw errors if WebLLM or another browser runtime is added later.

## Decision

Every runtime adapter implements inspect, download, load, run, abort, and unload. Runtime inputs and events use structured-clone-safe domain types. Sessions have explicit ownership and state, and raw engine failures map to stable Emberbench error codes.

One adapter owns one active model session. Workspaces consume the contract rather than importing an inference library directly.

## Consequences

Runtime implementations require translation code, but model lifecycle, errors, cancellation, and progress become consistent across workspaces. Adding another inference engine should not require rewriting workspace components.
