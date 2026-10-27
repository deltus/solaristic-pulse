// Preview builds: each round* branch is published under /preview/<branch>/ on the same website as the
// live app, so the browser shares IndexedDB and localStorage between them. A preview build
// (VITE_PREVIEW=<branch>) uses its own database name and storage keys so it can never touch live data.

const LIVE_DB = 'solaristic-pulse';

/** The preview branch name, or undefined in the live app. */
export function previewName(env: Record<string, unknown> = import.meta.env): string | undefined {
  const v = String(env.VITE_PREVIEW ?? '').trim();
  return v ? v.replace(/[^A-Za-z0-9._-]/g, '-') : undefined;
}

export const PREVIEW = previewName();

/** IndexedDB name: the live name stays exactly as it was. */
export function dbName(preview: string | undefined = PREVIEW): string {
  return preview ? `${LIVE_DB}-preview-${preview}` : LIVE_DB;
}

/** localStorage key: unchanged in the live app, namespaced per preview. */
export function storageKey(key: string, preview: string | undefined = PREVIEW): string {
  return preview ? `preview-${preview}:${key}` : key;
}
