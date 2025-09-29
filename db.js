(function (global) {
  const DB_NAME = 'TabVaultDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  const DEFAULT_SETTINGS = { autoSaveInterval: 31, maxAutoSnapshots: 86 };
  const DEFAULT_STORAGE_LIMIT = 256 * 1024 * 1024; // 256MB estimate for progress UI
  const SNAPSHOT_NAME_AUTO = '自动保存';
  const SNAPSHOT_NAME_MANUAL = '手动保存';
  const LEGACY_AUTO_NAMES = new Set([SNAPSHOT_NAME_AUTO, '自动保存']);
  const LEGACY_MANUAL_NAMES = new Set([SNAPSHOT_NAME_MANUAL, '手动保存']);

  let dbPromise = null;

  function cloneValue(value) {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function openDatabase() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => db.close();
          resolve(db);
        };
      });
    }
    return dbPromise;
  }

  function runTransaction(mode, handler) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      handler(store, tx, resolve, reject);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  function getValue(key, defaultValue) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result && Object.prototype.hasOwnProperty.call(request.result, 'value')) {
          resolve(cloneValue(request.result.value));
        } else {
          resolve(defaultValue);
        }
      };
      request.onerror = () => reject(request.error);
    }));
  }

  function setValue(key, value) {
    return runTransaction('readwrite', (store) => {
      store.put({ key, value: cloneValue(value) });
    });
  }

  function deleteValue(key) {
    return runTransaction('readwrite', (store) => {
      store.delete(key);
    });
  }

  function normalizeSnapshotName(name) {
    if (LEGACY_AUTO_NAMES.has(name)) {
      return SNAPSHOT_NAME_AUTO;
    }
    if (LEGACY_MANUAL_NAMES.has(name)) {
      return SNAPSHOT_NAME_MANUAL;
    }
    return name;
  }

  function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return snapshot;
    }
    return { ...snapshot, name: normalizeSnapshotName(snapshot.name) };
  }

  function isAutoSnapshotName(name) {
    return normalizeSnapshotName(name) === SNAPSHOT_NAME_AUTO;
  }

  function isManualSnapshotName(name) {
    return normalizeSnapshotName(name) === SNAPSHOT_NAME_MANUAL;
  }

  async function getSnapshots() {
    const snapshots = await getValue('snapshots', []);
    return Array.isArray(snapshots) ? snapshots.map(normalizeSnapshot) : [];
  }

  async function setSnapshots(snapshots) {
    if (!Array.isArray(snapshots)) {
      await setValue('snapshots', []);
      return;
    }
    await setValue('snapshots', snapshots.map(normalizeSnapshot));
  }

  async function updateSnapshots(updater) {
    const snapshots = await getSnapshots();
    const updated = updater(Array.isArray(snapshots) ? snapshots.slice() : []);
    await setSnapshots(updated);
    return updated;
  }

  async function addSnapshot(snapshot) {
    return updateSnapshots((snapshots) => {
      snapshots.unshift(normalizeSnapshot(snapshot));
      return snapshots;
    });
  }

  async function replaceSnapshot(snapshot) {
    const normalized = normalizeSnapshot(snapshot);
    return updateSnapshots((snapshots) => snapshots.map((item) => item.id === normalized.id ? normalized : item));
  }

  async function deleteSnapshot(id) {
    return updateSnapshots((snapshots) => snapshots.filter((item) => item.id !== id));
  }

  async function getSnapshotById(id) {
    const snapshots = await getSnapshots();
    return snapshots.find((item) => item.id === id);
  }

  async function getSettings() {
    const stored = await getValue('settings', null);
    if (stored && typeof stored === 'object') {
      return { ...DEFAULT_SETTINGS, ...stored };
    }
    return { ...DEFAULT_SETTINGS };
  }

  async function saveSettings(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    await setValue('settings', merged);
    return merged;
  }

  async function getLastSavedState() {
    return getValue('lastSavedState', null);
  }

  async function saveLastSavedState(hash) {
    await setValue('lastSavedState', hash);
    return hash;
  }

  async function estimateUsage() {
    const [snapshots, settings, lastSavedState] = await Promise.all([
      getSnapshots(),
      getSettings(),
      getLastSavedState()
    ]);
    const encoder = new TextEncoder();
    const payload = { snapshots, settings, lastSavedState };
    const bytes = encoder.encode(JSON.stringify(payload)).byteLength;
    return {
      bytes,
      totalBytes: DEFAULT_STORAGE_LIMIT,
      ratio: Math.min(1, bytes / DEFAULT_STORAGE_LIMIT)
    };
  }

  const api = {
    openDatabase,
    getValue,
    setValue,
    deleteValue,
    getSnapshots,
    setSnapshots,
    updateSnapshots,
    addSnapshot,
    replaceSnapshot,
    deleteSnapshot,
    getSnapshotById,
    getSettings,
    saveSettings,
    getLastSavedState,
    saveLastSavedState,
    estimateUsage,
    DEFAULT_SETTINGS,
    DEFAULT_STORAGE_LIMIT,
    SNAPSHOT_NAME_AUTO,
    SNAPSHOT_NAME_MANUAL,
    normalizeSnapshot,
    normalizeSnapshotName,
    isAutoSnapshotName,
    isManualSnapshotName
  };

  global.TabVaultDB = api;
})(typeof self !== 'undefined' ? self : this);
