/** Presentation-only explanations of the existing science registry; no calculations run here. */
export interface MethodMath {
  explanation: string;
  equations: string[];
  symbols: [string, string][];
}

const tex = String.raw;

export const METHOD_MATH: Record<string, MethodMath> = {
  'M-SITE': {
    explanation: 'Read the ground height from the four surrounding elevation-map pixels, then add it and the observer height to the Moon’s reference radius. Convert all heights to kilometres before adding them.',
    equations: [tex`h_{\mathrm{site}} = \operatorname{bilinear}\!\left(\mathrm{DEM},\,\operatorname{stereo}(\varphi,\lambda)\right)`, tex`r_o = R + h_{\mathrm{site}} + h_{\mathrm{obs}}`],
    symbols: [[tex`\varphi,\lambda`, 'Site latitude and longitude. stereo converts them to polar map coordinates.'], [tex`\mathrm{DEM}`, 'LOLA LDEM_80S_80MPP_ADJ elevation map; bilinear blends the four neighbouring pixels.'], [tex`R`, 'Moon reference radius: 1,737.4 km.'], [tex`h_{\mathrm{site}},h_{\mathrm{obs}}`, 'Ground elevation above the reference sphere and observer height above the ground.'], [tex`r_o`, 'Observer’s distance from the Moon’s centre, in km.']],
  },
  'M-EPHEM': {
    explanation: 'SPICE gives the Sun or Earth position at each saved hour. Between two hours, blend the earlier and later vectors in proportion to the elapsed time.',
    equations: [tex`\mathbf r_{\mathrm{body}}(t) = \operatorname{spkpos}(\mathrm{body},t,\mathrm{frame},\mathrm{LT{+}S},\mathrm{Moon})`, tex`w = \frac{t-t_i}{t_{i+1}-t_i}`, tex`\mathbf r(t) = (1-w)\,\mathbf r_i + w\,\mathbf r_{i+1}`],
    symbols: [[tex`t,t_i,t_{i+1}`, 'Requested time and its surrounding saved sample times, using the same time units.'], [tex`w`, 'Fraction of the sample interval elapsed: 0 at the earlier hour, 1 at the later hour.'], [tex`\mathbf r_i,\mathbf r_{i+1}`, 'Moon-centred position vectors at those samples, in km. Bold symbols are vectors.'], [tex`\mathrm{frame},\mathrm{LT{+}S}`, 'MOON_ME_DE440_ME421 lunar frame; light-time and stellar-aberration corrections.']],
  },
  'M-GEOM': {
    explanation: 'Subtract the observer position from the body position. Project that direction onto local east, north and up; use those components to find the compass bearing and height above the local horizontal.',
    equations: [tex`\mathbf v = \mathbf r_{\mathrm{body}} - \mathbf r_{\mathrm{obs}}`, tex`\mathbf E = (-\sin\lambda,\,\cos\lambda,\,0)`, tex`\mathbf N = (-\sin\varphi\cos\lambda,\,-\sin\varphi\sin\lambda,\,\cos\varphi)`, tex`\mathbf U = (\cos\varphi\cos\lambda,\,\cos\varphi\sin\lambda,\,\sin\varphi)`, tex`A = \operatorname{atan2}(\mathbf v\cdot\mathbf E,\,\mathbf v\cdot\mathbf N)\pmod{360^\circ}`, tex`e = \arcsin\!\left(\frac{\mathbf v\cdot\mathbf U}{\lVert\mathbf v\rVert}\right)`],
    symbols: [[tex`\varphi,\lambda`, 'Site latitude and longitude.'], [tex`\mathbf v`, 'Vector from observer to Sun or Earth, in km.'], [tex`\mathbf E,\mathbf N,\mathbf U`, 'Local east, north and up unit vectors.'], [tex`\cdot,\lVert\mathbf v\rVert`, 'Dot product (projection onto an axis), and vector length.'], [tex`A,e`, 'Azimuth clockwise from north and elevation above the horizontal, in degrees. atan2 finds a bearing from east/north components; arcsin recovers an angle from its sine.']],
  },
  'M-HORIZON': {
    explanation: 'Look along each compass bearing and calculate the apparent height of every terrain sample, allowing for the Moon’s curvature. The highest angle is the skyline that the Sun or Earth must clear. Blend adjacent bearings for directions between them.',
    equations: [tex`\theta = \frac{s}{R}`, tex`e(s) = \operatorname{atan2}\!\left((R+h(s))\cos\theta-r_o,\,(R+h(s))\sin\theta\right)`, tex`H(A) = \max_s e(s)`],
    symbols: [[tex`s,R,\theta`, 'Surface distance along the ray, reference radius, and central angle in radians; s and R use the same distance units.'], [tex`h(s),r_o`, 'Terrain elevation at that distance and observer distance from the Moon’s centre, in the same units as R.'], [tex`e(s)`, 'Terrain’s apparent elevation angle; atan2 uses vertical and horizontal offsets to find the angle.'], [tex`A,H(A)`, 'Compass bearing and the highest terrain elevation at that bearing. Rays sample every 0.5° out to 600 km.']],
  },
  'M-SUNVIS': {
    explanation: 'Compare the Sun’s centre with the skyline. The Sun is visible if its upper edge clears the terrain. The disk fraction estimates how much of the circular Sun is exposed; 0 means fully hidden and 1 means fully visible.',
    equations: [tex`C_s = e_s-H(A_s)`, tex`\rho = \arcsin\!\left(\frac{R_{\odot}}{d}\right)`, tex`\text{Sun visible when } C_s+\rho>0`, tex`x = \operatorname{clamp}\!\left(\frac{C_s}{\rho},-1,1\right)`, tex`f_{\mathrm{disk}} = 1-\frac{\arccos x-x\sqrt{1-x^2}}{\pi}`],
    symbols: [[tex`e_s,A_s,H(A_s)`, 'Sun elevation, Sun azimuth and terrain skyline at that azimuth.'], [tex`C_s,\rho`, 'Sun-centre clearance and apparent solar radius, expressed in the same angular units.'], [tex`R_{\odot},d`, 'Solar radius (695,700 km) and observer-to-Sun distance in km. arcsin converts their ratio to an angle.'], [tex`x,\operatorname{clamp}`, 'Clearance divided by apparent radius, limited to the range −1 to 1.'], [tex`f_{\mathrm{disk}},\pi`, 'Visible fraction of the disk, and pi (about 3.14159). arccos is inverse cosine; the square-root term gives the circular-segment correction.']],
  },
  'M-EARTHVIS': {
    explanation: 'Subtract the terrain skyline from the Earth-centre elevation. Count Earth as visible only when that clearance is strictly greater than the selected minimum.',
    equations: [tex`C_e = e_e-H(A_e)`, tex`\text{Earth visible when } C_e>C_{\min}`],
    symbols: [[tex`e_e,A_e,H(A_e)`, 'Earth-centre elevation, Earth azimuth and terrain skyline at that azimuth, in degrees.'], [tex`C_e,C_{\min}`, 'Earth-centre clearance and required minimum clearance, in degrees. The default minimum is 0°.']],
  },
  'M-WINDOWS': {
    explanation: 'When the visibility margin changes sign between integration samples, estimate the crossing in proportion to those two margins. Final summaries use 15-minute steps with 5-minute probes near the horizon; the chart retains hourly samples. Add the visible-window durations and divide by the full interval to get the visible fraction.',
    equations: [tex`t_c = t_i+\frac{m_i}{m_i-m_{i+1}}\,(t_{i+1}-t_i)`, tex`T_{\mathrm{visible}} = \sum_j(t_{\mathrm{end},j}-t_{\mathrm{start},j})`, tex`f_{\mathrm{visible}} = \frac{T_{\mathrm{visible}}}{T_{\mathrm{interval}}}`],
    symbols: [[tex`t_i,t_{i+1},t_c`, 'Two neighbouring sample times and the estimated crossing time, using the same time units.'], [tex`m_i,m_{i+1}`, 'Visibility margins at those times: Sun upper-edge clearance, or Earth-centre clearance minus its chosen minimum.'], [tex`\sum_j`, 'Add the duration of every visible window j. Durations are converted to hours for display.'], [tex`f_{\mathrm{visible}}`, 'Visible fraction from 0 to 1; multiply by 100 to display a percentage.']],
  },
  'M-POWER': {
    explanation: 'Scale sunlight intensity for the actual Sun distance. Multiply by panel area, efficiency, the pointing factor and the exposed solar-disk fraction to estimate electrical power.',
    equations: [tex`S(r) = 1361\,\mathrm{W\,m^{-2}}\left(\frac{1\,\mathrm{au}}{r}\right)^2`, tex`P = S(r)\,A\,\eta\,\cos i\,f_{\mathrm{disk}}`, tex`\cos i = \begin{cases}1 & \text{Sun-tracking}\\ \cos e & \text{Vertical, azimuth-tracking}\\ \max(0,\sin e) & \text{Horizontal}\end{cases}`],
    symbols: [[tex`r,S(r)`, 'Sun distance and solar irradiance (watts per square metre). Use the same distance units for r and 1 astronomical unit (au).'], [tex`A,\eta`, 'Panel area in m² and efficiency as a fraction: 28% becomes 0.28.'], [tex`i,e`, 'Angle between panel normal and Sun direction, and Sun elevation. The selected pointing mode determines cos i.'], [tex`f_{\mathrm{disk}},P`, 'Visible solar-disk fraction (0–1) and generated electrical power in watts.']],
  },
  'M-BATTERY': {
    explanation: 'First split an integration step wherever generation crosses the load, so each substep only charges or only discharges. For each substep i, average its endpoint power and multiply by elapsed hours. Subtract the load energy and constrain storage to empty/full. Solve the empty/full crossing time within the substep; unmet demand and surplus are accounted separately.',
    equations: [tex`E_{\mathrm{gen},i} = \frac{P_i+P_{i+1}}{2}\,\Delta t`, tex`E_{i+1} = \operatorname{clamp}\!\left(E_i+E_{\mathrm{gen},i}-P_{\mathrm{load}}\Delta t,\,0,\,E_{\mathrm{cap}}\right)`, tex`E_{\mathrm{unserved}} = \sum_i\max\!\left(0,\,P_{\mathrm{load}}\Delta t-E_i-E_{\mathrm{gen},i}\right)`],
    symbols: [[tex`P_i,P_{i+1},P_{\mathrm{load}}`, 'Generated power at consecutive samples and the constant electrical load, in watts.'], [tex`\Delta t`, 'Step length in hours, so watts × hours gives watt-hours (Wh).'], [tex`E_i,E_{i+1},E_{\mathrm{cap}}`, 'Stored energy before and after the step, and battery capacity, in Wh.'], [tex`\operatorname{clamp},\max,\sum_i`, 'Limit a value to the given range; choose the larger value; add over all steps.'], [tex`E_{\mathrm{unserved}}`, 'Total unmet energy demand in Wh. The battery starts full.']],
  },
  'M-PATCH': {
    explanation: 'Place each terrain-grid point at its measured height on the curved Moon, then express it relative to the site. Horizontal distance follows the local tangent plane; up is the vertical offset from the site’s surface.',
    equations: [tex`\theta = \frac{s}{R}`, tex`d_{\mathrm{horizontal}} = (R+h)\sin\theta`, tex`z_{\mathrm{up}} = (R+h)\cos\theta-(R+h_{\mathrm{site}})`],
    symbols: [[tex`s,R,\theta`, 'Surface arc distance from the site, Moon reference radius and central angle in radians.'], [tex`h,h_{\mathrm{site}}`, 'Grid-point and site elevations above the reference sphere. All lengths use the same units.'], [tex`d_{\mathrm{horizontal}},z_{\mathrm{up}}`, 'Horizontal displacement and vertical offset from the site. Azimuth A sets the compass direction of that horizontal displacement.']],
  },
};
