import type { FastifyInstance } from 'fastify';

/** Explicit release fingerprints only; never infer or publish the debug signing certificate. */
export async function mobileAppLinkRoutes(app: FastifyInstance) {
  const fingerprints = (process.env.ANDROID_RELEASE_SHA256_FINGERPRINTS || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
  if (fingerprints.some(value => !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))) throw new Error('ANDROID_RELEASE_SHA256_FINGERPRINTS must contain SHA-256 certificate fingerprints');
  app.get('/.well-known/assetlinks.json', async (_request, reply) => reply.type('application/json').header('Cache-Control', 'public, max-age=300').send(fingerprints.length ? [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'com.noaul.nono', sha256_cert_fingerprints: [...new Set(fingerprints)] },
  }] : []));
}
