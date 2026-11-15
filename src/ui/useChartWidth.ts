import { useEffect, useState, type RefObject } from 'react';

/** Keep SVG coordinates in CSS pixels so chart labels stay readable on phones. */
export function useChartWidth(ref: RefObject<SVGSVGElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => {
      const next = Math.round(element.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
