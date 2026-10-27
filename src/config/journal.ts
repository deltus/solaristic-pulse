// Teacher journal: tags to pick from (custom tags can be added on each entry) and the seven
// AITSL Australian Professional Standards for Teachers.

export const JOURNAL_TAGS: string[] = [
  'Behaviour management', 'Lesson design', 'Engagement', 'Differentiation', 'Assessment', 'Relationships', 'Mentor feedback'
];

export const AITSL_STANDARDS: { n: number; label: string }[] = [
  { n: 1, label: 'Know students and how they learn' },
  { n: 2, label: 'Know the content and how to teach it' },
  { n: 3, label: 'Plan for and implement effective teaching and learning' },
  { n: 4, label: 'Create and maintain supportive and safe learning environments' },
  { n: 5, label: 'Assess, provide feedback and report on student learning' },
  { n: 6, label: 'Engage in professional learning' },
  { n: 7, label: 'Engage professionally with colleagues, parents/carers and the community' }
];

export const aitslLabel = (n?: number) => (n ? `Standard ${n}: ${AITSL_STANDARDS.find((s) => s.n === n)?.label ?? ''}` : '');
