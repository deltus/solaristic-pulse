// What a relief teacher sees after opening a pass link: sign in with their email, then a simplified
// class page (open/close lesson, daily check-in, homework check, cold call, brain break). Nothing
// else in the app can be reached. The class data lives in its own database on this device and is
// deleted when the pass ends.

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { cloudConfigured, signOut, thisDeviceId, useAccount } from '../cloud';
import { REFUSAL_TEXT, type ReliefBundle } from '../logic/relief';
import { formatDate, today } from '../lib/dates';
import * as svc from '../services';
import { endReliefSession, reliefTick, savedBundle, startReliefSession, unsentCount, type ReliefSession, type StartResult } from '../relief/device';
import { supabaseRelief } from '../relief/server';
import { useLive, useRoute, useSettings } from './hooks';
import { displayName, Icon, ToastHost, toast } from './components';
import { SignIn } from './Account';
import { CheckinScreen } from './screens/Checkin';
import { HomeworkScreen } from './screens/Homework';
import { CloseLessonScreen } from './screens/CloseLesson';
import { ColdCallScreen } from './screens/ColdCall';
import { BrainBreakScreen } from './screens/BrainBreak';
import { SeatsProjector } from './screens/Seating';
import { IncidentForm } from './Incident';

const ALLOWED = new Set([undefined, 'checkin', 'homework', 'coldcall', 'brainbreak', 'close', 'student', 'seats', 'incident']);
const MORE: Record<string, string> = {
  'not-found': 'This pass link isn’t recognised. Ask the class teacher to send it again.',
  'not-signed-in': 'Sign in to use this pass.',
  'broken-link': 'This pass link is incomplete. Open the whole link the class teacher sent, or scan the QR code again.',
  offline: 'You’re offline. Connect to the internet to open the pass the first time.'
};

type Phase = { kind: 'starting' } | { kind: 'refused'; reason: string } | { kind: 'active'; bundle: ReliefBundle } | { kind: 'ended' };

