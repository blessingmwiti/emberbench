import { formatBytes } from '../diagnostics/format';
import type { RuntimeCacheStatus } from '../runtimes/core/types';
import type { TransformersRuntimeDevice } from '../runtimes/transformers/runtime-device';
import type { VisionImageMetadata } from './preprocess-image';

interface VisionTaskOutputProps {
  cacheInspected: boolean;
  cacheStatus: RuntimeCacheStatus;
  canClear: boolean;
  canDeleteSavedResult: boolean;
  caption: string;
  durationMs: number | null;
  imageMetadata: VisionImageMetadata | null;
  installStatus: string;
  loadTimeMs: number | null;
  onClear: () => void;
  onDeleteSavedResult: () => void;
  runtimeDevice: TransformersRuntimeDevice;
  storageMessage: string | null;
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return '—';
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)} s`
    : `${milliseconds.toFixed(0)} ms`;
}

function preparedInputLabel(imageMetadata: VisionImageMetadata | null) {
  if (!imageMetadata) return 'No image prepared';
  return `${imageMetadata.width}×${imageMetadata.height} PNG · ${formatBytes(
    imageMetadata.processedBytes,
  )}${imageMetadata.resized ? ' · resized locally' : ''}`;
}

export function VisionTaskOutput({
  cacheInspected,
  cacheStatus,
  canClear,
  canDeleteSavedResult,
  caption,
  durationMs,
  imageMetadata,
  installStatus,
  loadTimeMs,
  onClear,
  onDeleteSavedResult,
  runtimeDevice,
  storageMessage,
}: VisionTaskOutputProps) {
  const cacheLabel = !cacheInspected
    ? 'Not inspected'
    : `${cacheStatus.files.filter((file) => file.cached).length}/${cacheStatus.files.length} files`;

  return (
    <aside className="vision-result" aria-live="polite">
      <p className="panel-label">LOCAL VISION RESULT</p>
      <article className="vision-output-card" aria-labelledby="vision-caption-heading">
        <div>
          <h3 id="vision-caption-heading">Caption</h3>
          <span>{caption ? 'Generated locally' : 'Waiting for analysis'}</span>
        </div>
        <blockquote>{caption || 'The generated image caption will appear here.'}</blockquote>
      </article>

      <dl aria-label="Vision task details">
        <div>
          <dt>Model load</dt>
          <dd>{formatDuration(loadTimeMs)}</dd>
        </div>
        <div>
          <dt>Caption latency</dt>
          <dd>{formatDuration(durationMs)}</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>{runtimeDevice === 'webgpu' ? 'WebGPU worker' : 'WebAssembly worker'}</dd>
        </div>
        <div>
          <dt>Prepared input</dt>
          <dd>{preparedInputLabel(imageMetadata)}</dd>
        </div>
        <div>
          <dt>Offline cache</dt>
          <dd>{cacheLabel}</dd>
        </div>
        <div>
          <dt>Install record</dt>
          <dd>{installStatus}</dd>
        </div>
      </dl>
      <div className="vision-result-actions">
        <button
          className="button button--quiet"
          disabled={!canClear}
          onClick={onClear}
          type="button"
        >
          Clear local image and result
        </button>
        <button
          className="button button--danger"
          disabled={!canDeleteSavedResult}
          onClick={onDeleteSavedResult}
          type="button"
        >
          Delete saved metadata
        </button>
      </div>
      {storageMessage ? <p className="storage-message">{storageMessage}</p> : null}
    </aside>
  );
}
