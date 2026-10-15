import { useEffect, useState } from 'preact/hooks';
import { db } from '../db';
import { deleteSaved, FILE_SAVED_EVENT, formatSize, openFile, shareSaved, type SavedFile } from '../files';
import { isNative } from '../platform';
import { relativeDay, toISODate } from '../lib/dates';
import { useLive } from './hooks';
import { Icon, Sheet, toast } from './components';

const kindLabel = (k: string) => (k === 'backup' ? 'Backup saved' : k === 'sample' ? 'Sample saved' : 'Report saved');
const iconFor = (rec: SavedFile) => (rec.kind === 'backup' ? 'shield' : 'reports');

async function share(rec: SavedFile) {
  if (!(await shareSaved(rec))) toast('Sharing isn’t available here. Use Open to download it again.');
}

/** Pops up after any file is saved: Open, Share, and where it went. */
export function FileSavedHost() {
  const [id, setId] = useState<string | null>(null);
  const rec = useLive(() => (id ? db.files.get(id) : undefined), [id]);
  useEffect(() => {
    const on = (e: Event) => setId((e as CustomEvent<string>).detail);
    window.addEventListener(FILE_SAVED_EVENT, on);
    return () => window.removeEventListener(FILE_SAVED_EVENT, on);
  }, []);
  if (!id || !rec) return null;
  return (
    <Sheet title={kindLabel(rec.kind)} onClose={() => setId(null)}>
      <div class="file-saved">
        <div class="file-icon"><Icon name={iconFor(rec)} /></div>
        <div class="grow" style="min-width:0">
          <div class="file-name">{rec.name}</div>
          <div class="tiny muted">{formatSize(rec.size)} · {rec.location}</div>
        </div>
      </div>
      <div class="grid2" style="margin-top:16px">
        <button class="btn primary" onClick={() => openFile(rec)}><Icon name="download" /> {isNative() ? 'Open' : 'Download again'}</button>
        <button class="btn" onClick={() => share(rec)}><Icon name="share" /> Share</button>
      </div>
      <p class="tiny muted" style="margin:12px 0 0">Find it any time under Reports → Recent files.{isNative() ? ' A notification lets you open it later too.' : ''}</p>
    </Sheet>
  );
}

export function RecentFiles() {
  const files = useLive(() => db.files.orderBy('createdAt').reverse().toArray(), []);
  if (!files?.length) return null;
  return (
    <>
      <div class="section"><h3 class="grow">Recent files</h3><span class="tiny muted mono">{files.length}</span></div>
      <div class="card flat" style="padding:4px 14px">
        {files.map((f) => (
          <div key={f.id} class="file-row">
            <span class="file-icon small"><Icon name={iconFor(f)} /></span>
            <span class="grow" style="min-width:0">
              <span class="file-name">{f.name}</span>
              <span class="tiny muted">{relativeDay(toISODate(new Date(f.createdAt)))} · {formatSize(f.size)}</span>
            </span>
            <button class="icon-btn" aria-label={`Open ${f.name}`} onClick={() => openFile(f)}><Icon name="download" /></button>
            <button class="icon-btn" aria-label={`Share ${f.name}`} onClick={() => share(f)}><Icon name="share" /></button>
            <button class="icon-btn" aria-label={`Remove ${f.name}`} onClick={async () => {
              const alsoFile = isNative() && confirm('Also delete the file from this phone? (Cancel keeps the file and just removes it from this list.)');
              await deleteSaved(f, alsoFile);
            }}><Icon name="x" /></button>
          </div>
        ))}
      </div>
    </>
  );
}
