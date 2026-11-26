import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Chat } from './components/Chat';
import { ComputerPanel } from './components/ComputerPanel';
import { ModalRoot } from './components/modals';

export function App() {
  const ready = useStore((s) => s.ready);
  const previewOpen = useStore((s) => s.modal?.kind === 'preview');
  const pane = useStore((s) => s.mobilePane);

  if (!ready) return <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-dim)' }}>Loading…</div>;

  return (
    <div className={`app ${previewOpen ? 'with-preview' : ''}`} data-pane={pane}>
      <Sidebar />
      <Chat />
      {previewOpen && <ComputerPanel />}
      <ModalRoot />
    </div>
  );
}
