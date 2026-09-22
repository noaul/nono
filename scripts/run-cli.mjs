export async function runCli(operation, { onSuccess = () => 0, onError = console.error } = {}) {
  const keepAlive = setInterval(() => {}, 2_147_483_647);
  try {
    return (await onSuccess(await operation())) ?? 0;
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    clearInterval(keepAlive);
  }
}
