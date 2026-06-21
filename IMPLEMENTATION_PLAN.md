# Emberbench Implementation Plan

This is the chronological source of truth for building Emberbench from an empty repository into a production-ready, browser-native AI workbench.

The plan is intentionally ordered. Later phases may be researched early, but implementation should not skip a milestone's exit criteria unless the decision is recorded in this file.

## How to use this plan

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed and verified
- `[-]` Deliberately skipped, with a short explanation
- Mark an item complete only after its acceptance condition is satisfied.
- Add newly discovered work to the appropriate phase rather than keeping a separate hidden list.
- Record material architectural decisions in an ADR under `docs/decisions/`.
- Keep this plan aligned with the product direction in [README.md](README.md).

## Definition of done

A task is complete when:

- Its implementation is present in the repository.
- Relevant automated tests pass.
- User-facing behavior has been checked in a real browser where applicable.
- Errors and empty/loading states are handled.
- Accessibility and privacy implications have been considered.
- Documentation is updated if behavior, setup, or architecture changed.

A milestone is complete only when all of its exit criteria are satisfied.

---

## Phase 0 — Product foundation

### Product definition

- [x] Choose the working product name: Emberbench.
- [x] Write the product vision and architecture README.
- [x] Add the Apache License 2.0.
- [x] Define the primary value proposition: the fastest path from a web link to private, on-device AI.
- [x] Establish local-first, honest compatibility, useful offline behavior, and progressive complexity as product principles.
- [x] Define the primary MVP user persona.
- [x] Select the three launch workspaces: General Assistant, Code Lab, and Vision Desk.
- [x] Define the exact MVP boundary and move non-MVP requests to later phases.
- [x] Write five representative end-to-end user stories.
- [x] Define measurable MVP success criteria.

### Decision records

- [x] Create `docs/decisions/`.
- [x] Add an ADR template.
- [x] Record the frontend framework decision.
- [x] Record the primary runtime decision.
- [x] Record the model-storage strategy.
- [x] Record the browser support policy.
- [x] Record the privacy and telemetry policy.

### Project governance

- [ ] Add `CONTRIBUTING.md`.
- [ ] Add a code of conduct.
- [ ] Add a security policy and private vulnerability-reporting instructions.
- [ ] Add issue and pull-request templates.
- [ ] Define versioning and release conventions.
- [ ] Define how third-party model licenses will be reviewed and displayed.

### Exit criteria

- [x] The target MVP user and three launch workspaces are unambiguous.
- [x] The MVP can be described as a finite list of user-visible capabilities.
- [x] Foundational technical decisions are documented.

---

## Phase 1 — Technical feasibility spikes

The goal of this phase is to eliminate the largest technical risks before investing in the full interface.

### Browser and WebGPU probe

- [x] Create a minimal static WebGPU capability page.
- [x] Detect whether `navigator.gpu` is available.
- [x] Request a GPU adapter and device safely.
- [x] Display useful adapter information without depending on unavailable or privacy-restricted fields.
- [x] Detect WebGPU initialization failures.
- [ ] Detect WebGPU device loss and report it clearly.
- [ ] Test the probe in current Chrome and Edge.
- [ ] Test the probe in current Safari.
- [ ] Test the probe in current Firefox and document limitations.
- [ ] Record the initial browser support matrix.

### Text-generation spike

- [x] Install Transformers.js and ONNX Runtime Web in an isolated prototype.
- [x] Select one very small browser-compatible text model.
- [x] Load the model with WebGPU.
- [x] Run a basic text-generation prompt.
- [x] Stream generated tokens to the page.
- [x] Cancel generation while it is running.
- [x] Unload the model and release references.
- [x] Move inference into a Web Worker.
- [x] Measure model download size.
- [x] Measure cold load time.
- [x] Measure warm load time.
- [x] Measure time to first token.
- [x] Measure tokens per second.
- [ ] Record memory-related failure behavior.

### Non-text spike

- [x] Choose image understanding for the third MVP workspace.
- [x] Select one small compatible model for that task.
- [x] Load and run it through WebGPU.
- [x] Verify input preprocessing works entirely in-browser.
- [x] Verify output is useful enough for an MVP workflow.
- [x] Record download, load, and inference measurements.

### Storage and offline spike

- [x] Inspect how the selected runtime caches model assets.
- [ ] Test a model download followed by an offline reload.
- [x] Confirm cached inference works while blocking all Hugging Face requests.
- [ ] Compare Cache API, IndexedDB, and OPFS for the required model files.
- [ ] Verify whether large files are duplicated between runtime and application storage.
- [x] Test `navigator.storage.estimate()`.
- [x] Test `navigator.storage.persist()`.
- [ ] Simulate an interrupted model download.
- [ ] Determine whether downloads can resume or must restart.
- [ ] Test model deletion and verify that storage is reclaimed.
- [ ] Document eviction risks and browser-specific behavior.

