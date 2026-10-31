import { render } from 'preact';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import './styles.css';
import { App } from './ui/App';
import { isNative } from './platform';
import { initCloud } from './cloud';
import { initSync } from './sync/cloudSync';
import { PREVIEW } from './preview';
import { PreviewBanner } from './ui/PreviewBanner';
import { PulseDB, useDatabase } from './db';
import { readReliefLink } from './logic/relief';
import { enterReliefMode, loadReliefSession, reliefDbName, saveReliefSession } from './relief/device';
import { startReliefOwner } from './relief/owner';
import { purgeBrainDumps } from './services';
import { ReliefApp } from './ui/ReliefApp';

// A relief pass link (?relief=…#rk=…): remember it, then take the pass id and key out of the address bar.
const link = readReliefLink(location.href);
if (link) {
  saveReliefSession({ passId: link.passId, key: link.key });
  history.replaceState(null, '', link.clean);
}

const relief = loadReliefSession();
if (relief) {
  // Relief mode: the class lives in its own database, and this device's own sync stays off.
  useDatabase(new PulseDB(reliefDbName(relief.passId)));
  enterReliefMode(relief);
  initCloud();
  render(<ReliefApp session={relief} />, document.getElementById('app')!);
} else {
  initSync();
  initCloud();
  startReliefOwner();
  void purgeBrainDumps().catch(() => {});
  render(<App />, document.getElementById('app')!);
}

if (PREVIEW) {
  const strip = document.createElement('div');
  document.body.prepend(strip);
  render(<PreviewBanner />, strip);
}

// Offline support: cache the app shell with a service worker (web builds only, never in previews).
if (!PREVIEW && !isNative() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh() {
        if (confirm('A new version of Solaristic Radar is available. Update now? (Your data is not affected.)')) update(true);
      }
    });
  });
}
