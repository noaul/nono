import { connectMobileBridge, type MobileBridge } from './mobile-bridge.ts'

let bridge: MobileBridge | null = null
let backHandler: (() => boolean) | null = null

/** The layout owns one connection; child panels only register their current Back action. */
export function mountNodeskBridge(): () => void {
	const connection = connectMobileBridge({ onBack: () => backHandler?.() ?? false })
	bridge = connection
	connection?.setBackState(backHandler !== null)
	return () => {
		connection?.setBackState(false)
		connection?.dispose()
		if (bridge === connection) bridge = null
	}
}

export function setNodeskBackHandler(handler: (() => boolean) | null): void {
	backHandler = handler
	bridge?.setBackState(handler !== null)
}

/** Return false to preserve the browser download when native support is unavailable. */
export function tryNativeBackupDownload(jobId: string, origin: string): boolean {
	if (!bridge?.supports('download.request') || !/^[A-Za-z0-9_-]+$/.test(jobId)) return false
	let site: URL
	try {
		site = new URL(origin)
	} catch {
		return false
	}
	if (site.protocol !== 'https:' || site.username || site.password) return false
	try {
		bridge.send('download.request', { url: `${site.origin}/api/admin/backup-center/jobs/${jobId}/download`, filename: `nono-backup-${jobId}.json`, mimeType: 'application/json' })
		return true
	} catch {
		return false
	}
}