### Hugging Face inspection spike

- [x] Parse `owner/model` identifiers.
- [x] Parse standard Hugging Face model URLs.
- [x] Reject malformed and non-Hugging Face URLs safely.
- [x] Fetch public repository metadata.
- [x] Inspect repository siblings/files.
- [x] Read configuration metadata without executing repository code.
- [x] Identify ONNX and quantized artifacts.
- [x] Identify required tokenizer and processor assets.
- [x] Detect repositories that require authentication.
- [x] Produce a rough `ready`, `conversion-required`, or `unsupported` result.

### Feasibility report

- [x] Create `docs/feasibility-report.md`.
- [~] Record tested devices, browsers, models, and measurements.
- [ ] Identify blockers and proposed mitigations.
- [ ] Choose the initial text model.
- [ ] Choose the initial coding model.
- [ ] Choose the initial image or speech model.
- [ ] Confirm or revise the MVP scope based on evidence.

### Exit criteria

- [x] Text generation runs and streams from a worker on WebGPU.
- [x] One non-text model completes a useful task.
- [ ] At least one model can be reused while fully offline.
- [ ] The selected storage strategy has been validated with real model files.
- [ ] Basic Hugging Face repository inspection works.
- [ ] No unresolved feasibility blocker prevents the MVP.

---

## Phase 2 — Repository and application foundation

### Project scaffolding

- [x] Scaffold the TypeScript application.
- [x] Configure the selected frontend framework and Vite.
- [x] Set the required Node.js version.
- [x] Add package-manager metadata and lockfile.
- [x] Add `.gitignore`.
- [x] Add `.editorconfig`.
- [x] Configure strict TypeScript settings.
- [ ] Configure path aliases.
- [x] Configure formatting.
- [x] Configure linting.
- [ ] Add environment-variable typing and validation.
- [ ] Prevent secrets from being bundled into the client.

### Test infrastructure

- [x] Configure unit tests.
- [x] Configure component tests.
- [ ] Configure Playwright browser tests.
- [ ] Add separate WebGPU-capable browser-test configuration.
- [ ] Add deterministic test fixtures for model metadata.
- [ ] Add a tiny test model or mocked runtime for routine CI.
- [ ] Add code-coverage reporting with practical thresholds.

### Continuous integration

- [ ] Add CI for type checking.
- [ ] Add CI for linting.
- [ ] Add CI for unit and component tests.
- [ ] Add CI for production builds.
- [ ] Add CI for non-WebGPU browser tests.
- [ ] Document how WebGPU integration tests are run outside standard CI.
- [ ] Add dependency update automation.
- [ ] Add dependency vulnerability scanning.

### Application shell

- [x] Create the global layout.
- [ ] Add routing.
- [~] Add navigation for Home, Workspaces, Models, Downloads, and Settings.
- [x] Add a global error boundary.
- [ ] Add toast or notification infrastructure.
- [ ] Add loading, empty, warning, and fatal-error patterns.
- [x] Add responsive desktop and mobile layouts.
- [ ] Add light, dark, and system theme support.
- [ ] Add an accessible icon system.
- [x] Add a privacy/local-processing indicator.

### Design system

- [ ] Define color, typography, spacing, radius, and elevation tokens.
- [ ] Build button, input, select, dialog, tooltip, badge, card, and progress components.
- [ ] Build an accessible model-card component.
- [ ] Build a reusable status panel.
- [ ] Build skeleton and progress states for long model operations.
- [x] Check keyboard navigation.
- [x] Check visible focus behavior.
- [ ] Check contrast in all themes.
- [x] Add reduced-motion behavior.

### Exit criteria

- [x] A production build succeeds from a clean checkout.
- [ ] CI validates type, lint, test, and build tasks.
- [ ] The application shell is responsive and keyboard-accessible.
- [ ] No model-runtime logic is coupled directly to page components.

---

## Phase 3 — Core domain architecture

### Shared model types

- [x] Define `ModelSource`.
- [x] Define `ModelManifest`.
- [x] Define `ModelArtifact`.
- [x] Define `ModelCapability`.
- [x] Define `ModelPrecision`.
- [x] Define `RuntimeRequirement`.
- [x] Define `CompatibilityReport`.
- [x] Define `InstalledModel`.
- [x] Define `ModelSession`.
- [x] Define serializable model input and output event types.
- [x] Version model manifest schemas from the beginning.

### Runtime contract

- [x] Define the common runtime adapter interface.
- [x] Define inspect, download, load, run, abort, and unload behavior.
- [x] Define streaming event semantics.
- [x] Define progress event semantics.
- [x] Define runtime error codes.
- [x] Define cancellation semantics.
- [x] Define session and resource ownership.
- [ ] Define runtime capability discovery.
- [x] Add initial runtime contract tests.

### Curated model registry

