# ADR 0003: Validate runtime caching before owning model storage

- Status: Accepted
- Date: 2026-06-21

## Context

Model files may be several gigabytes. Duplicating them between runtime caches and application-managed storage would waste quota and make offline state unreliable.

## Decision

During feasibility work, first validate Transformers.js and browser cache behavior with real models. Prefer Cache API for request-addressable artifacts and OPFS only where application-managed large files provide a measured benefit. Use IndexedDB for metadata, conversations, and state rather than primary model blobs.

## Consequences

The final storage adapter remains evidence-driven. The application must expose verification and repair instead of assuming that a cached request is permanently available.
