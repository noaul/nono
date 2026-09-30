import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GeneralPanel } from './GeneralPanel';
import { useAppStore } from '../../store/useAppStore';

vi.unmock('../../store/useAppStore');
vi.mock('../UpdateChecker', () => ({ UpdateChecker: () => null }));
afterEach(cleanup);

it('switches translation engine from General settings independently of interface language', () => {
  useAppStore.setState({ language: 'en', translationEngine: 'microsoft' });
  render(<GeneralPanel t={(_zh, en) => en} />);
  expect(screen.getByRole('radio', { name: 'Microsoft' })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: 'Google' }));
  expect(screen.getByRole('radio', { name: 'Google' })).toBeChecked();
  expect(useAppStore.getState().translationEngine).toBe('google');
  expect(useAppStore.getState().language).toBe('en');
});
