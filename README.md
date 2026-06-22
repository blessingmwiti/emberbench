# Emberbench

> A private, install-free AI workbench that runs text, vision, audio, and multimodal models directly in the browser with WebGPU.

Emberbench is a local-first web application for discovering, downloading, running, and managing useful AI models without requiring a Python environment, Docker, a native inference server, or a cloud account.

Open the application, choose a compatible model, download it once, and use it on-device—even when offline.

The project is intended for much more than chat. Emberbench provides reusable workspaces for software development, cybersecurity, writing, research, document analysis, image understanding, speech transcription, and other technical or creative workflows.

> **Project status:** active browser prototype. The application now includes curated model
> installation, persistent offline downloads, WebGPU with WebAssembly fallback, local benchmark
> history, and a locally persisted General Assistant workspace with safe Markdown and code-block
> rendering. Model coverage, browser support, and memory estimates remain subject to device
> testing.

## Why Emberbench?

Local AI is powerful, but getting from “I found a model” to “I am using it” still commonly involves installing runtimes, choosing model formats, understanding quantization, configuring GPU backends, starting servers, and connecting a user interface.

Emberbench moves that experience into a web application:

- No native runtime installation
- No terminal required
- No local inference server to configure
- No prompts or documents sent to a cloud service
- No recurring per-token charges
- One-time model downloads with offline reuse
- Guided Hugging Face compatibility checks
- One interface for text, images, audio, embeddings, and multimodal models
- Clear hardware, storage, and performance information before a download

Emberbench does not aim to replace every native inference tool. Native runtimes remain the right choice for very large models, maximum performance, advanced server deployments, fine-tuning, and extensive automation. Emberbench instead targets the broad space between cloud AI and specialist local-AI tooling: private on-device AI that is immediately approachable and useful.

## Product principles

### Local by default

Inference, conversations, uploaded files, embeddings, and workspace data remain on the user's device unless the user explicitly enables an external integration.

### Honest compatibility

Emberbench must never imply that every Hugging Face repository can run in a browser. A model importer explains what is supported, what may be convertible, and why a model cannot run.

### Capability before model branding

Most users want to “review this code” or “describe this image,” not choose between opaque architecture names. The primary experience is organized around tasks and capabilities. Model details remain available for advanced users.

### Useful offline

Offline support is a core product behavior, not a decorative PWA badge. Once the application shell and a model are stored, supported workflows should continue without a network connection.

### Progressive complexity

A new user can start with a recommended model and sensible defaults. An experienced user can inspect precision, execution provider, context length, generation parameters, memory use, and runtime logs.

### Measurable behavior

Model cards should expose real device measurements such as load time, first-token latency, generation speed, peak memory observations, and task-specific quality notes.

## Who is it for?

- Developers who want a private coding assistant without running a local server
- Security professionals analyzing sensitive logs, scripts, or reports on-device
- Writers and researchers working with unpublished or confidential material
- Students and educators who need reusable AI without API costs
- Organizations that cannot send data to external model providers
- Users with unreliable or expensive internet connectivity
- Web developers experimenting with browser-native AI
- Non-specialists who find current local inference setup intimidating

## Core experiences

### 1. Model library

A curated collection of tested models grouped by capability:

- General conversation and writing
- Coding and technical reasoning
- Image understanding and OCR
- Speech recognition
- Embeddings and semantic search
- Multimodal conversation
- Image generation in a later release

Each model card shows:

- Supported tasks
- Download size
- Approximate runtime memory requirement
- Available quantizations
- Expected browser and device class
- Context length
- License
- Source repository and revision
- Offline readiness
- Community and device-specific benchmark results

### 2. Workspaces

Workspaces adapt the interface, system instructions, tools, and inputs to a task. Initial workspace ideas include:

- **General Assistant** — conversation, summarization, planning, and writing
- **Code Lab** — explain, generate, refactor, and review source code
- **Security Desk** — inspect logs, scripts, indicators, configurations, and reports
- **Vision Desk** — caption images, perform OCR, answer visual questions, and locate objects
- **Document Room** — search and discuss local documents using on-device embeddings
- **Transcription Studio** — transcribe and summarize audio locally
- **Writer's Room** — draft, rewrite, critique, and transform text

