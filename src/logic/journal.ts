// Teacher journal: which lesson a new entry links to, filtering for the export, and the Word
// (.docx) export itself. A .docx is a zip of XML files, built here with JSZip (already in the app).
// The journal is private: nothing here is used by reports or shared exports.

import type { JournalEntry, Lesson } from '../types';
import { aitslLabel } from '../config/journal';
import { formatDate } from '../lib/dates';

/** The current (open) lesson of the class, else its most recent one. */
export function defaultJournalLesson(lessons: Lesson[], classId: string): Lesson | undefined {
  const mine = lessons.filter((l) => l.classId === classId && !l.historical).sort((a, b) => b.openedAt - a.openedAt);
  return mine.find((l) => l.status !== 'closed') ?? mine[0];
}

export function filterJournal(entries: JournalEntry[], f: { from?: string; to?: string; classIds?: string[] }): JournalEntry[] {
  return entries
    .filter((e) => (!f.from || e.date >= f.from) && (!f.to || e.date <= f.to) && (!f.classIds?.length || f.classIds.includes(e.classId)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (text: string, opts: { bold?: boolean; size?: number; italic?: boolean; color?: string } = {}) =>
  `<w:r><w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.italic ? '<w:i/>' : ''}${opts.color ? `<w:color w:val="${opts.color}"/>` : ''}${opts.size ? `<w:sz w:val="${opts.size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (runs: string, spaceAfter = 120) => `<w:p><w:pPr><w:spacing w:after="${spaceAfter}"/></w:pPr>${runs}</w:p>`;

/** The document body: a title, then each entry with its date, class, lesson, tags and standard. */
export function journalDocumentXml(p: {
  title: string; subtitle: string; entries: JournalEntry[]; className: (id: string) => string; lessonName: (id?: string) => string;
}): string {
  const body = [
    para(run(p.title, { bold: true, size: 36 }), 60),
    para(run(p.subtitle, { italic: true, color: '666666' }), 240),
    ...(p.entries.length ? p.entries.flatMap((e) => {
      const lesson = p.lessonName(e.lessonId);
      const meta = [p.className(e.classId), lesson && `Lesson: ${lesson}`].filter(Boolean).join(' · ');
      const tags = [...e.tags, aitslLabel(e.aitsl)].filter(Boolean).join(' · ');
      return [
        para(run(formatDate(e.date), { bold: true, size: 26 }), 40),
        para(run(meta, { color: '555555' }), 60),
        ...e.text.split(/\r?\n/).map((line) => para(run(line))),
        ...(tags ? [para(run(tags, { italic: true, color: '555555' }), 280)] : [para('', 160)])
      ];
    }) : [para(run('No journal entries in this period.'))])
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** A Word document (.docx) from the document XML. */
export async function docxBlob(documentXml: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_TYPE });
}
