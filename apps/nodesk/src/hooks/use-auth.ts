import { create } from 'zustand'
import { clearAllAuthCache, getAuthToken as getToken, sessionUserId } from '@/lib/auth'

interface AuthStore {
	isAuth: boolean
	initialized: boolean
	userId: string | null
	clearAuth: () => void
	refreshAuthState: () => Promise<void>
	getAuthToken: () => Promise<string>
}

export const useAuthStore = create<AuthStore>(set => ({
	isAuth: false,
	initialized: false,
	userId: null,

	clearAuth: () => {
		clearAllAuthCache()
		set({ isAuth: false, initialized: true, userId: null })
	},

	refreshAuthState: async () => {
		const userId = await sessionUserId(true)
		set({ isAuth: userId !== null, initialized: true, userId })
	},

	getAuthToken: async () => {
		const token = await getToken()
		set({ isAuth: true, initialized: true })
		return token
	}
}))

void useAuthStore.getState().refreshAuthState()
