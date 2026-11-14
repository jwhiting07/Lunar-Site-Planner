import { memo } from 'react';
import type { SiteDoc } from '../science';
import { COORD_CLASS_LABEL, deg, fmtLat, fmtLon, num } from '../ui/labels';

function SiteFactsImpl({ site, onDetails }: { site: SiteDoc; onDetails: () => void }) {
  return <section className="site-facts" aria-label={`Facts for ${site.short}`}>
    <p className="site-facts-type">{COORD_CLASS_LABEL[site.coord_class]}</p>
    <dl className="site-coordinates">
      <div><dt>Latitude</dt><dd>{fmtLat(site.lat_deg)}</dd></div>
      <div><dt>Longitude</dt><dd>{fmtLon(site.lon_deg)}</dd></div>
    </dl>
    <dl className="site-facts-values">
      <div><dt>Elevation</dt><dd>{num(site.elevation_m, 0)} m</dd></div>
      <div><dt>Regional slope</dt><dd>{deg(site.slope.pixel_deg)}</dd></div>
      <div><dt>Terrain horizon</dt><dd>{deg(site.horizon.min_deg)} to {deg(site.horizon.max_deg)}</dd></div>
    </dl>
    <button type="button" className="site-source-link" onClick={onDetails}>Sources & coordinate details ↗</button>
  </section>;
}

export const SiteFacts = memo(SiteFactsImpl);
