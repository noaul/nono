import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LlmView from '../src/views/admin/LlmView.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

async function settle(wrapper: ReturnType<typeof mount>) {
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
}

describe('LlmView', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('loads and saves a custom API base URL', async () => {
    apiRequest
      .mockResolvedValueOnce({
        llmProvider: 'openai',
        llmModel: 'custom-model',
        llmBaseUrl: 'https://gateway.example.com/v1',
        llmReasoningEffort: 'medium',
        hasLlmApiKey: true,
      })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mount(LlmView, {
      global: {
        stubs: {
          AdminLayout: { template: '<main><slot /></main>', props: ['title'] },
        },
      },
    });
    await settle(wrapper);

    expect((wrapper.get('[data-testid="llm-base-url"]').element as HTMLInputElement).value).toBe('https://gateway.example.com/v1');
    expect((wrapper.get('[data-testid="llm-reasoning-effort"]').element as HTMLSelectElement).value).toBe('medium');
    await wrapper.get('[data-testid="llm-base-url"]').setValue('https://new-gateway.example/api/v1');
    await wrapper.get('form').trigger('submit');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/account/llm', {
      method: 'PUT',
      body: JSON.stringify({
        provider: 'openai',
        model: 'custom-model',
        apiKey: '',
        baseUrl: 'https://new-gateway.example/api/v1',
        reasoningEffort: 'medium',
      }),
    });
  });

  it('tests the current LLM connection without saving the form', async () => {
    apiRequest
      .mockResolvedValueOnce({ llmProvider: 'openai', llmModel: 'gpt-5-mini', hasLlmApiKey: true })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ ok: true, model: 'gpt-5-mini', reasoningEffort: 'high' });

    const wrapper = mount(LlmView, { global: { stubs: { AdminLayout: { template: '<main><slot /></main>', props: ['title'] } } } });
    await settle(wrapper);
    await wrapper.get('[data-testid="llm-reasoning-effort"]').setValue('high');
    await wrapper.get('[data-testid="test-llm-connection"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/account/llm/test', {
      method: 'POST',
      body: JSON.stringify({ provider: 'openai', model: 'gpt-5-mini', apiKey: '', baseUrl: '', reasoningEffort: 'high' }),
    });
    expect(wrapper.text()).toContain('连接成功');
  });

  it('adds and saves a NoStar AI profile from the Nono admin page', async () => {
    apiRequest
      .mockResolvedValueOnce({ llmProvider: 'openai', llmModel: 'gpt-4o-mini', hasLlmApiKey: false })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ saved: 1 });

    const wrapper = mount(LlmView, { global: { stubs: { AdminLayout: { template: '<main><slot /></main>', props: ['title'] } } } });
    await settle(wrapper);
    await wrapper.get('[data-testid="add-nostar-ai-profile"]').trigger('click');
    await wrapper.get('[data-testid="nostar-profile-name-0"]').setValue('仓库分析');
    await wrapper.get('[data-testid="save-nostar-ai-profiles"]').trigger('click');
    await settle(wrapper);

    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/nostar/ai', {
      method: 'PUT',
      body: expect.stringContaining('仓库分析'),
    });
  });
});
