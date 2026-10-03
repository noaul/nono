import assert from 'node:assert/strict'
import test from 'node:test'
import { runBackupJob } from '../src/app/(home)/backup-job-client.ts'

test('supplied keys tolerate at most five minutes of future clock skew', async () => {
  let submissions = 0
  const options = {
    now: () => 1000,
    fetch: async () => {
      submissions++
      return new Response(JSON.stringify({ data: { id: 'one', status: 'completed' } }))
    },
  }
  assert.equal((await runBackupJob('/restore', { method: 'POST' }, () => {}, { ...options, requestId: '301000_restore' })).id, 'one')
  await assert.rejects(runBackupJob('/restore', { method: 'POST' }, () => {}, { ...options, requestId: '301001_restore' }), /状态未知.*任务记录/)
  assert.equal(submissions, 1)
})

test('a lost acceptance followed by an offline day stops submission with unknown outcome', async () => {
  let time = 1000
  let submissions = 0
  await assert.rejects(runBackupJob('/restore', { method: 'POST' }, () => {}, {
    requestId: '1000_restore', now: () => time,
    wait: async () => { time += 24 * 60 * 60 * 1000 },
    fetch: async () => {
      submissions++
      if (submissions === 1) throw new Error('lost 202')
      return new Response(JSON.stringify({ data: { id: 'unsafe-replay', status: 'completed' } }))
    },
  }), /状态未知.*任务记录/)
  assert.equal(submissions, 1)
})

test('retries an uncertain submission with the same identifier and keeps polling across network timeouts', async () => {
  const calls: Array<{ url: string; key: string | null }> = []
  const states: string[] = []
  const requestId = `${Date.now()}_stable-id`
  const replies: Array<Response | Error> = [new Error('timeout'), new Response(JSON.stringify({ data: { id: 'one', status: 'queued' } }), { status: 202 }), new Error('timeout'), new Response(JSON.stringify({ data: { id: 'one', status: 'running' } })), new Response(JSON.stringify({ data: { id: 'one', status: 'completed', result: { restored: ['nono'] } } }))]
  const job = await runBackupJob('/restore', { method: 'POST', body: '{}' }, state => states.push(state), {
    requestId, wait: async () => {},
    fetch: async (url, init) => { calls.push({ url: String(url), key: new Headers(init?.headers).get('idempotency-key') }); const next = replies.shift()!; if (next instanceof Error) throw next; return next },
  })
  assert.deepEqual(job.result, { restored: ['nono'] })
  assert.deepEqual(calls.slice(0, 2), [{ url: '/restore', key: requestId }, { url: '/restore', key: requestId }])
  assert.equal(calls[2].url, '/api/admin/backup-center/jobs/one')
  assert.ok(states.some(state => state.includes('连接中断')))
})

test('reports server failures and interruptions, never replaying a terminal restore', async () => {
  for (const status of ['failed', 'interrupted']) {
    let calls = 0
    await assert.rejects(runBackupJob('/restore', { method: 'POST' }, () => {}, { requestId: `${Date.now()}_stable`, wait: async () => {}, fetch: async () => { calls++; return new Response(JSON.stringify({ data: { id: 'one', status, error: 'Inspect safety snapshots' } }), { status: 202 }) } }), /Inspect safety snapshots/)
    assert.equal(calls, 1)
  }
})
