// Include fixed offsets as well as every named zone (including UTC−12, which has
// no inhabited city in Intl's canonical list). IANA Etc/GMT signs are reversed.
const fixedZones = Array.from({ length: 27 }, (_, index) => index - 12).filter(offset => offset !== 0)
  .map(offset => 'Etc/GMT' + (offset > 0 ? '-' : '+') + Math.abs(offset));
export const TIME_ZONES = ['UTC', ...Intl.supportedValuesOf('timeZone'), ...fixedZones];

export interface TimeZoneChoice {
  id: string; place: string; name: string; offset: string; offsetMinutes: number;
}

/** Use Intl's current offset and localized name so DST and fractional offsets stay accurate. */
export function timeZoneChoice(id: string, at: Date): TimeZoneChoice {
  const part = (style: 'long' | 'longOffset') => new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: style }).formatToParts(at).find(value => value.type === 'timeZoneName')?.value ?? '';
  const offsetName = part('longOffset');
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetName);
  const offsetMinutes = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1) : 0;
  const offset = offsetName.replace('GMT', 'UTC');
  return { id, place: id === 'UTC' ? 'UTC' : id.startsWith('Etc/') ? 'Fixed ' + offset : id.replaceAll('_', ' ').split('/').slice(1).join(' / '), name: part('long'), offset, offsetMinutes };
}

export function timeZoneChoices(at: Date): TimeZoneChoice[] {
  return TIME_ZONES.map(id => timeZoneChoice(id, at)).sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.place.localeCompare(b.place) || a.id.localeCompare(b.id));
}
