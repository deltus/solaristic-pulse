// Bright strip on every screen of a branch preview, so nobody mistakes it for the live app.
import { useState } from 'preact/hooks';
import { getSettings, saveSettings } from '../db';
import { loadDemoData } from '../demo';
import { PREVIEW } from '../preview';

export function PreviewBanner() {
  const [busy, setBusy] = useState(false);
  if (!PREVIEW) return null;
  async function demo() {
    if (!confirm('Add the fictional demo classes to this preview?')) return;
    setBusy(true);
    await loadDemoData();
    const s = await getSettings();
    // Skip setup so the demo is ready to try straight away.
    if (!s.onboarded) await saveSettings({ onboarded: true, tutorialDone: true, profile: { ...s.profile, name: s.profile.name || 'Preview teacher' } });
    location.hash = '#/today';
    location.reload();
  }
  return (
    <div class="preview-banner" role="status">
      <span>PREVIEW · {PREVIEW} · not the live app · test data only</span>
      <button onClick={demo} disabled={busy}>{busy ? 'Loading…' : 'Load demo data'}</button>
    </div>
  );
}