export function ReliefApp({ session }: { session: ReliefSession }) {
  const account = useAccount();
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });

  // Once signed in: open the pass (each open is logged). Offline, carry on with what's on the device.
  useEffect(() => {
    if (account.status !== 'signedIn') return;
    let live = true;
    (async () => {
      const r: StartResult = await startReliefSession(supabaseRelief, session, thisDeviceId());
      if (!live) return;
      if (r.ok) return setPhase({ kind: 'active', bundle: r.bundle });
      if (r.reason === 'offline') {
        const b = await savedBundle();
        if (b) return setPhase({ kind: 'active', bundle: b });
      }
      setPhase({ kind: 'refused', reason: r.reason });
    })();
    return () => { live = false; };
  }, [account.status]);

  // Every minute (and on returning to the app): send entries, and finish when the pass is over.
  useEffect(() => {
    if (phase.kind !== 'active') return;
    const tick = async () => {
      const r = await reliefTick(supabaseRelief, session, thisDeviceId());
      if (r === 'ended') setPhase({ kind: 'ended' });
    };
    void tick();
    const t = setInterval(tick, 60_000);
    const vis = () => { if (!document.hidden) void tick(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', vis); };
  }, [phase.kind]);

  const leave = async () => { await endReliefSession(session.passId); location.hash = '#/'; location.reload(); };

  let body;
  if (!cloudConfigured()) body = <Notice title="Relief pass">Relief passes work in the live app only, not in previews. <button class="btn block" style="margin-top:12px" onClick={leave}>Close</button></Notice>;
  else if (account.status === 'loading' || (account.status === 'signedIn' && phase.kind === 'starting')) body = <Notice title="Opening your relief pass…" />;
  else if (account.status !== 'signedIn') {
    body = (
      <Notice title={`Relief pass${session.className ? ` for ${session.className}` : ''}`}>
        <p class="small">Sign in with your school email to open it. We'll email you a code; no password needed.</p>
        <SignIn defaultEmail="" />
      </Notice>
    );
  } else if (phase.kind === 'refused') {
    body = (
      <Notice title="Can't open this pass">
        <p>{(REFUSAL_TEXT as Record<string, string>)[phase.reason] ?? MORE[phase.reason] ?? phase.reason}</p>
        {phase.reason === 'wrong-email' && <button class="btn block" style="margin-bottom:8px" onClick={async () => { await signOut(); setPhase({ kind: 'starting' }); }}>Sign in with a different email</button>}
        <button class="btn block" onClick={leave}>Close</button>
      </Notice>
    );
  } else if (phase.kind === 'ended') {
    body = <Notice title="This relief pass has ended">Everything you entered has been sent to the class teacher, and the class has been removed from this device. Thank you! <button class="btn primary block" style="margin-top:12px" onClick={() => { location.hash = '#/'; location.reload(); }}>Done</button></Notice>;
  } else if (phase.kind === 'active') body = <ReliefShell b={phase.bundle} />;

  return <div class="shell relief-shell"><div class="content-col"><main class="main">{body}</main></div><ToastHost /></div>;
}

function Notice({ title, children }: { title: string; children?: ComponentChildren }) {
  return <div class="card" style="margin-top:24px"><h2 style="margin-top:0">{title}</h2>{children}</div>;
}

/** Only this class's relief screens; any other address goes back to the class page. */
function ReliefShell({ b }: { b: ReliefBundle }) {
  const [page, id, sub, extra] = useRoute();
  const ok = page === 'class' && id === b.cls.id && ALLOWED.has(sub) && ((sub !== 'student' && sub !== 'incident') || !!extra);
  useEffect(() => { if (!ok) location.hash = `#/class/${b.cls.id}`; }, [ok]);
  if (!ok) return null;
  const banner = <div class="relief-banner"><b>Relief</b>{b.pass.reliefName ? ` · ${b.pass.reliefName}` : ''} · {b.cls.name} · until {formatDate(b.pass.to)}</div>;
  const screen = sub === 'checkin' ? <CheckinScreen classId={id} />
    : sub === 'student' && extra ? <CheckinScreen key={extra} classId={id} studentId={extra} />
    : sub === 'homework' ? <HomeworkScreen classId={id} />
    : sub === 'coldcall' ? <ColdCallScreen classId={id} />
    : sub === 'brainbreak' ? <BrainBreakScreen classId={id} />
    : sub === 'close' ? <CloseLessonScreen classId={id} />
    : sub === 'seats' ? <ReliefSeats b={b} />
    : sub === 'incident' && extra ? <IncidentForm key={extra} classId={id} studentId={extra} />
    : <ReliefHub b={b} />;
  return <>{banner}{screen}</>;
}

/** The class teacher's seating plan, names only (the projector view). */
function ReliefSeats({ b }: { b: ReliefBundle }) {
  const ctx = useLive(() => svc.loadLessonContext(b.cls.id), [b.cls.id]);
  if (!ctx) return null;
  if (!ctx.seatingPlan) return <p class="muted">The class teacher hasn't made a seating plan for this class.</p>;
  return <SeatsProjector plan={ctx.seatingPlan} students={ctx.students} className={b.cls.name} closeHref={`#/class/${b.cls.id}/checkin`} />;
}

/** The simplified class page. */
function ReliefHub({ b }: { b: ReliefBundle }) {
  const settings = useSettings();
  const ctx = useLive(() => svc.loadLessonContext(b.cls.id), [b.cls.id]);
  const unsent = useLive(() => unsentCount(), []);
  if (!ctx || !settings) return null;
  const classId = b.cls.id;
  const lesson = ctx.lesson;
  const seen = lesson ? ctx.checkins.filter((c) => c.lessonId === lesson.id && c.status === 'complete').length : 0;
  return (
    <div>
      <span class="eyebrow">{formatDate(today())}</span>
      <h1 class="home-title">{b.cls.name}</h1>
      {b.pass.plan && <div class="card flat"><span class="eyebrow">Today's plan</span><div class="small">{b.pass.plan}</div></div>}
      {b.homeworkLastLesson && <div class="card flat"><span class="eyebrow">Homework set last lesson</span><div class="small">{b.homeworkLastLesson}</div></div>}
      {!lesson ? (
        <button class="btn primary big block" style="margin:12px 0" onClick={async () => { await svc.openLesson(classId); toast('Lesson open'); }}><Icon name="check" /> Open lesson</button>
      ) : (
        <>
          <p class="muted small" style="margin:8px 0 12px">Lesson open · {seen} checked in{unsent ? ` · ${unsent} waiting to send` : ''}</p>
          <div class="hub-grid">
            <a class="hub-btn primary" href={`#/class/${classId}/checkin`}><Icon name="today" /><b>Daily check-in</b><span>The class teacher's order</span></a>
            <a class="hub-btn" href={`#/class/${classId}/homework`}><Icon name="reports" /><b>Homework check</b><span>{b.homeworkLastLesson ?? 'No homework was set'}</span></a>
            <a class="hub-btn" href={`#/class/${classId}/coldcall`}><Icon name="user" /><b>Cold call</b><span>Pick a student fairly</span></a>
            <a class="hub-btn" href={`#/class/${classId}/close`}><Icon name="check" /><b>Close lesson</b><span>At the end of the lesson</span></a>
          </div>
          <a class="hub-btn wide bb-btn" href={`#/class/${classId}/brainbreak`}><Icon name="bolt" /><b>Brain break</b><span>A quick subject game or a calm reset</span></a>
        </>
      )}
      <div class="section"><h3>Class ({b.students.length})</h3></div>
      <div class="list">
        {b.queue.map((sid) => b.students.find((s) => s.id === sid)).filter((s): s is NonNullable<typeof s> => !!s).map((s) => (
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
