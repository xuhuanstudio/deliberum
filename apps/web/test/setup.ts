Object.defineProperty(window, "scrollTo", {
  value: () => undefined,
  writable: true
});

const localStorageItems = new Map<string, string>();

const localStorageMock: Storage = {
  get length() {
    return localStorageItems.size;
  },
  clear() {
    localStorageItems.clear();
  },
  getItem(key: string) {
    return localStorageItems.get(key) ?? null;
  },
  key(index: number) {
    return Array.from(localStorageItems.keys())[index] ?? null;
  },
  removeItem(key: string) {
    localStorageItems.delete(key);
  },
  setItem(key: string, value: string) {
    localStorageItems.set(key, value);
  }
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock
});

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock
});
