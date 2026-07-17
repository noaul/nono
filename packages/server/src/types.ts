import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Repository } from './services/repository.js';
import type { fetchPublicResource, resolvePublicAddress } from './utils/safe-fetch.js';

export type Role = 'admin' | 'user';
export type LlmProvider = 'openai' | 'claude';
export type LlmReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface AppServices {
  prisma: PrismaClient;
  repo: Repository;
  sessionSecret: string;
  encryptionKey: string;
  nodeskContentDir: string;
  llmClient?: LlmClient;
  publicFetcher?: typeof fetchPublicResource;
  publicAddressResolver?: typeof resolvePublicAddress;
}

export interface LlmClient {
  complete(input: { provider: LlmProvider; apiKey: string; model: string; baseUrl?: string | null; prompt: string; reasoningEffort?: LlmReasoningEffort | null }): Promise<string>;
}

export interface AuthedRequest extends FastifyRequest {
  user: AuthUser;
}
