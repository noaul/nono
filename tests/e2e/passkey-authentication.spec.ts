import type { FastifyInstance } from 'fastify';
import { expect, test } from '@playwright/test';
import { buildApp } from '../../packages/server/src/app.js';
import { MemoryRepository } from '../../packages/server/src/services/repository.js';

const sessionSecret = 'playwright-session-secret-that-is-long-enough';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const password = 'Password2026!';

let app: FastifyInstance;
let appURL: string;
let previousNodeEnv: string | undefined;

test.beforeEach(async () => {
  previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  app = await buildApp({
    repo: new MemoryRepository(false),
    sessionSecret,
    encryptionKey,
    webAuthnOrigin: null,
    webAuthnRpId: null,
  });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  appURL = address.replace('127.0.0.1', 'localhost');
});

test.afterEach(async () => {
  await app.close();
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
});

test('registers a platform passkey and signs in without a password', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const setup = await page.request.post(`${appURL}/api/auth/setup`, {
    data: {
      username: 'admin',
      email: 'admin@nono.test',
      displayName: 'Admin',
      password,
    },
  });
  expect(setup.ok()).toBe(true);

  await page.goto(`${appURL}/admin/account`);
  await page.getByTestId('passkey-name').fill('Playwright Passkey');
  await page.getByTestId('add-passkey').click();
  await expect(page.getByText('Playwright Passkey')).toBeVisible();
  await expect(page.getByText('通行密钥已添加')).toBeVisible();

  const logout = await page.request.post(`${appURL}/api/auth/logout`);
  expect(logout.ok()).toBe(true);
  await page.goto(`${appURL}/login`);
  await page.getByTestId('passkey-login').click();

  await expect(page).toHaveURL(`${appURL}/admin`);
  await expect(page.getByRole('heading', { name: '控制台总览' }).last()).toBeVisible();
});
