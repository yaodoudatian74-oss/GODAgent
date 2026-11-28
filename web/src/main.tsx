import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { actions } from './store';

actions.boot();

// Skip the service worker inside the APK (served from godagent.local / file:) —
// the app's assets are already served locally there, and an extra SW only risks
// interfering with model/wasm requests.
const inApk = location.hostname === 'godagent.local' || location.protocol === 'file:';
if ('serviceWorker' in navigator && !(import.meta as any).env?.VITE_SINGLEFILE && !inApk) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
