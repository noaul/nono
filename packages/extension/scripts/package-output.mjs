import path from 'node:path';

export function packageOutputDirectory(args, root) {
  if (args.length === 0) return path.join(root, 'artifacts');
  if (args.length !== 2 || args[0] !== '--output-dir' || !args[1]) throw new Error('Usage: package.mjs [--output-dir DIRECTORY]');
  return path.resolve(args[1]);
}
