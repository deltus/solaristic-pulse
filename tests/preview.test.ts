import { describe, expect, it } from 'vitest';
import { dbName, previewName, storageKey } from '../src/preview';

describe('preview builds', () => {
  it('keeps the live database name when not a preview', () => {
    expect(previewName({})).toBeUndefined();
    expect(previewName({ VITE_PREVIEW: '' })).toBeUndefined();
    expect(dbName(undefined)).toBe('solaristic-pulse');
    expect(storageKey('pulse.sync', undefined)).toBe('pulse.sync');
  });

  it('uses a separate database and storage keys for each preview', () => {
    const p = previewName({ VITE_PREVIEW: 'round4' });
    expect(p).toBe('round4');
    expect(dbName(p)).toBe('solaristic-pulse-preview-round4');
    expect(storageKey('pulse.sync', p)).toBe('preview-round4:pulse.sync');
    expect(storageKey('pulse.sync', p).startsWith('pulse.')).toBe(false);
  });

  it('cleans odd characters out of branch names', () => {
    expect(previewName({ VITE_PREVIEW: 'round 5/a' })).toBe('round-5-a');
  });
});
