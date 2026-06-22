import { getCuratedModels } from '../models/catalog/registry';
import { createRuntimeAdapter } from '../runtimes/create-runtime-adapter';
import { clearEmberbenchDatabase } from './database';

export interface LocalDataResetResult {
  filesDeleted: number;
  modelsChecked: number;
}

export async function clearLocalData(): Promise<LocalDataResetResult> {
  let filesDeleted = 0;
  let modelsChecked = 0;

  for (const manifest of getCuratedModels()) {
    const adapter = createRuntimeAdapter(manifest);
    try {
      const result = await adapter.deleteCache(manifest);
      filesDeleted += result.filesDeleted;
      modelsChecked += 1;
    } finally {
      adapter.terminate();
    }
  }

  await clearEmberbenchDatabase();
  return { filesDeleted, modelsChecked };
}
