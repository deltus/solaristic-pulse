// ICP evidence for learning support meetings: add a photo, file, note or voice memo.
// Nothing opens the camera by itself; "Take a picture" is a choice. Evidence stays on this device.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { EvidenceItem, EvidenceKind, IcpAdjustment, IcpCheck, Student } from '../types';
import * as svc from '../services';
import { compressImage, buildEvidencePack } from '../evidence';
import { saveFile, formatSize } from '../files';
import { EVIDENCE_KINDS, evidenceDue, evidenceOn } from '../logic/evidence';
import { formatShort, today } from '../lib/dates';
import { FREE_WHILE_TESTING, hasFeature } from '../features';
import { Icon, Sheet, toast } from './components';

const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Object URL for a stored blob, revoked when the component goes. */
function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** For an ICP adjustment (`adj`), or for a daily check-in (`checkin`: "Include evidence?" on an Issue). */
export function EvidenceSheet({ adj, checkin, onClose, reason }: { adj?: IcpAdjustment; checkin?: { id: string; studentId: string; label: string }; onClose: () => void; reason?: string }) {
  const owner: svc.EvidenceOwner = adj ? { studentId: adj.studentId, adjustmentId: adj.id } : { studentId: checkin!.studentId, checkinId: checkin!.id };
  const prompted = !!reason;
  const [note, setNote] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const f of [...list]) {
        const kind: EvidenceKind = f.type.startsWith('image/') ? 'photo' : f.type.startsWith('audio/') ? 'voice' : 'file';
        const blob = kind === 'photo' ? await compressImage(f) : f;
        const name = kind === 'photo' && blob !== f ? f.name.replace(/\.\w+$/, '') + '.jpg' : f.name;
        await svc.addEvidence(owner, { kind, blob, name });
        setAdded((a) => [...a, `${EVIDENCE_KINDS.find((k) => k.value === kind)!.label}: ${name}`]);
      }
    } finally { setBusy(false); }
  }

  return (
    <Sheet title="Add evidence" onClose={onClose}>
      <div class="row between" style="margin:0 0 4px"><b class="small">{adj ? adj.title : checkin!.label}</b>{FREE_WHILE_TESTING && <span class="badge blue">Pro · free while testing</span>}</div>
      {reason && <p class="small" style="margin:0 0 4px">{reason}</p>}
      {adj?.evidence?.prompt && <p class="small muted" style="margin:0 0 10px">{adj.evidence.prompt}</p>}
      <p class="tiny muted evidence-tip"><Icon name="info" /> Photograph the work, not the student.</p>

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles((e.target as HTMLInputElement).files); (e.target as HTMLInputElement).value = ''; }} />
      <input ref={upload} type="file" multiple hidden onChange={(e) => { addFiles((e.target as HTMLInputElement).files); (e.target as HTMLInputElement).value = ''; }} />

      <div class="grid2 evidence-actions">
        <button class="btn" disabled={busy} onClick={() => upload.current?.click()}><Icon name="upload" /> Upload a file</button>
        <button class="btn" disabled={busy} onClick={() => camera.current?.click()}><Icon name="camera" /> Take a picture</button>
      </div>
      <VoiceRecorder owner={owner} onSaved={(label) => setAdded((a) => [...a, label])} />
      <div class="note-box">
          <div class="note-title">Note</div>
          <textarea class="input" value={note} placeholder="What you saw, e.g. completed all three steps with the checklist" onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
          <button class="btn small" style="margin-top:8px" disabled={!note.trim()} onClick={async () => { await svc.addEvidence(owner, { kind: 'note', text: note }); setAdded((a) => [...a, 'Note']); setNote(''); }}>Save note</button>
      </div>

      {added.length > 0 && (
        <div class="evidence-added pop-in">
          {added.map((x, i) => <div key={i} class="tiny"><Icon name="check" /> {x}</div>)}
        </div>
      )}
      <p class="tiny muted" style="margin-top:12px">Evidence stays on this device. It isn't synced or included in backups.</p>
      <div class="actions">
        {prompted && adj && !added.length && <button class="btn ghost" onClick={async () => { await svc.snoozeEvidence(adj); onClose(); }}>Not today</button>}
        <button class="btn primary" onClick={() => { if (added.length) toast('Evidence saved'); onClose(); }}>{added.length ? 'Done' : 'Close'}</button>
      </div>
    </Sheet>
  );
}

