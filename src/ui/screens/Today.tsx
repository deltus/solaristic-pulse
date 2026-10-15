import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { db, saveSettings } from '../../db';
import type { Category, Checkin, IcpAdjustment, IcpCheck, IcpOutcome, Observation, PlanEntry, Question, Settings, Student } from '../../types';
import * as svc from '../../services';
import { rankStudents } from '../../logic/priority';
import { allOpenFollowUps, openFollowUp } from '../../logic/followups';
import type { FollowUpOutcome } from '../../types';
import { dueQuestions } from '../../logic/schedule';
import { icpDueStatus } from '../../logic/icp';
import { relativeDay, today } from '../../lib/dates';
import { useLive, useSettings } from '../hooks';
import { displayName, Empty, Icon, Sheet, levelClass, toast } from '../components';
import type { ReminderState } from '../reminders';
import { ReminderPrompt } from '../ReminderPrompt';

async function loadToday(classId: string, date: string) {
  const data = await svc.loadClassData(classId);
  if (!data) return null;
  const ids = data.students.map((s) => s.id);
  const [plan, adjustments, icpChecks] = await Promise.all([
    db.plans.get(svc.planId(date, classId)),
    db.icpAdjustments.where('studentId').anyOf(ids).toArray(),
    db.icpChecks.where('studentId').anyOf(ids).toArray()
  ]);
  return { ...data, plan, adjustments: adjustments.filter((a) => a.active && a.startDate <= date && (!a.endDate || a.endDate >= date)), icpChecks };
}
type Bundle = NonNullable<Awaited<ReturnType<typeof loadToday>>>;

