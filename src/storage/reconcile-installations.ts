import { findCuratedModel } from '../models/catalog/registry';
import { reconcileInstalledModel } from '../models/reconcile-installed-model';
import { createRuntimeAdapter } from '../runtimes/create-runtime-adapter';
import { installedModels } from './database';

export interface ReconciliationSummary {
  checked: number;
  repaired: number;
  stale: number;
}

export async function reconcileInstallations(): Promise<ReconciliationSummary> {
  const records = await installedModels.list();
  const summary: ReconciliationSummary = {
    checked: 0,
    repaired: 0,
    stale: 0,
  };

  for (const record of records) {
    const manifest = findCuratedModel(record.modelId);
    if (!manifest) continue;

    const adapter = createRuntimeAdapter(manifest);
    try {
      const cache = await adapter.inspectCache(manifest);
      const reconciled = reconcileInstalledModel(record, manifest, cache);
      summary.checked += 1;
      if (record.status !== 'installed' && reconciled.status === 'installed') {
        summary.repaired += 1;
      }
      if (reconciled.status === 'failed') {
        summary.stale += 1;
      }
      if (JSON.stringify(reconciled) !== JSON.stringify(record)) {
        await installedModels.put(reconciled);
      }
    } finally {
      adapter.terminate();
    }
  }

  return summary;
}
