import { useEffect, useRef, useState } from 'preact/hooks';
import { useRoute, useSettings, useLive, useTick } from './hooks';
import { Icon, Sheet, ToastHost, toastMarkedPresent } from './components';
import { MARKED_PRESENT_EVENT } from '../services';
import { ThumbsScreen, TicketScreen, YesNoScreen } from './screens/Cfu';
import { LockScreen } from './Lock';
import { Setup } from './Setup';
import { Tour } from './Tour';
import { ClassHub, TodayScreen } from './screens/Today';
import { CheckinScreen, SelectStudentScreen } from './screens/Checkin';
import { HomeworkScreen } from './screens/Homework';
import { CloseLessonScreen } from './screens/CloseLesson';
import { ColdCallScreen } from './screens/ColdCall';
import { AssessmentCheckScreen } from './screens/Assessment';
import { BrainBreakScreen } from './screens/BrainBreak';
import { TeachingScreen } from './screens/Teaching';
import { SeatingScreen } from './screens/Seating';
import { lessonsToClose, lessonName } from '../logic/lessons';
import { HomeScreen } from './screens/Home';
import { BlitzScreen } from './screens/Blitz';
import { CheckoutScreen } from './screens/Checkout';
import { ClassesScreen, ClassDetail } from './screens/Classes';
import { StudentsScreen, StudentProfile } from './screens/Students';
import { IcpScreen } from './screens/Icp';
import { ReportsScreen } from './screens/Reports';
import { SettingsScreen } from './screens/Settings';
import { useReminders, type ReminderState } from './reminders';
import { IncidentForm, IncidentView } from './Incident';
import { CloseDayScreen } from './CloseDay';
import { BrainDumpScreen } from './BrainDump';
import { db, saveSettings } from '../db';
import { FileSavedHost } from './Files';
import { openFile } from '../files';
import { isNative } from '../platform';
import { useSyncStatus } from '../sync/engine';
import { SyncAttentionBanner, syncLine } from './Sync';
import { useAccount } from '../cloud';
import { today, dayOffset, setDayOffset, DAY_CHANGE_EVENT, formatShort, nowMs } from '../lib/dates';

export const NAV = [
  { path: 'home', label: 'Today', icon: 'today' },
  { path: 'classes', label: 'Classes', icon: 'classes' },
  { path: 'students', label: 'Students', icon: 'students' },
  { path: 'blitz', label: 'Blitz', icon: 'bolt' },
  { path: 'icp', label: 'ICP Check-In', icon: 'icp' },
  { path: 'reports', label: 'Reports', icon: 'reports' },
  { path: 'teaching', label: 'My teaching', icon: 'edit' },
  { path: 'settings', label: 'Settings', icon: 'settings' }
];

const wide = () => window.matchMedia('(min-width: 960px)').matches;

