import { memo } from 'react';
import type { ProvenanceDoc, SiteDoc } from '../science';
import { COORD_CLASS_LABEL, SLOPE_DISCLAIMER, deg, fmtLat, fmtLon, num } from '../ui/labels';
import { Panel, RefLinks } from './Common';

function SiteFactsImpl({ site, provenance }: { site: SiteDoc; provenance: ProvenanceDoc | null }) {
  const h = site.horizon;
  return (
    <Panel title="Site facts" help="Position, terrain and sources for the primary site">
      <p className="site-title">
        {site.name} <span className={`badge badge-${site.coord_class}`}>{COORD_CLASS_LABEL[site.coord_class]}</span>
      </p>
      <dl className="facts">
        <dt>Latitude</dt>
        <dd>
          {fmtLat(site.lat_deg)} <span className="muted">({num(site.lat_deg, 4)}{'°'})</span>
        </dd>
        <dt>Longitude</dt>
        <dd>{fmtLon(site.lon_deg)}</dd>
        <dt>Elevation</dt>
        <dd>
          {num(site.elevation_m, 0)} m <span className="muted">LOLA DEM, above 1737.4 km sphere</span>
        </dd>
        {site.published_elevation_m !== null && (
          <>
            <dt>Elevation</dt>
            <dd>
              {num(site.published_elevation_m, 0)} m <span className="muted">published</span>
            </dd>
          </>
        )}
        <dt>Slope</dt>
        <dd>
          {num(site.slope.pixel_deg, 1)}{'°'} pixel, {num(site.slope.mean3x3_deg, 1)}{'°'} 3{'×'}3 mean
          <div className="muted">{SLOPE_DISCLAIMER}</div>
        </dd>
        <dt>Terrain horizon</dt>
        <dd>
          {deg(h.min_deg, 2)} to {deg(h.max_deg, 2)} <span className="muted">(mean {deg(h.mean_deg, 2)})</span>
          <div className="muted">Farthest horizon-defining terrain {num(h.max_obstruction_distance_km, 1)} km</div>
        </dd>
        <dt>Coordinate source</dt>
        <dd>
          <RefLinks ids={site.coord_refs} provenance={provenance} full />
        </dd>
        {site.context_refs.length > 0 && (
          <>
            <dt>Context</dt>
            <dd>
              <RefLinks ids={site.context_refs} provenance={provenance} full />
            </dd>
          </>
        )}
      </dl>
    </Panel>
  );
}

export const SiteFacts = memo(SiteFactsImpl);
