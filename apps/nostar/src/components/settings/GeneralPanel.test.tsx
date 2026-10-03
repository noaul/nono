import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GeneralPanel } from './GeneralPanel';
import { useAppStore } from '../../store/useAppStore';

vi.unmock('../../store/useAppStore');
afterEach(cleanup);

it('shows the current version without an upstream update check', () => {
  useAppStore.setState({ language: 'en' });
  render(<GeneralPanel t={(_zh, en) => en} />);
  expect(screen.queryByText('Check for Updates')).toBeNull();
  expect(screen.queryByRole('button', { name: /check/i })).toBeNull();
  expect(screen.getByText(/Current Version: v/)).toBeInTheDocument();
});

it('switches translation engine from General settings independently of interface language', () => {
  useAppStore.setState({ language: 'en', translationEngine: 'microsoft' });
  render(<GeneralPanel t={(_zh, en) => en} />);
  expect(screen.getByRole('radio', { name: 'Microsoft' })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: 'Google' }));
  expect(screen.getByRole('radio', { name: 'Google' })).toBeChecked();
  expect(useAppStore.getState().translationEngine).toBe('google');
  expect(useAppStore.getState().language).toBe('en');
});
