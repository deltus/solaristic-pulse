// Relief passes (class teacher's side): create, send (QR code, link, email), list, cancel, see the
// use log, and preview exactly what the relief teacher gets. Plus the "Relief entries to review"
// card for Home. Sending needs the teacher to be signed in (passes go through the account server).

import { useEffect, useState } from 'preact/hooks';
import { db } from '../db';
import type { ReliefPass } from '../types';
import * as svc from '../services';
import { AUTO_ACCEPT_DAYS, MAX_SCHOOL_DAYS, passStatus, reliefEntries, reliefLink, reliefToReview, type ReliefBundle, type ReliefEntry, type PassStatus } from '../logic/relief';
import { summarise, summaryText } from '../logic/checkin';
import { openLessonFor } from '../logic/lessons';
import { formatDate, formatShort, today } from '../lib/dates';
import { appUrl, useAccount } from '../cloud';
import { mailtoLink, shareText } from '../platform';
import { canSendPasses, cancelPass, runReliefOwner, sendPass } from '../relief/owner';
import { CopyLink, QrCode } from './Account';
import { useLive, useTick } from './hooks';
import { displayName, Empty, Field, Icon, Sheet, toast } from './components';

const STATUS: Record<PassStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'ok' }, upcoming: { label: 'Upcoming', cls: 'blue' }, expired: { label: 'Ended', cls: '' }, cancelled: { label: 'Cancelled', cls: 'some' }
};
const dates = (p: Pick<ReliefPass, 'from' | 'to'>) => (p.from === p.to ? formatDate(p.from) : `${formatShort(p.from)} – ${formatShort(p.to)}`);