export function TodayScreen({ reminder }: { reminder: ReminderState }) {
  const settings = useSettings();
  const classes = useLive(() => db.classes.toArray().then((cs) => cs.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name))), []);
  const date = today();
  const autoSwitched = useRef<string | null>(null);

  // Follow the timetable: when a lesson starts, switch to that class once.
  useEffect(() => {
    const cur = reminder.current;
    if (cur && autoSwitched.current !== cur.id && settings && settings.currentClassId !== cur.classId) {
      autoSwitched.current = cur.id;
      saveSettings({ currentClassId: cur.classId });
    } else if (cur) autoSwitched.current = cur.id;
  }, [reminder.current?.id, settings?.currentClassId]);

  const classId = classes?.find((c) => c.id === settings?.currentClassId)?.id ?? classes?.[0]?.id;
  useEffect(() => { if (classId) svc.ensurePlan(classId, date); }, [classId, date]);
  const bundle = useLive(() => (classId ? loadToday(classId, date) : null), [classId, date]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const lessonCount = useLive(() => db.timetable.count(), []);
  useEffect(() => setActiveId(null), [classId]);

  if (!settings || !classes) return null;
  if (!classes.length) {
    return <div class="card" style="margin-top:20px"><Empty icon="classes">Create your first class to start.<br /><a class="btn primary" style="margin-top:12px" href="#/classes">Add a class</a></Empty></div>;
  }
  return (
    <div>
      <LessonLine reminder={reminder} classId={classId!} classes={classes} />
      {!!lessonCount && !settings.reminders.enabled && !settings.reminderCardDismissed && <ReminderCard />}
      {bundle === undefined ? null : bundle === null ? <p class="muted">Class not found.</p> : (
        <TodayBody bundle={bundle} settings={settings} date={date} activeId={activeId} setActiveId={setActiveId} openPicker={() => setPicker(true)} />
      )}
      {picker && bundle && <StudentPicker bundle={bundle} date={date} onClose={() => setPicker(false)} onPick={async (id) => {
        await svc.addToPlan(bundle.cls.id, date, id);
        setActiveId(id);
        setPicker(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }} />}
    </div>
  );
}

function LessonLine({ reminder, classId, classes }: { reminder: ReminderState; classId: string; classes: { id: string; name: string }[] }) {
  const cur = reminder.current;
  const name = (id: string) => classes.find((c) => c.id === id)?.name ?? 'Class';
  if (cur && cur.classId === classId) return <div class="lesson-line"><Icon name="clock" /><span><b>Now</b> · {cur.start}–{cur.end}{cur.room ? ` · ${cur.room}` : ''}</span></div>;
  if (cur) return <div class="lesson-line"><Icon name="clock" /><span><b>{name(cur.classId)}</b> is on now</span><button class="btn small" onClick={() => saveSettings({ currentClassId: cur.classId })}>Switch</button></div>;
  if (reminder.next) return <div class="lesson-line"><Icon name="clock" /><span>Next: <b>{name(reminder.next.classId)}</b> {reminder.next.start}</span></div>;
  return <div class="lesson-line" />;
}

function TodayBody({ bundle, settings, date, activeId, setActiveId, openPicker }: {
  bundle: Bundle; settings: Settings; date: string; activeId: string | null; setActiveId: (id: string | null) => void; openPicker: () => void;
}) {
  const { cls, students, observations, checkins, questions, categories, plan, adjustments, icpChecks } = bundle;
  const active = students.filter((s) => !s.archived);
  const todayChk = new Map(checkins.filter((c) => c.date === date && c.classId === cls.id).map((c) => [c.studentId, c]));
  const entries = plan?.entries ?? [];
  const target = cls.dailyTarget ?? settings.dailyTarget;
  const counted = (id: string) => ['complete', 'partial'].includes(todayChk.get(id)?.status ?? '');
  const done = [...todayChk.values()].filter((c) => c.status === 'complete' || c.status === 'partial').length;
  const pending = entries.filter((e) => { const st = todayChk.get(e.studentId)?.status; return !st || st === 'partial'; });
  const currentId = activeId && entries.some((e) => e.studentId === activeId) ? activeId : pending[0]?.studentId ?? null;
  const current = students.find((s) => s.id === currentId);
  const entry = entries.find((e) => e.studentId === currentId);
  const [more, setMore] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [trail, setTrail] = useState<string[]>([]);
  const [openLast, setOpenLast] = useState(false);

  const obsBy = useMemo(() => {
    const m = new Map<string, Observation[]>();
    for (const o of observations) (m.get(o.studentId) ?? m.set(o.studentId, []).get(o.studentId)!).push(o);
    return m;
  }, [observations]);

  if (!active.length) {
    return <div class="card"><Empty icon="students">No students in {cls.name} yet.<br /><a class="btn primary" style="margin-top:12px" href={`#/classes/${cls.id}`}>Add students</a></Empty></div>;
  }

  const attention = [
    ...active.filter((s) => !todayChk.has(s.id) && allOpenFollowUps(obsBy.get(s.id) ?? [], questions).length).map((s) => ({ s, tag: 'Follow-up', cls: 'flag' })),
    ...rankStudents({ students: active, observations, checkins, questions, categories, today: date, maxGapDays: settings.maxGapDays, excludeIds: new Set(todayChk.keys()) })
      .filter((c) => c.overdue && c.daysSince !== null)
      .map((c) => ({ s: students.find((x) => x.id === c.studentId)!, tag: `${c.daysSince} days`, cls: '' }))
  ].filter((x, i, arr) => arr.findIndex((y) => y.s.id === x.s.id) === i);

  async function checkMore() {
    setMore(true);
    const n = await svc.extendPlan(cls.id, date, Math.min(5, target));
    setMore(false);
    toast(n ? `${n} more added` : `Everyone in ${cls.name} is done today`);
  }
  const open = async (id: string) => { await svc.addToPlan(cls.id, date, id); pick(id); };
  const pick = (id: string | null) => { setOpenLast(false); setActiveId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const next = () => {
    if (currentId) setTrail((t) => [...t.filter((x) => x !== currentId), currentId]);
    pick(pending.find((e) => e.studentId !== currentId)?.studentId ?? null);
  };
  // Back to the previous student: this session's history first, else the previous check-in in the queue.
  const curIdx = entries.findIndex((e) => e.studentId === currentId);
  const prevId = trail.filter((x) => x !== currentId).at(-1)
    ?? entries.slice(0, curIdx < 0 ? entries.length : curIdx).reverse().find((e) => todayChk.has(e.studentId))?.studentId;
  const back = prevId ? () => { setTrail((t) => t.filter((x) => x !== prevId && x !== currentId)); setActiveId(prevId); setOpenLast(true); } : undefined;

  return (
    <>
      <div class="segbar" data-tour="progress" aria-label={`${done} of ${target} check-ins done`}>
        {Array.from({ length: Math.max(target, done) }, (_, i) => <i key={i} class={i < done ? 'on' : ''} />)}
      </div>

      {current ? (
        <StepCard
          key={current.id}
          student={current}
          entry={entry}
          position={entry?.source === 'daily' ? `${Math.min(done - (counted(current.id) ? 1 : 0) + 1, target)} of ${target}` : entry?.source === 'extra' ? 'Extra' : 'Chosen'}
          classId={cls.id}
          date={date}
          checkin={todayChk.get(current.id)}
          obs={obsBy.get(current.id) ?? []}
          questions={questions}
          categories={categories}
          adjustments={adjustments.filter((a) => a.studentId === current.id).filter((a) => { const st = icpDueStatus(a, icpChecks, date, true); return st.due || st.doneToday; })}
          icpToday={icpChecks.filter((c) => c.date === date)}
          settings={settings}
          onNext={next}
          onBack={back}
          startAtLast={openLast}
        />
      ) : (
        <div class="done-state">
          <div class="check"><Icon name="check" /></div>
          <h2>{done >= target ? 'All done for today' : 'Queue is empty'}</h2>
          <p class="muted small">{cls.name} · {done} checked</p>
          {back && <button class="btn small" onClick={back}><Icon name="back" /> Back</button>}
        </div>
      )}

      <div class="grid2" style="margin-top:22px" data-tour="more">
        <button class="btn" disabled={more} onClick={checkMore}><Icon name="plus" /> Check more</button>
        <button class="btn" onClick={openPicker}><Icon name="search" /> Choose student</button>
      </div>

      <div class="section"><h3 class="grow">Today</h3><span class="tiny muted mono">{done}/{target}</span></div>
      <div class="card flat" style="padding:4px 14px">
        <div class="mini-list">
          {entries.map((e) => {
            const s = students.find((x) => x.id === e.studentId);
            if (!s) return null;
            const st = todayChk.get(s.id)?.status;
            return (
              <button key={s.id} class="mini-row" onClick={() => pick(s.id)}>
                <span class="grow">{displayName(s)}</span>
                {s.id === currentId ? <span class="now"><Icon name="arrow" /></span>
                  : st === 'complete' ? <span class="ok"><Icon name="check" /></span>
                  : st === 'absent' ? <span class="tiny muted">Absent</span>
                  : st === 'skipped' ? <span class="tiny muted">Skipped</span>
                  : st === 'partial' ? <span class="tiny muted">Partly</span>
                  : <span class="muted-ico"><Icon name="clock" /></span>}
              </button>
            );
          })}
        </div>
      </div>

      {attention.length > 0 && (
        <>
          <div class="section"><h3 class="grow">Needs attention</h3><span class="tiny muted mono">{attention.length}</span></div>
          <div class="card flat" style="padding:4px 14px">
            <div class="mini-list">
              {(showAll ? attention : attention.slice(0, 5)).map(({ s, tag, cls: c }) => (
                <button key={s.id} class="mini-row" onClick={() => open(s.id)}>
                  <span class="grow">{displayName(s)}</span>
                  <span class={`badge ${c}`}>{tag}</span>
                </button>
              ))}
            </div>
            {attention.length > 5 && !showAll && <button class="link-btn" onClick={() => setShowAll(true)}>Show {attention.length - 5} more</button>}
          </div>
        </>
      )}
    </>
  );
}

type Step = { kind: 'q'; q: Question } | { kind: 'icp'; a: IcpAdjustment };

const FU_SHORT: { outcome: FollowUpOutcome; label: string; cls: string; difficult: boolean }[] = [
  { outcome: 'improved', label: 'No, all good', cls: 'l0', difficult: false },
  { outcome: 'same', label: 'Yes, about the same', cls: 'l1', difficult: true },
  { outcome: 'worsened', label: 'Yes, and worse', cls: 'l2', difficult: true },
  { outcome: 'unknown', label: 'Not sure', cls: 'ln', difficult: false }
];
const ICP_SHORT: { value: IcpOutcome; label: string; cls: string }[] = [
  { value: 'implemented', label: 'Yes', cls: 'l0' },
  { value: 'partial', label: 'Partly', cls: 'l1' },
  { value: 'not', label: 'No', cls: 'l2' },
  { value: 'na', label: 'Not needed today', cls: 'ln' }
];

function StepCard({ student, entry, position, classId, date, checkin, obs, questions, categories, adjustments, icpToday, settings, onNext, onBack, startAtLast }: {
  onBack?: () => void; startAtLast?: boolean;
  student: Student; entry?: PlanEntry; position: string; classId: string; date: string; checkin?: Checkin; obs: Observation[];
  questions: Question[]; categories: Category[]; adjustments: IcpAdjustment[]; icpToday: IcpCheck[]; settings: Settings; onNext: () => void;
}) {
  const name = student.preferredName || student.firstName;
  const answers = new Map(obs.filter((o) => checkin && o.checkinId === checkin.id).map((o) => [o.questionId, o]));
  const steps: Step[] = [
    ...dueQuestions(questions, student, classId, obs, date, checkin?.id).map((q) => ({ kind: 'q' as const, q })),
    ...adjustments.map((a) => ({ kind: 'icp' as const, a }))
  ];
  const answered = (s: Step) => (s.kind === 'q' ? answers.has(s.q.id) : icpToday.some((c) => c.adjustmentId === s.a.id));
  const firstOpen = steps.findIndex((s) => !answered(s));
  const [idx, setIdxRaw] = useState(startAtLast ? Math.max(0, steps.length - 1) : firstOpen < 0 ? 0 : firstOpen);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [info, setInfo] = useState(false);
  const [finished, setFinished] = useState(!startAtLast && firstOpen < 0 && steps.length > 0 && checkin?.status === 'complete');
  // Note box: open before answering (saved with the answer) or after (saved on Next).
  const [noteOpen, setNoteOpen] = useState(false);
  const [askWhy, setAskWhy] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftCtx, setDraftCtx] = useState<string | undefined>(undefined);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const setIdx = (n: number) => {
    clearTimeout(advanceTimer.current);
    setDir(n < idx ? 'back' : 'fwd');
    setNoteOpen(false);
    setAskWhy(false);
    setIdxRaw(n);
  };
  const goBack = () => { if (idx > 0 && !finished) setIdx(idx - 1); else onBack?.(); };
  const top = (
    <div class="row between">
      <div class="cc-eyebrow">{position}</div>
      {checkin?.status !== 'absent' && checkin?.status !== 'skipped' && <button class="link-btn" style="padding:4px 0" onClick={() => svc.markStatus(student.id, classId, date, 'skipped')}>Skip</button>}
    </div>
  );

  async function chk() {
    return checkin ?? svc.getOrCreateCheckin(student.id, classId, date, entry?.source ?? 'manual');
  }
  function advance() {
    clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      if (idx < steps.length - 1) setIdx(idx + 1);
      else if (settings.autoAdvance) { toast(`${name} saved`); onNext(); }
      else setFinished(true);
    }, 260);
  }

  if (checkin?.status === 'absent' || checkin?.status === 'skipped') {
    return (
      <div class="cc fade-up" data-tour="card">
        {top}
        <div class="cc-head"><h1>{displayName(student)}</h1></div>
        <p class="cc-sub">{checkin.status === 'absent' ? 'Absent today. Not counted as a difficulty.' : 'Skipped for now.'}</p>
        <div class="grid2">{onBack ? <button class="btn" onClick={onBack}><Icon name="back" /> Back</button> : null}<button class="btn" onClick={() => svc.undoCheckin(checkin.id)}>Undo</button><button class="btn primary" onClick={onNext}>Next <Icon name="arrow" /></button></div>
      </div>
    );
  }

  if (finished || !steps.length) {
    return (
      <div class="cc fade-up" data-tour="card">
        {top}
        <div class="cc-head"><h1>{displayName(student)}</h1></div>
        <p class="cc-sub">{steps.length ? 'All answers saved.' : 'No questions due for this student today.'}</p>
        <div class="grid2">{onBack ? <button class="btn" onClick={onBack}><Icon name="back" /> Back</button> : null}<button class="btn" onClick={() => { setFinished(false); setIdx(0); }}>Review</button><button class="btn primary" onClick={onNext}>Next student <Icon name="arrow" /></button></div>
      </div>
    );
  }

  const step = steps[Math.min(idx, steps.length - 1)];
  const cat = step.kind === 'q' ? categories.find((c) => c.id === step.q.categoryId) : undefined;
  const fu = step.kind === 'q' ? openFollowUp(obs, step.q.id, checkin?.id) : null;
  const ans = step.kind === 'q' ? answers.get(step.q.id) : undefined;
  const icpAns = step.kind === 'icp' ? icpToday.find((c) => c.adjustmentId === step.a.id) : undefined;
  const label = step.kind === 'icp' ? 'ICP' : cat?.name ?? '';
  const canNote = step.kind === 'icp' || step.q.allowDetail;
  const savedNote = step.kind === 'q' ? ans?.note : icpAns?.note;

  function openNote() {
    clearTimeout(advanceTimer.current);
    setDraft(savedNote ?? '');
    setDraftCtx(step.kind === 'q' ? ans?.context : undefined);
    setAskWhy(false);
    setNoteOpen(true);
  }
  /** Saves an answer (with any note typed first). A difficulty pauses to ask what happened. */
  async function answer(save: (note?: string, context?: string) => Promise<unknown>, difficult: boolean) {
    const typed = noteOpen ? draft.trim() : '';
    await save(typed || undefined, noteOpen ? draftCtx : undefined);
    if (difficult && !typed && !savedNote && canNote) {
      clearTimeout(advanceTimer.current);
      setDraft('');
      setDraftCtx(undefined);
      setAskWhy(true);
      setNoteOpen(true);
      return;
    }
    setNoteOpen(false);
    setAskWhy(false);
    advance();
  }
  async function saveNoteAndNext() {
    if (step.kind === 'q' && ans) await svc.updateObservationDetail(ans.id, { note: draft.trim() || undefined, context: draftCtx });
    if (step.kind === 'icp' && icpAns) await svc.updateIcpNote(icpAns.id, draft.trim());
    setNoteOpen(false);
    setAskWhy(false);
    advance();
  }
  const hasAnswer = step.kind === 'q' ? !!ans : !!icpAns;

  return (
    <div class="cc" data-tour="card">
      {top}
      <div class="cc-head" key={student.id}>
        <h1 class="fade-up">{displayName(student)}</h1>
        {student.flag && <Icon name="flag" class="flag" />}
        <button class="icon-btn" aria-label="Why this student" onClick={() => setInfo(!info)}><Icon name="info" /></button>
      </div>
      {info && (
        <div class="prev pop-in" style="margin:8px 0 0">
          <div class="reason-list" style="margin:0 0 8px">{(entry?.reasons ?? ['Chosen by you']).map((r) => <span key={r} class="badge">{r}</span>)}</div>
          <a class="small" href={`#/students/${student.id}`}>Open profile</a>
        </div>
      )}

      <div key={`${student.id}-${idx}`} class={dir === 'back' ? 'slide-back' : 'slide-fwd'}>
        <p class="cc-sub">{label} · {idx + 1} of {steps.length}</p>

        {step.kind === 'q' && fu && (
          <div class="prev">
            <span class="eyebrow">Last time · {relativeDay(fu.previous.date, date)} · {cat?.name}</span>
            {fu.previous.note
              ? <div class="prev-note">“{fu.previous.note}”</div>
              : <b>{fu.previous.followUp ? `Still a difficulty (${fu.previous.response.toLowerCase()})` : fu.previous.response}</b>}
            {fu.previous.context && <div class="tiny muted">During {fu.previous.context.toLowerCase()}</div>}
          </div>
        )}

        <div class="cc-q">
          {step.kind === 'icp' ? `${step.a.title}?` : fu ? 'Did this happen again?' : (step.q.shortText || step.q.text).replace(/\{name\}/g, name)}
        </div>

        <div class="cc-opts">
          {step.kind === 'icp' && ICP_SHORT.map((o) => (
            <button key={o.value} class={`opt ${o.cls} ${icpAns?.outcome === o.value ? 'sel' : ''}`}
              onClick={() => answer((note) => svc.recordIcpCheck(step.a, date, o.value, note), false)}>
              {o.label}<Icon name="check" class="tick" />
            </button>
          ))}
          {step.kind === 'q' && fu && FU_SHORT.map((o) => (
            <button key={o.outcome} class={`opt ${o.cls} ${ans?.followUp?.outcome === o.outcome ? 'sel' : ''}`}
              onClick={() => answer(async (note, context) => svc.answerQuestion({ checkin: await chk(), question: step.q, followUp: { previousId: fu.previous.id, prevLevel: fu.level, outcome: o.outcome }, note, context }), o.difficult)}>
              {o.label}<Icon name="check" class="tick" />
            </button>
          ))}
          {step.kind === 'q' && !fu && step.q.options.map((o) => (
            <button key={o.label} class={`opt ${levelClass(o.level)} ${ans?.response === o.label && !ans.followUp ? 'sel' : ''}`}
              onClick={() => answer(async (note, context) => svc.answerQuestion({ checkin: await chk(), question: step.q, option: o, note, context }), !!o.level)}>
              {o.label}<Icon name="check" class="tick" />
            </button>
          ))}
        </div>

        {canNote && (noteOpen ? (
          <div class="note-box pop-in">
            <div class="note-title">{askWhy ? 'What happened? (optional)' : hasAnswer ? 'Note' : 'Note (saved with your answer)'}</div>
            {step.kind === 'q' && (
              <div class="chips" style="flex-wrap:wrap">
                {settings.contextTags.map((t) => (
                  <button key={t} class={`chip small ${draftCtx === t ? 'active' : ''}`} onClick={() => setDraftCtx(draftCtx === t ? undefined : t)}>{t}</button>
                ))}
              </div>
            )}
            <textarea class="input" autoFocus value={draft} placeholder={askWhy ? 'e.g. Mucked around during group work' : 'Short note'}
              onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)} />
            <div class="tiny muted" style="margin:6px 0 10px"><Icon name="mic" class="inline-ico" /> Tap your keyboard's mic to dictate. Stick to what happened; avoid full names where you can.</div>
            {hasAnswer
              ? <button class="btn primary block" onClick={saveNoteAndNext}>{draft.trim() || draftCtx ? 'Save and next' : 'Next'} <Icon name="arrow" /></button>
              : <button class="link-btn" onClick={() => setNoteOpen(false)}>Cancel note</button>}
          </div>
        ) : (
          <button class="link-btn note-link" onClick={openNote}>{savedNote ? '✎ Edit note' : '+ Add a note'}</button>
        ))}
      </div>

      <div class="cc-foot">
        <button class="link-btn back-btn" disabled={idx === 0 && !onBack} onClick={goBack}><Icon name="back" /> Back</button>
        <div class="step-dots" role="tablist" aria-label="Questions">
          {steps.map((s, k) => <button key={k} role="tab" aria-selected={k === idx} aria-label={`Question ${k + 1}`} class={`${k === idx ? 'cur' : answered(s) ? 'done' : ''}`} onClick={() => setIdx(k)} />)}
        </div>
        <button class="link-btn" data-tour="absent" onClick={() => svc.markStatus(student.id, classId, date, 'absent')}>Absent</button>
      </div>
    </div>
  );
}

