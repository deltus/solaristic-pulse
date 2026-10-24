// Paid features. Everything is unlocked while the app is being tested; when plans exist,
// `hasFeature` is the one place that decides.

export const PAID_FEATURES = {
  /** ICP evidence (photos, files, voice memos): more storage, so it will be a paid feature. */
  evidence: 'ICP evidence'
} as const;
export type PaidFeature = keyof typeof PAID_FEATURES;

/** True while testing: every paid feature is free for now. */
export const FREE_WHILE_TESTING = true;

export function hasFeature(_f: PaidFeature): boolean {
  return FREE_WHILE_TESTING;
}