Workspaces are recipes, not separate models. A compatible model may serve multiple workspaces, while specialized models can be recommended where they provide a meaningful advantage.

### 3. Hugging Face model import

Users can paste either:

```text
https://huggingface.co/owner/model-name
```

or:

```text
owner/model-name
```

Emberbench then:

1. Normalizes and validates the repository identifier.
2. Confirms that the repository exists and is accessible.
3. Reads model metadata, configuration, task, architecture, and license.
4. Inspects available weights, tokenizers, processors, and ONNX files.
5. Checks the architecture against installed runtime adapters.
6. Detects unsupported custom code, operators, or missing browser artifacts.
7. Lists available precisions and estimates download and memory requirements.
8. Checks browser capabilities and available storage.
9. Runs a lightweight load or initialization probe where practical.
10. Produces a compatibility report before the user downloads the model.

The report has three principal outcomes:

#### Ready to run

The repository contains compatible artifacts and all required model assets.

#### Conversion required

The underlying architecture is supported, but browser-ready ONNX or quantized artifacts are unavailable. A future companion conversion service or documented local conversion workflow may generate them.

#### Unsupported

The architecture, operators, custom code, size, license, authentication requirement, or model files prevent safe browser execution. Emberbench explains the reason and suggests compatible alternatives when possible.

Compatibility is never determined from the repository URL alone.

## Initial model lineup

The exact models will be selected after browser and device benchmarking. The following represents the desired launch coverage:

| Role | Candidate family | Primary uses |
| --- | --- | --- |
| General assistant | SmolLM or compact Qwen instruct model | Chat, writing, summarization |
| Coding assistant | Qwen2.5-Coder 1.5B or similar | Code generation, explanation, review |
| Vision model | Florence-2 or a compact vision-language model | OCR, captioning, visual analysis |
| Speech model | Whisper Tiny/Base | Local transcription |
| Embedding model | GTE, BGE, or compact Qwen embedding model | Document retrieval and semantic search |

Candidate selection criteria:

- Runs reliably through a browser-compatible runtime
- Has a useful quantized variant
- Fits realistic consumer hardware
- Has a suitable redistributable or downloadable license
- Provides meaningful quality for its task
- Has complete tokenizer, processor, and configuration assets
- Can be pinned to a known revision for reproducibility

Five models should be **available**, but they should not all remain loaded in GPU memory. Emberbench will normally keep one large generative model active, unload inactive models, and share or retain smaller components only when memory permits.

## Supported model formats and runtimes

### Primary runtime: Transformers.js

