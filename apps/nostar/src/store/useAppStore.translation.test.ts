import { describe, expect, it, vi } from 'vitest';
vi.unmock('./useAppStore');
import { normalizePersistedState, useAppStore } from './useAppStore';
describe('translation engine preferences', () => {
  it('migrates old or invalid settings to Microsoft and keeps Google selections', () => {
    expect(normalizePersistedState({}, useAppStore.getState()).translationEngine).toBe('microsoft');
    expect(normalizePersistedState({translationEngine: 'google'}, useAppStore.getState()).translationEngine).toBe('google');
    expect(normalizePersistedState({translationEngine: 'unknown'} as never, useAppStore.getState()).translationEngine).toBe('microsoft');
    useAppStore.getState().setTranslationEngine('google');
    expect(useAppStore.getState().translationEngine).toBe('google');
    const serialized = useAppStore.persist.getOptions().partialize!(useAppStore.getState());
    expect((serialized as {translationEngine: string}).translationEngine).toBe('google');
    useAppStore.getState().setTranslationEngine('microsoft');
  });
});
