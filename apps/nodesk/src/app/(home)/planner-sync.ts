import { normalizeEvents, normalizeTasks, type WorkbenchEvent, type WorkbenchTask } from './ambient-workbench-model.ts'

/** Tasks and events are saved on the server (`/api/admin/nodesk/planner`) and cached in localStorage. */
export type PlannerSnapshot = { tasks: WorkbenchTask[]; events: WorkbenchEvent[] }
export type RemotePlanner = PlannerSnapshot & { updatedAt: string | null }

/**
 * What this browser last agreed on with the server, cached next to the tasks. `base` is the common
 * ancestor for merging; local edits are whatever differs from it, so they survive reloads and
 * failed saves. `userId` keeps one account's cache from being uploaded into another's.
 */
export type PlannerSyncMeta = { userId: string; base: PlannerSnapshot | null; baseUpdatedAt: string | null }

export const PLANNER_SAVE_DELAY_MS = 800
export const PLANNER_SYNC_STORAGE_KEY = 'nodesk.ambient.planner-sync.v1'
const EMPTY: PlannerSnapshot = { tasks: [], events: [] }

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

export function readSyncMeta(raw: string | null, userId: string): PlannerSyncMeta | null {
	try {
		const value = JSON.parse(raw || 'null') as Partial<PlannerSyncMeta> | null
		if (!value || value.userId !== userId) return null
		const base = value.base ? { tasks: normalizeTasks(value.base.tasks), events: normalizeEvents(value.base.events) } : null
		return { userId, base, baseUpdatedAt: typeof value.baseUpdatedAt === 'string' ? value.baseUpdatedAt : null }
	} catch {
		return null
	}
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

/**
 * Three-way merge by id. An item only one side changed takes that side's version (including a
 * deletion); when both changed it, this browser's edit wins, except that an edit beats a deletion.
 */
function mergeItems<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
	const baseById = new Map(base.map(item => [item.id, item]))
	const localById = new Map(local.map(item => [item.id, item]))
	const remoteById = new Map(remote.map(item => [item.id, item]))
	const pick = (id: string): T | undefined => {
		const original = baseById.get(id)
		const mine = localById.get(id)
		const theirs = remoteById.get(id)
		if (same(mine, original)) return theirs
		if (same(theirs, original)) return mine
		return mine ?? theirs
	}
	const merged: T[] = []
	// Items new on the server lead, like freshly added tasks do locally.
	for (const item of remote) if (!baseById.has(item.id) && !localById.has(item.id)) merged.push(item)
	for (const item of local) {
		const chosen = pick(item.id)
		if (chosen) merged.push(chosen)
	}
	for (const item of remote) {
		if (localById.has(item.id) || !baseById.has(item.id)) continue
		const chosen = pick(item.id)
		if (chosen) merged.push(chosen)
	}
	return merged
}

/** Combines this browser's edits since `base` with whatever reached the server meanwhile. */
export function mergePlanner(base: PlannerSnapshot | null, local: PlannerSnapshot, remote: PlannerSnapshot): PlannerSnapshot {
	const ancestor = base ?? EMPTY
	return {
		tasks: mergeItems(ancestor.tasks, local.tasks, remote.tasks),
		events: normalizeEvents(mergeItems(ancestor.events, local.events, remote.events))
	}
}

/** True when this browser holds edits the server has not accepted yet. */
export function hasLocalChanges(meta: PlannerSyncMeta | null, local: PlannerSnapshot) {
	return plannerKey(local) !== plannerKey(meta?.base ?? EMPTY)
}
