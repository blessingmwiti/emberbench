# ADR 0005: No content telemetry

- Status: Accepted
- Date: 2026-06-21

## Context

Local privacy is a core product claim. Prompt, file, image, code, conversation, and generated content telemetry would contradict that claim.

## Decision

Do not transmit user content or generated content by default. Initial development contains no product analytics. Future operational or benchmark reporting must be explicit opt-in, content-free, documented, and separately reviewable.

## Consequences

Product decisions cannot depend on invasive analytics. Diagnostics must be reproducible locally and exports must be user-controlled and redacted.
