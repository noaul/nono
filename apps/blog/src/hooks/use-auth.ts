import { create } from 'zustand'
import { clearAllAuthCache, getAuthToken as getToken, hasAuth as checkAuth } from '@/lib/auth'

interface AuthStore {
	isAuth: boolean
	initialized: boolean
	clearAuth: () => void
	refreshAuthState: () => Promise<void>
	getAuthToken: () => Promise<string>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
	isAuth: false,
	initialized: false,

	clearAuth: () => {
		clearAllAuthCache()
		set({ isAuth: false, initialized: true })
	},

	refreshAuthState: async () => {
		set({ isAuth: await checkAuth(), initialized: true })
	},

	getAuthToken: async () => {
		const token = await getToken()
		await get().refreshAuthState()
		return token
	}
}))

void useAuthStore.getState().refreshAuthState()
