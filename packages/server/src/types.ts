import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Repository } from './services/repository.js';
import type { WebAuthnService } from './services/webauthn.service.js';
import type { fetchPublicResource, requestSafeResource, resolvePublicAddress } from './utils/safe-fetch.js';

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
  safeRequester: typeof requestSafeResource;
  privateOutboundHosts: string[];
  webAuthn: WebAuthnService;
  webAuthnRpName: string;
  webAuthnRpId: string | null;
  webAuthnOrigin: string | null;
}

export interface LlmClient {
  complete(input: { provider: LlmProvider; apiKey: string; model: string; baseUrl?: string | null; prompt: string; reasoningEffort?: LlmReasoningEffort | null; allowPrivateHosts?: string[] }): Promise<string>;
}

export interface AuthedRequest extends FastifyRequest {
  user: AuthUser;
}
