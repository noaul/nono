interface StatusRefreshEventSource {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface VisibleStatusRefreshRuntime {
  windowEvents: StatusRefreshEventSource;
  documentEvents: StatusRefreshEventSource;
  isVisible: () => boolean;
  now: () => number;
  setInterval: (handler: () => void, delay: number) => number;
  clearInterval: (timer: number) => void;
}

const statusRefreshTriggerCooldownMs = 1_000;

export function formatStatusDay(day: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${day}T00:00:00Z`));
}

export function startVisibleStatusRefresh(
  refresh: () => void,
  intervalMs: number,
  runtime: VisibleStatusRefreshRuntime = browserStatusRefreshRuntime()
): () => void {
  let active = true;
  let lastTriggeredAt = Number.NEGATIVE_INFINITY;
  const refreshWhenVisible = () => {
    if (!active || !runtime.isVisible()) return;
    const now = runtime.now();
    if (now - lastTriggeredAt < statusRefreshTriggerCooldownMs) return;
    lastTriggeredAt = now;
    refresh();
  };
  const timer = runtime.setInterval(refreshWhenVisible, intervalMs);
  runtime.windowEvents.addEventListener('focus', refreshWhenVisible);
  runtime.windowEvents.addEventListener('online', refreshWhenVisible);
  runtime.documentEvents.addEventListener('visibilitychange', refreshWhenVisible);

  return () => {
    active = false;
    runtime.clearInterval(timer);
    runtime.windowEvents.removeEventListener('focus', refreshWhenVisible);
    runtime.windowEvents.removeEventListener('online', refreshWhenVisible);
    runtime.documentEvents.removeEventListener('visibilitychange', refreshWhenVisible);
  };
}

function browserStatusRefreshRuntime(): VisibleStatusRefreshRuntime {
  return {
    windowEvents: window,
    documentEvents: document,
    isVisible: () => document.visibilityState === 'visible',
    now: () => Date.now(),
    setInterval: (handler, delay) => window.setInterval(handler, delay),
    clearInterval: (timer) => window.clearInterval(timer)
  };
}
