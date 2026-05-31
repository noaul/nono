import type { FastifyRequest } from 'fastify';
import type { Repository } from './services/repository.js';

export type Role = 'admin' | 'user';
export type LlmProvider = 'openai' | 'claude';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface AppServices {
  repo: Repository;
  sessionSecret: string;
  encryptionKey: string;
  llmClient?: LlmClient;
}

export interface LlmClient {
  complete(input: { provider: LlmProvider; apiKey: string; model: string; prompt: string }): Promise<string>;
}

export interface AuthedRequest extends FastifyRequest {
  user: AuthUser;
}