/** Manage class → Relief: passes for this class. */
export function ReliefPanel({ classId }: { classId: string }) {
  useTick(60_000);
  const account = useAccount();
  const passes = useLive(() => db.reliefPasses.where('classId').equals(classId).toArray(), [classId]);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<ReliefPass | null>(null);
  const [sending, setSending] = useState<ReliefPass | null>(null);
  // Fresh use log and any relief entries when the tab opens.
  useEffect(() => { void runReliefOwner(); }, [account.status]);
  if (!passes) return null;
  const now = Date.now();
  const canSend = canSendPasses();
  const sorted = [...passes].sort((a, b) => b.createdAt - a.createdAt);
  const current = sorted.filter((p) => ['active', 'upcoming'].includes(passStatus(p, now)));
  const past = sorted.filter((p) => !current.includes(p));
  async function send(p: ReliefPass) {
    try {
      setSending(await sendPass(p.id));
    } catch (e) {
      toast(`Couldn't send the pass: ${(e as Error).message}`);
    }
  }
  const row = (p: ReliefPass) => {
    const st = passStatus(p, now);
    const last = p.uses?.length ? p.uses[p.uses.length - 1] : undefined;
    return (
      <div key={p.id} class="card relief-pass">
        <div class="row between"><b>{p.reliefName || 'Relief teacher'}</b><span class={`badge ${STATUS[st].cls}`}>{STATUS[st].label}</span></div>
        <div class="small">{dates(p)}{p.reliefEmail ? ` · ${p.reliefEmail}` : ''}</div>
        <div class="tiny muted">{p.shareIcp ? 'ICP adjustments shared' : 'ICP marker only'} · {last ? `Last used ${new Date(last.at).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : p.sentAt ? 'Sent, not used yet' : 'Not sent yet'}</div>
        {!!p.uses?.length && (
          <details class="tiny"><summary>Use log ({p.uses.length})</summary>{p.uses.map((u, i) => <div key={i}>{new Date(u.at).toLocaleString('en-AU')} · {u.email ?? 'unknown email'} · device {u.device.slice(0, 8)}</div>)}</details>
        )}
        <div class="row wrap" style="gap:6px;margin-top:8px">
          {(st === 'active' || st === 'upcoming') && canSend && <button class="btn small primary" onClick={() => send(p)}><Icon name="qr" /> Send</button>}
          <button class="btn small" onClick={() => setPreview(p)}><Icon name="search" /> What they'll see</button>
          {(st === 'active' || st === 'upcoming') && <button class="btn small danger" onClick={async () => {
            if (!confirm('Cancel this relief pass? It stops working straight away.')) return;
            try { await cancelPass(p.id); toast('Pass cancelled'); } catch { toast('Cancelled here. Connect to the internet so it stops on their device too.'); }
          }}><Icon name="x" /> Cancel pass</button>}
        </div>
      </div>
    );
  };
  return (
    <div>
      {!canSend && <div class="notice small" style="margin-bottom:12px">To send a relief pass, sign in first: Settings → <a href="#/settings/account">Account &amp; devices</a>. You can still prepare a pass and preview it.</div>}
      <button class="btn primary small" style="margin-bottom:12px" onClick={() => setCreating(true)}><Icon name="plus" /> Relief pass</button>
      <div class="section"><h3>Active and upcoming</h3></div>
      {current.length ? current.map(row) : <div class="card"><Empty icon="user">No relief passes.</Empty></div>}
      {past.length > 0 && <><div class="section"><h3>Past</h3></div>{past.map(row)}</>}
      {creating && <ReliefPassForm classId={classId} onClose={(p) => { setCreating(false); if (p) (canSend ? send(p) : setPreview(p)); }} />}
      {preview && <ReliefPreviewSheet pass={preview} onClose={() => setPreview(null)} />}
      {sending && <SendPassSheet pass={sending} onClose={() => setSending(null)} />}
    </div>
  );
}

/** QR code, copy link, email and share for a pass. The key is only in the link. */
function SendPassSheet({ pass, onClose }: { pass: ReliefPass; onClose: () => void }) {
  const cls = useLive(() => db.classes.get(pass.classId), [pass.classId]);
  const link = reliefLink(appUrl(), pass.id, pass.key!);
  const name = cls?.name ?? 'my class';
  const subject = `Relief pass for ${name}`;
  const body = `Hi${pass.reliefName ? ` ${pass.reliefName}` : ''},\n\nHere's your Solaristic Radar relief pass for ${name} (${dates(pass)}). Open this link on the phone or laptop you'll use, then sign in with ${pass.reliefEmail ? pass.reliefEmail : 'your school email'}:\n\n${link}\n\nIt works on one device only and stops at the end of ${formatDate(pass.to)}.`;
  return (
    <Sheet title="Send relief pass" onClose={onClose}>
      <p class="small">Scan this on the relief teacher's phone, or send them the link. It works on <b>one device</b>, until the end of <b>{formatDate(pass.to)}</b>{pass.reliefEmail ? <>, for <b>{pass.reliefEmail}</b> only</> : ''}.</p>
      <QrCode text={link} filename="relief-pass-qr.png" />
      <CopyLink link={link} />
      <div class="row wrap" style="gap:8px;margin-top:10px">
        <a class="btn primary" href={mailtoLink(pass.reliefEmail ?? '', subject, body)}><Icon name="mail" /> Email</a>
        <button class="btn" onClick={() => shareText(subject, body, link)}><Icon name="arrow" /> Share</button>
      </div>
      <p class="tiny muted" style="margin-top:10px">Anyone with this link who can sign in{pass.reliefEmail ? ' with that email' : ''} can open the pass, so only send it to the relief teacher.</p>
    </Sheet>
  );
}

function ReliefPassForm({ classId, onClose }: { classId: string; onClose: (p?: ReliefPass) => void }) {
  const lessons = useLive(() => db.lessons.where('classId').equals(classId).toArray(), [classId]);
  const [f, setF] = useState<{ from: string; to: string; name: string; email: string; shareIcp: boolean; plan: string | null }>({ from: today(), to: '', name: '', email: '', shareIcp: false, plan: null });
  const [err, setErr] = useState('');
  if (!lessons) return null;
  // Pre-filled with the current lesson's learning intention, if there is one.
  const plan = f.plan ?? openLessonFor(lessons, classId)?.intention ?? '';
  const set = (k: 'from' | 'to' | 'name' | 'email') => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  async function save() {
    try {
      const p = await svc.createReliefPass({ classId, from: f.from, to: f.to || f.from, reliefName: f.name, reliefEmail: f.email, shareIcp: f.shareIcp, plan });
      toast('Relief pass prepared');
      onClose(p);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <Sheet title="Relief pass" onClose={() => onClose()}>
      <div class="grid2">
        <Field label="First day"><input class="input" type="date" value={f.from} min={today()} onInput={set('from')} /></Field>
        <Field label="Last day (optional)" hint={`Up to ${MAX_SCHOOL_DAYS} school days.`}><input class="input" type="date" value={f.to} min={f.from} onInput={set('to')} /></Field>
      </div>
      <Field label="Relief teacher's name (optional)"><input class="input" value={f.name} onInput={set('name')} /></Field>
      <Field label="School email (optional)" hint="If you add it, the pass only works for this email."><input class="input" type="email" value={f.email} onInput={set('email')} /></Field>
      <label class="check"><input type="checkbox" checked={f.shareIcp} onChange={(e) => setF({ ...f, shareIcp: (e.target as HTMLInputElement).checked })} /><span>Share ICP adjustments (titles and short instructions). Off: they only see an ICP marker and "Ask the school for details".</span></label>
      <Field label="Today's plan (optional)"><textarea class="input" value={plan} onInput={(e) => setF({ ...f, plan: (e.target as HTMLTextAreaElement).value })} /></Field>
      {err && <p class="small" style="color:var(--sig)">{err}</p>}
      <div class="actions"><button class="btn" onClick={() => onClose()}>Cancel</button><button class="btn primary" onClick={save}>Prepare pass</button></div>
    </Sheet>
  );
}

function ReliefPreviewSheet({ pass, onClose }: { pass: ReliefPass; onClose: () => void }) {
  const bundle = useLive(() => svc.reliefBundleFor(pass.id), [pass.id]);
  return (
    <Sheet title="What the relief teacher sees" onClose={onClose}>
      <p class="tiny muted" style="margin-top:-4px">A preview built from exactly the data their device would receive. Buttons are inactive here.</p>
      {bundle ? <ReliefClassPage b={bundle} preview /> : null}
    </Sheet>
  );
}

/** The relief teacher's simplified class page, drawn only from the bundle. */
export function ReliefClassPage({ b, preview }: { b: ReliefBundle; preview?: boolean }) {
  const byId = new Map(b.students.map((s) => [s.id, s]));
  const ordered = b.queue.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
  const btn = (icon: string, label: string) => <button class="hub-btn" disabled={preview}><Icon name={icon} /><b>{label}</b></button>;
  return (
    <div class="relief-page">
      <div class="relief-banner"><b>Relief</b>{b.pass.reliefName ? ` · ${b.pass.reliefName}` : ''} · {b.cls.name} · until {formatDate(b.pass.to)}</div>
      {b.pass.plan && <div class="card flat"><span class="eyebrow">Today's plan</span><div class="small">{b.pass.plan}</div></div>}
      {b.homeworkLastLesson && <div class="card flat"><span class="eyebrow">Homework set last lesson</span><div class="small">{b.homeworkLastLesson}</div></div>}
      <div class="hub-grid">
        {btn('check', 'Open / close lesson')}{btn('today', 'Daily check-in')}{btn('reports', 'Homework check')}{btn('user', 'Cold call')}
      </div>
      <button class="hub-btn wide bb-btn" disabled={preview}><Icon name="bolt" /><b>Brain break</b></button>
      <div class="section"><h3>Class ({ordered.length})</h3><span class="tiny muted">check-in order</span></div>
      <div class="list">
        {ordered.map((s) => (
          <div key={s.id} class="list-item relief-student">
            <span class="grow">
              <span class="title">{displayName(s)} {s.flagged && <Icon name="flag" class="flag" />}{s.icp && <span class="icp-mark">ICP</span>}</span>
              {s.icp && (s.adjustments ? s.adjustments.map((a, i) => <div key={i} class="tiny">{a.title}{a.details ? `: ${a.details}` : ''}</div>) : <div class="tiny muted">Ask the school for details</div>)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Home: relief entries waiting for the class teacher (accepted automatically after 7 days). */
export function ReliefReviewCard() {
  const data = useLive(async () => {
    const [checkins, homework, coldCalls, brainBreaks, assessmentChecks, observations, tags, students] = await Promise.all([
      db.checkins.filter((c) => !!c.relief).toArray(), db.homework.filter((h) => !!h.relief).toArray(), db.coldCalls.filter((c) => !!c.relief).toArray(),
      db.brainBreaks.filter((b) => !!b.relief).toArray(), db.assessmentChecks.filter((a) => !!a.relief).toArray(), db.observations.toArray(), db.issueTags.toArray(), db.students.toArray()
    ]);
    return { entries: reliefEntries({ checkins, homework, coldCalls, brainBreaks, assessmentChecks }, { checkin: (c) => `Check-in: ${summaryText(summarise(c, observations, tags))}` }), students };
  }, []);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const pending = reliefToReview(data.entries, Date.now());
  if (!pending.length) return null;
  const who = [...new Set(pending.map((e) => e.relief.name))].join(', ');
  const name = (id?: string) => { const s = data.students.find((x) => x.id === id); return s ? displayName(s) : ''; };
  return (
    <div class="card relief-review">
      <div class="row between"><b>Relief entries to review</b><span class="badge blue">{pending.length}</span></div>
      <p class="small" style="margin:4px 0 8px">From {who}. They're kept unless you remove them, and accepted automatically after {AUTO_ACCEPT_DAYS} days.</p>
      {open && (
        <div class="list" style="margin-bottom:8px">
          {pending.map((e: ReliefEntry) => (
            <div key={`${e.kind}-${e.id}`} class="list-item">
              <span class="grow"><span class="title">{name(e.studentId) || e.text}</span><div class="sub">{formatShort(e.date)} · {name(e.studentId) ? e.text : ''} · Relief: {e.relief.name}</div></span>
              <button class="icon-btn" aria-label="Remove this entry" onClick={async () => { if (confirm('Remove this relief entry?')) await svc.removeReliefEntry(e); }}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}
      <div class="row" style="gap:8px">
        <button class="btn primary small" onClick={async () => { await svc.acceptReliefEntries(pending); toast('Relief entries accepted'); }}><Icon name="check" /> Accept all</button>
        <button class="btn small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Review'}</button>
      </div>
    </div>
  );
}
