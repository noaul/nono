import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BackupPanel } from './BackupPanel';
import { useAppStore } from '../../store/useAppStore';
import { backend } from '../../services/backendAdapter';
import { WebDAVService } from '../../services/webdavService';
vi.unmock('../../store/useAppStore');
const {toastMock} = vi.hoisted(() => ({toastMock: vi.fn()}));
vi.mock('../../hooks/useDialog', () => ({useDialog: () => ({toast: toastMock, confirm: async () => true})}));
const dav = {id: 'dav-1', name: 'DAV', url: 'https://dav.example', username: 'alice', password: 'secret', path: '/', isActive: true};
describe('WebDAV backup completeness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({webdavConfigs: [dav], activeWebDAVConfig: 'dav-1', aiConfigs: [], repositories: [], releases: [], releaseSubscriptions: new Set([12]), readReleases: new Set([41]), defaultCategoryOverrides: {tools: {name: 'My tools'}}, categoryOrder: ['tools'], assetFilters: [], includeKeysInBackup: false});
  });
  it('backs up subscriptions, read state and category preferences as JSON while masking secrets', async () => {
    const uploaded: string[] = [];
    vi.spyOn(WebDAVService.prototype, 'uploadFile').mockImplementation(async (_filename, body) => {uploaded.push(body); return true;});
    render(<BackupPanel t={zh => zh}/>);
    fireEvent.click(screen.getByText('开始备份'));
    await waitFor(() => expect(uploaded).toHaveLength(1));
    const data = JSON.parse(uploaded[0]);
    expect(data.releaseSubscriptions).toEqual([12]);
    expect(data.readReleases).toEqual([41]);
    expect(data.defaultCategoryOverrides).toEqual({tools: {name: 'My tools'}});
    expect(data.categoryOrder).toEqual(['tools']);
    expect(data.webdavConfigs[0].password).toBe('***');
  });
  it('saves newly edited credentials before using the stored proxy config', async () => {
    let saved = false;
    let usedSavedConfig = false;
    vi.spyOn(backend, 'isAvailable', 'get').mockReturnValue(true);
    vi.spyOn(backend, 'syncWebDAVConfigs').mockImplementation(async configs => { saved = configs[0].id === 'dav-1'; });
    vi.spyOn(WebDAVService.prototype, 'uploadFile').mockImplementation(async () => { usedSavedConfig = saved; return true; });
    render(<BackupPanel t={zh => zh}/>);
    fireEvent.click(screen.getByText('开始备份'));
    await waitFor(() => expect(usedSavedConfig).toBe(true));
  });
  it('restores sets and clears empty preferences without replacing masked credentials', async () => {
    vi.spyOn(WebDAVService.prototype, 'listFiles').mockResolvedValue(['github-stars-backup-2026-09-30.json']);
    vi.spyOn(WebDAVService.prototype, 'downloadFile').mockResolvedValue(JSON.stringify({repositories: [], releases: [], releaseSubscriptions: [8, 8], readReleases: [], defaultCategoryOverrides: {}, categoryOrder: [], assetFilters: [], webdavConfigs: [{...dav, password: '***'}], includeKeysInBackup: false}));
    render(<BackupPanel t={zh => zh}/>);
    fireEvent.click(screen.getByText('开始恢复'));
    await waitFor(() => expect([...useAppStore.getState().releaseSubscriptions]).toEqual([8]));
    expect([...useAppStore.getState().readReleases]).toEqual([]);
    expect(useAppStore.getState().defaultCategoryOverrides).toEqual({});
    expect(useAppStore.getState().categoryOrder).toEqual([]);
    expect(useAppStore.getState().webdavConfigs[0].password).toBe('secret');
  });
  it('warns instead of reporting full success when part of a restore fails', async () => {
    toastMock.mockReset();
    const original = useAppStore.getState().addAIConfig;
    useAppStore.setState({addAIConfig: () => { throw new Error('quota exceeded'); }});
    try {
      vi.spyOn(WebDAVService.prototype, 'listFiles').mockResolvedValue(['github-stars-backup-2026-09-30.json']);
      vi.spyOn(WebDAVService.prototype, 'downloadFile').mockResolvedValue(JSON.stringify({repositories: [], releases: [], aiConfigs: [{id: 'ai-1', name: 'AI', apiType: 'openai', baseUrl: 'https://ai.example', apiKey: '***', model: 'm', isActive: false}]}));
      render(<BackupPanel t={zh => zh}/>);
      fireEvent.click(screen.getByText('开始恢复'));
      await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('AI'), 'warning'));
      expect(toastMock.mock.calls.some(([, type]) => type === 'success')).toBe(false);
    } finally {
      useAppStore.setState({addAIConfig: original});
    }
  });
  it('keeps newer preferences when restoring a legacy backup without those fields', async () => {
    vi.spyOn(WebDAVService.prototype, 'listFiles').mockResolvedValue(['github-stars-backup-2026-09-30.json']);
    vi.spyOn(WebDAVService.prototype, 'downloadFile').mockResolvedValue(JSON.stringify({customCategories: []}));
    render(<BackupPanel t={zh => zh}/>);
    fireEvent.click(screen.getByText('开始恢复'));
    await waitFor(() => expect(screen.getByText('开始恢复')).not.toBeDisabled());
    expect([...useAppStore.getState().releaseSubscriptions]).toEqual([12]);
    expect(useAppStore.getState().defaultCategoryOverrides).toEqual({tools: {name: 'My tools'}});
  });
});
