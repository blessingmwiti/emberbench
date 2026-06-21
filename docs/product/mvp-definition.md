# Emberbench MVP Definition

## Primary user

The primary MVP user is a technically curious developer or technical knowledge worker who wants private local AI but does not want to install, configure, or maintain a native inference server.

They use a modern laptop or desktop, understand that local models have device limits, and value privacy and immediate access more than maximum possible inference performance.

## Launch workspaces

1. **General Assistant** for private conversation, summarization, planning, and writing.
2. **Code Lab** for code explanation, generation, refactoring, debugging, and review.
3. **Vision Desk** for image captioning, OCR, and visual questions.

Vision Desk is the third workspace because it proves that Emberbench is a multimodal workbench rather than another chat wrapper.

## Exact MVP boundary

The MVP will:

- Diagnose browser, WebGPU, and storage readiness.
- Present a curated model catalog.
- Install, verify, load, unload, repair, and delete supported models.
- Stream output from an on-device text model.
- Run General Assistant, Code Lab, and Vision Desk.
- Persist conversations and settings locally.
- Launch and run an installed model offline.
- Inspect public Hugging Face model repositories and return an honest compatibility result.
- Provide clear privacy, licensing, storage, and deletion controls.

The MVP will not:

- Run arbitrary Hugging Face models.
- Convert PyTorch weights in the browser.
- Support image generation.
- Fine-tune models.
- Synchronize data between users or devices.
- Require accounts or cloud inference.
- Promise support for all browsers or mobile devices.

## Representative user stories

1. As a first-time user, I can open Emberbench, see whether my browser is supported, install a recommended model, and receive useful output without reading setup documentation.
2. As a developer, I can paste code into Code Lab, ask for an explanation or review, stop generation, and keep the session on my device.
3. As a visual knowledge worker, I can upload an image to Vision Desk and perform captioning or OCR without sending it to a server.
4. As a privacy-conscious user, I can disconnect from the internet, reopen Emberbench, and use an already installed model and prior conversations.
5. As an advanced user, I can paste a public Hugging Face URL and learn whether the model is ready, requires conversion, or is unsupported before downloading it.

## MVP success criteria

- A supported first-time user reaches useful model output in under ten minutes, excluding unavoidable model download time.
- At least 80% of moderated first-run tests complete without external setup documentation.
- Installed-model verification accurately prevents incomplete models from being labeled offline-ready.
- Core offline end-to-end tests pass for every release.
- No prompt, image, code sample, or generated response is transmitted by default.
- Compatibility reports explain every unsupported result with at least one actionable reason.
- General Assistant, Code Lab, and Vision Desk complete their primary task on the published supported-device matrix.
