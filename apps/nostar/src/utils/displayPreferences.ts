export const cardFieldKeys = [
  'description',
  'tags',
  'language',
  'stars',
  'license',
  'updated',
] as const;
export type CardField = (typeof cardFieldKeys)[number];
export interface DisplayPreferences {
  fontSize: 'small' | 'default' | 'large';
  reducedMotion: boolean;
  cardFields: Record<CardField, boolean>;
}
export const defaultDisplayPreferences: DisplayPreferences = {
  fontSize: 'default',
  reducedMotion: false,
  cardFields: {
    description: true,
    tags: true,
    language: true,
    stars: true,
    license: true,
    updated: true,
  },
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function normalizeDisplayPreferences(
  value: unknown
): DisplayPreferences {
  const input = record(value);
  const fields = record(input.cardFields);
  return {
    fontSize:
      input.fontSize === 'small' || input.fontSize === 'large'
        ? input.fontSize
        : 'default',
    reducedMotion: input.reducedMotion === true,
    cardFields: Object.fromEntries(
      cardFieldKeys.map((key) => [
        key,
        typeof fields[key] === 'boolean' ? fields[key] : true,
      ])
    ) as Record<CardField, boolean>,
  };
}
export function normalizeListSettings(mapping: unknown, memberships: unknown) {
  return {
    categoryListIdMap: Object.fromEntries(
      Object.entries(record(mapping)).filter(
        ([, v]) => typeof v === 'string' && v.length > 0 && v.length <= 200
      )
    ) as Record<string, string>,
    githubListMemberships: Object.fromEntries(
      Object.entries(record(memberships))
        .filter(([, v]) => Array.isArray(v))
        .map(([key, v]) => [
          key,
          [
            ...new Set(
              (v as unknown[])
                .filter(
                  (name): name is string =>
                    typeof name === 'string' && /^[\w.-]+\/[\w.-]+$/.test(name)
                )
                .map((name) => name.toLowerCase())
            ),
          ],
        ])
    ) as Record<string, string[]>,
  };
}
/** Shared by backend sync, manual sync and backups, including explicit empty maps. */
export function readBatchTwoSettings(value: Record<string, unknown>) {
  const result: Partial<{
    displayPreferences: DisplayPreferences;
    categoryListIdMap: Record<string, string>;
    githubListMemberships: Record<string, string[]>;
  }> = {};
  if ('displayPreferences' in value)
    result.displayPreferences = normalizeDisplayPreferences(
      value.displayPreferences
    );
  const lists = normalizeListSettings(
    value.categoryListIdMap,
    value.githubListMemberships
  );
  if ('categoryListIdMap' in value)
    result.categoryListIdMap = lists.categoryListIdMap;
  if ('githubListMemberships' in value)
    result.githubListMemberships = lists.githubListMemberships;
  return result;
}
