import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StatusDay } from './types';

type StatusDisplayModule = {
  buildStatusDisplayHistory: (history: StatusDay[]) => StatusDay[];
  formatStatusLocation: (location: string | null | undefined) => string;
};

async function loadStatusDisplayModule(): Promise<StatusDisplayModule | null> {
  const modulePath = './yumi-status-display';
  return import(modulePath).catch(() => null) as Promise<StatusDisplayModule | null>;
}

describe('Yumi status display', () => {
  it('renders every time window with the same number of visual segments', async () => {
    const display = await loadStatusDisplayModule();
    expect(display).not.toBeNull();
    if (!display) return;

    const history = Array.from({ length: 7 }, (_, index): StatusDay => ({
      day: `2026-08-${String(18 + index).padStart(2, '0')}`,
      state: index === 3 ? 'outage' : 'operational',
      uptimePercent: index === 3 ? 0 : 100,
      sampleCount: 12,
      incidents: index === 3 ? 1 : 0
    }));

    const segments = display.buildStatusDisplayHistory(history);
    expect(segments).toHaveLength(90);
    expect(segments[0]).toBe(history[0]);
    expect(segments.at(-1)).toBe(history.at(-1));
  });

  it('abbreviates US state and country names without removing the city', async () => {
    const display = await loadStatusDisplayModule();
    expect(display).not.toBeNull();
    if (!display) return;

    expect(display.formatStatusLocation('Anaheim-Santa Ana-Garden Grove, California, United States'))
      .toBe('Anaheim-Santa Ana-Garden Grove, CA, US');
  });

  it('uses the fixed history projection and does not expose a scroll container', () => {
    const overview = fs.readFileSync(path.resolve(process.cwd(), 'src/YumiOverview.tsx'), 'utf8');
    const styles = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

    expect(overview).toContain('buildStatusDisplayHistory(item.history)');
    expect(overview).toContain('formatStatusLocation(item.location)');
    expect(styles).toContain('.yumi-status-grid { display: grid; grid-template-columns: 1fr;');
    expect(styles).toMatch(/\.status-history-scroll\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.status-history-day\s*\{[^}]*border-radius:\s*3px/s);
    expect(styles).not.toMatch(/\.status-history-day:hover[^}]*transform:/s);
  });

  it('keeps the overview mounted while a different time window loads', () => {
    const overview = fs.readFileSync(path.resolve(process.cwd(), 'src/YumiOverview.tsx'), 'utf8');

    expect(overview).toContain('const [statusWindowLoading, setStatusWindowLoading] = useState(false)');
    expect(overview).toContain('setStatusWindowLoading(true)');
    expect(overview).toContain('statusWindowLoading ? <StatusHistoryLoading />');
    expect(overview).not.toContain('setData(null)');
    expect(overview).not.toContain('setLoading(true)');
  });
});
