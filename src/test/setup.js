import '@testing-library/jest-dom/vitest';

// This vitest/jsdom combination runs without any localStorage (Node's own
// global is feature-flagged off). Pages persist small bits of state
// ("slashloop:activeWorkspaceId", "slashloop:onboarding"), so give the suite
// the in-memory Storage a browser would have.
if (typeof globalThis.localStorage === "undefined" || globalThis.localStorage === null) {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(String(k)),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  if (typeof window !== "undefined") Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
}