export function App() {
  const settings = useSettings();
  const route = useRoute();
  const [locked, setLocked] = useState<boolean | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [picker, setPicker] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const online = useOnline();
  useDayOffset();
  const reminder = useReminders(settings);
  const drawerRef = useRef<HTMLElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  useEdgeSwipe(drawer, setDrawer, drawerRef, shadeRef);
  useNotificationTaps();

  useEffect(() => {
    if (settings && locked === null) setLocked(!!settings.pin);
  }, [settings, locked]);
  useEffect(() => {
    const on = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (settings?.pin && hiddenAt.current && Date.now() - hiddenAt.current > settings.lockAfterMin * 60_000) setLocked(true);
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [settings]);
  useEffect(() => setDrawer(false), [route.join('/')]);
  // Entering something for a student marked absent today clears it: say so.
  useEffect(() => {
    window.addEventListener(MARKED_PRESENT_EVENT, toastMarkedPresent);
    return () => window.removeEventListener(MARKED_PRESENT_EVENT, toastMarkedPresent);
  }, []);

  const icpDue = useLive(async () => {
    const adjs = await db.icpAdjustments.filter((a) => a.active).count();
    return adjs > 0 && (await db.icpChecks.where('date').equals(today()).count()) < adjs;
  }, []);
  const classes = useLive(() => db.classes.toArray().then((cs) => cs.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name))), []);

  if (!settings || locked === null) return null;
  if (locked && settings.pin) return <LockScreen pin={settings.pin} name={settings.profile.name} onUnlock={() => setLocked(false)} />;
  if (!settings.onboarded) return <Setup />;

  const [page = 'home', id, sub, extra, more] = route;
  const currentClass = classes?.find((c) => c.id === (page === 'class' && id ? id : settings.currentClassId)) ?? classes?.[0];
  let screen;
  switch (page) {
    case 'classes': screen = id && sub === 'blitz' ? <BlitzScreen classId={id} fromClassPage /> : id ? <ClassDetail id={id} tab={sub} /> : <ClassesScreen />; break;
    case 'students': screen = id ? <StudentProfile id={id} /> : <StudentsScreen />; break;
    case 'icp': screen = id === 'class' && sub ? <IcpScreen key={`class-${sub}`} classFilter={sub} /> : <IcpScreen studentId={id} mode={sub} />; break;
    case 'reports': screen = <ReportsScreen studentId={id} />; break;
    case 'settings': screen = <SettingsScreen section={id} sub={sub} />; break;
    case 'today': screen = <TodayScreen reminder={reminder} />; break;
    case 'class':
      screen = !id ? <TodayScreen reminder={reminder} />
        : sub === 'checkin' ? <CheckinScreen classId={id} />
        : sub === 'student' && extra ? <CheckinScreen key={extra} classId={id} studentId={extra} />
        : sub === 'homework' ? <HomeworkScreen key={extra ?? ''} classId={id} anyway={extra === 'anyway'} />
        : sub === 'close' ? <CloseLessonScreen classId={id} />
        : sub === 'coldcall' ? <ColdCallScreen classId={id} />
        : sub === 'cfu' && extra === 'thumbs' ? <ThumbsScreen classId={id} />
        : sub === 'cfu' && extra === 'yesno' ? <YesNoScreen classId={id} />
        : sub === 'cfu' && extra === 'ticket' ? <TicketScreen key={more ?? ''} classId={id} fromClose={more === 'close'} />
        : sub === 'assessment' ? <AssessmentCheckScreen key={extra ?? ''} classId={id} assessmentId={extra} />
        : sub === 'brainbreak' ? <BrainBreakScreen classId={id} />
        : sub === 'select' ? <SelectStudentScreen classId={id} />
        : sub === 'seating' ? <SeatingScreen classId={id} tab={extra} focus={more} />
        : sub === 'incident' && extra ? <IncidentForm key={extra} classId={id} studentId={extra} />
        : <ClassHub classId={id} reminder={reminder} />;
      break;
    case 'blitz': screen = <BlitzScreen classId={id} />; break;
    case 'teaching': screen = <TeachingScreen />; break;
    case 'incident': screen = id ? <IncidentView id={id} /> : <HomeScreen reminder={reminder} />; break;
    case 'closeday': screen = <CloseDayScreen key={id ?? ''} date={id} />; break;
    case 'braindump': screen = <BrainDumpScreen key={id ?? ''} classId={id} />; break;
    case 'checkout': screen = id ? <CheckoutScreen classId={id} timetableId={sub} /> : <HomeScreen reminder={reminder} />; break;
    default: screen = <HomeScreen reminder={reminder} />;
  }
  const isToday = page === 'today' || page === 'class';
  const isHome = !isToday && !NAV.some((n) => n.path === page && n.path !== 'home');

  return (
    <div class="shell">
      <div ref={shadeRef} class={`drawer-shade ${drawer ? 'open' : ''}`} onClick={() => setDrawer(false)} />
      <nav ref={drawerRef} class={`drawer ${drawer ? 'open' : ''}`} aria-label="Main" data-tour="drawer">
        <div class="drawer-head">
          <span class="topbar-mark"><img src="icons/mark.png" alt="" /></span>
          <div><b>Solaristic Radar</b><span>{settings.profile.name}</span></div>
        </div>
        {NAV.map((n) => (
          <a key={n.path} href={`#/${n.path}`} data-tour={`nav-${n.path}`} class={`nav-item ${(page === n.path && !(page === 'settings' && (id === 'invite' || id === 'account'))) || (isToday && n.path === 'today') ? 'active' : ''}`} onClick={() => setDrawer(false)}>
            <Icon name={n.icon} /><span>{n.label}</span>
            {n.path === 'icp' && icpDue && <i class="dot" aria-label="ICP check-ins due" />}
          </a>
        ))}
        <div class="drawer-rule" />
        <AccountNavItem active={page === 'settings' && id === 'account'} onClick={() => setDrawer(false)} />
        <a class={`nav-item ${page === 'settings' && id === 'invite' ? 'active' : ''}`} href="#/settings/invite" onClick={() => setDrawer(false)}><Icon name="qr" /><span>Invite a colleague</span></a>
        {settings.pin && <button class="nav-item" onClick={() => { setDrawer(false); setLocked(true); }}><Icon name="lock" /><span>Lock app</span></button>}
        <SyncNavStatus />
        {!online && <div class="nav-item" style="cursor:default"><Icon name="wifiOff" /><span class="small muted">Offline: everything still works</span></div>}
      </nav>
      <div class="content-col">
        <header class="topbar">
          <button class="icon-btn menu-btn" data-tour="menu" aria-label="Open menu" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
          {isToday && currentClass ? (
            <button class="class-btn" data-tour="class" onClick={() => setPicker(true)} aria-label="Change class">{currentClass.name}<Icon name="chevronDown" /></button>
          ) : <span class="title">{isHome ? 'Solaristic Radar' : NAV.find((n) => n.path === page)?.label ?? ''}</span>}
          <span class="spacer" />
          {settings.devTools !== false ? <DayButton /> : <span class="topbar-mark" aria-hidden="true"><img src="icons/mark.png" alt="" /></span>}
        </header>
        <main class="main"><SyncAttentionBanner />{!(page === 'class' && sub === 'close') && <LessonPrompt />}{screen}</main>
      </div>
      {picker && classes && <ClassPicker classes={classes} current={currentClass?.id} reminder={reminder} onClose={() => setPicker(false)} />}
      {!settings.tutorialDone && <Tour name={settings.profile.name} setDrawer={setDrawer} onDone={() => saveSettings({ tutorialDone: true })} />}
      <FileSavedHost />
      <ToastHost />
    </div>
  );
}

