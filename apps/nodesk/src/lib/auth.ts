import { localeCopy as copy } from '../i18n/language.ts'
type SessionUser = {
	id?: number | string
	role?: string
}

type SessionPayload = {
	authenticated?: boolean
	user?: SessionUser | null
}

type SessionResponse = {
	data?: SessionPayload
	code?: number
	message?: string
}

let sessionCache: SessionPayload | null | undefined

async function readSession(force = false): Promise<SessionPayload> {
	if (!force && sessionCache !== undefined) return sessionCache || { authenticated: false, user: null }

	if (typeof window === 'undefined' && typeof fetch === 'undefined') {
		sessionCache = { authenticated: false, user: null }
		return sessionCache
	}

	try {
		const response = await fetch('/api/auth/session', {
			credentials: 'include',
			cache: 'no-store',
			headers: { Accept: 'application/json' }
		})
		// Only the server saying so signs the user out; a deploy (502) or a rate limit keeps the last answer.
		if (response.status === 401 || response.status === 403) {
			sessionCache = { authenticated: false, user: null }
			return sessionCache
		}
		if (!response.ok) return sessionCache || { authenticated: false, user: null }

		const payload = (await response.json()) as SessionResponse & SessionPayload
		const session: SessionPayload = payload.data || {
			authenticated: payload.authenticated,
			user: payload.user
		}
		sessionCache = session
		return session
	} catch {
		// Offline (e.g. an app resuming before the network is back): keep the last known session.
		return sessionCache || { authenticated: false, user: null }
	}
}

function isAdminSession(session: SessionPayload): boolean {
	return session.authenticated === true && session.user?.role === 'admin'
}

export function clearAllAuthCache(): void {
	sessionCache = undefined
}

export async function hasAuth(force = false): Promise<boolean> {
	return isAdminSession(await readSession(force))
}

/** The signed-in admin's id, so per-account browser caches are not mixed between accounts. */
export async function sessionUserId(force = false): Promise<string | null> {
	const session = await readSession(force)
	return isAdminSession(session) && session.user?.id !== undefined ? String(session.user.id) : null
}

/**
 * Compatibility entry point for the NoDesk content services.
 * Authorization is provided by the same-origin NoNo session cookie; this
 * return value is intentionally not a credential and is ignored by the API client.
 */
export async function getAuthToken(): Promise<string> {
	if (!isAdminSession(await readSession(true))) {
		throw new Error(copy('需要先登录 NoNo 管理员账户', 'Sign in to a NoNo admin account first'))
	}
	return 'nono-session'
}
