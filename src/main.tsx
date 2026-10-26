import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter/opsz-italic.css';
// Display-name fonts (loaded by the browser only when a name uses them)
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/orbitron';
import '@fontsource-variable/pixelify-sans';
import '@fontsource-variable/caveat';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/unifrakturmaguntia';
import '@fontsource/bungee';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/base.css';
import './styles/components.css';
import './styles/art.css';
import './styles/cosmetics.css';
import './styles/layout.css';
import './styles/chat.css';
import './styles/profile.css';
import './styles/views.css';
import './styles/settings.css';
import './styles/studio.css';
import './styles/voice.css';
import './styles/responsive.css';
import './styles/auth.css';
import './styles/moderation.css';
import './styles/notifications.css';
import './styles/bugs.css';
import './styles/security.css';
import './styles/guest.css';
import App from './App';
import { installFlagEmojiFallback } from './lib/flagEmoji';
import { initAuth } from './backend/auth';
import {prepareAppStyles} from './lib/appStyles';
import {t} from './i18n';

async function start(){
  try{await prepareAppStyles();}
  catch{
    const box=document.getElementById('onyx-startup');
    if(box){
      const message=document.createElement('p');message.textContent=t('Connection interrupted');box.append(message);
      const retry=document.createElement('button');retry.textContent=t('Try again');retry.onclick=()=>location.reload();box.append(retry);
    }
    return;
  }
installFlagEmojiFallback();
// This branch and its dynamic import are removed entirely by the production build.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('ui-e2e')) {
  await import('./dev/uiE2E').then((m) => m.mountUIE2E());
} else if (import.meta.env.DEV && new URLSearchParams(location.search).has('voice-e2e')) {
  await import('./dev/voiceE2E').then((m) => m.mountVoiceE2E());
} else {
  initAuth();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
document.getElementById('onyx-startup')?.remove();
}
void start();
