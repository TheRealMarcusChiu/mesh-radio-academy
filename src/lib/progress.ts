/**
 * Browser-local page progress. Nothing leaves the browser. If storage is
 * blocked, missing, full or holds unreadable data, progress lives in memory for
 * this page view and `status` says so, so the UI can tell the learner.
 */

export const STORAGE_KEY = 'mesh-radio-academy:progress:v1';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ProgressStore {
  readonly status: 'saved' | 'memory';
  has(id: string): boolean;
  mark(id: string, done: boolean): void;
  list(): string[];
  reset(): void;
}

const ID = /^[a-z0-9][a-z0-9/-]{0,119}$/;

function read(storage: KV): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    const pages = (parsed as { version?: unknown; pages?: unknown } | null)?.pages;
    if (!Array.isArray(pages)) return [];
    return pages.filter((p): p is string => typeof p === 'string' && ID.test(p));
  } catch {
    return [];
  }
}

export function openProgress(getStorage: () => KV | null | undefined): ProgressStore {
  let storage: KV | null = null;
  try {
    storage = getStorage() ?? null;
  } catch {
    storage = null;
  }
  const pages = new Set(storage ? read(storage) : []);

  const save = () => {
    if (!storage) return;
    try {
      if (pages.size) storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, pages: [...pages] }));
      else storage.removeItem(STORAGE_KEY);
    } catch {
      storage = null; // quota or revoked access: keep going in memory
    }
  };

  return {
    get status() {
      return storage ? 'saved' : 'memory';
    },
    has: (id) => pages.has(id),
    mark(id, done) {
      if (!ID.test(id)) throw new Error(`Invalid page id: ${JSON.stringify(id)}`);
      if (done) pages.add(id);
      else pages.delete(id);
      save();
    },
    list: () => [...pages],
    reset() {
      pages.clear();
      save();
    },
  };
}
