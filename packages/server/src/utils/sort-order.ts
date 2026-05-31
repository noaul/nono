const MAX_POSTGRES_INT = 2_147_483_647;

export function createSortOrder(offset = 0) {
  return Math.min(MAX_POSTGRES_INT, Math.floor(Date.now() / 1000) + offset);
}
