import type { InstalledModel } from '../models/catalog/types';
import { parseInstalledModel } from '../models/installed-model';

const DATABASE_NAME = 'emberbench';
const DATABASE_VERSION = 1;
const INSTALLED_MODELS_STORE = 'installed-models';
export const INSTALLED_MODELS_CHANGED_EVENT = 'emberbench:installed-models-changed';

function announceInstalledModelsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(INSTALLED_MODELS_CHANGED_EVENT));
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