- [x] Define a validated manifest file format.
- [x] Add schema validation for manifests.
- [x] Add source repository and pinned revision fields.
- [x] Add model license fields.
- [x] Add task and workspace compatibility fields.
- [x] Add artifact size and precision fields to compatibility reports.
- [x] Add minimum/recommended device-tier fields.
- [x] Add model status: experimental, supported, or recommended.
- [x] Add the first tiny development model.
- [x] Build catalog filtering and lookup APIs.

### State management

- [ ] Separate ephemeral UI state from persisted domain state.
- [ ] Implement model-registry state.
- [ ] Implement runtime-session state.
- [ ] Implement download state.
- [ ] Implement settings state.
- [ ] Implement conversation/workspace-session state.
- [ ] Ensure worker messages are serializable and versioned.

### Exit criteria

- [x] Model manifest domain schemas are validated at runtime.
- [ ] Runtime adapters can be swapped without changing workspace components.
- [x] A curated model can be resolved entirely from its manifest.
- [ ] Core architecture has automated contract tests.

---

## Phase 4 — Device diagnostics and compatibility tiers

### Capability detection

- [ ] Detect WebGPU availability.
- [ ] Detect WebAssembly fallback availability.
- [ ] Capture browser and platform details conservatively.
- [ ] Request adapter/device only when required.
- [ ] Detect known runtime-required WebGPU features.
- [ ] Detect available storage and storage quota.
- [ ] Detect persistent-storage status.
- [ ] Detect online/offline state.
- [ ] Avoid claiming exact available VRAM when the browser cannot expose it.

### Device tiers

- [ ] Define Basic, Standard, and Performance device tiers.
- [ ] Define an Unsupported/Fallback state.
- [ ] Map static model requirements to tiers.
- [x] Add a lightweight opt-in runtime initialization probe.
- [ ] Combine probe results with conservative model estimates.
- [ ] Explain why a device received its tier.
- [ ] Allow advanced users to override recommendations with a warning.

### Diagnostics interface

- [ ] Build the diagnostics page.
- [ ] Show WebGPU status.
- [ ] Show storage availability and persistence.
- [ ] Show supported runtime paths.
- [ ] Show device tier.
- [ ] Show browser-specific guidance.
- [ ] Add copyable diagnostic details with no private content.
- [ ] Add a re-run diagnostics action.

### Exit criteria

- [ ] Unsupported users receive clear next steps instead of a broken model load.
- [ ] Every curated model can be compared with the current device.
- [ ] Storage and memory statements are clearly labeled as measured or estimated.

---

## Phase 5 — Storage and download manager

### Persistence layer

- [x] Define the IndexedDB database and stores.
- [x] Add schema migrations.
- [x] Store model installation metadata.
- [ ] Store application settings.
- [ ] Store conversations and workspace sessions.
- [ ] Store benchmark summaries.
- [x] Implement transactional writes where state must remain consistent.
- [x] Handle corrupted or incompatible persisted data.
- [ ] Add a full local-data reset flow.

### Model artifact storage

- [ ] Implement the chosen model-file storage adapter.
- [ ] Prevent duplicate storage of identical artifacts.
- [ ] Namespace files by model and pinned revision.
- [ ] Track expected file sizes.
- [ ] Track available hashes, ETags, or revision metadata.
- [ ] Verify all required artifacts before marking a model installed.
- [ ] Implement deletion.
- [ ] Implement installation verification.
- [ ] Implement installation repair.

### Download manager

- [ ] Implement queued downloads.
- [ ] Implement per-file and overall progress.
- [ ] Implement cancellation.
- [ ] Implement retry with bounded backoff.
- [ ] Implement resume where technically supported.
- [ ] Preserve understandable state after page reload.
- [ ] Check available storage before starting.
- [ ] Warn about metered or very large downloads where detectable.
- [ ] Handle offline transitions during download.
- [ ] Handle server and CORS failures.
- [ ] Prevent two downloads from writing the same model simultaneously.

### Storage interface

- [ ] Build the Downloads page.
- [ ] Build the Installed Models page.
- [ ] Show used and estimated available storage.
- [ ] Show incomplete installations.
- [ ] Add retry, cancel, repair, and delete actions.
- [ ] Confirm destructive deletion.
- [ ] Explain browser eviction and persistent storage.
- [x] Request persistent storage at an appropriate user-driven moment.

### Exit criteria

- [ ] A model can be downloaded, verified, listed, repaired, and deleted.
- [ ] Interrupted operations recover to a consistent state.
- [ ] Storage estimates and insufficient-space errors are actionable.
- [ ] No model is labeled offline-ready before all required assets are verified.

---

## Phase 6 — Transformers.js runtime

### Worker protocol

