import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { db, saveSettings } from '../../db';
import type { Category, Checkin, IcpAdjustment, IcpCheck, IcpOutcome, Observation, PlanEntry, Question, Settings, Student } from '../../types';
import * as svc from '../../services';
import { rankStudents } from '../../logic/priority';
import { allOpenFollowUps, openFollowUp } from '../../logic/followups';
import type { FollowUpOutcome } from '../../types';
import { dueQuestions } from '../../logic/schedule';
import { icpDueStatus } from '../../logic/icp';
import { formatShort, relativeDay, today } from '../../lib/dates';
import { useLive, useSettings } from '../hooks';
import { displayName, Empty, Icon, Sheet, levelClass, toast } from '../components';
import type { ReminderState } from '../reminders';
import { recentStatus, STATUS_LABEL } from '../../logic/summary';
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
  return <div class="row between today-top"><a class="link-btn back-btn" href="#/home"><Icon name="back" /> Your classes</a><LessonInfo reminder={reminder} classId={classId} classes={classes} /></div>;
}

function LessonInfo({ reminder, classId, classes }: { reminder: ReminderState; classId: string; classes: { id: string; name: string }[] }) {
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
  // Keep the current student on screen until the teacher moves on (finishing their last
  // question marks them complete, which would otherwise jump straight to the next student).
  useEffect(() => { if (!activeId && currentId) setActiveId(currentId); }, [activeId, currentId]);

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
          <a class="btn primary" href="#/home" style="margin-top:10px"><Icon name="back" /> Back to your classes</a>
          {back && <button class="btn small ghost" style="margin-top:6px" onClick={back}>Review the last student</button>}
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
  { outcome: 'same', label: 'Yes, still needs support', cls: 'l1', difficult: true }
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
  const [leaving, setLeaving] = useState(false);
  const [info, setInfo] = useState(false);
  const [finished, setFinished] = useState(!startAtLast && firstOpen < 0 && steps.length > 0 && checkin?.status === 'complete');
  // Note box: open before answering (saved with the answer) or after (saved on Next).
  const [noteOpen, setNoteOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftCtx, setDraftCtx] = useState<string | undefined>(undefined);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const setIdx = (n: number) => {
    clearTimeout(advanceTimer.current);
    setLeaving(false);
    setNoteOpen(false);
    setIdxRaw(n);
  };
  const goBack = () => { if (idx > 0 && !finished) setIdx(idx - 1); else if (onBack) onBack(); else location.hash = '#/home'; };
  const top = (
    <div class="row between">
      <div class="cc-eyebrow">{position}</div>
      {checkin?.status !== 'absent' && checkin?.status !== 'skipped' && <button class="link-btn" style="padding:4px 0" onClick={() => svc.markStatus(student.id, classId, date, 'skipped')}>Skip</button>}
    </div>
  );

  async function chk() {
    return checkin ?? svc.getOrCreateCheckin(student.id, classId, date, entry?.source ?? 'manual');
  }
  /** Let the pressed answer register, fade the question out, then fade the next one in. */
  function advance() {
    clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      setLeaving(true);
      advanceTimer.current = setTimeout(() => {
        setLeaving(false);
        if (idx < steps.length - 1) setIdx(idx + 1);
        else if (settings.autoAdvance) { toast(`${name} saved`); onNext(); }
        else setFinished(true);
      }, 220);
    }, 160);
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

  /** Tap: save and move on. Hold: save, then open the note box for this answer. */
  async function answer(save: () => Promise<unknown>, held: boolean, askNote = false) {
    clearTimeout(advanceTimer.current);
    await save();
    setAsked(askNote && !held);
    if ((held || askNote) && canNote) {
      setDraft(savedNote ?? '');
      setDraftCtx(step.kind === 'q' ? ans?.context : undefined);
      setNoteOpen(true);
      return;
    }
    setNoteOpen(false);
    advance();
  }
  async function saveNoteAndNext() {
    // Ids are deterministic, so this works even before the saved answer has refreshed on screen.
    if (step.kind === 'q') await svc.updateObservationDetail(`${svc.checkinIdFor(date, classId, student.id)}|${step.q.id}`, { note: draft.trim() || undefined, context: draftCtx });
    else await svc.updateIcpNote(`${step.a.id}|${date}`, draft.trim());
    setNoteOpen(false);
    advance();
  }

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

      <div key={`${student.id}-${idx}`} class={`q-step ${leaving ? 'q-leave' : 'q-enter'}`}>
        <p class="cc-sub">{label} · {idx + 1} of {steps.length}</p>

        {step.kind === 'q' && fu && (
          <div class="prev">
            <span class="eyebrow">{cat?.name} · last time · {relativeDay(fu.previous.date, date)} ({formatShort(fu.previous.date)})</span>
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
            <HoldOpt key={o.value} cls={o.cls} selected={icpAns?.outcome === o.value} label={o.label} canHold={canNote}
              onPick={(held) => answer(() => svc.recordIcpCheck(step.a, date, o.value), held)} />
          ))}
          {step.kind === 'q' && fu && FU_SHORT.map((o) => (
            <HoldOpt key={o.outcome} cls={o.cls} selected={ans?.followUp?.outcome === o.outcome} label={o.label} canHold={canNote}
              onPick={(held) => answer(async () => svc.answerQuestion({ checkin: await chk(), question: step.q, followUp: { previousId: fu.previous.id, prevLevel: fu.level, outcome: o.outcome } }), held)} />
          ))}
          {step.kind === 'q' && !fu && step.q.options.map((o) => (
            <HoldOpt key={o.label} cls={levelClass(o.level)} selected={ans?.response === o.label && !ans.followUp} label={o.label} canHold={canNote}
              onPick={(held) => answer(async () => svc.answerQuestion({ checkin: await chk(), question: step.q, option: o }), held, !!o.askNote)} />
          ))}
        </div>

        {noteOpen ? (
          <div class="note-box pop-in">
            <div class="note-title">{asked ? 'Any notes?' : step.kind === 'q' ? cat?.notePrompt ?? 'What happened?' : 'Note'}</div>
            {step.kind === 'q' && (
              <div class="chips" style="flex-wrap:wrap">
                {(cat?.tags ?? settings.contextTags).map((t) => (
                  <button key={t} class={`chip small ${draftCtx === t ? 'active' : ''}`} onClick={() => setDraftCtx(draftCtx === t ? undefined : t)}>{t}</button>
                ))}
              </div>
            )}
            <textarea class="input" autoFocus value={draft} placeholder="Short note"
              onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)} />
            <div class="tiny muted" style="margin:6px 0 10px"><Icon name="mic" class="inline-ico" /> Tap your keyboard's mic to dictate. Stick to what happened; avoid full names where you can.</div>
            <button class="btn primary block" onClick={saveNoteAndNext}>{draft.trim() || draftCtx ? 'Save and next' : 'Next'} <Icon name="arrow" /></button>
          </div>
        ) : canNote && (
          savedNote
            ? <p class="saved-note">“{savedNote}”<span class="tiny muted"> · hold an answer to edit</span></p>
            : <p class="hold-hint">Hold an answer to add a note · <button class="link-btn inline" onClick={() => advance()}>Didn’t see</button></p>
        )}
      </div>

      <div class="cc-foot">
        <button class="link-btn back-btn" onClick={goBack}><Icon name="back" /> Back</button>
        <div class="step-dots" role="tablist" aria-label="Questions">
          {steps.map((s, k) => <button key={k} role="tab" aria-selected={k === idx} aria-label={`Question ${k + 1}`} class={`${k === idx ? 'cur' : answered(s) ? 'done' : ''}`} onClick={() => setIdx(k)} />)}
        </div>
        <button class="link-btn" data-tour="absent" onClick={() => svc.markStatus(student.id, classId, date, 'absent')}>Absent</button>
      </div>
      <RecentTable obs={obs} categories={categories} />
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

