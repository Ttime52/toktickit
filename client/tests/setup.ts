import "@testing-library/jest-dom";

// Node can start jsdom with an invalid --localstorage-file option in the
// course environment. Provide the browser storage contract so UI tests can
// verify the documented requester persistence key.
if (typeof window !== "undefined") {
  const storage = window.localStorage;
  if (typeof storage.getItem !== "function") {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size;
        },
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, String(value)),
      } satisfies Storage,
    });
  }
}
