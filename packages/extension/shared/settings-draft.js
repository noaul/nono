export function connectionDraft(serverUrl, token) {
  return {
    serverUrl: String(serverUrl || '').trim(),
    token: String(token || '').trim(),
  };
}

export async function persistConnectionDraft(storage, draft) {
  await storage.set(draft);
  return draft;
}
