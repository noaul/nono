import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GitHubConnectScreen } from './GitHubConnectScreen';
import { useAppStore } from '../store/useAppStore';
import { backend } from '../services/backendAdapter';
import { GitHubApiService } from '../services/githubApi';

vi.unmock('../store/useAppStore');

describe('GitHubConnectScreen', () => {
  beforeEach(() => {
    useAppStore.setState({ language: 'en', githubToken: null, user: null });
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('verifies the typed token itself, not the token stored on the server, then saves it', async () => {
    const verify = vi.spyOn(backend, 'verifyGitHubToken').mockResolvedValue({ id: 1, login: 'octo', name: 'Octo', avatar_url: '', email: null });
    const save = vi.spyOn(backend, 'syncSettings').mockResolvedValue();
    const proxied = vi.spyOn(GitHubApiService.prototype, 'getCurrentUser');

    render(<GitHubConnectScreen />);
    fireEvent.change(screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx'), { target: { value: 'ghp_new' } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({ github_token: 'ghp_new' }));
    expect(verify).toHaveBeenCalledWith('ghp_new');
    expect(proxied).not.toHaveBeenCalled();
    expect(useAppStore.getState().user).toMatchObject({ login: 'octo' });
  });

  it('does not save a token GitHub rejects', async () => {
    vi.spyOn(backend, 'verifyGitHubToken').mockRejectedValue(new Error('GitHub token expired or invalid'));
    const save = vi.spyOn(backend, 'syncSettings').mockResolvedValue();

    render(<GitHubConnectScreen />);
    fireEvent.change(screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx'), { target: { value: 'ghp_bad' } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(screen.getByText('GitHub token expired or invalid')).toBeInTheDocument());
    expect(save).not.toHaveBeenCalled();
  });
});
