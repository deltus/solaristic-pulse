// Saved files (reports, backups, samples): save, remember the last few, open, share, delete.
// Web: the browser downloads the file and a copy is kept in IndexedDB for "Recent files".
// Android: the file is written to Documents/Solaristic Radar and opened with the phone's apps.

import { db, newId } from './db';
import { isNative } from './platform';

export type FileKind = 'report' | 'backup' | 'sample';

export interface SavedFile {
  id: string;
  name: string;
  kind: FileKind;
  mime: string;
  size: number;
  createdAt: number;
  location: string;
  /** Android: content/file URI, path and directory of the written file. */
  uri?: string;
  path?: string;
  directory?: string;
  /** Web: a copy of the file so it can be downloaded or shared again. */
  blob?: Blob;
}

const KEEP = 10;
export const FILE_SAVED_EVENT = 'pulse:file-saved';

export async function saveFile(blob: Blob, filename: string, kind: FileKind = 'report'): Promise<SavedFile> {
  const rec: SavedFile = {
    id: newId(), name: filename, kind, mime: blob.type || 'application/octet-stream', size: blob.size, createdAt: Date.now(),
    location: 'Your browser’s Downloads folder'
  };
  if (isNative()) {
    const n = await import('./native');
    const w = await n.writeNative(blob, filename);
    Object.assign(rec, { uri: w.uri, path: w.path, directory: w.directory, location: w.location });
    n.notifyFileSaved(rec.id, filename, kind).catch(() => {});
  } else {
    download(blob, filename);
    rec.blob = blob;
  }
  await db.files.put(rec);
  await prune();
  window.dispatchEvent(new CustomEvent(FILE_SAVED_EVENT, { detail: rec.id }));
  return rec;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function prune() {
  const all = await db.files.orderBy('createdAt').reverse().toArray();
  for (const old of all.slice(KEEP)) await db.files.delete(old.id); // the file itself stays on the device
}

export async function openFile(rec: SavedFile): Promise<void> {
  if (isNative() && rec.uri) return (await import('./native')).openNative(rec.uri, rec.mime, rec.name);
  if (rec.blob) download(rec.blob, rec.name);
}

/** Opens the system share sheet (email, Drive, Teams…). Returns false if sharing isn't supported here. */
export async function shareSaved(rec: SavedFile): Promise<boolean> {
  if (isNative() && rec.uri) { await (await import('./native')).shareNative(rec.uri, rec.name); return true; }
  return rec.blob ? shareBlob(rec.blob, rec.name, rec.name) : false;
}

export async function shareBlob(blob: Blob, filename: string, title: string): Promise<boolean> {
  if (isNative()) { await (await import('./native')).shareBlobNative(blob, filename, title); return true; }
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.canShare?.({ files: [file] })) return false;
  try { await navigator.share({ files: [file], title }); } catch { /* cancelled */ }
  return true;
}

export async function deleteSaved(rec: SavedFile, alsoFile: boolean): Promise<void> {
  if (alsoFile && isNative() && rec.path && rec.directory) await (await import('./native')).deleteNative(rec.path, rec.directory);
  await db.files.delete(rec.id);
}

export function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}
