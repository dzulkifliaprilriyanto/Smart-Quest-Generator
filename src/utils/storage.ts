import type {
  ExamCardConfig,
  ExamCardParticipant,
  GeneratorParams,
  KopTemplate,
  QuestionSet,
  StoredLogoAsset,
  StudentResponseEntry,
  SubjectCatalogMap,
  ThemeMode,
} from '../types/question';

const DB_NAME = 'smart-soal-studio-db';
const DB_VERSION = 3;
const STORE_DRAFTS = 'drafts';
const STORE_HISTORY = 'history';
const STORE_SETTINGS = 'settings';
const STORE_LOGOS = 'logos';

export interface DraftRecord {
  id: 'active-draft';
  params: GeneratorParams;
  activeSet: QuestionSet | null;
  updatedAt: string;
}

const FALLBACK_PREFIX = 'smart_soal_studio_';

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB tidak tersedia'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const store = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_LOGOS)) {
        const logoStore = db.createObjectStore(STORE_LOGOS, { keyPath: 'logo_id' });
        logoStore.createIndex('updated_at', 'updated_at', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Gagal membuka IndexedDB'));
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(`${FALLBACK_PREFIX}${storeName}_${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}

async function idbPut<T>(storeName: string, key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Gagal menulis ke IndexedDB'));
      tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
    });
  } catch {
    try {
      localStorage.setItem(`${FALLBACK_PREFIX}${storeName}_${key}`, JSON.stringify(value));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }
}

export async function saveDraft(
  params: GeneratorParams,
  activeSet: QuestionSet | null
): Promise<void> {
  const record: DraftRecord = {
    id: 'active-draft',
    params,
    activeSet,
    updatedAt: new Date().toISOString(),
  };
  await idbPut(STORE_DRAFTS, 'active-draft', record);
}

export async function loadDraft(): Promise<DraftRecord | null> {
  return idbGet<DraftRecord>(STORE_DRAFTS, 'active-draft');
}

export async function saveToHistory(questionSet: QuestionSet): Promise<void> {
  await idbPut(STORE_HISTORY, questionSet.id, questionSet);
}

export async function loadHistory(): Promise<QuestionSet[]> {
  try {
    const db = await openDatabase();
    const list = await new Promise<QuestionSet[]>((resolve, reject) => {
      const tx = db.transaction(STORE_HISTORY, 'readonly');
      const store = tx.objectStore(STORE_HISTORY);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as QuestionSet[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    try {
      const raw = localStorage.getItem(`${FALLBACK_PREFIX}${STORE_HISTORY}_all`);
      const parsed = raw ? (JSON.parse(raw) as QuestionSet[]) : [];
      return parsed.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      return [];
    }
  }
}

export async function deleteHistoryItem(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_HISTORY, 'readwrite');
      const store = tx.objectStore(STORE_HISTORY);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback ignored
  }
}

export async function clearAllHistory(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_HISTORY, 'readwrite');
      const store = tx.objectStore(STORE_HISTORY);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback ignored
  }
}

export async function saveThemePreference(theme: ThemeMode): Promise<void> {
  await idbPut(STORE_SETTINGS, 'theme', { key: 'theme', value: theme });
}

export async function loadThemePreference(): Promise<ThemeMode | null> {
  const row = await idbGet<{ key: string; value: ThemeMode }>(STORE_SETTINGS, 'theme');
  return row?.value ?? null;
}

export async function saveSubjectCatalog(catalog: SubjectCatalogMap): Promise<void> {
  await idbPut(STORE_SETTINGS, 'subject-catalog', {
    key: 'subject-catalog',
    value: catalog,
  });
}

export async function loadSubjectCatalog(): Promise<SubjectCatalogMap | null> {
  const row = await idbGet<{ key: string; value: SubjectCatalogMap }>(
    STORE_SETTINGS,
    'subject-catalog'
  );
  return row?.value ?? null;
}

export async function saveStudentResponses(
  setId: string,
  responses: StudentResponseEntry[]
): Promise<void> {
  await idbPut(STORE_SETTINGS, `responses-${setId}`, {
    key: `responses-${setId}`,
    value: responses,
  });
}

export async function loadStudentResponses(
  setId: string
): Promise<StudentResponseEntry[]> {
  const row = await idbGet<{ key: string; value: StudentResponseEntry[] }>(
    STORE_SETTINGS,
    `responses-${setId}`
  );
  return row?.value ?? [];
}

export async function saveKopTemplates(templates: KopTemplate[]): Promise<void> {
  await idbPut(STORE_SETTINGS, 'kop-templates', {
    key: 'kop-templates',
    value: templates,
  });
}

export async function loadKopTemplates(): Promise<KopTemplate[] | null> {
  const row = await idbGet<{ key: string; value: KopTemplate[] }>(
    STORE_SETTINGS,
    'kop-templates'
  );
  return row?.value ?? null;
}

export async function saveActiveKopId(kopId: string): Promise<void> {
  await idbPut(STORE_SETTINGS, 'active-kop-id', {
    key: 'active-kop-id',
    value: kopId,
  });
}

export async function loadActiveKopId(): Promise<string | null> {
  const row = await idbGet<{ key: string; value: string }>(
    STORE_SETTINGS,
    'active-kop-id'
  );
  return row?.value ?? null;
}

export async function saveExamCardParticipants(
  participants: ExamCardParticipant[]
): Promise<void> {
  await idbPut(STORE_SETTINGS, 'exam-card-participants', {
    key: 'exam-card-participants',
    value: participants,
  });
}

export async function loadExamCardParticipants(): Promise<ExamCardParticipant[]> {
  const row = await idbGet<{ key: string; value: ExamCardParticipant[] }>(
    STORE_SETTINGS,
    'exam-card-participants'
  );
  return row?.value ?? [];
}

export async function saveExamCardConfig(config: ExamCardConfig): Promise<void> {
  await idbPut(STORE_SETTINGS, 'exam-card-config', {
    key: 'exam-card-config',
    value: config,
  });
}

export async function loadExamCardConfig(): Promise<ExamCardConfig | null> {
  const row = await idbGet<{ key: string; value: ExamCardConfig }>(
    STORE_SETTINGS,
    'exam-card-config'
  );
  return row?.value ?? null;
}

export async function saveLogoAsset(asset: StoredLogoAsset): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LOGOS, 'readwrite');
      const store = tx.objectStore(STORE_LOGOS);
      store.put(asset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Gagal menyimpan logo'));
      tx.onabort = () => reject(tx.error ?? new Error('Penyimpanan logo dibatalkan'));
    });
  } catch {
    try {
      const existing = await loadAllLogos();
      const next = [asset, ...existing.filter((x) => x.logo_id !== asset.logo_id)];
      localStorage.setItem(`${FALLBACK_PREFIX}${STORE_LOGOS}_all`, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }
}

export async function loadAllLogos(): Promise<StoredLogoAsset[]> {
  try {
    const db = await openDatabase();
    const list = await new Promise<StoredLogoAsset[]>((resolve, reject) => {
      const tx = db.transaction(STORE_LOGOS, 'readonly');
      const store = tx.objectStore(STORE_LOGOS);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as StoredLogoAsset[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    return list.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  } catch {
    try {
      const raw = localStorage.getItem(`${FALLBACK_PREFIX}${STORE_LOGOS}_all`);
      const parsed = raw ? (JSON.parse(raw) as StoredLogoAsset[]) : [];
      return parsed.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    } catch {
      return [];
    }
  }
}

export async function deleteLogoAsset(logoId: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LOGOS, 'readwrite');
      const store = tx.objectStore(STORE_LOGOS);
      store.delete(logoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Gagal menghapus logo'));
      tx.onabort = () => reject(tx.error ?? new Error('Penghapusan logo dibatalkan'));
    });
  } catch {
    try {
      const existing = await loadAllLogos();
      const next = existing.filter((x) => x.logo_id !== logoId);
      localStorage.setItem(`${FALLBACK_PREFIX}${STORE_LOGOS}_all`, JSON.stringify(next));
    } catch {
      // Ignore
    }
  }
}

export async function savePrimaryLogoId(logoId: string | null): Promise<void> {
  await idbPut(STORE_SETTINGS, 'primary-logo-id', {
    key: 'primary-logo-id',
    value: logoId ?? '',
  });
}

export async function loadPrimaryLogoId(): Promise<string | null> {
  const row = await idbGet<{ key: string; value: string }>(STORE_SETTINGS, 'primary-logo-id');
  return row?.value ? row.value : null;
}
