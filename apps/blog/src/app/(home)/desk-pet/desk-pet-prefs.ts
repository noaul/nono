/** Which desk pets are shown, stored per browser. */
export const PET_PREFS_KEY = 'nodesk.ambient.pets.v2'
/** The single on/off switch from before Momo; `false` turns both pets off. */
export const LEGACY_PET_KEY = 'nodesk.ambient.pet.v1'

export type PetPrefs = { nono: boolean; momo: boolean }

export function readPetPrefs(stored: string | null, legacy: string | null): PetPrefs {
	const fallback: PetPrefs = legacy === 'false' ? { nono: false, momo: false } : { nono: true, momo: true }
	if (!stored) return fallback
	try {
		const value = JSON.parse(stored) as Partial<Record<keyof PetPrefs, unknown>> | null
		return {
			nono: typeof value?.nono === 'boolean' ? value.nono : fallback.nono,
			momo: typeof value?.momo === 'boolean' ? value.momo : fallback.momo
		}
	} catch {
		return fallback
	}
}
