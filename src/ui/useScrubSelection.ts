import { useCallback, useEffect, useRef } from 'react';

/** Suppress selection even when a captured scrub gesture leaves its own surface. */
export function useScrubSelection() {
  const active = useRef(false);
  const stop = useCallback(() => {
    if (active.current) delete document.body.dataset.timelineDragging;
    active.current = false;
  }, []);
  useEffect(() => {
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);
    window.addEventListener('blur', stop);
    return () => {
      stop();
      window.removeEventListener('pointerup', stop, true);
      window.removeEventListener('pointercancel', stop, true);
      window.removeEventListener('blur', stop);
    };
  }, [stop]);
  return { start: () => { active.current = true; document.body.dataset.timelineDragging = 'true'; }, stop };
}