- [x] Define messages from the UI to an inference worker.
- [~] Define progress, token, result, warning, and error events.
- [x] Add request identifiers.
- [x] Add cancellation messages.
- [x] Handle worker startup failure.
- [x] Handle worker crashes.
- [x] Handle stale events from cancelled or replaced requests.
- [ ] Add worker-protocol tests.

### Runtime adapter

- [ ] Implement Transformers.js runtime discovery.
- [x] Implement model initialization.
- [x] Select WebGPU when supported.
- [ ] Implement practical WebAssembly fallback rules.
- [ ] Configure local/cached model resolution.
- [x] Stream text-generation events.
- [x] Support non-streaming task results.
- [x] Implement cancellation.
- [x] Implement unload and cleanup.
- [ ] Handle WebGPU device loss.
- [ ] Map raw errors to Emberbench error codes.
- [ ] Add runtime contract tests.

### Runtime manager

- [ ] Track the active model and session.
- [ ] Prevent unsafe concurrent model loads.
- [ ] Queue or reject conflicting operations clearly.
- [ ] Unload inactive large models.
- [ ] Add model warm-up where beneficial.
- [ ] Apply device-tier context and input limits.
- [ ] Expose runtime status to the interface.
- [ ] Recover after an out-of-memory or device-loss failure.

### Exit criteria

- [x] A curated text model loads and runs entirely in a worker.
- [x] Output streams without freezing the interface.
- [x] Generation can be cancelled reliably.
- [x] The model can be unloaded and loaded again.
- [ ] Errors are mapped to actionable user-facing messages.

---

## Phase 7 — Core MVP user experience

### First-run experience

- [ ] Explain local inference and model downloads.
- [ ] Run device diagnostics.
- [ ] Recommend an appropriate starter model.
- [ ] Show download size and capability before installation.
- [ ] Let the user skip onboarding.
- [ ] Remember completed onboarding locally.
- [ ] Provide a clear path back to diagnostics and model selection.

### Model library

- [ ] Display curated model cards.
- [ ] Filter by capability.
- [ ] Filter by installed status.
- [ ] Filter by device compatibility.
- [ ] Show precision and artifact size.
- [ ] Show source, pinned revision, and license.
- [ ] Show supported workspaces.
- [x] Show installed/offline status.
- [ ] Add install, load, unload, and delete actions.
- [ ] Add model detail pages.

### General Assistant workspace

- [ ] Build conversation layout.
- [ ] Create and rename conversations.
- [ ] Compose and submit prompts.
- [ ] Render streaming output.
- [ ] Stop generation.
- [ ] Regenerate a response.
- [ ] Copy message content.
- [ ] Edit and resubmit a prior user message.
- [ ] Render Markdown safely.
- [ ] Render code blocks safely.
- [ ] Persist conversations locally.
- [ ] Delete individual conversations.
- [ ] Expose generation settings behind an advanced panel.
- [ ] Display the active model and local-processing status.

### Code Lab workspace

- [ ] Add syntax-aware code input.
- [ ] Add language selection and automatic hints.
- [ ] Add Explain, Generate, Refactor, Debug, and Review modes.
- [ ] Define mode-specific prompt recipes.
- [ ] Render code and diffs legibly.
- [ ] Copy generated code.
- [ ] Preserve code sessions locally.
- [ ] Add input-size and context warnings.
- [ ] Clearly state that output must be reviewed before execution.

### Third MVP workspace

- [ ] Build the selected Vision Desk or Transcription Studio interface.
- [ ] Validate accepted input formats and size limits.
- [ ] Perform preprocessing locally.
- [ ] Display progress during inference.
- [ ] Render structured task output.
- [ ] Persist session metadata without duplicating large user files unnecessarily.
- [ ] Provide clear deletion controls.

### Exit criteria

- [ ] A new user can reach useful output without reading setup documentation.
- [ ] General Assistant and Code Lab work end to end.
- [ ] The third workspace completes its primary task.
- [ ] Sessions survive a page reload.
- [ ] All model processing is visibly identified as local.

---

## Phase 8 — PWA and reliable offline mode

### Application shell

- [x] Add a web app manifest.
- [x] Add installable application icons.
- [x] Add service-worker generation and registration.
- [x] Cache versioned application-shell assets.
- [x] Add an offline fallback route.
- [x] Ensure updates are atomic.
- [x] Notify users when an application update is ready.
- [x] Avoid activating an update in the middle of inference.

### Offline model behavior

- [x] Detect whether every required model asset is stored for the text feasibility model.
- [ ] Add `available offline`, `partial`, and `online only` states.
- [x] Prevent silent network fallback during declared offline inference.
- [x] Launch the application after its origin server becomes unavailable.
- [x] Load an installed model while its origin and Hugging Face are unavailable.
- [ ] Run each MVP workspace while offline.
- [ ] Load persisted conversations while offline.
- [ ] Verify that model deletion updates offline status.

### Offline tests

