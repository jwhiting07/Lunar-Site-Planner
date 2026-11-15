/**
 * Position a shown popover under (or, when there is no room, above) its anchor,
 * kept inside the viewport. Call after showPopover() so the popup can be measured.
 */
export function placePopover(anchor: HTMLElement, popup: HTMLElement) {
  const a = anchor.getBoundingClientRect();
  const p = popup.getBoundingClientRect();
  const below = innerHeight - a.bottom - 8;
  const above = a.top - 8;
  const flip = p.height > below && above > below;
  return {
    left: Math.max(8, Math.min(a.left, innerWidth - Math.max(a.width, p.width) - 8)),
    top: flip ? Math.max(8, a.top - Math.min(p.height, above) - 4) : a.bottom + 4,
    width: a.width,
  };
}
