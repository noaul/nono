import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptDeployment } from './accept-deployment.mjs';

export function imageTagForCommit(repository, commit) {
  const normalized = String(commit).trim().replace(/[^a-fA-F0-9]/g, '');
  if (normalized.length < 12) throw new Error('Git commit must contain at least 12 hexadecimal characters');
  return `${repository}:${normalized.slice(0, 12).toLowerCase()}`;
}

export function parseDeployArgs(argv) {
  const options = {
    cwd: process.cwd(),
    baseUrl: 'http://127.0.0.1:8188',
    imageRepository: 'nono-app',
    skipPull: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dir') options.cwd = argv[++index];
    else if (argument === '--base-url') options.baseUrl = argv[++index];
    else if (argument === '--image-repository') options.imageRepository = argv[++index];
    else if (argument === '--skip-pull') options.skipPull = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export async function deployCompose({
  cwd,
  baseUrl,
  imageRepository,
  skipPull,
  run = runCommand,
  accept = acceptDeployment,
  wait = sleep,
  acceptanceAttempts = 24,
  log = console.log,
}) {
  const commandOptions = { cwd };
  const previousCommit = (await run('git', ['rev-parse', 'HEAD'], { ...commandOptions, capture: true })).stdout.trim();
  const previousImage = await inspectCurrentImage(run, commandOptions);

  if (!skipPull) await run('git', ['pull', '--ff-only', 'origin', 'main'], commandOptions);
  const currentCommit = (await run('git', ['rev-parse', 'HEAD'], { ...commandOptions, capture: true })).stdout.trim();
  const imageTag = imageTagForCommit(imageRepository, currentCommit);
  const deployEnv = { ...process.env, NONO_APP_IMAGE: imageTag };

  log(`deploying ${previousCommit.slice(0, 12)} -> ${currentCommit.slice(0, 12)} as ${imageTag}`);
  await run('docker', ['compose', 'up', '-d', 'postgres'], { ...commandOptions, env: deployEnv });
  await run('docker', ['compose', 'build', 'app'], { ...commandOptions, env: deployEnv });
  await run('docker', ['compose', 'up', '-d', '--no-deps', 'app'], { ...commandOptions, env: deployEnv });

  try {
    await waitForAcceptance({ baseUrl, accept, wait, attempts: acceptanceAttempts, log });
    return { previousCommit, currentCommit, imageTag, rolledBack: false };
  } catch (deploymentError) {
    if (!previousImage.reference) {
      throw new Error(`Deployment acceptance failed and no previous image is available: ${errorText(deploymentError)}`);
    }

    log(`deployment acceptance failed; restoring ${previousImage.reference}`);
    const rollbackEnv = { ...process.env, NONO_APP_IMAGE: previousImage.reference };
    await run('docker', ['compose', 'up', '-d', '--no-deps', '--force-recreate', 'app'], { ...commandOptions, env: rollbackEnv });
    try {
      await waitForAcceptance({ baseUrl, accept, wait, attempts: Math.max(3, Math.ceil(acceptanceAttempts / 2)), log });
    } catch (rollbackError) {
      throw new Error(`Deployment failed (${errorText(deploymentError)}) and rollback failed (${errorText(rollbackError)})`);
    }
    return {
      previousCommit,
      currentCommit,
      imageTag,
      rolledBack: true,
      rollbackImage: previousImage.reference,
      deploymentError: errorText(deploymentError),
    };
  }
}

export async function waitForAcceptance({ baseUrl, accept, wait, attempts, log }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await accept({ baseUrl, log });
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      log(`acceptance attempt ${attempt}/${attempts} failed: ${errorText(error)}`);
      await wait(5000);
    }
  }
  throw lastError || new Error('Deployment acceptance failed');
}

export async function runCommand(command, args, { cwd = process.cwd(), env = process.env, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function inspectCurrentImage(run, commandOptions) {
  try {
    const containerId = (await run('docker', ['compose', 'ps', '-q', 'app'], { ...commandOptions, capture: true })).stdout.trim();
    if (!containerId) return { id: '', reference: '' };
    const [idResult, referenceResult] = await Promise.all([
      run('docker', ['inspect', '--format', '{{.Image}}', containerId], { ...commandOptions, capture: true }),
      run('docker', ['inspect', '--format', '{{.Config.Image}}', containerId], { ...commandOptions, capture: true }),
    ]);
    return { id: idResult.stdout.trim(), reference: referenceResult.stdout.trim() };
  } catch {
    return { id: '', reference: '' };
  }
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  deployCompose(parseDeployArgs(process.argv.slice(2)))
    .then((result) => {
      if (result.rolledBack) {
        console.error(`deployment rolled back to ${result.rollbackImage}: ${result.deploymentError}`);
        process.exitCode = 1;
      } else {
        console.log(`deployment accepted at ${result.currentCommit.slice(0, 12)} (${result.imageTag})`);
      }
    })
    .catch((error) => {
      console.error(errorText(error));
      process.exitCode = 1;
    });
}
