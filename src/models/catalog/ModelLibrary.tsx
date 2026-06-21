import { formatBytes } from '../../diagnostics/format';
import { getCuratedModels, getModelDownloadSize } from './registry';

export function ModelLibrary() {
  return (
    <section className="section model-library-section" id="models">
      <div className="section-heading">
        <div>
          <p className="kicker">CURATED MODEL REGISTRY</p>
          <h2>Tested models, pinned precisely.</h2>
        </div>
        <p>
          These first manifests are generated from the models already proven in this browser. Each
          entry carries its source revision, artifacts, license, task, and device tier.
        </p>
      </div>

      <div className="model-library-grid">
        {getCuratedModels().map((model) => (
          <article className="model-library-card" key={model.id}>
            <div className="model-library-card__header">
              <span className={`model-status model-status--${model.status}`}>{model.status}</span>
              <span>{model.requirements.deviceTier} device</span>
            </div>
            <h3>{model.name}</h3>
            <p>{model.description}</p>
            <dl>
              <div>
                <dt>Task</dt>
                <dd>{model.requirements.task}</dd>
              </div>
              <div>
                <dt>Download</dt>
                <dd>{formatBytes(getModelDownloadSize(model))}</dd>
              </div>
              <div>
                <dt>Precision</dt>
                <dd>
                  {[...new Set(model.artifacts.map((artifact) => artifact.precision))].join(', ')}
                </dd>
              </div>
              <div>
                <dt>License</dt>
                <dd>{model.license.id}</dd>
              </div>
            </dl>
            <div className="capability-list">
              {model.capabilities.map((capability) => (
                <span key={capability}>{capability}</span>
              ))}
            </div>
            <a
              href={`https://huggingface.co/${model.source.modelId}/tree/${model.source.revision}`}
              rel="noreferrer"
              target="_blank"
            >
              View pinned source ↗
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
