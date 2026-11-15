import { useLayoutEffect, useRef, type Ref } from 'react';

export const MOON_FOV = 38;

/** Shared by the loading silhouette and the actual globe camera. */
export function moonFitDistance(aspect: number) {
  return Math.max(3.5, 1.12 / Math.sin(Math.atan(Math.tan(MOON_FOV * Math.PI / 360) * Math.min(aspect, 1))));
}

export function MoonPlaceholder() {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = element;
      if (!width || !height) return;
      const distance = moonFitDistance(width / height);
      // Perspective silhouette of the unit sphere, including its curved edge.
      const diameter = height / (Math.tan(MOON_FOV * Math.PI / 360) * Math.sqrt(distance * distance - 1));
      element.style.setProperty('--moon-disc-size', `${diameter}px`);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={host} className="moon-placeholder" aria-hidden="true"><span /></div>;
}

export function MoonNavigationControls({ onZoom, hoverReadout, scaleReadout, scaleLine }: {
  onZoom?: (factor: number) => void;
  hoverReadout?: Ref<HTMLOutputElement>; scaleReadout?: Ref<HTMLOutputElement>; scaleLine?: Ref<HTMLSpanElement>;
}) {
  return <>
    <div className="moon-coordinate-hud" aria-label="Moon surface scale and cursor coordinates">
      <output ref={hoverReadout} aria-label="Moon cursor latitude and longitude" aria-live="off">Lat: —, Lon: —</output>
      <div className="moon-scale-bar"><span ref={scaleLine} /><output ref={scaleReadout} aria-label="Moon distance scale">— km</output></div>
    </div>
    <div className="moon-zoom">
      <button type="button" className="btn explorer-button" disabled={!onZoom} aria-label="Zoom in on Moon" onClick={() => onZoom?.(0.85)}>+</button>
      <button type="button" className="btn explorer-button" disabled={!onZoom} aria-label="Zoom out from Moon" onClick={() => onZoom?.(1.18)}>−</button>
    </div>
  </>;
}

export function MoonLoading({ showPlaceholder = false, chromeReady = false }: { showPlaceholder?: boolean; chromeReady?: boolean }) {
  return <div className={`moon-stage moon-stage-full moon-loading${chromeReady ? ' moon-chrome-ready' : ''}`} aria-busy="true" aria-label="Loading Moon">
    {showPlaceholder && <MoonPlaceholder />}
    <MoonNavigationControls />
  </div>;
}
