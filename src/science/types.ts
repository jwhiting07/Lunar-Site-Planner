/** Shapes of the generated files in public/data/ (written by scripts/build_data.py). */

export interface SiteDoc {
  id: string;
  name: string;
  short: string;
  /** Planetocentric latitude, degrees (ME frame). */
  lat_deg: number;
  /** East-positive longitude, degrees (ME frame). */
  lon_deg: number;
  /** verified_landing = published as-landed spacecraft position; representative_point = analysis point chosen by this project. */
  coord_class: 'verified_landing' | 'representative_point';
  coord_refs: string[];
  coord_note: string;
  context_refs: string[];
  selection: Record<string, unknown> | null;
  /** Height above the 1737.4 km sphere sampled from the LOLA DEM, metres. */
  elevation_m: number;
  elevation_source: string;
  /** Elevation published with the coordinates, if any (not used in calculations). */
  published_elevation_m: number | null;
  slope: { pixel_deg: number; mean3x3_deg: number; source: string; note: string };
  /** South polar stereographic [x, y], metres. */
  stereo_xy_m: [number, number];
  terrain_aware: boolean;
  horizon: {
    file: string;
    layout: string;
    n_az: number;
    az_step_deg: number;
    min_deg: number;
    max_deg: number;
    mean_deg: number;
    max_obstruction_distance_km: number;
    fraction_azimuths_beyond_patch: number;
    coverage_min_km: number;
    unseen_terrain_margin_min_deg: number;
    samples_from_240m_dem_fraction: number;
  };
  terrain: {
    texture_file?: string;
    file: string;
    n: number;
    half_width_m: number;
    spacing_m: number;
    layout: string;
    min_m: number;
    max_m: number;
    samples_from_240m_dem_fraction: number;
  };
}

export interface SitesDoc {
  schema: number;
  generated_utc: string;
  frame: string;
  reference_radius_m: number;
  /** ASSUMED height of the observer above the DEM surface used for the horizon masks, metres. */
  observer_height_m: number;
  overview: {
    file: string;
    px: number;
    half_width_m: number;
    meters_per_px: number;
    projection: string;
    note: string;
  };
  sites: SiteDoc[];
}

export interface EphemerisIndex {
  schema: number;
  frame: string;
  frame_description: string;
  center: string;
  aberration_correction: string;
  units: string;
  layout: string;
  time_system: string;
  step_s: number;
  start_utc: string;
  stop_utc: string;
  files: { file: string; t0_utc: string; n: number; bytes: number }[];
  /** Start of the default planning window (searches without a date use it); start_utc may be earlier (historical data). */
  default_start_utc?: string;
  /** Why the historical coverage begins where it does. */
  first_contact?: string;
  history_interpolation?: { max_error_vs_spice: Record<string, number>; check: string };
  body_radii_km: { sun: number; earth_equatorial: number; moon: number; source: string };
  interpolation: {
    method: string;
    max_error_vs_spice: Record<string, number>;
    check: string;
  };
  refs: string[];
}

export interface ReferenceDoc {
  id: string;
  authority: string;
  title: string;
  url: string;
  doi?: string;
  data_doi?: string;
  version: string;
  kind: string;
}

export interface ProvenanceDoc {
  schema: number;
  generated_utc: string;
  pipeline: { command: string; scripts: Record<string, string>; python: string; packages: Record<string, string> };
  conventions: Record<string, string | number>;
  parameters: Record<string, { value: unknown; class: string; id: string; note?: string }>;
  self_checks: Record<string, unknown>;
  sources: {
    file: string;
    url: string;
    role: string;
    ref: string;
    bytes: number;
    sha256: string;
    retrieved_utc: string;
    used_for: string[];
  }[];
  products: {
    file: string;
    description: string;
    inputs: string[];
    method?: string;
    frame?: string;
    units?: string;
    refs: string[];
    bytes?: number;
    sha256?: string;
    generated_utc: string;
  }[];
  references: ReferenceDoc[];
}