- [ ] Add an end-to-end test for first online visit.
- [ ] Add an end-to-end test for model installation.
- [ ] Add an end-to-end test for offline reload.
- [ ] Add an end-to-end test for offline inference.
- [ ] Test application update behavior offline and after reconnect.
- [ ] Test incomplete model installation offline.
- [ ] Test storage eviction or missing-file recovery where reproducible.

### Exit criteria

- [~] The installed PWA launches without a network connection.
- [x] At least one model completes inference fully offline.
- [x] Offline status never claims readiness for incomplete assets in the text feasibility model.
- [ ] Application updates do not silently break installed models.

---

## Phase 9 — Hugging Face model importer

### Input parsing and repository inspection

- [x] Accept `owner/model` identifiers.
- [x] Accept canonical Hugging Face model URLs.
- [x] Handle URLs containing revisions or file paths intentionally.
- [x] Normalize equivalent inputs.
- [x] Validate owner and repository-name syntax.
- [x] Fetch public model metadata.
- [x] Inspect repository files and pin the reported revision.
- [x] Parse model configuration defensively.
- [x] Parse tokenizer and processor metadata defensively.
- [x] Never execute arbitrary repository code.

### Compatibility rules

- [x] Create an initial allowlist of supported architectures.
- [x] Map the initial architecture and tasks to the Transformers.js runtime adapter.
- [x] Map model tasks to initial Emberbench capabilities.
- [x] Check for required ONNX graphs.
- [x] Check for tokenizer files.
- [x] Check for processor and preprocessing files.
- [x] Detect available quantizations and dtypes.
- [x] Detect unsupported custom code requirements.
- [ ] Detect unsupported operators or known runtime limitations.
- [x] Detect gated or private repositories.
- [x] Detect incomplete repositories.
- [ ] Calculate total required download size.
- [ ] Estimate device-tier and memory suitability.
- [x] Pin the inspected repository revision.

### Compatibility report

- [x] Implement `Ready to run`.
- [x] Implement `Conversion required`.
- [x] Implement `Unsupported`.
- [x] Include specific reasons and evidence.
- [x] Distinguish errors from genuine incompatibility.
- [x] Display recommended artifacts.
- [x] Display compatible precision choices.
- [ ] Display storage and device warnings.
- [ ] Suggest curated alternatives when possible.
- [ ] Link to source metadata and model license.

### Safe import

- [ ] Convert a successful report into a user-model manifest.
- [ ] Require confirmation before download.
- [ ] Download only allowlisted artifact types.
- [ ] Verify the pinned revision during download.
- [ ] Store imported models separately from curated manifests.
- [ ] Allow imported model metadata to be refreshed.
- [ ] Require revalidation before changing revisions.
- [ ] Clearly label imported models as community/untested.
- [ ] Add a report-export function for debugging.

### Authentication

- [ ] Write a threat model for gated/private repository tokens.
- [ ] Decide whether gated-model support belongs in the web application.
- [ ] If approved, implement session-only authentication first.
- [ ] Never log or include tokens in error reports.
- [ ] Add explicit token removal.
- [ ] Test sign-out and storage cleanup.

### Exit criteria

- [x] Public Hugging Face URLs produce deterministic metadata compatibility reports.
- [x] Unsupported repositories explain why they cannot run at the metadata layer.
- [ ] Compatible repositories can be installed and run from pinned artifacts.
- [ ] Repository content is always treated as untrusted data.

---

## Phase 10 — Model lineup and evaluation

### Evaluation framework

- [ ] Define task-specific quality tests for each workspace.
- [ ] Define standardized prompts and inputs.
- [ ] Define acceptable latency and failure thresholds.
- [ ] Record device, browser, runtime, model revision, and precision.
- [ ] Separate objective measurements from subjective quality notes.
- [ ] Add reproducible benchmark scripts.
- [ ] Add a benchmark-results schema.

### General assistant model

- [ ] Compare at least three compact instruct-model candidates.
- [ ] Evaluate basic instruction following.
- [ ] Evaluate summarization.
- [ ] Evaluate writing and rewriting.
- [ ] Evaluate supported languages.
- [ ] Measure speed and stability across device tiers.
- [ ] Review license compatibility.
- [ ] Select and pin the launch model.

### Coding model

- [ ] Compare at least two compact coding-model candidates.
- [ ] Evaluate explanation.
- [ ] Evaluate generation.
- [ ] Evaluate debugging.
- [ ] Evaluate refactoring.
- [ ] Evaluate security-review usefulness.
- [ ] Measure speed and context limits.
- [ ] Review license compatibility.
- [ ] Select and pin the launch model.

### Vision or speech model

- [ ] Compare viable compact candidates.
- [ ] Evaluate the chosen workspace's core task.
- [ ] Evaluate malformed and oversized inputs.
- [ ] Measure preprocessing and inference latency.
- [ ] Review language and media-format support.
- [ ] Review license compatibility.
- [ ] Select and pin the launch model.

