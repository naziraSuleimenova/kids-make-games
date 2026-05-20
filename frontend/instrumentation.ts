export async function register() {
  // Only patch in the Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Some tools (e.g. Inngest CLI, certain Node.js flags) inject a broken
  // localStorage into the Node.js global that has getItem as non-function.
  // Next.js internals then trip over it during SSR. Force-replace it.
  const _store: Record<string, string> = {};
  const storage = {
    getItem: (k: string) => _store[k] ?? null,
    setItem: (k: string, v: string) => { _store[k] = v; },
    removeItem: (k: string) => { delete _store[k]; },
    clear: () => { for (const k in _store) delete _store[k]; },
    get length() { return Object.keys(_store).length; },
    key: (i: number) => Object.keys(_store)[i] ?? null,
  };

  for (const key of ['localStorage', 'sessionStorage'] as const) {
    try {
      Object.defineProperty(global, key, { value: storage, writable: true, configurable: true });
    } catch {
      (global as Record<string, unknown>)[key] = storage;
    }
  }
}