function ClassPicker({ classes, current, reminder, onClose }: { classes: { id: string; name: string }[]; current?: string; reminder: ReminderState; onClose: () => void }) {
  const todays = reminder.todays;
  const sorted = [...classes].sort((a, b) => {
    const ta = todays.find((t) => t.classId === a.id)?.start ?? '99', tb = todays.find((t) => t.classId === b.id)?.start ?? '99';
    return ta.localeCompare(tb) || a.name.localeCompare(b.name);
  });
  return (
    <Sheet title="Class" onClose={onClose}>
      <div class="list">
        {sorted.map((c) => {
          const l = todays.find((t) => t.classId === c.id);
          return (
            <button key={c.id} class="list-item" onClick={() => { saveSettings({ currentClassId: c.id }); location.hash = `#/class/${c.id}`; onClose(); }}>
              <span class="grow"><span class="title">{c.name}</span>{l && <div class="sub">Today {l.start}{l.room ? ` · ${l.room}` : ''}</div>}</span>
              {reminder.current?.classId === c.id && <span class="badge blue">Now</span>}
              {c.id === current && <Icon name="check" />}
            </button>
          );
        })}
      </div>
      <a class="btn small ghost" href="#/classes" onClick={onClose} style="margin-top:4px"><Icon name="plus" /> Manage classes</a>
    </Sheet>
  );
}

/** Drag from the left edge to open the drawer; drag it back (or tap outside) to close. */
function useEdgeSwipe(open: boolean, setOpen: (v: boolean) => void, drawerRef: { current: HTMLElement | null }, shadeRef: { current: HTMLDivElement | null }) {
  useEffect(() => {
    let start: { x: number; y: number; open: boolean; w: number; active: boolean } | null = null;
    const set = (p: number) => {
      const d = drawerRef.current, s = shadeRef.current;
      if (!d || !s) return;
      d.style.transition = s.style.transition = 'none';
      d.style.transform = `translateX(${(p - 1) * 100}%)`;
      s.style.opacity = String(p);
      s.style.pointerEvents = 'none';
    };
    const clear = () => {
      const d = drawerRef.current, s = shadeRef.current;
      if (d) d.style.transition = d.style.transform = '';
      if (s) s.style.transition = s.style.opacity = s.style.pointerEvents = '';
    };
    const down = (e: PointerEvent) => {
      if (wide() || document.querySelector('.overlay, .tour-block')) return;
      const w = drawerRef.current?.offsetWidth ?? 280;
      if (!open && e.clientX <= 40) start = { x: e.clientX, y: e.clientY, open: false, w, active: false };
      else if (open && e.clientX <= w + 40) start = { x: e.clientX, y: e.clientY, open: true, w, active: false };
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.active) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { start = null; return; } // vertical scroll
        if (Math.abs(dx) < 8) return;
        start.active = true;
      }
      set(Math.max(0, Math.min(1, (start.open ? start.w + dx : dx) / start.w)));
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const s = start;
      start = null;
      if (!s.active) return;
      const p = (s.open ? s.w + (e.clientX - s.x) : e.clientX - s.x) / s.w;
      clear();
      setOpen(p > (s.open ? 0.7 : 0.35));
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [open]);
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);
  return online;
}

