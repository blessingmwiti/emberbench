import { useEffect, useState } from 'react';

import { findCuratedModel } from '../models/catalog/registry';
import { BENCHMARKS_CHANGED_EVENT, benchmarks, type BenchmarkSummary } from '../storage/database';

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return '—';
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)} s`
    : `${milliseconds.toFixed(0)} ms`;
}

export function RecentBenchmarks() {
  const [results, setResults] = useState<BenchmarkSummary[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void benchmarks
        .list(6)
        .then((next) => {
          if (active) setResults(next);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener(BENCHMARKS_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(BENCHMARKS_CHANGED_EVENT, refresh);
    };
  }, []);

  return (
    <section className="section benchmarks-section" aria-labelledby="benchmarks-heading">
      <div className="section-heading">
        <div>
          <p className="kicker">LOCAL BENCHMARK HISTORY</p>
          <h2 id="benchmarks-heading">Recent successful runs.</h2>
        </div>
        <p>
          Timing summaries stay in this browser. Prompts, generated text, captions, and images are
          deliberately excluded.
        </p>
      </div>

      {results.length === 0 ? (
        <p className="model-library-empty">Complete a model run to record local timing data.</p>
      ) : (
        <div className="benchmark-list">
          {results.map((result) => (
            <article key={result.id}>
              <div>
                <p>{result.runtimeDevice.toUpperCase()}</p>
                <h3>{findCuratedModel(result.modelId)?.name ?? result.modelId}</h3>
                <span>{new Date(result.createdAt).toLocaleString()}</span>
              </div>
              <dl>
                <div>
                  <dt>Load</dt>
                  <dd>{formatDuration(result.loadTimeMs)}</dd>
                </div>
                <div>
                  <dt>First token</dt>
                  <dd>{formatDuration(result.firstTokenMs)}</dd>
                </div>
                <div>
                  <dt>Run</dt>
                  <dd>{formatDuration(result.durationMs)}</dd>
                </div>
                <div>
                  <dt>{result.task === 'text-generation' ? 'Tokens' : 'Results'}</dt>
                  <dd>{result.outputUnits}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