### Additional curated models

- [ ] Add an embedding model.
- [ ] Add the remaining vision or speech model.
- [ ] Reach five useful curated models.
- [ ] Add model-specific known limitations.
- [ ] Add recommended settings per device tier.
- [ ] Add upgrade and replacement policy.

### Exit criteria

- [ ] Every curated model has a pinned revision and reviewed license.
- [ ] Every curated model has measured browser/device evidence.
- [ ] Recommendations are based on task quality and reliability, not popularity alone.
- [ ] The catalog contains five complementary models.

---

## Phase 11 — Expanded workbench

### Security Desk

- [ ] Define defensive-security scope and safety boundaries.
- [ ] Add log and structured-event input.
- [ ] Add suspicious-script review.
- [ ] Add configuration review.
- [ ] Add detection-rule explanation.
- [ ] Add defensive prompt recipes.
- [ ] Add prominent non-authoritative-output guidance.
- [ ] Add representative defensive evaluation cases.

### Writer's Room

- [ ] Add rewrite, critique, summarize, expand, and tone modes.
- [ ] Add side-by-side revisions.
- [ ] Add user-defined style instructions.
- [ ] Add reusable writing recipes.
- [ ] Preserve revision history locally.
- [ ] Export selected text or revisions.

### Vision Desk

- [ ] Add image paste and upload.
- [ ] Add image preview and metadata removal options.
- [ ] Add captioning.
- [ ] Add OCR.
- [ ] Add visual question answering.
- [ ] Add detection or grounding if supported reliably.
- [ ] Add camera input with explicit permission.
- [ ] Add image-size optimization and limits.

### Transcription Studio

- [ ] Add audio upload.
- [ ] Add microphone recording with explicit permission.
- [ ] Add local transcription.
- [ ] Add timestamps if supported.
- [ ] Add local summarization through a text model.
- [ ] Export plain text and subtitle formats.
- [ ] Handle long recordings through chunking.

### Document Room and local RAG

- [ ] Define supported document formats for the first release.
- [ ] Parse documents locally.
- [ ] Extract and normalize text.
- [ ] Chunk text with stable source references.
- [ ] Generate embeddings locally.
- [ ] Store embeddings and index metadata locally.
- [ ] Implement semantic retrieval.
- [ ] Add retrieved context to generation safely.
- [ ] Cite local filename and passage references.
- [ ] Detect and warn about prompt injection inside documents.
- [ ] Rebuild stale indexes.
- [ ] Delete documents and derived embeddings completely.

### Workspace recipes

- [ ] Define a versioned workspace-recipe schema.
- [ ] Separate trusted built-in recipes from imported recipes.
- [ ] Allow users to create and edit recipes.
- [ ] Validate imported recipe files.
- [ ] Export recipes without private conversation data.
- [ ] Share recipes through URLs or files without requiring a server.
- [ ] Add recipe migration and compatibility handling.

### Exit criteria

- [ ] All named workspaces have a useful, task-specific interface.
- [ ] Workspaces reuse common model/runtime infrastructure.
- [ ] Local document retrieval includes source citations.
- [ ] Imported recipes cannot execute arbitrary code.

---

## Phase 12 — Benchmarks, observability, and diagnostics

### Local benchmarks

- [ ] Measure download duration.
- [ ] Measure initialization time.
- [ ] Measure cold and warm load time.
- [ ] Measure time to first token.
- [ ] Measure tokens per second.
- [ ] Measure transcription real-time factor.
- [ ] Measure embedding throughput.
- [ ] Measure vision-task latency.
- [ ] Measure cancellation latency.
- [ ] Record failures without recording private user content.

### Benchmark interface

- [ ] Build a device benchmark page.
- [ ] Explain what each metric means.
- [ ] Compare observed performance with model recommendations.
- [ ] Export anonymized benchmark details locally.
- [ ] Let users delete benchmark history.
- [ ] Never upload benchmark data without explicit consent.

### Diagnostics and recovery

- [ ] Add structured local logs with redaction.
- [ ] Add a user-controlled diagnostics export.
- [ ] Add model-installation verification.
- [ ] Add storage repair.
- [ ] Add database migration recovery.
- [ ] Add service-worker reset/recovery.
- [ ] Add runtime reset after device loss.
- [ ] Add a safe “reset Emberbench” workflow.

### Optional community reports

- [ ] Define an explicit opt-in data policy.
- [ ] Design an anonymous report format that excludes prompts and files.
- [ ] Add moderation and trust requirements.
- [ ] Add server-side validation if the feature is approved.
- [ ] Display community data separately from official test results.

### Exit criteria

- [ ] Users can understand and diagnose model performance.
- [ ] Common installation and runtime failures have recovery paths.
- [ ] No diagnostic mechanism captures prompts or document content by default.

---