/** Android: tapping a notification opens the saved file, or that class's check-ins. */
function useNotificationTaps() {
  useEffect(() => {
    if (!isNative()) return;
    import('../native').then((n) => n.onNotificationTap(async ({ fileId, classId }) => {
      if (fileId) {
        const rec = await db.files.get(fileId);
        if (rec) openFile(rec);
      } else if (classId) {
        await saveSettings({ currentClassId: classId });
        location.hash = `#/class/${classId}`;
      }
    }));
  }, []);
}

/** Re-render everything when the test clock moves. */
function useDayOffset() {
  const [, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((n) => n + 1);
    window.addEventListener(DAY_CHANGE_EVENT, on);
    return () => window.removeEventListener(DAY_CHANGE_EVENT, on);
  }, []);
}

/** Developer tool: jump the app's "today" forward one day (reset with ✕). */
function DayButton() {
  const off = dayOffset();
  return (
    <div class="day-tool">
      {off > 0 && (
        <button class="day-chip" title="Back to the real date" onClick={() => setDayOffset(0)}>
          {formatShort(today())} <Icon name="x" />
        </button>
      )}
      <button class="btn small day-next" title="Test tool: move to the next day" onClick={() => setDayOffset(off + 1)}>+1 day</button>
    </div>
  );
}

/** Small sync status line in the menu while sync is on. */
function SyncNavStatus() {
  const s = useSyncStatus();
  if (s.state === 'off') return null;
  return <a class="nav-item" href="#/settings/account"><span class={`sync-state ${s.state}`}><i /></span><span class="small muted">{syncLine(s)}</span></a>;
}

/** "Sign in to your account" while signed out; the signed-in email (opens Account & devices) otherwise. */
function AccountNavItem({ active, onClick }: { active: boolean; onClick: () => void }) {
  const acc = useAccount();
  if (acc.status === 'off' || acc.status === 'loading') return null;
  if (acc.status === 'signedOut') {
    return <a class={`nav-item signin-item ${active ? 'active' : ''}`} href="#/settings/account" onClick={onClick}><Icon name="user" /><span>Sign in to your account</span></a>;
  }
  return (
    <a class={`nav-item ${active ? 'active' : ''}`} href="#/settings/account" onClick={onClick}>
      <Icon name="user" /><span class="nav-account"><span>Account</span><span class="tiny muted">{acc.user.email}</span></span>
    </a>
  );
}

/**
 * "Close your lesson?": a lesson open for an hour or more, one left open from earlier (shown the
 * next time the app opens), or a "Remind me in 30 minutes" that has come due. "Later" hides it for 30 minutes.
 */
function LessonPrompt() {
  const data = useLive(async () => ({ lessons: await db.lessons.where('status').anyOf('open', 'finishing').toArray(), classes: await db.classes.toArray() }), []);
  const [later, setLater] = useState<Record<string, number>>({});
  useTick(60_000);
  if (!data) return null;
  const now = nowMs();
  const l = lessonsToClose(data.lessons, now).find((x) => !(later[x.id] > now));
  if (!l) return null;
  const name = data.classes.find((c) => c.id === l.classId)?.name ?? 'Class';
  const when = l.date === today() ? `opened ${new Date(l.openedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : `from ${formatShort(l.date)}`;
  return (
    <div class="lesson-prompt pop-in" role="status">
      <span class="grow"><b>Close your lesson?</b> {name}{l.intention ? ` · ${lessonName(l)}` : ''} · {l.status === 'finishing' ? 'to finish' : when}</span>
      <a class="btn small primary" href={`#/class/${l.classId}/close`}>Close</a>
      <button class="later" onClick={() => setLater({ ...later, [l.id]: now + 30 * 60_000 })}>Later</button>
    </div>
  );
}
