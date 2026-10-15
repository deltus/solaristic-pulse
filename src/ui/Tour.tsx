// First-run guided tour: highlights each part of the app in turn. Skippable; replay from Settings.

import { useEffect, useLayoutEffect, useState } from 'preact/hooks';

interface Step { target?: string; title: string; text: string; drawer?: boolean }

const steps = (first: string): Step[] => [
  { title: `Welcome${first ? `, ${first}` : ''}`, text: 'A one-minute tour of where everything is. Skip whenever you like.' },
  { target: '[data-tour=menu]', title: 'Menu', text: 'Tap here, or swipe in from the left edge, to open the menu.' },
  { target: '[data-tour=class]', title: 'Your class', text: 'Tap to switch class. During a timetabled lesson Pulse switches for you.' },
  { target: '[data-tour=progress]', title: "Today's check-ins", text: 'About five students per class. Students with recent difficulties come up more often, and nobody is left out for long.' },
  { target: '[data-tour=card]', title: 'Check in', text: 'One question at a time. Tap an answer to save it and move on. Press and hold an answer to add a note; it comes back next time as a follow-up.' },
  { target: '[data-tour=absent]', title: 'Absent or skip', text: 'Absence never counts against a student. Their place goes to someone else.' },
  { target: '[data-tour=more]', title: 'More students', text: 'Check extra students when you have time, or choose one yourself.' },
  { target: '[data-tour=nav-classes]', drawer: true, title: 'Classes', text: 'Add classes, import rosters and set your timetable.' },
  { target: '[data-tour=nav-students]', drawer: true, title: 'Students', text: "Profiles, trends and each student's draw weight." },
  { target: '[data-tour=nav-icp]', drawer: true, title: 'ICP Check-In', text: 'Record whether Individual Curriculum Plan adjustments happened.' },
  { target: '[data-tour=nav-reports]', drawer: true, title: 'Reports', text: 'Excel or CSV exports, de-identified when you need to share.' },
  { target: '[data-tour=nav-settings]', drawer: true, title: 'Settings', text: 'Reminders, questions, PIN and backups. You can replay this tour from here.' },
  { title: "You're all set", text: 'Everything stays on this device. Back it up regularly from Settings.' }
];

function visibleRect(sel?: string): DOMRect | null {
  if (!sel) return null;
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return null;
  return r;
}

export function Tour({ name, setDrawer, onDone }: { name: string; setDrawer: (v: boolean) => void; onDone: () => void }) {
  const list = steps(name.trim().split(/\s+/)[0] ?? '');
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = list[i];

  useEffect(() => {
    if (!location.hash.startsWith('#/today') && location.hash !== '' && location.hash !== '#/') location.hash = '#/today';
  }, []);

  useLayoutEffect(() => {
    setDrawer(!!step.drawer);
    setRect(null);
    const measure = () => {
      const el = step.target ? (document.querySelector(step.target) as HTMLElement | null) : null;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 60 || r.bottom > innerHeight - 160) el.scrollIntoView({ block: 'center' });
      }
      setRect(visibleRect(step.target));
    };
    const t = setTimeout(measure, step.drawer ? 320 : 60);
    const on = () => setRect(visibleRect(step.target));
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); };
  }, [i]);

  const finish = () => { setDrawer(false); onDone(); };
  const next = () => (i < list.length - 1 ? setI(i + 1) : finish());
  const pad = 6;
  const below = rect && rect.bottom + 200 < innerHeight;
  const cardStyle = rect
    ? below ? { top: `${rect.bottom + pad + 12}px` } : { bottom: `${innerHeight - rect.top + pad + 12}px` }
    : { top: '50%', transform: 'translateY(-50%)' };

  return (
    <>
      <div class="tour-block" onClick={(e) => e.stopPropagation()} style={rect ? '' : 'background:rgba(14,26,58,0.55)'} />
      {rect && <div class="tour-spot" style={{ top: `${rect.top - pad}px`, left: `${rect.left - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` }} />}
      <div class="tour-card" role="dialog" aria-label={step.title} style={cardStyle}>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div class="tour-foot">
          <div class="tour-dots" aria-hidden="true">{list.map((_, k) => <i key={k} class={k === i ? 'on' : ''} />)}</div>
          {i < list.length - 1 && <button class="link-btn" onClick={finish}>Skip</button>}
          {i > 0 && <button class="btn small" onClick={() => setI(i - 1)}>Back</button>}
          <button class="btn small primary" onClick={next}>{i === list.length - 1 ? 'Start' : 'Next'}</button>
        </div>
      </div>
    </>
  );
}
