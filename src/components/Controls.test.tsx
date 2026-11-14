import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DateRange, parseDate } from './Controls';

describe('planning date controls', () => {
  it('rejects calendar rollover and accepts leap day', () => {
    for (const date of ['', '2026-02-29', '2026-02-31', '2028-13-01', '2029-1-1']) expect(parseDate(date)).toBeNull();
    expect(parseDate('2028-02-29')).toBe(Date.UTC(2028, 1, 29));
  });

  it('offers only dates with room for a nonempty interval inside the shipped coverage', () => {
    const html = renderToStaticMarkup(<DateRange startMs={Date.UTC(2026, 0, 1)} endMs={Date.UTC(2029, 0, 1)} covStartMs={Date.UTC(2026, 0, 1)} covEndMs={Date.UTC(2029, 0, 1)} onChange={() => {}} />);
    expect(html).toContain('min="2026-01-01" max="2028-12-31"');
    expect(html).toContain('min="2026-01-02" max="2029-01-01"');
  });
});
