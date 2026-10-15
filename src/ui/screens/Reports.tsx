import { useEffect, useState } from 'preact/hooks';
import { db, sortedCategories } from '../../db';
import { buildExport, toBlob, DEID_WARNING, type ExportOptions, type ExportResult } from '../../exporting';
import { mailtoLink } from '../../platform';
import { saveFile, shareBlob } from '../../files';
import { RecentFiles } from '../Files';
import { buildSqlScript, buildSqliteFile } from '../../sqlExport';
import { addDays, today } from '../../lib/dates';
import { useLive, useSettings } from '../hooks';
import { displayName, Field, Icon, PageHead, Switch, toast } from '../components';

const PRESETS: [string, number | null][] = [['4 weeks', 28], ['10 weeks (term)', 70], ['6 months', 182], ['All time', null]];

export function ReportsScreen({ studentId }: { studentId?: string }) {
  const settings = useSettings();
  const data = useLive(async () => ({
    classes: (await db.classes.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    students: await db.students.toArray(),
    categories: await sortedCategories()
  }), []);
  const [o, setO] = useState<ExportOptions>({
    kind: studentId ? 'student' : 'class', classIds: [], studentId, from: addDays(today(), -70), to: today(),
    categoryIds: [], includeNotes: true, includeIcp: true, deidentify: false, hideClassNames: false
  });
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [result, setResult] = useState<(ExportResult & { blob: Blob; filename: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setO((x) => ({
      ...x,
      classIds: x.classIds.length ? x.classIds : data.classes.filter((c) => !c.archived && (!settings?.currentClassId || c.id === settings.currentClassId)).map((c) => c.id).slice(0, 1),
      categoryIds: x.categoryIds.length ? x.categoryIds : data.categories.map((c) => c.id)
    }));
  }, [data]);
  useEffect(() => setResult(null), [o, format]);
  if (!data || !settings) return null;

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const valid = o.categoryIds.length && (o.kind === 'class' ? o.classIds.length : !!o.studentId);

  async function generate() {
    setBusy(true);
    try {
      const r = await buildExport(o);
      const blob = await toBlob(r.sheets, format);
      setResult({ ...r, blob, filename: `${r.baseName}.${format}` });
    } catch (e) {
      toast(`Could not create the report: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    if (!result) return;
    const ok = await shareBlob(result.blob, result.filename, 'Solaristic Pulse report');
    if (!ok) {
      await saveFile(result.blob, result.filename, 'report');
    }
  }
  const emailHref = mailtoLink(settings.profile.email, 'Solaristic Pulse report', `Report generated ${new Date().toLocaleDateString('en-AU')}.\n\nAttach the downloaded file: ${result?.filename ?? ''}\n`);
  const active = data.classes.filter((c) => !c.archived);

  return (
    <div>
      <PageHead eyebrow="Reports" title="Export a report" />
      <div class="chips">
        <button class={`chip ${o.kind === 'class' ? 'active' : ''}`} onClick={() => setO({ ...o, kind: 'class' })}>Whole class</button>
        <button class={`chip ${o.kind === 'student' ? 'active' : ''}`} onClick={() => setO({ ...o, kind: 'student' })}>Individual student</button>
      </div>

      <div class="card">
        {o.kind === 'class' ? (
          <>
            <span class="eyebrow">Classes</span>
            {active.map((c) => (
              <label class="check" key={c.id}><input type="checkbox" checked={o.classIds.includes(c.id)} onChange={() => setO({ ...o, classIds: toggle(o.classIds, c.id) })} /><span>{c.name}</span></label>
            ))}
            {data.classes.some((c) => c.archived) && <details class="small"><summary class="muted">Archived classes</summary>{data.classes.filter((c) => c.archived).map((c) => (
              <label class="check" key={c.id}><input type="checkbox" checked={o.classIds.includes(c.id)} onChange={() => setO({ ...o, classIds: toggle(o.classIds, c.id) })} /><span>{c.name}</span></label>
            ))}</details>}
          </>
        ) : (
          <Field label="Student">
            <select class="input" value={o.studentId ?? ''} onChange={(e) => setO({ ...o, studentId: (e.target as HTMLSelectElement).value || undefined })}>
              <option value="">Choose a student…</option>
              {data.classes.map((c) => {
                const list = data.students.filter((s) => s.classId === c.id).sort((a, b) => a.lastName.localeCompare(b.lastName));
                return list.length ? <optgroup key={c.id} label={c.name}>{list.map((s) => <option key={s.id} value={s.id}>{displayName(s)}</option>)}</optgroup> : null;
              })}
            </select>
          </Field>
        )}
      </div>

      <div class="card">
        <span class="eyebrow">Period</span>
        <div class="chips" style="flex-wrap:wrap">
          {PRESETS.map(([l, d]) => <button key={l} class="chip small" onClick={() => setO({ ...o, from: d === null ? undefined : addDays(today(), -d), to: today() })}>{l}</button>)}
        </div>
        <div class="grid2">
          <Field label="From"><input class="input" type="date" value={o.from ?? ''} onInput={(e) => setO({ ...o, from: (e.target as HTMLInputElement).value || undefined })} /></Field>
          <Field label="To"><input class="input" type="date" value={o.to ?? ''} onInput={(e) => setO({ ...o, to: (e.target as HTMLInputElement).value || undefined })} /></Field>
        </div>
        <span class="eyebrow">Categories</span>
        {data.categories.map((c) => (
          <label class="check" key={c.id}><input type="checkbox" checked={o.categoryIds.includes(c.id)} onChange={() => setO({ ...o, categoryIds: toggle(o.categoryIds, c.id) })} /><span>{c.name}</span></label>
        ))}
      </div>

      <div class="card">
        <span class="eyebrow">Content & privacy</span>
        <Switch label="Include teacher notes" checked={o.includeNotes} onChange={(v) => setO({ ...o, includeNotes: v })} />
        <Switch label="Include ICP information" checked={o.includeIcp} onChange={(v) => setO({ ...o, includeIcp: v })} />
        <Switch label="De-identify for external use" hint="Replaces names with Student 001, 002… and removes school IDs." checked={o.deidentify} onChange={(v) => setO({ ...o, deidentify: v })} />
        {o.deidentify && (
          <>
            <Switch label="Also replace class names" hint="Class A, Class B…" checked={o.hideClassNames} onChange={(v) => setO({ ...o, hideClassNames: v })} />
            <div class="notice"><b>Removing names does not guarantee anonymity.</b> {DEID_WARNING}{o.includeNotes ? ' Consider turning off teacher notes for external presentations.' : ''}</div>
          </>
        )}
        <span class="eyebrow" style="margin-top:8px">Format</span>
        <div class="chips">
          <button class={`chip small ${format === 'xlsx' ? 'active' : ''}`} onClick={() => setFormat('xlsx')}>Excel (.xlsx): all sheets</button>
          <button class={`chip small ${format === 'csv' ? 'active' : ''}`} onClick={() => setFormat('csv')}>CSV: observations only</button>
        </div>
      </div>

      <button class="btn primary block" disabled={!valid || busy} onClick={generate}>{busy ? 'Creating…' : 'Create report'}</button>

      {result && (
        <div class="card" style="margin-top:14px">
          <span class="eyebrow">Ready · created on this device</span>
          <h3 style="word-break:break-all">{result.filename}</h3>
          <p class="small muted">{result.students} student{result.students === 1 ? '' : 's'} · {result.observations} observations · {format === 'xlsx' ? `${result.sheets.length} sheets: ${result.sheets.map((s) => s.name).join(', ')}` : 'observations sheet'}</p>
          <div class="actions">
            <button class="btn primary" onClick={() => saveFile(result.blob, result.filename, 'report')}><Icon name="download" /> Save</button>
            <button class="btn" onClick={share}><Icon name="share" /> Share / attach</button>
            <a class="btn" href={emailHref}><Icon name="mail" /> Email draft</a>
          </div>
          <p class="tiny muted" style="margin-top:8px">Email: download (or share) the file, then attach it to the draft. The app never sends email itself.</p>
          {o.deidentify && <Preview result={result} />}
        </div>
      )}
      <SqlExportCard />
      <RecentFiles />
    </div>
  );
}

function Preview({ result }: { result: ExportResult }) {
  const obs = result.sheets.find((s) => s.name === 'Observations');
  if (!obs) return null;
  return (
    <details style="margin-top:10px">
      <summary class="small">Preview de-identified rows</summary>
      <div style="overflow:auto;max-height:260px;margin-top:8px">
        <table class="tiny" style="border-collapse:collapse;min-width:600px">
          {obs.rows.slice(0, 12).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={`border:1px solid var(--line);padding:4px;${i === 0 ? 'font-weight:600' : ''}`}>{c}</td>)}</tr>)}
        </table>
      </div>
    </details>
  );
}

/** Long-term data: everything, in SQL form, for Power BI / Excel / a school database. */
function SqlExportCard() {
  const [deid, setDeid] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const name = (ext: string) => `solaristic-pulse-data_${today()}${deid ? '_deidentified' : ''}.${ext}`;
  async function run(kind: 'sqlite' | 'sql') {
    setBusy(kind);
    try {
      const blob = kind === 'sqlite'
        ? await buildSqliteFile({ deidentify: deid })
        : new Blob([await buildSqlScript({ deidentify: deid })], { type: 'application/sql' });
      await saveFile(blob, name(kind), 'report');
    } catch (e) {
      toast(`Could not create the export: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div class="card" style="margin-top:18px">
      <span class="eyebrow">Long-term data (SQL)</span>
      <p class="small muted" style="margin-top:0">All history in one file, for analysis across terms and years. The <b>database file</b> opens in Power BI, Excel (Power Query) or DB Browser for SQLite. The <b>SQL script</b> loads into a school database (SQL Server, MySQL, PostgreSQL).</p>
      <Switch label="De-identify" hint="Names replaced with Student 001…; known names removed from notes." checked={deid} onChange={setDeid} />
      <div class="grid2">
        <button class="btn" disabled={!!busy} onClick={() => run('sqlite')}><Icon name="download" /> {busy === 'sqlite' ? 'Creating…' : 'Database file'}</button>
        <button class="btn" disabled={!!busy} onClick={() => run('sql')}><Icon name="download" /> {busy === 'sql' ? 'Creating…' : 'SQL script'}</button>
      </div>
    </div>
  );
}
