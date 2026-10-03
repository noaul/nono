import { normalizeEvents, normalizeTasks, type WorkbenchEvent, type WorkbenchTask } from './ambient-workbench-model.ts'

/** Tasks and events are saved on the server (`/api/admin/nodesk/planner`) and cached in localStorage. */
export type PlannerSnapshot = { tasks: WorkbenchTask[]; events: WorkbenchEvent[] }
export type RemotePlanner = PlannerSnapshot & { updatedAt: string | null }

export const PLANNER_SAVE_DELAY_MS = 800

export function readRemotePlanner(value: unknown): RemotePlanner | null {
	if (!value || typeof value !== 'object') return null
	const input = value as Record<string, unknown>
	return {
		tasks: normalizeTasks(input.tasks),
		events: normalizeEvents(input.events),
		updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null
	}
}

/** Identifies the content only, so a save is skipped when nothing changed since the last sync. */
export function plannerKey(snapshot: PlannerSnapshot) {
	return JSON.stringify([snapshot.tasks, snapshot.events])
}

/**
 * The server has never been written (`updatedAt` null): this browser's cached tasks become the
 * server copy. After that the server is the source of truth and the cache only covers offline use.
 */
export function reconcilePlanner(local: PlannerSnapshot, remote: RemotePlanner): { snapshot: PlannerSnapshot; upload: boolean } {
	if (remote.updatedAt === null) return { snapshot: local, upload: local.tasks.length + local.events.length > 0 }
	return { snapshot: { tasks: remote.tasks, events: remote.events }, upload: false }
}
