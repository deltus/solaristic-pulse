// Blitz: mark the whole class on one topic in one go. Each topic feeds one of the
// everyday check-in areas, so it shows up in trends, the "last 5 answers" table and reports.

export interface BlitzTopic {
  id: string;
  label: string;
  /** Yes/No question shown above the class list. */
  prompt: string;
  /** Check-in area (category id) this topic feeds. */
  categoryId: string;
  icon: string;
}

export const BLITZ_TOPICS: BlitzTopic[] = [
  { id: 'homework', label: 'Homework', prompt: 'Homework done?', categoryId: 'homework', icon: 'reports' },
  { id: 'preparedness', label: 'Preparedness', prompt: 'Books and equipment?', categoryId: 'homework', icon: 'classes' },
  { id: 'uniform', label: 'Uniform', prompt: 'In correct uniform?', categoryId: 'homework', icon: 'user' },
  { id: 'productivity', label: 'Productivity', prompt: 'Productive this lesson?', categoryId: 'focus', icon: 'today' },
  { id: 'behaviour', label: 'Behaviour', prompt: 'Behaviour on track?', categoryId: 'behaviour', icon: 'students' },
  { id: 'coping', label: 'Coping with the lesson', prompt: 'Coping with the lesson?', categoryId: 'coping', icon: 'shield' }
];

export const blitzTopic = (id: string) => BLITZ_TOPICS.find((t) => t.id === id);

export type BlitzMark = 'yes' | 'no' | 'absent';
