import { useState } from 'react';
import { load, save } from '../lib/storage';

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Shown in the browser (not the installed app): how to put it on the home screen. */
export function InstallHint() {
  const [hidden, setHidden] = useState(() => load('bbw.installHintHidden', false));
  if (hidden || isStandalone()) return null;
  return (
    <section className="card install">
      <div className="section-head">
        <h3>Add to your Home Screen</h3>
        <button className="btn text small" onClick={() => { save('bbw.installHintHidden', true); setHidden(true); }}>Not now</button>
      </div>
      <p className="muted small">
        {isIOS()
          ? <>Tap Safari's Share button, then <b>Add to Home Screen</b>. It opens full screen, like a real app.</>
          : <>Open your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. It opens full screen, like a real app.</>}
      </p>
    </section>
  );
}