[Transformers.js](https://huggingface.co/docs/transformers.js/) provides browser pipelines for text, vision, audio, embeddings, and multimodal tasks using ONNX Runtime.

### Inference foundation: ONNX Runtime Web

[ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) provides WebGPU and WebAssembly execution paths. WebGPU is preferred, with WebAssembly fallback only for models and tasks where it remains practical.

### Optional optimized LLM adapter: WebLLM

[WebLLM](https://webllm.mlc.ai/) may be added for supported conversational models where its compilation and runtime path provides a better experience.

### Unified runtime contract

Application features should not call a runtime directly. Every runtime adapter implements a common interface resembling:

```ts
interface ModelRuntime {
  inspect(model: ModelSource): Promise<CompatibilityReport>;
  download(model: ResolvedModel, options?: DownloadOptions): Promise<void>;
  load(model: InstalledModel, options?: LoadOptions): Promise<ModelSession>;
  run(input: ModelInput, options?: RunOptions): AsyncIterable<ModelEvent>;
  abort(): Promise<void>;
  unload(): Promise<void>;
}
```

This layer allows Emberbench to add or replace inference engines without rewriting every workspace.

## Offline architecture

Offline mode requires more than caching the HTML page.

### Application shell

A service worker caches versioned JavaScript, CSS, fonts, icons, routing assets, and essential metadata. The application can launch and display installed models while disconnected.

### Model storage

Model binaries should use the most reliable storage strategy supported by the selected runtime and browser:

- Cache API for request-addressable model assets
- Origin Private File System (OPFS) for large, managed binary files where supported
- IndexedDB for metadata and as a compatibility fallback

The implementation should avoid duplicating the same model weights across storage layers.

### Persistent storage

Emberbench requests persistent browser storage through `navigator.storage.persist()` when available and explains that browser storage may otherwise be evicted under device pressure.

### Local application data

IndexedDB stores:

- Installed-model registry
- Download state and integrity metadata
- Conversations and workspace sessions
- User settings
- Prompt recipes
- Document indexes and embedding references
- Device benchmark results

### Offline status

The interface distinguishes:

- **Available offline** — application and all required model files are stored and verified
- **Partially available** — some optional or required assets are missing
- **Online only** — model has not been installed
- **Update available** — a newer application or model revision exists

### Integrity and revisions

Models are pinned to a repository revision. Downloaded files are checked against known sizes and available hashes or ETags. An update does not silently replace a working offline model.

## Proposed architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                        Emberbench UI                        │
│  Library · Workspaces · Sessions · Downloads · Diagnostics │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  Capability and Task Layer                 │
│ Chat · Code · Vision · Audio · Embeddings · Multimodal     │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Model Runtime Manager                   │
│ Registry · Compatibility · Scheduling · Memory · Events    │
└───────────────┬───────────────────────┬─────────────────────┘
                │                       │
┌───────────────▼────────────┐  ┌───────▼─────────────────────┐
│ Transformers.js / ONNX Web│  │ Optional WebLLM Adapter    │
│ WebGPU + WASM fallback    │  │ Optimized text generation │
└───────────────┬────────────┘  └───────┬─────────────────────┘
                │                       │
┌───────────────▼───────────────────────▼─────────────────────┐
│ Web Workers · WebGPU · Cache API · OPFS · IndexedDB · PWA │
└─────────────────────────────────────────────────────────────┘
```

### Main components

- **Hardware diagnostics** — WebGPU availability, adapter information, storage estimate, browser support, and safe capability tiers
- **Model registry** — curated and user-imported model metadata
- **Compatibility engine** — repository inspection and runtime support rules
- **Download manager** — progress, retries, cancellation, resumption where supported, and integrity checks
- **Runtime manager** — model loading, unloading, execution, cancellation, and memory policy
- **Worker pool** — keeps model initialization and inference away from the main UI thread
- **Workspace engine** — task-specific interfaces and reusable recipes
- **Local data layer** — sessions, settings, documents, and installed-model state
- **Benchmark harness** — load time, first-token latency, throughput, and task tests
- **Service worker** — application shell and offline lifecycle

## Hardware and browser diagnostics

Before recommending a model, Emberbench evaluates:

- WebGPU availability
- Browser and platform support
- Reported GPU adapter characteristics where exposed
- Shader or operator features required by the runtime
- Available browser storage
- Model download size
- Estimated memory needs
- Known device-specific failures

Browsers do not consistently expose exact usable GPU memory, so estimates must be labeled as estimates. The safest approach combines static model requirements, runtime probes, conservative device tiers, and observed benchmark history.

Suggested device tiers:

- **Basic** — embeddings, Whisper Tiny, compact text models
- **Standard** — quantized 1B–3B text models and compact vision models
- **Performance** — larger context windows, larger quantized models, and heavier multimodal tasks
- **Unsupported or fallback** — no WebGPU; limited tasks may run through WebAssembly

## Model lifecycle

```text
Discover → Inspect → Compare → Download → Verify → Load → Run → Unload
                                      ↘ Available offline
```

The runtime manager should:

- Prevent concurrent loads likely to exhaust memory
- Use least-recently-used unloading for inactive sessions
- Support generation cancellation
- Recover cleanly from WebGPU device loss
- Keep downloads independent from model loading
- Surface actionable errors instead of raw runtime traces
- Allow a model to be deleted without deleting conversations
- Let users verify or repair an incomplete installation

## User experience

### First launch

1. Check browser and WebGPU support.
2. Explain that inference remains on-device.
3. Assign a conservative device tier.
4. Recommend one small starter model.
5. Show download size and expected capabilities.
6. Let the user enter a workspace as soon as the model is ready.

### Model library

Users can filter by:

- Task
- Installed status
- Offline readiness
- Download size
- Device compatibility
- Runtime
- Quantization
- License

### Running a task

The interface should show:

- Active model
- Whether processing is local
- Model loading and generation state
- Stop control
- Input-specific controls
- Optional advanced generation settings
- Performance details behind a disclosure panel

### Errors

Errors should answer three questions:

1. What happened?
2. What can the user do now?
3. Is their data or downloaded model still intact?

For example:

> This model exceeded the memory available to this browser tab. Your download is intact. Close other GPU-heavy tabs, reduce the context size, or use the recommended Q4 variant.

## Domain-specific behavior

### Coding

- Syntax-aware code input and output
- Project snippets or selected files rather than unrestricted filesystem access
- Configurable review recipes
- Diff-oriented answers
- Language and framework context

### Cybersecurity

- Log and structured-event input
- Detection-rule explanation
- Configuration review
- Suspicious-script analysis
- Clear warnings that model output is not authoritative
- Defensive use as the default product framing

Emberbench is an analysis assistant, not a security boundary. It must not claim that local execution makes generated guidance safe or correct.

### Writing

- Rewrite, critique, summarize, expand, and change tone
- Local document history
- Side-by-side revisions
- User-defined style recipes

### Documents and RAG

- Local parsing and chunking where browser support permits
- On-device embedding generation
- IndexedDB or OPFS-backed vector storage
- Retrieval citations pointing to local filenames and passages
- Explicit index deletion and rebuilding

### Vision and audio

- Image paste, upload, camera input where permitted
- OCR, captioning, detection, and visual question answering
- Audio upload or microphone capture
- Local transcription and optional local summarization

## Privacy and security model

Emberbench's privacy promise must be technically inspectable:

- No prompt or uploaded file telemetry
- No analytics containing generated content
- No remote inference hidden behind a “local” interface
- Explicit consent before accessing camera, microphone, or local files
- Network activity visible through an in-app privacy/status panel
- Content Security Policy restricting unexpected network destinations
- Sanitization of rendered model output
- Model repositories treated as untrusted input
- No execution of arbitrary repository JavaScript or Python
- Gated/private model credentials kept out of logs and persistent storage unless explicitly supported securely
- Clear deletion controls for models, chats, documents, indexes, and all local data

If optional cloud features are added, they must be visibly separated from local execution.

## Performance strategy

- Prefer tested quantized models for first-run recommendations
- Stream generated tokens and incremental task output
- Perform inference in workers
- Warm up models after loading
- Compile or cache runtime artifacts where supported
- Avoid unnecessary model copies between the main thread and workers
- Use transferable objects and shared memory only where browser isolation requirements are satisfied
- Limit context and image resolution based on device tier
- Record local benchmark results without uploading private content

Performance metrics:

- Download size and duration
- Model initialization time
- Warm and cold load time
- Time to first token
- Tokens per second
- Transcription real-time factor
- Embeddings per second
- Vision task latency
- Cancellation latency
- Failure and recovery behavior

## Accessibility and internationalization

- Full keyboard navigation
- Screen-reader labels and live generation announcements
- Reduced-motion support
- High-contrast themes
- Responsive layouts
- UI localization independent from model language support
- Explicit display of each model's supported languages

## MVP scope

### Included

- Progressive web application shell
- Browser and WebGPU diagnostics
- Curated model library
- One general text model
- One coding model
- One vision or speech model
- Download, verify, load, unload, and delete lifecycle
- Streaming text generation with cancellation
- Hugging Face public-repository compatibility inspection
- Conversations stored locally
- Offline launch and inference for installed models
- Storage management
- Basic benchmark page
- General, coding, and one media-oriented workspace

### Deliberately deferred

- Running arbitrary Hugging Face models
- Automatic in-browser conversion of PyTorch models
- Large image-generation models
- Fine-tuning or training
- Multi-user accounts and synchronization
- Native filesystem-wide agents
- Background model inference while the app is closed
- Guaranteed support across all mobile devices
- Loading several large generative models simultaneously
- Cloud fallback enabled by default

## Roadmap

### Phase 0 — Feasibility benchmark

- Test candidate runtimes across Chrome/Edge, Safari, and Firefox support levels
- Benchmark candidate models on representative integrated and discrete GPUs
- Validate browser storage behavior for multi-gigabyte assets
- Test offline startup, upgrades, eviction, and interrupted downloads
- Publish the first compatibility matrix

### Phase 1 — Core MVP

- Build diagnostics and model registry
- Implement model download and storage
- Implement Transformers.js runtime adapter
- Add chat and coding workspaces
- Add one image or audio pipeline
- Add local session persistence
- Ship reliable offline mode

### Phase 2 — Open model import

- Add Hugging Face repository inspection
- Build architecture and artifact compatibility rules
- Add import reports and alternative recommendations
- Support model revision pinning and updates
- Add gated-model authentication only after secure design review

### Phase 3 — Workbench expansion

- Local document RAG
- More multimodal workflows
- Shareable workspace recipes
- Model and device benchmarks
- Optional WebLLM adapter
- Installation and storage repair tools

### Phase 4 — Ecosystem

- Community compatibility reports
- Signed or reviewed workspace packs
- Optional desktop packaging for broader filesystem and hardware access
- Documented conversion pipeline
- Organization policies and managed model catalogs

## Success metrics

- Time from opening Emberbench to first useful output
- Percentage of supported users completing setup without documentation
- Model download completion and recovery rate
- Percentage of installed models that remain usable offline
- Compatibility-report accuracy
- Crash and out-of-memory rate by model/device tier
- Weekly use across more than one workspace
- User understanding of whether inference is local
- User retention without requiring an account

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| WebGPU support differs by browser and device | Diagnostics, tested compatibility matrix, conservative recommendations |
| Large model downloads are interrupted or evicted | Resumable design, verification, persistent-storage request, repair flow |
| Models exceed usable memory | Quantized defaults, device tiers, context limits, proactive unloading |
| “Any Hugging Face model” creates false expectations | Three-state compatibility report and explicit artifact inspection |
| Browser runtime is slower than native tools | Focus on convenience, privacy, task UX, and models sized for the browser |
| Model quality is inadequate for specialized work | Workspace-specific evaluation and transparent model recommendations |
| Repository metadata or files are malicious | Never execute repository code; allowlisted formats and strict parsing |
| Offline mode breaks after an app update | Versioned shell, atomic updates, pinned model revisions, offline tests |
| Browser storage is misunderstood as permanent | Explain storage behavior and expose backup/delete/repair controls |

## Competitive position

### Compared with llama.cpp

[llama.cpp](https://github.com/ggml-org/llama.cpp) is an excellent low-level native inference engine with broad hardware optimization, GGUF support, a server, and extensive expert controls. It is better suited to users who need maximum native performance, scripting, server deployment, or detailed runtime configuration.

Emberbench provides:

- No compilation or native installation
- Capability-oriented interfaces beyond text chat
- Guided browser compatibility and storage management
- A PWA experience that can be shared with a URL
- Built-in multimodal workspaces
- A curated, constrained path designed for non-specialists

### Compared with Ollama

[Ollama](https://ollama.com/) makes native model execution substantially easier and offers a strong local API. It remains an installation plus background-service model and is especially useful as infrastructure for other applications.

Emberbench provides:

- Open-and-run browser onboarding
- No daemon, ports, API endpoint, or native package
- No separate frontend/backend pairing
- Offline browser application behavior after installation
- Model compatibility explained before downloading
- Task-specific interfaces included in the product

### Compared with Open WebUI

[Open WebUI](https://github.com/open-webui/open-webui) is a feature-rich interface that typically connects to Ollama or another inference provider. It offers broader server, account, knowledge, and provider features than Emberbench initially will.

Emberbench provides:

- Inference inside the browser rather than a UI connected to a separate model server
- A zero-server deployment model
- Per-device model downloads and execution
- A smaller privacy surface for single-user local workflows
- First-class non-chat inputs and capability-specific workspaces

### The defensible difference

“No installation” is a useful hook, but not a sufficient product moat. Emberbench wins if it combines:

1. **Immediate access** — open a URL and start without understanding inference infrastructure.
2. **Private local processing** — prompts and files remain on-device.
3. **Multimodal task design** — coding, security, documents, images, and audio are first-class workflows rather than chat attachments.
4. **Compatibility intelligence** — users learn whether a model will actually run before spending time and bandwidth.
5. **Portable distribution** — a teacher, team, or product can share a link to a prepared workspace.
6. **Reliable offline behavior** — downloaded models remain genuinely useful without internet access.
7. **Safe constraints** — tested models and clear limits reduce the trial-and-error common in local AI.

The strongest positioning is:

> **Emberbench is the fastest path from a web link to private, on-device AI—not a replacement for native inference infrastructure.**

## Technical direction

Likely starting stack:

- TypeScript
- React or another component-based frontend
- Vite
- Transformers.js
- ONNX Runtime Web
- Web Workers
- IndexedDB
- Cache API and/or OPFS
- Service worker and web app manifest
- Playwright for browser and offline end-to-end tests
- Vitest for unit tests

The final framework choice matters less than keeping runtime, storage, compatibility, and workspace layers independent.

## Suggested repository layout

```text
src/
  app/                 Application shell and routes
  components/          Shared UI components
  diagnostics/         Browser, GPU, and storage inspection
  models/
    catalog/           Curated model manifests
    compatibility/     Hugging Face and runtime compatibility rules
    downloads/         Download and integrity management
    registry/          Installed and available model state
  runtimes/
    core/              Common runtime contracts
    transformers/      Transformers.js adapter
    webllm/            Optional WebLLM adapter
  storage/             IndexedDB, Cache API, and OPFS abstractions
  workers/             Inference and model-management workers
  workspaces/
    assistant/
    code/
    security/
    vision/
    documents/
    transcription/
  benchmark/           Device and model benchmark harness
  privacy/             Network policy and local-data controls
public/
  manifest.webmanifest
  icons/
tests/
  unit/
  integration/
  browser/
```

## Testing strategy

### Unit tests

- URL and repository identifier parsing
- Compatibility rules
- Model manifest validation
- Storage accounting
- Download state transitions
- Workspace recipe behavior

### Integration tests

- Runtime adapter lifecycle
- Worker communication
- Interrupted and repaired downloads
- Model revision upgrades
- IndexedDB migrations
- Service worker updates

### Browser tests

- First launch with and without WebGPU
- Download and run a small test model
- Reload while offline
- Run inference offline
- Cancel generation
- Recover from worker and device errors
- Delete a model and verify reclaimed storage
- Verify no unexpected network requests during local inference

### Device matrix

Testing should include:

- Integrated Intel/AMD graphics
- Apple Silicon
- Entry-level and mainstream discrete GPUs
- Systems with constrained memory
- Current Chromium-based browsers
- Safari and Firefox as their WebGPU/runtime support permits
- Mobile browsers as an experimental tier until proven reliable

## Contributing

Contribution guidance will be added once the initial runtime proof of concept and model manifest format are established. Early contributions will be most valuable in:

- Browser/device compatibility testing
- Model conversion and quantization research
- Runtime adapters
- Accessibility
- Offline storage reliability
- Task-specific evaluation sets
- Documentation and localization

## License

Emberbench is licensed under the [Apache License 2.0](LICENSE).

Model licenses are independent of the Emberbench application license and must be displayed and respected individually.

## Name

**Emberbench** is a working product name: “ember” suggests useful computation kept alive locally, while “bench” describes a place where different tools and models are brought together to do real work.

---

Emberbench begins with a simple promise:

> Open it. Install a model once. Keep your work on your device. Use it wherever you need it.