## Phase 13 — Privacy, security, and safety hardening

### Threat modeling

- [ ] Threat-model model repository imports.
- [ ] Threat-model rendered model output.
- [ ] Threat-model local file, image, audio, camera, and microphone access.
- [ ] Threat-model browser storage and shared-device use.
- [ ] Threat-model service-worker and cache poisoning.
- [ ] Threat-model workspace recipe imports.
- [ ] Threat-model optional Hugging Face authentication.
- [ ] Document trust boundaries.

### Application security

- [ ] Add a restrictive Content Security Policy.
- [ ] Restrict network destinations.
- [ ] Sanitize rendered Markdown and HTML.
- [ ] Prevent script execution from model output.
- [ ] Validate all imported JSON and manifests.
- [ ] Limit accepted repository artifact types.
- [ ] Add file type and size validation.
- [ ] Add dependency integrity and vulnerability checks.
- [ ] Review worker isolation and cross-origin isolation needs.
- [ ] Review denial-of-service risks from oversized inputs.

### Privacy controls

- [ ] Add a network activity/privacy panel.
- [ ] Document exactly what leaves the device.
- [ ] Add separate deletion for conversations, models, documents, indexes, and settings.
- [ ] Add a one-action full local-data deletion flow.
- [ ] Avoid prompt/content analytics.
- [ ] Obtain explicit permission for camera and microphone use.
- [ ] Avoid persisting raw media unless the user requests it.
- [ ] Test shared-device privacy behavior.

### Security verification

- [ ] Add static security analysis.
- [ ] Add dependency scanning.
- [ ] Add malicious manifest and metadata test cases.
- [ ] Add XSS tests for model-generated content.
- [ ] Add prompt-injection tests for Document Room.
- [ ] Perform a manual security review before public beta.
- [ ] Resolve all critical and high-severity findings.

### Exit criteria

- [ ] Trust boundaries and known risks are documented.
- [ ] Arbitrary model repository code is never executed.
- [ ] Generated and imported content cannot inject executable UI code.
- [ ] Users can inspect and erase all locally stored data.

---

## Phase 14 — Accessibility, localization, and product polish

### Accessibility

- [ ] Complete keyboard-only navigation.
- [ ] Add accurate accessible names and descriptions.
- [ ] Add appropriate live regions for generation progress.
- [ ] Avoid overwhelming screen readers with token-by-token announcements.
- [ ] Verify focus management in dialogs and route changes.
- [ ] Verify color contrast.
- [ ] Verify zoom and large-text behavior.
- [ ] Verify reduced-motion behavior.
- [ ] Test with at least one major screen reader.
- [ ] Complete an accessibility audit.

### Localization

- [ ] Extract interface strings.
- [ ] Add locale-aware formatting.
- [ ] Support right-to-left layout in the design system.
- [ ] Distinguish interface language from model language support.
- [ ] Display model language capabilities.
- [ ] Add the first additional interface language.
- [ ] Document translation contribution workflow.

### Product polish

- [ ] Refine onboarding from user testing.
- [ ] Refine model recommendations.
- [ ] Refine long-operation progress feedback.
- [ ] Add helpful empty states.
- [ ] Add keyboard shortcuts where useful.
- [ ] Add import/export for conversations where appropriate.
- [ ] Add release notes inside the application.
- [ ] Complete visual review at common screen sizes.

### Exit criteria

- [ ] Core flows meet the project's accessibility target.
- [ ] UI architecture supports translation cleanly.
- [ ] User testing finds no recurring setup blocker.

---

## Phase 15 — Performance and reliability

### Performance

- [ ] Audit initial JavaScript bundle size.
- [ ] Lazy-load workspace and runtime code.
- [ ] Avoid loading model libraries before needed.
- [ ] Minimize main-thread work.
- [ ] Minimize copies of large typed arrays.
- [ ] Use transferable objects where safe.
- [ ] Warm up models only when beneficial.
- [ ] Tune input limits by device tier.
- [ ] Tune context-length defaults.
- [ ] Profile memory across repeated load/unload cycles.

### Reliability

- [ ] Test repeated model switching.
- [ ] Test repeated cancellation.
- [ ] Test long conversations near context limits.
- [ ] Test storage near quota.
- [ ] Test abrupt tab closure during download.
- [ ] Test abrupt tab closure during database writes.
- [ ] Test offline/online transitions.
- [ ] Test service-worker upgrades.
- [ ] Test corrupted and missing model files.
- [ ] Test WebGPU device loss.
- [ ] Test multi-tab coordination.
- [ ] Add safeguards against duplicate active inference across tabs.

### Browser and device matrix

- [ ] Test supported Chromium browsers on Windows.
- [ ] Test supported Chromium browsers on macOS.
- [ ] Test supported Chromium browsers on Linux.
- [ ] Test Safari on Apple Silicon.
- [ ] Evaluate Firefox support.
- [ ] Test representative integrated GPUs.
- [ ] Test representative discrete GPUs.
- [ ] Test constrained-memory systems.
- [ ] Evaluate mobile support and label it accurately.
- [ ] Publish the supported-browser and device matrix.

