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
        hasLlmApiKey: true,
      })
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
      }),
    });
  });
});
