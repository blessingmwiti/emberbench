# ADR 0006: Use pnpm with fail-closed dependency policies

- Status: Accepted
- Date: 2026-06-21

## Context

JavaScript packages can execute lifecycle scripts during installation, compromised releases may be installed before maintainers or registries react, and transitive dependencies can introduce sources that were never reviewed directly.

Emberbench also plans to process untrusted model metadata, so its development toolchain should minimize avoidable supply-chain execution.

## Decision

Use pnpm 11 with:

- Exact dependency versions and a committed lockfile
- A strict 2-day minimum package release age
- Failure when package publish-time metadata is unavailable
- Trust-policy downgrade checks for recent packages
- Lockfile supply-chain verification enabled
- Transitive exotic dependency sources blocked
- Dependency build scripts denied unless explicitly reviewed in `allowBuilds`
- Frozen-lockfile installs in CI

`esbuild` is currently the only approved dependency build because Vite requires its platform binary. Node-only Transformers.js dependencies are denied build execution because Emberbench runs inference in the browser.

## Consequences

Fresh releases cannot be adopted immediately, and some legitimate dependency updates will require explicit review or narrowly pinned exceptions. Installation failures are treated as a useful security boundary rather than silently bypassed.

pnpm reduces risk but does not establish that package contents are safe. Lockfile review, vulnerability audits, dependency minimization, and browser isolation remain necessary.
