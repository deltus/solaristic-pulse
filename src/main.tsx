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

initSync();
initCloud();

render(<App />, document.getElementById('app')!);

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
