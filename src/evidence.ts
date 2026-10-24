// ICP evidence files: photo compression and the "evidence pack" ZIP for learning support meetings.
// Evidence stays on this device; nothing here uploads anything.

import { db } from './db';
import type { EvidenceItem, IcpAdjustment, Student } from './types';
import { EVIDENCE_KINDS } from './logic/evidence';
import { formatDate, today } from './lib/dates';

/** Longest side for saved photos. */
const MAX_SIDE = 1600;

/** Shrinks a photo to a 1600 px JPEG (keeps storage small). Returns the original if it can't. */
export async function compressImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'application/pdf': 'pdf' };
const safe = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function evidenceFileName(e: EvidenceItem, adj: IcpAdjustment | undefined, n: number): string {
  const ext = e.name?.includes('.') ? e.name.split('.').pop()! : EXT[(e.mime ?? '').split(';')[0]] ?? 'bin';
  return `${e.date}_${safe(adj?.title ?? 'adjustment')}_${e.kind}-${n}.${ext}`;
}

/** All of a student's evidence as a ZIP: the files, plus an index of every item and note. */
export async function buildEvidencePack(s: Student, displayName: string): Promise<{ blob: Blob; name: string; count: number }> {
  const [{ default: JSZip }, items, adjustments] = await Promise.all([
    import('jszip'), db.evidence.where('studentId').equals(s.id).toArray(), db.icpAdjustments.where('studentId').equals(s.id).toArray()
  ]);
  items.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const zip = new JSZip();
  const lines = [`ICP evidence: ${displayName}`, `Exported ${formatDate(today())} from Solaristic Radar. Contains student information; store and share according to school policy.`, ''];
  items.forEach((e, i) => {
    const adj = adjustments.find((a) => a.id === e.adjustmentId);
    const file = e.blob ? evidenceFileName(e, adj, i + 1) : '';
    if (e.blob) zip.file(file, e.blob);
    lines.push(`${formatDate(e.date)} · ${adj?.title ?? 'Adjustment'} · ${EVIDENCE_KINDS.find((k) => k.value === e.kind)?.label ?? e.kind}${file ? ` · ${file}` : ''}${e.text ? `\n    ${e.text}` : ''}`);
  });
  zip.file('index.txt', lines.join('\n'));
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  return { blob, name: `icp-evidence_${safe(`${s.lastName}-${s.preferredName || s.firstName}`)}_${today()}.zip`, count: items.length };
}