function VoiceRecorder({ owner, onSaved }: { owner: svc.EvidenceOwner; onSaved: (label: string) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const upload = useRef<HTMLInputElement>(null);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);
  useEffect(() => () => rec?.stream.getTracks().forEach((t) => t.stop()), [rec]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        if (blob.size) { await svc.addEvidence(owner, { kind: 'voice', blob, name: 'voice-memo' }); onSaved('Voice memo'); }
      };
      r.start();
      setSecs(0);
      setRec(r);
    } catch {
      toast('Microphone not available. You can upload a recording instead.');
    }
  }

  const fallback = (
    <>
      <input ref={upload} type="file" accept="audio/*" hidden onChange={async (e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) { await svc.addEvidence(owner, { kind: 'voice', blob: f, name: f.name }); onSaved(`Voice memo: ${f.name}`); }
        (e.target as HTMLInputElement).value = '';
      }} />
      <button class="link-btn tiny" onClick={() => upload.current?.click()}>Upload a recording</button>
    </>
  );
  if (!canRecord()) return <div class="voice-row"><Icon name="mic" /><span class="grow small muted">Voice memo</span>{fallback}</div>;
  return (
    <div class={`voice-row ${rec ? 'recording' : ''}`}>
      {rec ? (
        <>
          <span class="rec-dot" aria-hidden="true" />
          <span class="grow small mono">Recording {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
          <button class="btn small primary" onClick={() => { rec.stop(); setRec(null); }}>Stop and save</button>
        </>
      ) : (
        <>
          <button class="btn small" onClick={start}><Icon name="mic" /> Record a voice memo</button>
          <span class="grow" />
          {fallback}
        </>
      )}
    </div>
  );
}

/** Evidence on the student's ICP page: status, gallery and the meeting pack. */
export function EvidenceSection({ adj, items, checks, onAdd }: { adj: IcpAdjustment; items: EvidenceItem[]; checks: IcpCheck[]; onAdd: () => void }) {
  if (!hasFeature('evidence')) return null;
  const st = evidenceDue(adj, items, checks, today());
  const mine = items.filter((i) => i.adjustmentId === adj.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  if (!evidenceOn(adj) && !mine.length) return null;
  return (
    <>
      <div class="divider" />
      <div class="row between">
        <span class="eyebrow">Evidence for learning support</span>
        {evidenceOn(adj) && st.label && <span class={`badge ${st.due ? 'some' : ''}`}>{st.label}</span>}
      </div>
      <div class="evidence-grid">
        {mine.map((e) => <EvidenceTile key={e.id} e={e} />)}
        <button class="evidence-add" onClick={onAdd}><Icon name="plus" /><span>Add</span></button>
      </div>
    </>
  );
}

function EvidenceTile({ e }: { e: EvidenceItem }) {
  const url = useBlobUrl(e.blob);
  const [open, setOpen] = useState(false);
  const label = EVIDENCE_KINDS.find((k) => k.value === e.kind)?.label ?? e.kind;
  return (
    <>
      <button class={`evidence-tile ${e.kind}`} onClick={() => setOpen(true)} aria-label={`${label}, ${formatShort(e.date)}`}>
        {e.kind === 'photo' && url ? <img src={url} alt="" /> : <span class="evidence-ico"><Icon name={e.kind === 'voice' ? 'mic' : e.kind === 'note' ? 'edit' : 'file'} /></span>}
        <span class="evidence-cap">{e.kind === 'note' ? e.text?.slice(0, 40) : formatShort(e.date)}</span>
      </button>
      {open && (
        <Sheet title={`${label} · ${formatShort(e.date)}`} onClose={() => setOpen(false)}>
          {e.kind === 'photo' && url && <img class="evidence-full" src={url} alt="Evidence photo" />}
          {e.kind === 'voice' && url && <audio controls src={url} style="width:100%" />}
          {e.kind === 'file' && <p class="small">{e.name} <span class="muted">· {formatSize(e.size ?? 0)}</span></p>}
          {e.text && <p class="small">{e.text}</p>}
          <div class="actions">
            <button class="btn danger" onClick={async () => { if (confirm('Delete this evidence from the device?')) { await svc.deleteEvidence(e.id); setOpen(false); } }}><Icon name="trash" /></button>
            {e.blob && <button class="btn" onClick={() => saveFile(e.blob!, e.name?.includes('.') ? e.name : `${e.date}-${e.kind}`, 'report')}><Icon name="download" /> Save a copy</button>}
            <button class="btn primary" onClick={() => setOpen(false)}>Close</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

export async function downloadEvidencePack(s: Student, name: string) {
  const pack = await buildEvidencePack(s, name);
  if (!pack.count) return toast('No evidence saved yet');
  await saveFile(pack.blob, pack.name, 'report');
}

/** Small nudge after an ICP answer when evidence is due. */
export function EvidencePrompt({ adj, reason, onAdd, onSkip }: { adj: IcpAdjustment; reason: string; onAdd: () => void; onSkip: () => void }) {
  return (
    <div class="note-box evidence-prompt pop-in">
      <div class="row" style="gap:10px;align-items:flex-start">
        <span class="guide-icon small"><Icon name="camera" /></span>
        <div class="grow">
          <b class="small">Do you want to add evidence?</b>
          <p class="tiny muted" style="margin:2px 0 8px">{reason}{adj.evidence?.prompt ? ` ${adj.evidence.prompt}.` : ''}</p>
          <div class="row">
            <button class="btn small primary" onClick={onAdd}>Add evidence</button>
            <button class="btn small ghost" onClick={async () => { await svc.snoozeEvidence(adj); onSkip(); }}>Not today</button>
          </div>
        </div>
      </div>
    </div>
  );
}
