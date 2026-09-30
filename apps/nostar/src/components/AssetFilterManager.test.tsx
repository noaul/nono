import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetFilterManager } from './AssetFilterManager';
import { useAppStore } from '../store/useAppStore';

vi.unmock('../store/useAppStore');
vi.mock('../hooks/useDialog', () => ({ useDialog: () => ({ confirm: vi.fn(async () => true), toast: vi.fn() }) }));
afterEach(cleanup);

describe('preset filter reset', () => {
  it('restores default preset rules and preserves custom rules and active preset selections', async () => {
    const custom = { id: 'custom', name: 'Custom', keywords: [], includeRepos: ['owner/app'] };
    useAppStore.setState({ language: 'en', assetFilters: [
      { id: 'preset-linux', name: 'Edited', keywords: ['whl'], excludeKeywords: ['linux'], includeRepos: ['owner/other'], alwaysExcludeRepos: ['owner/app'] }, custom,
    ], releaseSelectedFilters: ['preset-linux'] });
    render(<AssetFilterManager selectedFilters={['preset-linux']} onFilterToggle={useAppStore.getState().toggleReleaseSelectedFilter} onClearFilters={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset preset filters' }));
    await waitFor(() => expect(useAppStore.getState().assetFilters.find(filter => filter.id === 'preset-linux')).toMatchObject({ keywords: ['linux', 'appimage', 'deb', 'rpm'] }));
    expect(useAppStore.getState().assetFilters.find(filter => filter.id === 'preset-linux')).not.toHaveProperty('alwaysExcludeRepos');
    expect(useAppStore.getState().assetFilters).toContainEqual(custom);
    expect(useAppStore.getState().releaseSelectedFilters).toEqual(['preset-linux']);
  });
});