/** Pause before the hold bar appears, so a normal tap never shows it. */
const HOLD_DELAY_MS = 500;
/** Time for the bar to fill once it appears. */
const HOLD_FILL_MS = 600;

/**
 * Answer button. Tap: presses down like a real button, then answers and moves on.
 * Press and hold: after a short pause a bar fills across the button; when full it answers
 * and opens the note box.
 */
export function HoldOpt({ cls, selected, label, canHold, onPick }: { cls: string; selected: boolean; label: string; canHold: boolean; onPick: (held: boolean) => void }) {
  const [holding, setHolding] = useState(false);
  const [down, setDown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fired = useRef(false);
  const pressed = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => { clearTimeout(timer.current); pressed.current = false; setHolding(false); setDown(false); };
  return (
    <button
      class={`opt ${cls} ${selected ? 'sel' : ''} ${holding ? 'holding' : ''} ${down ? 'down' : ''}`}
      style={{ '--hold': `${HOLD_FILL_MS}ms` } as Record<string, string>}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        fired.current = false;
        pressed.current = true;
        setDown(true);
        if (!canHold) return;
        timer.current = setTimeout(() => {
          setHolding(true);
          timer.current = setTimeout(() => {
            fired.current = true;
            pressed.current = false;
            setHolding(false);
            setDown(false);
            navigator.vibrate?.(25);
            onPick(true);
          }, HOLD_FILL_MS);
        }, HOLD_DELAY_MS);
      }}
      onPointerUp={() => {
        if (!pressed.current || fired.current) return;
        cancel();
        navigator.vibrate?.(8); // light "click" on phones that support it
        onPick(false);
      }}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => { if (e.detail === 0) onPick(false); /* keyboard activation */ }}
    >
      <span class="hold-fill" aria-hidden="true" />
      <span class="opt-label">{label}</span><Icon name="check" class="tick" />
    </button>
  );
}

/** Under the survey: each core area from the student's last 5 answers (check-ins and Blitz). */
function RecentTable({ obs, categories }: { obs: Observation[]; categories: Category[] }) {
  const rows = ['homework', 'focus', 'behaviour', 'coping']
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => !!c);
  return (
    <div class="recent-table">
      <div class="recent-head"><span>Last 5 answers</span><span class="tiny muted">incl. Blitz</span></div>
      {rows.map((c) => {
        const r = recentStatus(obs, c.id);
        return (
          <div class="recent-row" key={c.id}>
            <span class="grow">{c.name}</span>
            <span class={`status ${r.status}`}>{STATUS_LABEL[r.status]}</span>
            {r.count > 0 && <span class="tiny muted mono">{r.support}/{r.count}</span>}
          </div>
        );
      })}
    </div>
  );
}
