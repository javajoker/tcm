/** Debounced saving: the latest value is written at most `delayMs` after the last change (tech spec §8.2: ≤ 300 ms); `flush` writes it now (page hide). */
export interface Autosaver<T> { schedule(value: T): void; flush(): Promise<void>; cancel(): void }

export function createAutosaver<T>(save: (value: T) => Promise<void>, delayMs = 250, timers: { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void } = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }): Autosaver<T> {
  let pending: { value: T } | null = null;
  let handle: unknown = null;
  const run = async (): Promise<void> => {
    handle = null;
    if (pending === null) return;
    const { value } = pending;
    pending = null;
    await save(value);
  };
  return {
    schedule(value) { pending = { value }; if (handle !== null) timers.clear(handle); handle = timers.set(() => { void run(); }, delayMs); },
    async flush() { if (handle !== null) { timers.clear(handle); } await run(); },
    cancel() { if (handle !== null) timers.clear(handle); handle = null; pending = null; },
  };
}
