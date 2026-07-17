import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptDeployment } from './accept-deployment.mjs';
import { runCommand, waitForAcceptance } from './deploy-compose.mjs';

export async function rollbackCompose({ cwd, baseUrl, image, run = runCommand, accept = acceptDeployment, log = console.log }) {
  if (!image) throw new Error('--image is required');
  const env = { ...process.env, NONO_APP_IMAGE: image };
  await run('docker', ['image', 'inspect', image], { cwd, env, capture: true });
  await run('docker', ['compose', 'up', '-d', '--no-deps', '--force-recreate', 'app'], { cwd, env });
  await waitForAcceptance({ baseUrl, accept, wait: sleep, attempts: 12, log });
  return { image };
}

function parseArgs(argv) {
  const options = { cwd: process.cwd(), baseUrl: 'http://127.0.0.1:8188', image: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dir') options.cwd = argv[++index];
    else if (argv[index] === '--base-url') options.baseUrl = argv[++index];
    else if (argv[index] === '--image') options.image = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  rollbackCompose(parseArgs(process.argv.slice(2)))
    .then((result) => console.log(`rollback accepted: ${result.image}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
