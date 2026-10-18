import { useEffect, useRef, useState } from 'preact/hooks';
import { useRoute, useSettings, useLive } from './hooks';
import { Icon, Sheet, ToastHost } from './components';
import { LockScreen } from './Lock';
import { Setup } from './Setup';
import { Tour } from './Tour';
import { TodayScreen } from './screens/Today';
import { HomeScreen } from './screens/Home';
import { BlitzScreen } from './screens/Blitz';
import { ClassesScreen, ClassDetail } from './screens/Classes';
import { StudentsScreen, StudentProfile } from './screens/Students';
import { IcpScreen } from './screens/Icp';
import { ReportsScreen } from './screens/Reports';
import { SettingsScreen } from './screens/Settings';
import { useReminders, type ReminderState } from './reminders';
import { db, saveSettings } from '../db';
import { FileSavedHost } from './Files';
import { openFile } from '../files';
import { isNative } from '../platform';
import { today, dayOffset, setDayOffset, DAY_CHANGE_EVENT, formatShort } from '../lib/dates';

export const NAV = [
  { path: 'home', label: 'Today', icon: 'today' },
  { path: 'classes', label: 'Classes', icon: 'classes' },
  { path: 'students', label: 'Students', icon: 'students' },
  { path: 'blitz', label: 'Blitz', icon: 'bolt' },
  { path: 'icp', label: 'ICP Check-In', icon: 'icp' },
  { path: 'reports', label: 'Reports', icon: 'reports' },
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

  const icpDue = useLive(async () => {
    const adjs = await db.icpAdjustments.filter((a) => a.active).count();
    return adjs > 0 && (await db.icpChecks.where('date').equals(today()).count()) < adjs;
  }, []);
  const classes = useLive(() => db.classes.toArray().then((cs) => cs.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name))), []);

  if (!settings || locked === null) return null;
  if (locked && settings.pin) return <LockScreen pin={settings.pin} name={settings.profile.name} onUnlock={() => setLocked(false)} />;
  if (!settings.onboarded) return <Setup />;

  const [page = 'home', id, sub] = route;
  const currentClass = classes?.find((c) => c.id === settings.currentClassId) ?? classes?.[0];
  let screen;
  switch (page) {
    case 'classes': screen = id && sub === 'blitz' ? <BlitzScreen classId={id} fromClassPage /> : id ? <ClassDetail id={id} /> : <ClassesScreen />; break;
    case 'students': screen = id ? <StudentProfile id={id} /> : <StudentsScreen />; break;
    case 'icp': screen = <IcpScreen studentId={id} mode={sub} />; break;
    case 'reports': screen = <ReportsScreen studentId={id} />; break;
    case 'settings': screen = <SettingsScreen section={id} sub={sub} />; break;
    case 'today': screen = <TodayScreen reminder={reminder} />; break;
    case 'blitz': screen = <BlitzScreen classId={id} />; break;
    default: screen = <HomeScreen reminder={reminder} />;
  }
  const isToday = page === 'today';
  const isHome = !isToday && !NAV.some((n) => n.path === page && n.path !== 'home');

  return (
    <div class="shell">
      <div ref={shadeRef} class={`drawer-shade ${drawer ? 'open' : ''}`} onClick={() => setDrawer(false)} />
      <nav ref={drawerRef} class={`drawer ${drawer ? 'open' : ''}`} aria-label="Main" data-tour="drawer">
        <div class="drawer-head">
          <span class="topbar-mark"><img src="icons/mark.png" alt="" /></span>
          <div><b>Solaristic Pulse</b><span>{settings.profile.name}</span></div>
        </div>
        {NAV.map((n) => (
          <a key={n.path} href={`#/${n.path}`} data-tour={`nav-${n.path}`} class={`nav-item ${(page === n.path && !(page === 'settings' && id === 'invite')) || (isToday && n.path === 'today') ? 'active' : ''}`} onClick={() => setDrawer(false)}>
            <Icon name={n.icon} /><span>{n.label}</span>
            {n.path === 'icp' && icpDue && <i class="dot" aria-label="ICP check-ins due" />}
          </a>
        ))}
        <div class="drawer-rule" />
        <a class={`nav-item ${page === 'settings' && id === 'invite' ? 'active' : ''}`} href="#/settings/invite" onClick={() => setDrawer(false)}><Icon name="qr" /><span>Invite a colleague</span></a>
        {settings.pin && <button class="nav-item" onClick={() => { setDrawer(false); setLocked(true); }}><Icon name="lock" /><span>Lock app</span></button>}
        {!online && <div class="nav-item" style="cursor:default"><Icon name="wifiOff" /><span class="small muted">Offline: everything still works</span></div>}
      </nav>
      <div class="content-col">
        <header class="topbar">
          <button class="icon-btn menu-btn" data-tour="menu" aria-label="Open menu" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
          {isToday && currentClass ? (
            <button class="class-btn" data-tour="class" onClick={() => setPicker(true)} aria-label="Change class">{currentClass.name}<Icon name="chevronDown" /></button>
          ) : <span class="title">{isHome ? 'Solaristic Pulse' : NAV.find((n) => n.path === page)?.label ?? ''}</span>}
          <span class="spacer" />
          {settings.devTools !== false ? <DayButton /> : <span class="topbar-mark" aria-hidden="true"><img src="icons/mark.png" alt="" /></span>}
        </header>
        <main class="main">{screen}</main>
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
            <button key={c.id} class="list-item" onClick={() => { saveSettings({ currentClassId: c.id }); onClose(); }}>
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
        location.hash = '#/today';
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
