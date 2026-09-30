import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterModal } from './FilterModal';

vi.mock('../i18n', () => ({ useCopy: () => (_zh: string, en: string) => en }));
afterEach(cleanup);

describe('filter rule editing', () => {
  it('creates a filter with only blacklist and repository rules', () => {
    const onSave = vi.fn();
    render(<FilterModal isOpen onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. macOS'), { target: { value: 'Release rules' } });
    fireEvent.change(screen.getByLabelText('Excluded keywords'), { target: { value: ' debug , DEBUG, symbols ' } });
    fireEvent.change(screen.getByLabelText('Always include repositories'), { target: { value: ' Owner/App , owner/app' } });
    fireEvent.change(screen.getByLabelText('Always exclude repositories'), { target: { value: 'owner/other' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Release rules', keywords: [], excludeKeywords: ['debug', 'symbols'], includeRepos: ['Owner/App'], alwaysExcludeRepos: ['owner/other'] }));
  });
});
