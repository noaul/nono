import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mountNodeskBridge, setNodeskBackHandler, tryNativeBackupDownload } from '../src/lib/nodesk-mobile.ts'

type Message = { requestId: string; type: string; payload: Record<string, unknown> }
const host = globalThis as typeof globalThis & { NonoBridge?: { postMessage(raw: string): void; onmessage?: ((event: { data: string }) => void) | null } }
let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  setNodeskBackHandler(null)
  delete host.NonoBridge
})

function nativePort(capabilities?: string[]) {
  const messages: Message[] = []
  const port = {
    postMessage(raw: string) { messages.push(JSON.parse(raw)) },
    onmessage: null as ((event: { data: string }) => void) | null,
  }
  host.NonoBridge = port
  dispose = mountNodeskBridge()
  const hello = messages.find(message => message.type === 'bridge.hello')!
  assert.ok(hello)
  if (capabilities) port.onmessage?.({ data: JSON.stringify({ v: 1, type: 'bridge.ready', requestId: hello.requestId, payload: { version: 1, capabilities } }) })
  return { port, messages }
}

test('browser, unnegotiated and unsupported bridges retain the browser backup flow', () => {
  dispose = mountNodeskBridge()
  assert.equal(tryNativeBackupDownload('job-1', 'https://nono.example'), false)
  dispose?.()
  const { messages } = nativePort()
  assert.equal(tryNativeBackupDownload('job-1', 'https://nono.example'), false)
  assert.equal(messages.some(message => message.type === 'download.request'), false)
})

test('negotiated Android backup downloads use an absolute HTTPS job URL', () => {
  const { messages } = nativePort(['download.request', 'ui.back'])
  assert.equal(tryNativeBackupDownload('job-123', 'https://nono.example'), true)
  assert.deepEqual(messages.at(-1)?.payload, { url: 'https://nono.example/api/admin/backup-center/jobs/job-123/download', filename: 'nono-backup-job-123.json', mimeType: 'application/json' })
  assert.equal(messages.at(-1)?.type, 'download.request')
  assert.equal(tryNativeBackupDownload('job-123', 'http://nono.example'), false)
  assert.equal(tryNativeBackupDownload('../outside', 'https://nono.example'), false)
})

test('a ready bridge without download capability falls back to browser download', () => {
  const { messages } = nativePort(['ui.back'])
  assert.equal(tryNativeBackupDownload('job-123', 'https://nono.example'), false)
  assert.equal(messages.some(message => message.type === 'download.request'), false)
})

test('Android Back closes the registered desktop layer and cleanup releases its listener', () => {
  let closed = 0
  setNodeskBackHandler(() => { closed++; return true })
  const { messages, port } = nativePort(['ui.back'])
  port.onmessage?.({ data: JSON.stringify({ v: 1, requestId: 'back-1', type: 'ui.back', payload: {} }) })
  assert.equal(closed, 1)
  assert.deepEqual(messages.at(-1), { v: 1, requestId: 'back-1', type: 'ui.backResult', payload: { handled: true } })
  setNodeskBackHandler(null)
  assert.deepEqual(messages.at(-1)?.payload, { canHandle: false })
  dispose?.()
  assert.equal(port.onmessage, null)
})
