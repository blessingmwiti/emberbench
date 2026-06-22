import type { InstalledModel } from '../models/catalog/types';
import { parseInstalledModel } from '../models/installed-model';
import type { TransformersRuntimePreference } from '../runtimes/transformers/runtime-device';

const DATABASE_NAME = 'emberbench';
const DATABASE_VERSION = 2;
const INSTALLED_MODELS_STORE = 'installed-models';
const SETTINGS_STORE = 'settings';
export const INSTALLED_MODELS_CHANGED_EVENT = 'emberbench:installed-models-changed';
export const SETTINGS_CHANGED_EVENT = 'emberbench:settings-changed';

function announceInstalledModelsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(INSTALLED_MODELS_CHANGED_EVENT));
  }
}

function announceSettingsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed.')),
      { once: true },
    );
  });
}

function transactionCompleted(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')),
      { once: true },
    );
  });
}

export function openEmberbenchDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);

    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INSTALLED_MODELS_STORE)) {
        const store = database.createObjectStore(INSTALLED_MODELS_STORE, {
          keyPath: 'modelId',
        });
        store.createIndex('status', 'status');
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, {
          keyPath: 'id',
        });
      }
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('Could not open Emberbench storage.')),
      { once: true },
    );
    request.addEventListener(
      'blocked',
      () => reject(new Error('Emberbench storage upgrade is blocked by another tab.')),
      { once: true },
    );
  });
}

export class InstalledModelRepository {
  constructor(private readonly factory?: IDBFactory) {}

  async delete(modelId: string): Promise<void> {
    const database = await openEmberbenchDatabase(this.factory);
    try {
      const transaction = database.transaction(INSTALLED_MODELS_STORE, 'readwrite');
      const completed = transactionCompleted(transaction);
      await requestResult(transaction.objectStore(INSTALLED_MODELS_STORE).delete(modelId));
      await completed;
      announceInstalledModelsChanged();
    } finally {
      database.close();
    }
  }

  async get(modelId: string): Promise<InstalledModel | null> {
    const database = await openEmberbenchDatabase(this.factory);
    try {
      const transaction = database.transaction(INSTALLED_MODELS_STORE, 'readwrite');
      const completed = transactionCompleted(transaction);
      const store = transaction.objectStore(INSTALLED_MODELS_STORE);
      const value = await requestResult(store.get(modelId) as IDBRequest<unknown>);
      const model = parseInstalledModel(value);
      if (value !== undefined && !model) {
        store.delete(modelId);
      }
      await completed;
      return model;
    } finally {
      database.close();
    }
  }

  async list(): Promise<InstalledModel[]> {
    const database = await openEmberbenchDatabase(this.factory);
    try {
      const transaction = database.transaction(INSTALLED_MODELS_STORE, 'readwrite');
      const completed = transactionCompleted(transaction);
      const store = transaction.objectStore(INSTALLED_MODELS_STORE);
      const values = await requestResult(store.getAll() as IDBRequest<unknown[]>);
      const models: InstalledModel[] = [];
      for (const value of values) {
        const model = parseInstalledModel(value);
        if (model) {
          models.push(model);
        } else {
          const key = (value as Partial<InstalledModel> | null)?.modelId;
          if (typeof key === 'string') {
            store.delete(key);
          }
        }
      }
      await completed;
      return models.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } finally {
      database.close();
    }
  }

  async put(model: InstalledModel): Promise<void> {
    if (!parseInstalledModel(model)) {
      throw new Error('Refusing to persist an invalid installed-model record.');
    }

    const database = await openEmberbenchDatabase(this.factory);
    try {
      const transaction = database.transaction(INSTALLED_MODELS_STORE, 'readwrite');
      const completed = transactionCompleted(transaction);
      await requestResult(transaction.objectStore(INSTALLED_MODELS_STORE).put(model));
      await completed;
      announceInstalledModelsChanged();
    } finally {
      database.close();
    }
  }
}

export const installedModels = new InstalledModelRepository();

export interface AppSettings {
  confirmLargeDownloads: boolean;
  defaultCachedFilesOnly: boolean;
  id: 'app';
  runtimePreference: TransformersRuntimePreference;
  schemaVersion: 1;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  confirmLargeDownloads: true,
  defaultCachedFilesOnly: false,
  id: 'app',
  runtimePreference: 'auto',
  schemaVersion: 1,
};

export function parseAppSettings(value: unknown): AppSettings | null {
  if (!value || typeof value !== 'object') return null;
  const settings = value as Partial<AppSettings>;
  if (
    settings.id !== 'app' ||
    settings.schemaVersion !== 1 ||
    typeof settings.confirmLargeDownloads !== 'boolean' ||
    typeof settings.defaultCachedFilesOnly !== 'boolean'
  ) {
    return null;
  }
  const runtimePreference = settings.runtimePreference ?? 'auto';
  if (!['auto', 'webgpu', 'wasm'].includes(runtimePreference)) return null;
  return {
    ...settings,
    runtimePreference,
  } as AppSettings;
}

export class SettingsRepository {
  constructor(private readonly factory?: IDBFactory) {}

  async get(): Promise<AppSettings> {
    const database = await openEmberbenchDatabase(this.factory);
    try {
      const transaction = database.transaction(SETTINGS_STORE, 'readonly');
      const value = await requestResult(
        transaction.objectStore(SETTINGS_STORE).get('app') as IDBRequest<unknown>,
      );
      return parseAppSettings(value) ?? DEFAULT_APP_SETTINGS;
    } finally {
      database.close();
    }
  }

  async put(settings: AppSettings): Promise<void> {
    if (!parseAppSettings(settings)) {
      throw new Error('Refusing to persist invalid application settings.');
    }
    const database = await openEmberbenchDatabase(this.factory);
    try {
      const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
      const completed = transactionCompleted(transaction);
      await requestResult(transaction.objectStore(SETTINGS_STORE).put(settings));
      await completed;
      announceSettingsChanged();
    } finally {
      database.close();
    }
  }
}

export const appSettings = new SettingsRepository();

export async function clearEmberbenchDatabase(factory: IDBFactory = indexedDB): Promise<void> {
  const database = await openEmberbenchDatabase(factory);
  try {
    const transaction = database.transaction([INSTALLED_MODELS_STORE, SETTINGS_STORE], 'readwrite');
    const completed = transactionCompleted(transaction);
    transaction.objectStore(INSTALLED_MODELS_STORE).clear();
    transaction.objectStore(SETTINGS_STORE).clear();
    await completed;
  } finally {
    database.close();
  }
  announceInstalledModelsChanged();
  announceSettingsChanged();
}