function StudentPicker({ bundle, date, onClose, onPick }: { bundle: Bundle; date: string; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const last = (id: string) => bundle.checkins.filter((c) => c.studentId === id && (c.status === 'complete' || c.status === 'partial')).map((c) => c.date).sort().pop();
  const list = bundle.students
    .filter((s) => !s.archived && displayName(s).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  return (
    <Sheet title={bundle.cls.name} onClose={onClose}>
      <input class="input" placeholder="Search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} autoFocus />
      <div class="card flat" style="padding:4px 14px;margin-top:10px">
        <div class="mini-list">
          {list.map((s) => {
            const l = last(s.id);
            return (
              <button key={s.id} class="mini-row" onClick={() => onPick(s.id)}>
                <span class="grow">{displayName(s)}</span>
                <span class="tiny muted">{l ? (l === date ? 'Today' : relativeDay(l)) : 'Never'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

function ReminderCard() {
  return (
    <div class="card reminder-card pop-in">
      <button class="icon-btn close" aria-label="Hide this" onClick={() => saveSettings({ reminderCardDismissed: true })}><Icon name="x" /></button>
      <div class="row" style="align-items:flex-start;gap:12px">
        <span class="guide-icon small"><Icon name="bell" /></span>
        <div class="grow">
          <b>Reminders are off</b>
          <p class="small muted" style="margin:2px 0 10px">Get a nudge 5 minutes before each class, with who to check in with.</p>
          <ReminderPrompt compact />
        </div>
      </div>
    </div>
  );
}
