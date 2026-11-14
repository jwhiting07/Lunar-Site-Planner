import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type PlanningTool = 'timelines' | 'comparison' | 'horizon';

export function PlanningToolsDialog({ initialTool, onClose, timelines, comparison, horizon, timeControls, primarySitePicker, siteSelection, interval, dateRange }: {
  initialTool: PlanningTool;
  onClose: () => void;
  timelines: ReactNode;
  comparison: ReactNode;
  horizon: ReactNode;
  timeControls: ReactNode;
  primarySitePicker: ReactNode;
  siteSelection: ReactNode;
  interval: string;
  dateRange: ReactNode;
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
      <button type="button" className="btn" aria-pressed={tool === 'horizon'} onClick={() => setTool('horizon')}>Local horizon</button>
      <span>{interval} · UTC</span>
    </div>
    <div className="planning-tools-content">
      <div className="planning-date-controls">{dateRange}</div>
      {tool !== 'comparison' && <div className="planning-tools-site-picker">{primarySitePicker}</div>}
      {tool !== 'horizon' && siteSelection}
      {tool === 'timelines' && timelines}
      {tool === 'comparison' && comparison}
      {tool === 'horizon' && horizon}
    </div>
    <footer className="planning-tools-time">{timeControls}</footer>
  </dialog>;
}
