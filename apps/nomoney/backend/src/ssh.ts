import { Client } from 'ssh2';
import type { SshExecOptions, SshExecResult } from './types.js';

export function runSshCommand(options: SshExecOptions): Promise<SshExecResult> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    let presentedHostFingerprint = '';
    let fingerprintMismatch = false;
    const timeout = setTimeout(() => {
      finish(new Error('SSH command timed out'));
    }, options.timeoutMs ?? 30_000);

    const finish = (error: Error | null, result?: SshExecResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.end();
      if (error) reject(error);
      else resolve(result ?? { stdout: '', stderr: '', code: null });
    };

    client
      .on('ready', () => {
        client.exec(options.command, (error, stream) => {
          if (error) {
            finish(error);
            return;
          }

          let stdout = '';
          let stderr = '';
          stream
            .on('close', (code: number | null, signal: string) => {
              if (code && code !== 0) {
                finish(new Error(stderr.trim() || `SSH command failed with exit code ${code}`));
                return;
              }
              finish(null, { stdout, stderr, code, signal, hostFingerprint: presentedHostFingerprint });
            })
            .on('data', (data: Buffer) => {
              stdout += data.toString('utf8');
            });
          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString('utf8');
          });
        });
      })
      .on('error', (error) => finish(
        fingerprintMismatch ? new Error('SSH host fingerprint mismatch') : error
      ))
      .connect({
        host: options.host,
        port: options.port,
        username: options.username,
        password: options.authType === 'password' ? options.password : undefined,
        privateKey: options.authType === 'privateKey' ? options.privateKey : undefined,
        passphrase: options.authType === 'privateKey' ? options.passphrase : undefined,
        hostHash: 'sha256',
        hostVerifier: (hashedKey: string) => {
          presentedHostFingerprint = `SHA256:${hashedKey}`;
          fingerprintMismatch = Boolean(
            options.expectedHostFingerprint && options.expectedHostFingerprint !== presentedHostFingerprint
          );
          return !fingerprintMismatch;
        },
        readyTimeout: options.timeoutMs ?? 30_000
      });
  });
}
