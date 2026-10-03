export type BackupJob = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted'
  result?: unknown
  error?: string
  downloadAvailable?: boolean
  kind?: string
}

// Wire contract shared with backup-jobs.service: 24-hour key age, allowing five-minute future skew.
export const BACKUP_REQUEST_VALIDITY_MS = 24 * 60 * 60 * 1000
export const BACKUP_REQUEST_FUTURE_SKEW_MS = 5 * 60 * 1000

/** Transport errors say nothing about the operation outcome. Retry only while the SAME key is valid. */
export async function runBackupJob(url: string, init: RequestInit, onStatus: (message: string) => void, options: {
  requestId?: string
  fetch?: typeof fetch
  wait?: () => Promise<void>
  now?: () => number
} = {}): Promise<BackupJob> {
  const now = options.now || Date.now
  const requestId = options.requestId || `${now()}_${crypto.randomUUID()}`
  const match = /^(\d{1,16})_[A-Za-z0-9_-]{1,100}$/.exec(requestId)
  const issuedAt = match ? Number(match[1]) : NaN
  const fetcher = options.fetch || fetch
  const wait = options.wait || (() => new Promise<void>(resolve => setTimeout(resolve, 1500)))
  let job: BackupJob | undefined
  while (true) {
    if (!job && (!Number.isSafeInteger(issuedAt) || issuedAt - now() > BACKUP_REQUEST_FUTURE_SKEW_MS || now() - issuedAt >= BACKUP_REQUEST_VALIDITY_MS)) {
      throw new Error('自动提交重试已停止，任务状态未知；请在任务记录中确认结果，勿重复恢复。')
    }
    let response: Response
    try {
      const headers = new Headers(init.headers)
      headers.set('idempotency-key', requestId)
      response = await fetcher(job ? `/api/admin/backup-center/jobs/${job.id}` : url, job
        ? { credentials: 'same-origin', cache: 'no-store' }
        : { ...init, headers, credentials: 'same-origin', cache: 'no-store' })
    } catch {
      onStatus(`连接中断，任务状态未知；正在重新查询（请求 ${requestId}）。请勿重复提交。`)
      await wait()
      continue
    }
    if (response.status >= 500) {
      onStatus('服务暂时不可用，任务状态未知；正在重新查询，请勿重复提交。')
      await wait()
      continue
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`${payload?.message || `HTTP ${response.status}`}。如任务已提交，请在任务记录中确认结果。`)
    if (!payload?.data?.id || !payload.data.status) throw new Error('无法确认任务状态，请查询任务记录，勿重复恢复。')
    job = payload.data as BackupJob
    if (job.status === 'completed') return job
    if (job.status === 'failed' || job.status === 'interrupted') throw new Error(`${job.status === 'interrupted' ? '任务被中断：' : '任务失败：'}${job.error || '请检查安全快照后再决定是否重试。'}`)
    onStatus(`任务 ${job.id} ${job.status === 'queued' ? '已接受' : '执行中'}；关闭页面不会取消任务。`)
    await wait()
  }
}
