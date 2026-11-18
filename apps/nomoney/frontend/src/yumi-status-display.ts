import type { StatusDay } from './types';

const statusDisplaySegmentCount = 30;
const stateSeverity = { no_data: 0, operational: 1, degraded: 2, outage: 3 } as const;

const usStateAbbreviations: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC'
};

export function buildStatusDisplayHistory(history: StatusDay[]): StatusDay[] {
  if (!history.length) return [];
  if (history.length > statusDisplaySegmentCount) {
    // Merge neighbouring periods so long windows keep every outage visible.
    return Array.from({ length: statusDisplaySegmentCount }, (_, index) => mergeStatusDays(history.slice(
      Math.floor(index * history.length / statusDisplaySegmentCount),
      Math.floor((index + 1) * history.length / statusDisplaySegmentCount)
    )));
  }
  return Array.from({ length: statusDisplaySegmentCount }, (_, index) => {
    const sourceIndex = Math.min(history.length - 1, Math.floor(index * history.length / statusDisplaySegmentCount));
    return history[sourceIndex];
  });
}

function mergeStatusDays(days: StatusDay[]): StatusDay {
  if (days.length === 1) return days[0];
  const measured = days.filter((day) => day.uptimePercent !== null);
  const sampleCount = measured.reduce((sum, day) => sum + day.sampleCount, 0);
  return {
    day: days[0].day,
    endDay: days.at(-1)!.day,
    state: days.reduce((worst, day) => stateSeverity[day.state] > stateSeverity[worst] ? day.state : worst, days[0].state),
    uptimePercent: measured.length
      ? Math.round(measured.reduce((sum, day) => sum + day.uptimePercent! * (sampleCount ? day.sampleCount : 1), 0) / (sampleCount || measured.length) * 100) / 100
      : null,
    sampleCount,
    incidents: days.reduce((sum, day) => sum + day.incidents, 0)
  };
}

export function formatStatusLocation(location: string | null | undefined): string {
  const normalized = location?.trim();
  if (!normalized) return '';

  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return normalized;

  const countryIndex = parts.length - 1;
  const country = parts[countryIndex].toLowerCase();
  if (!['united states', 'united states of america', 'usa', 'us'].includes(country)) {
    return parts.join(', ');
  }

  parts[countryIndex] = 'US';
  const stateIndex = countryIndex - 1;
  parts[stateIndex] = usStateAbbreviations[parts[stateIndex].toLowerCase()] ?? parts[stateIndex];
  return parts.join(', ');
}
