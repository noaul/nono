import { describe, expect, it } from 'vitest';
import { aiTarget, aiTestBody } from '../src/routes/nostar/network.js';

describe('NoStar AI network helpers', () => {
  it.each([
    ['openai', 'https://ai.example/v1/chat/completions'],
    ['openai-responses', 'https://ai.example/v1/responses'],
  ])('does not duplicate an API version already present in the base URL', (apiType, expectedUrl) => {
    const target = aiTarget({
      apiType,
      baseUrl: 'https://ai.example/v1',
      apiKey: 'secret',
      model: 'model',
    });

    expect(target.url).toBe(expectedUrl);
    expect(target.url).not.toContain('/v1/v1/');
  });

  it('uses the Responses API request shape when testing that API type', () => {
    expect(aiTestBody('openai-responses', 'model')).toEqual({
      model: 'model',
      max_output_tokens: 8,
      input: 'Reply OK.',
    });
  });
});
