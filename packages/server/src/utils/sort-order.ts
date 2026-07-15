const MAX_POSTGRES_INT = 2_147_483_647;
const MIN_POSTGRES_INT = -2_147_483_648;

export function createSortOrder(offset = 0) {
  return Math.max(MIN_POSTGRES_INT, Math.min(MAX_POSTGRES_INT, -Math.floor(Date.now() / 1000) - Math.max(0, offset)));
}
