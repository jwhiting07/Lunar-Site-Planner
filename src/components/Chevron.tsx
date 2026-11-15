/** Minimal chevron; rotates via CSS when its button reports aria-expanded. */
export function Chevron({ className = '' }: { className?: string }) {
  return <svg className={`chev ${className}`} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
    <path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="square" />
  </svg>;
}
