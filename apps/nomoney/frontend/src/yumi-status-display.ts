import type { StatusDay } from './types';

const statusDisplaySegmentCount = 90;

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
  return Array.from({ length: statusDisplaySegmentCount }, (_, index) => {
    const sourceIndex = Math.min(history.length - 1, Math.floor(index * history.length / statusDisplaySegmentCount));
    return history[sourceIndex];
  });
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
