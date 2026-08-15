function createStorageAdapter() {
  const fallback = window.localStorage;
  const database = new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
    const request = window.indexedDB.open('sola-worship', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('keyvalue')) request.result.createObjectStore('keyvalue');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const transact = async (mode, operation) => {
    const db = await database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('keyvalue', mode);
      const request = operation(transaction.objectStore('keyvalue'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  return {
    async get(key) {
      try {
        const stored = await transact('readonly', (store) => store.get(key));
        if (stored !== undefined) return { value: stored };
        const legacy = fallback.getItem(key);
        if (legacy !== null) {
          await transact('readwrite', (store) => store.put(legacy, key));
          return { value: legacy };
        }
        return null;
      } catch {
        const value = fallback.getItem(key);
        return value === null ? null : { value };
      }
    },
    async set(key, value) {
      try {
        await transact('readwrite', (store) => store.put(value, key));
        return true;
      } catch {
        fallback.setItem(key, value);
        return true;
      }
    },
    async list(prefix) {
      const keys = new Set();
      try {
        const storedKeys = await transact('readonly', (store) => store.getAllKeys());
        storedKeys.filter((key) => String(key).startsWith(prefix)).forEach((key) => keys.add(String(key)));
      } catch { /* localStorage remains available as a fallback */ }
      for (let index = 0; index < fallback.length; index += 1) {
        const itemKey = fallback.key(index);
        if (itemKey && itemKey.startsWith(prefix)) keys.add(itemKey);
      }
      return { keys: [...keys].map((key) => ({ key })) };
    },
  };
}

export function installAppStorage() {
  if (!window.storage) {
    window.storage = createStorageAdapter();
  }
}
