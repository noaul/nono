type SessionUser = {
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
		if (!response.ok) {
			sessionCache = { authenticated: false, user: null }
			return sessionCache
		}

		const payload = (await response.json()) as SessionResponse & SessionPayload
		const session: SessionPayload = payload.data || {
			authenticated: payload.authenticated,
			user: payload.user
		}
		sessionCache = session
		return session
	} catch {
		sessionCache = { authenticated: false, user: null }
		return sessionCache
	}
}

function isAdminSession(session: SessionPayload): boolean {
	return session.authenticated === true && session.user?.role === 'admin'
}

export function clearAllAuthCache(): void {
	sessionCache = undefined
}

export async function hasAuth(): Promise<boolean> {
	return isAdminSession(await readSession())
}

/**
 * Compatibility entry point for the existing Blog write services.
 * Authorization is provided by the same-origin Nono session cookie; this
 * return value is intentionally not a credential and is ignored by the API client.
 */
export async function getAuthToken(): Promise<string> {
	if (!isAdminSession(await readSession(true))) {
		throw new Error('需要先登录 Nono 管理员账户')
	}
	return 'nono-session'
}
