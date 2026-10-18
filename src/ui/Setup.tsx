// First-time setup: sign in (name + email), a short guide, then the teacher's first class,
// students and lesson times. After this the app is free to use however they like.

import { useState } from 'preact/hooks';
import { saveSettings } from '../db';
import * as svc from '../services';
import { loadDemoData } from '../demo';
import { parseRoster } from '../logic/importers';
import { pickFile, readSpreadsheet, requestPersistentStorage } from '../platform';
import { Field, Icon, toast } from './components';
import { PinSetup, PrivacyNotice } from './Onboarding';
import { ReminderPrompt } from './ReminderPrompt';
import { InviteWelcome, SignIn } from './Account';
import { cloudConfigured, suggestedEmail, useAccount } from '../cloud';

const GUIDE = [
  { icon: 'today', title: 'A few students each lesson', text: 'Pulse picks about five students per class each day and asks a few quick questions about each.' },
  { icon: 'check', title: 'Tap and move on', text: 'Tap an answer and it saves straight away. Press and hold an answer to add a note.' },
  { icon: 'flag', title: 'Nobody gets missed', text: 'Students with recent difficulties come up more often, and everyone is checked regularly.' },
  { icon: 'clock', title: 'It remembers for you', text: 'Earlier concerns come back as follow-ups, and trends build up over time.' },
  { icon: 'shield', title: 'Private by design', text: 'Student records stay on this device. An account is optional, only to use Pulse on more than one device.' }
];
const STEPS = ['Sign in', 'How it works', 'Your class', 'Students', 'Lessons', 'Reminders', 'PIN', 'Ready'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** Parses pasted names: one per line, "First Last", "Last, First" or tab-separated columns. */
export function parseNameLines(text: string): { firstName: string; lastName: string }[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    if (l.includes('\t')) {
      const [f, ...r] = l.split('\t').map((x) => x.trim());
      return { firstName: f, lastName: r.join(' ') };
    }
    if (l.includes(',')) {
      const [last, first] = l.split(',').map((x) => x.trim());
      return first ? { firstName: first, lastName: last } : { firstName: last, lastName: '' };
    }
    const parts = l.split(/\s+/);
    return parts.length > 1 ? { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] } : { firstName: parts[0], lastName: '' };
  }).filter((n) => n.firstName);
}