### Exit criteria

- [ ] Supported browser/device combinations pass core end-to-end flows.
- [ ] Repeated model operations do not cause unbounded memory growth.
- [ ] Recovery behavior is tested for storage, worker, and GPU failures.
- [ ] Unsupported configurations fail gracefully.

---

## Phase 16 — MVP release

### Release preparation

- [ ] Update README status and screenshots.
- [ ] Complete installation and usage documentation.
- [ ] Complete privacy documentation.
- [ ] Complete model-license notices.
- [ ] Add a changelog.
- [ ] Add production hosting configuration.
- [ ] Configure HTTPS and required security headers.
- [ ] Configure immutable asset caching safely.
- [ ] Configure application version reporting.
- [ ] Create a release checklist.

### Release validation

- [ ] Test from a clean browser profile.
- [ ] Test first-run diagnostics.
- [ ] Test every curated model installation.
- [ ] Test every MVP workspace.
- [ ] Test offline launch and inference.
- [ ] Test model deletion and full-data deletion.
- [ ] Test production security headers.
- [ ] Test that unexpected network calls do not occur during local inference.
- [ ] Run accessibility checks.
- [ ] Run the complete automated test suite.
- [ ] Resolve all release-blocking defects.

### Launch

- [ ] Publish the MVP.
- [ ] Tag the release.
- [ ] Publish release notes.
- [ ] Open public issue reporting.
- [ ] Monitor installation, compatibility, and crash reports without collecting content.
- [ ] Triage feedback against the defined MVP persona and goals.

### MVP exit criteria

- [ ] A supported user can open Emberbench, install a recommended model, and obtain useful output.
- [ ] General Assistant, Code Lab, and the selected third workspace are production-usable.
- [ ] Installed models work offline.
- [ ] Hugging Face public-model inspection produces honest compatibility reports.
- [ ] Privacy, accessibility, licensing, and deletion requirements are met.

---

## Phase 17 — Post-MVP and complete product

### Runtime expansion

- [ ] Evaluate and implement a WebLLM adapter if measurements justify it.
- [ ] Add adapter selection based on model and device.
- [ ] Evaluate WebNN when browser support becomes practical.
- [ ] Evaluate desktop packaging for broader hardware and filesystem access.
- [ ] Keep browser mode fully functional and independent.

### Conversion ecosystem

- [ ] Document a reproducible model conversion process.
- [ ] Create validation tooling for converted artifacts.
- [ ] Create a manifest generator.
- [ ] Add conversion compatibility tests.
- [ ] Decide whether to provide a hosted conversion service.
- [ ] If hosted, design authentication, cost controls, security, and retention policy.
- [ ] Never present conversion as in-browser when it is performed remotely.

### Sharing and ecosystem

- [ ] Add signed or reviewed workspace packs.
- [ ] Add community model compatibility reports.
- [ ] Add community benchmark aggregation.
- [ ] Add trust and moderation systems.
- [ ] Add organization-managed model catalogs.
- [ ] Add organization policy controls.
- [ ] Add optional encrypted sync only if it preserves the privacy promise.

### Advanced workflows

- [ ] Add image generation after a separate feasibility and storage review.
- [ ] Add multimodal chat with compact vision-language models.
- [ ] Add multi-model workflow orchestration with strict memory scheduling.
- [ ] Add local tool integrations with explicit permission boundaries.
- [ ] Add safe project-file workflows for Code Lab.
- [ ] Add exportable reports for technical workspaces.

### Long-term product criteria

- [ ] The five curated models remain maintained and reproducible.
- [ ] Compatibility rules are versioned and tested.
- [ ] Every major workspace has task-specific evaluations.
- [ ] Offline behavior is continuously tested.
- [ ] Model and browser deprecations have migration paths.
- [ ] Community features do not weaken local-first defaults.
- [ ] Emberbench remains useful without an account or cloud service.

---

## Deferred ideas

Ideas belong here until they are accepted into a chronological phase.

- [ ] Optional cloud inference providers
- [ ] Encrypted cross-device conversation synchronization
- [ ] Collaborative shared workspaces
- [ ] Browser extension
- [ ] Native mobile wrapper
- [ ] Local fine-tuning or adapters
- [ ] Plugin system for third-party workspace tools
- [ ] Enterprise deployment policies

## Current next action

- [x] Implement the first Transformers.js adapter against the common contract.
- [x] Migrate Text Model Lab to consume the shared runtime adapter.
- [x] Add persistent installed-model records and lifecycle state.
- [x] Surface installed-model state in the curated model library.
- [ ] Add runtime capability discovery and device-tier recommendations.
