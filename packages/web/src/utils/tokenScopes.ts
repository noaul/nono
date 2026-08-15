/**
 * Scope profiles offered when creating an API token.
 *
 * Kept in one place because the token form exists on two screens. When they each carried their own
 * literal, adding a scope meant remembering to edit both, and a miss would silently issue tokens
 * that cannot do what the UI says they can.
 *
 * Mirrors DEFAULT_API_TOKEN_SCOPES in packages/server/src/utils/api-token-scopes.ts.
 */
export const EXTENSION_TOKEN_SCOPES = [
  'bookmarks:read',
  'bookmarks:write',
  'ai:analyze',
  'clips:read',
  'clips:write',
] as const;

export const FULL_TOKEN_SCOPES = ['*'] as const;

export type TokenScopeProfile = 'extension' | 'full';

export function scopesForProfile(profile: TokenScopeProfile): string[] {
  return profile === 'full' ? [...FULL_TOKEN_SCOPES] : [...EXTENSION_TOKEN_SCOPES];
}
