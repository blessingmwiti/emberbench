# ADR 0001: Use React, TypeScript, and Vite

- Status: Accepted
- Date: 2026-06-21

## Context

Emberbench needs a mature component model, strong TypeScript support, worker-friendly browser tooling, fast iteration, and a broad testing ecosystem.

## Decision

Use React 19 with strict TypeScript and Vite. Keep model runtimes, storage, diagnostics, and workspace domain logic independent of React.

## Consequences

The team receives a well-supported frontend ecosystem and rapid builds. Runtime isolation remains an architectural responsibility rather than being delegated to the UI framework.