export function Setup() {
  const [step, setStep] = useState(0);
  const [slide, setSlide] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profile, setProfile] = useState({ name: '', email: suggestedEmail() ?? '', school: '' });
  const [cls, setCls] = useState({ name: '', yearLevel: '' });
  const [classId, setClassId] = useState<string | null>(null);
  const [names, setNames] = useState('');
  const [added, setAdded] = useState(0);
  const [lesson, setLesson] = useState({ days: [] as number[], start: '09:00', end: '10:00', room: '' });
  const [lessons, setLessons] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = parseNameLines(names);
  const first = profile.name.trim().split(/\s+/)[0];

  const go = (n: number) => { setErr(''); setStep(n); window.scrollTo(0, 0); };

  async function signIn() {
    if (!profile.name.trim()) return setErr('Enter your name.');
    if (profile.email.trim() && !/^\S+@\S+\.\S+$/.test(profile.email.trim())) return setErr('Check the email address.');
    if (!accepted) return setErr('Tick the box to confirm you have read the privacy notice.');
    await saveSettings({ profile: { name: profile.name.trim(), email: profile.email.trim(), school: profile.school.trim() }, privacyAcceptedAt: Date.now() });
    go(1);
  }
  async function saveClass() {
    if (!cls.name.trim()) return setErr('Give your class a name.');
    if (classId) await svc.updateClass(classId, { name: cls.name.trim(), yearLevel: cls.yearLevel.trim() || undefined });
    else setClassId((await svc.createClass({ name: cls.name, yearLevel: cls.yearLevel })).id);
    go(3);
  }
  async function saveStudents() {
    if (!classId) return;
    setBusy(true);
    for (const n of parsed) await svc.addStudent(classId, n);
    setBusy(false);
    setAdded(added + parsed.length);
    setNames('');
    go(4);
  }
  async function importFile() {
    const file = await pickFile('.csv,.xlsx,.xls,text/csv');
    if (!file || !classId) return;
    try {
      const r = parseRoster(await readSpreadsheet(file));
      if (!r.rows.length) return setErr(r.errors[0] ?? 'No students found in that file.');
      const res = await svc.importRoster(r.rows.map((x) => ({ ...x, className: undefined })), classId);
      setAdded(added + res.added);
      toast(`Imported ${res.added} students`);
    } catch (e) {
      setErr(`Could not read the file: ${(e as Error).message}`);
    }
  }
  async function saveLessons() {
    if (!classId) return;
    if (lesson.days.length && lesson.end <= lesson.start) return setErr('The finish time must be after the start time.');
    for (const d of lesson.days) {
      await svc.saveTimetableEntry({ classId, day: d, start: lesson.start, end: lesson.end, room: lesson.room.trim() || undefined });
    }
    const total = lessons + lesson.days.length;
    setLessons(total);
    setLesson({ ...lesson, days: [] });
    go(total ? 5 : 6);
  }
  async function finish(demo: boolean) {
    setBusy(true);
    if (demo) await loadDemoData();
    await requestPersistentStorage();
    await saveSettings({ onboarded: true, tutorialDone: false, ...(classId && !demo ? { currentClassId: classId } : {}) });
    location.hash = '#/today';
  }
  const back = (n: number) => <button class="btn" onClick={() => go(n)}><Icon name="back" /> Back</button>;
  const error = err && <p class="small" style="color:var(--sig)">{err}</p>;

  return (
    <div class="onboard">
      <div class="segbar" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((_, i) => <i key={i} class={i <= step ? 'on' : ''} />)}</div>
      <span class="eyebrow" style="margin-top:14px">{STEPS[step]}</span>

      {step === 0 && (
        <>
          <img class="hero-mark" src="icons/icon-192.png" alt="" style="margin:8px 0 14px" />
          <h1>Welcome to Solaristic Pulse</h1>
          <p class="muted" style="margin:8px 0 18px">Setup takes about two minutes.</p>
          <InviteWelcome />
          <SetupSignIn email={profile.email} />
          <Field label="Your name"><input class="input" value={profile.name} autoComplete="name" placeholder="Alex Morgan" onInput={(e) => setProfile({ ...profile, name: (e.target as HTMLInputElement).value })} /></Field>
          <Field label="Email address" hint="Pre-fills emails when you share a report. Nothing is sent anywhere.">
            <input class="input" type="email" autoComplete="email" placeholder="name@school.edu.au" value={profile.email} onInput={(e) => setProfile({ ...profile, email: (e.target as HTMLInputElement).value })} />
          </Field>
          <Field label="School (optional)"><input class="input" value={profile.school} onInput={(e) => setProfile({ ...profile, school: (e.target as HTMLInputElement).value })} /></Field>
          <label class="check">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted((e.target as HTMLInputElement).checked)} />
            <span>I've read the privacy notice and will check my school's policies before using real student records.</span>
          </label>
          <button class="link-btn" style="padding:0 0 8px 30px;color:var(--blue)" onClick={() => setShowPrivacy(!showPrivacy)}>{showPrivacy ? 'Hide privacy notice' : 'Read the privacy notice'}</button>
          {showPrivacy && <div class="card flat"><PrivacyNotice /></div>}
          {error}
          <button class="btn primary block" style="margin-top:12px" onClick={signIn}>Continue <Icon name="arrow" /></button>
        </>
      )}

      {step === 1 && (
        <>
          <div class="guide-card">
            <div class="guide-icon"><Icon name={GUIDE[slide].icon} /></div>
            <h1>{GUIDE[slide].title}</h1>
            <p class="muted">{GUIDE[slide].text}</p>
          </div>
          <div class="guide-dots" aria-hidden="true">{GUIDE.map((_, i) => <i key={i} class={i === slide ? 'on' : ''} />)}</div>
          <div class="grid2">
            <button class="btn" onClick={() => (slide ? setSlide(slide - 1) : go(0))}><Icon name="back" /> Back</button>
            <button class="btn primary" onClick={() => (slide < GUIDE.length - 1 ? setSlide(slide + 1) : go(2))}>{slide < GUIDE.length - 1 ? 'Next' : 'Set up my class'}</button>
          </div>
          <button class="link-btn" style="display:block;margin:14px auto 0" onClick={() => go(2)}>Skip the guide</button>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Add your first class</h1>
          <p class="muted" style="margin:8px 0 18px">You can add more classes later.</p>
          <Field label="Class name"><input class="input" value={cls.name} placeholder="9C Science" onInput={(e) => setCls({ ...cls, name: (e.target as HTMLInputElement).value })} /></Field>
          <Field label="Year level (optional)"><input class="input" value={cls.yearLevel} placeholder="Year 9" onInput={(e) => setCls({ ...cls, yearLevel: (e.target as HTMLInputElement).value })} /></Field>
          {error}
          <div class="grid2">{back(1)}<button class="btn primary" onClick={saveClass}>Continue</button></div>
          <div class="divider" />
          <p class="small muted">Just looking around first?</p>
          <button class="btn block" disabled={busy} onClick={() => finish(true)}>Explore with fictional demo data</button>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Add students to {cls.name}</h1>
          <p class="muted" style="margin:8px 0 18px">One name per line. You can paste a column straight from a spreadsheet.</p>
          <textarea class="input" style="min-height:180px" value={names} placeholder={'Ethan Taylor\nMia Nguyen\nTaylor, Sam'} onInput={(e) => setNames((e.target as HTMLTextAreaElement).value)} />
          <div class="row between" style="margin:8px 0 14px">
            <span class="small muted">{parsed.length ? `${parsed.length} ready to add` : added ? `${added} added` : 'No names yet'}</span>
            <button class="btn small" onClick={importFile}><Icon name="upload" /> Import a file</button>
          </div>
          {error}
          <div class="grid2">{back(2)}<button class="btn primary" disabled={busy} onClick={saveStudents}>{parsed.length ? `Add ${parsed.length}` : added ? 'Continue' : 'Skip for now'}</button></div>
        </>
      )}

      {step === 4 && (
        <>
          <h1>When do you teach {cls.name}?</h1>
          <p class="muted" style="margin:8px 0 18px">Pulse opens the right class during a lesson and reminds you to check in.</p>
          <span class="eyebrow">Days</span>
          <div class="chips" style="margin-bottom:14px">
            {WEEKDAYS.map((d, i) => (
              <button key={d} class={`chip ${lesson.days.includes(i + 1) ? 'active' : ''}`} onClick={() => setLesson({ ...lesson, days: lesson.days.includes(i + 1) ? lesson.days.filter((x) => x !== i + 1) : [...lesson.days, i + 1] })}>{d}</button>
            ))}
          </div>
          <div class="grid2">
            <Field label="Start"><input class="input" type="time" value={lesson.start} onInput={(e) => setLesson({ ...lesson, start: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Finish"><input class="input" type="time" value={lesson.end} onInput={(e) => setLesson({ ...lesson, end: (e.target as HTMLInputElement).value })} /></Field>
          </div>
          <Field label="Room (optional)"><input class="input" value={lesson.room} onInput={(e) => setLesson({ ...lesson, room: (e.target as HTMLInputElement).value })} /></Field>
          <p class="tiny muted">Different times on different days? Add the rest later in Settings → Timetable, or import your whole timetable.</p>
          {error}
          <div class="grid2">{back(3)}<button class="btn primary" onClick={saveLessons}>{lesson.days.length ? 'Save lessons' : 'Skip for now'}</button></div>
        </>
      )}

      {step === 5 && (
        <>
          <div class="guide-icon" style="margin:6px 0 14px"><Icon name="bell" /></div>
          <h1>Get a reminder before each class</h1>
          <p class="muted" style="margin:8px 0 18px">A nudge 5 minutes before {cls.name || 'class'} starts, showing who to check in with and any ICP adjustments. You can change this any time in Settings.</p>
          <ReminderPrompt onDone={() => setTimeout(() => go(6), 600)} />
          <button class="link-btn" style="display:block;margin:14px auto 0" onClick={() => go(6)}>Not now</button>
        </>
      )}

      {step === 6 && (
        <>
          <h1>Lock with a PIN?</h1>
          <p class="muted" style="margin:8px 0 18px">Asked when the app opens. It stops casual access but doesn't encrypt your data.</p>
          <PinSetup onDone={() => go(7)} onSkip={() => go(7)} />
        </>
      )}

      {step === 7 && (
        <div style="text-align:center;padding-top:20px">
          <div class="guide-icon" style="margin:0 auto 14px"><Icon name="check" /></div>
          <h1>You're ready{first ? `, ${first}` : ''}</h1>
          <p class="muted" style="margin:10px 0 22px">{cls.name}{added ? ` · ${added} students` : ''}{lessons ? ` · ${lessons} lessons a week` : ''}</p>
          <button class="btn primary block" disabled={busy} onClick={() => finish(false)}>Start using Pulse</button>
          <p class="tiny muted" style="margin-top:14px">A quick tour will show you where everything is.</p>
        </div>
      )}
    </div>
  );
}

/** "Already use Pulse on another device?": optional sign-in on the first screen (opened automatically from an "Add a device" QR code). */
function SetupSignIn({ email }: { email: string }) {
  const acc = useAccount();
  const [open, setOpen] = useState(!!suggestedEmail());
  if (!cloudConfigured() || acc.status === 'loading') return null;
  if (acc.status === 'signedIn') return <div class="notice info small">Signed in as <b>{acc.user.email}</b>. Finish setting up this device below.</div>;
  if (!open) return <button class="link-btn" style="padding:0 0 14px;color:var(--blue)" onClick={() => setOpen(true)}>Already use Pulse on another device? Sign in</button>;
  return <div style="margin-bottom:14px"><SignIn defaultEmail={suggestedEmail() ?? email} /></div>;
}
