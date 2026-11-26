import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { actions } from './store';

actions.boot();

if ('serviceWorker' in navigator && !(import.meta as any).env?.VITE_SINGLEFILE) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
