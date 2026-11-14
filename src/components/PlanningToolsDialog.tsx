import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type PlanningTool = 'timelines' | 'comparison';

export function PlanningToolsDialog({ initialTool, onClose, timelines, comparison, timeControls, siteSelection, interval }: {
  initialTool: PlanningTool;
  onClose: () => void;
  timelines: ReactNode;
  comparison: ReactNode;
  timeControls: ReactNode;
  siteSelection: ReactNode;
  interval: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tool, setTool] = useState(initialTool);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className="planning-tools-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="planning-tools-header">
      <h2 id={titleId}>Timelines & comparison</h2>
      <button type="button" className="btn" onClick={onClose} aria-label="Close timelines and comparison">Close <span aria-hidden="true">×</span></button>
    </header>
    <div className="planning-tools-switch" role="group" aria-label="Analysis tool">
      <button type="button" className="btn" aria-pressed={tool === 'timelines'} onClick={() => setTool('timelines')}>Timelines</button>
      <button type="button" className="btn" aria-pressed={tool === 'comparison'} onClick={() => setTool('comparison')}>Compare sites</button>
      <span>{interval} · UTC</span>
    </div>
    <div className="planning-tools-content">
      {siteSelection}
      {tool === 'timelines' ? timelines : comparison}
    </div>
    <footer className="planning-tools-time">{timeControls}</footer>
  </dialog>;
}
