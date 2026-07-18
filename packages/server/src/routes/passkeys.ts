import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { z } from 'zod';
import type { AppServices } from '../types.js';
import { requireAuth } from '../plugins/auth.js';
import { sendOk } from '../plugins/responses.js';
import { publicUser } from '../services/repository.js';
import { issueBrowserSession } from '../services/session.service.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const registrationSchema = z.object({
  challengeId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  response: z.unknown(),
});

const authenticationSchema = z.object({
  challengeId: z.string().uuid(),
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

export async function passkeyRoutes(app: FastifyInstance, services: AppServices) {
  app.post('/api/admin/account/passkeys/options', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const context = webAuthnContext(request, services);
    const passkeys = await services.repo.listPasskeys(user.id);
    const options = await services.webAuthn.generateRegistrationOptions({
      rpName: services.webAuthnRpName,
      rpID: context.rpID,
      userID: Buffer.from(`nono:${user.id}`, 'utf8'),
      userName: user.username,
      userDisplayName: user.displayName,
      attestationType: 'none',
      excludeCredentials: passkeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports as any,
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    });
    const challenge = await services.repo.createWebAuthnChallenge({
      userId: user.id,
      challenge: options.challenge,
      type: 'registration',
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    return sendOk(reply, { options, challengeId: challenge.id });
  });

  app.post('/api/admin/account/passkeys', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const input = registrationSchema.parse(request.body);
    const challenge = await services.repo.consumeWebAuthnChallenge(input.challengeId, 'registration', user.id);
    if (!challenge) throw badRequest('Passkey challenge expired or already used');
    const context = webAuthnContext(request, services);
    const verification = await verifyRegistration(services, {
      response: input.response as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: context.origin,
      expectedRPID: context.rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) throw badRequest('Passkey registration failed');
    const info = verification.registrationInfo;
    const passkey = await services.repo.createPasskey({
      id: info.credential.id,
      userId: user.id,
      name: input.name,
      publicKey: info.credential.publicKey,
      counter: BigInt(info.credential.counter),
      transports: info.credential.transports || [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
    });
    return sendOk(reply, publicPasskey(passkey));
  });

  app.delete('/api/admin/account/passkeys/:id', async (request, reply) => {
    const user = await requireAuth(request, reply, services);
    if (!user) return;
    const id = String((request.params as { id?: string }).id || '');
    await services.repo.deletePasskey(user.id, id);
    return sendOk(reply, { ok: true });
  });

  app.post('/api/auth/passkey/options', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const context = webAuthnContext(request, services);
    const options = await services.webAuthn.generateAuthenticationOptions({
      rpID: context.rpID,
      userVerification: 'required',
    });
    const challenge = await services.repo.createWebAuthnChallenge({
      userId: null,
      challenge: options.challenge,
      type: 'authentication',
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    return sendOk(reply, { options, challengeId: challenge.id });
  });

  app.post('/api/auth/passkey/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = authenticationSchema.parse(request.body);
    const challenge = await services.repo.consumeWebAuthnChallenge(input.challengeId, 'authentication', null);
    if (!challenge) throw unauthorized();
    const passkey = await services.repo.findPasskey(input.response.id);
    if (!passkey) throw unauthorized();
    const context = webAuthnContext(request, services);
    const verification = await verifyAuthentication(services, {
      response: input.response as unknown as AuthenticationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: context.origin,
      expectedRPID: context.rpID,
      credential: {
        id: passkey.id,
        publicKey: Uint8Array.from(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports as any,
      },
      requireUserVerification: true,
    });
    if (!verification.verified) throw unauthorized();
    await services.repo.updatePasskeyCounter(passkey.userId, passkey.id, BigInt(verification.authenticationInfo.newCounter));
    await issueBrowserSession(services.repo, passkey.userId, request, reply);
    return sendOk(reply, { user: publicUser(passkey.user) });
  });
}

function webAuthnContext(request: FastifyRequest, services: AppServices) {
  const candidate = services.webAuthnOrigin || request.headers.origin || `${request.protocol}://${request.hostname}`;
  let origin: URL;
  try {
    origin = new URL(candidate);
  } catch {
    throw badRequest('Invalid WebAuthn origin');
  }
  const local = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1';
  if (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) {
    throw badRequest('Passkeys require HTTPS');
  }
  const rpID = services.webAuthnRpId || origin.hostname;
  if (origin.hostname !== rpID && !origin.hostname.endsWith(`.${rpID}`)) {
    throw badRequest('WebAuthn origin does not match RP ID');
  }
  return { origin: origin.origin, rpID };
}

function publicPasskey(passkey: { id: string; name: string; deviceType: string; backedUp: boolean; lastUsedAt?: Date | null; createdAt: Date }) {
  return {
    id: passkey.id,
    name: passkey.name,
    deviceType: passkey.deviceType,
    backedUp: passkey.backedUp,
    lastUsedAt: passkey.lastUsedAt || null,
    createdAt: passkey.createdAt,
  };
}

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function unauthorized() {
  return Object.assign(new Error('Passkey authentication failed'), { statusCode: 401 });
}

async function verifyAuthentication(services: AppServices, input: Parameters<AppServices['webAuthn']['verifyAuthenticationResponse']>[0]) {
  try {
    return await services.webAuthn.verifyAuthenticationResponse(input);
  } catch {
    throw unauthorized();
  }
}

async function verifyRegistration(services: AppServices, input: Parameters<AppServices['webAuthn']['verifyRegistrationResponse']>[0]) {
  try {
    return await services.webAuthn.verifyRegistrationResponse(input);
  } catch {
    throw badRequest('Passkey registration failed');
  }
}

export { publicPasskey };
