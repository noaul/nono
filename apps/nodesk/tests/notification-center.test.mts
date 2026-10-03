import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { CHANNEL_TYPES, channelDraftFromChannel, channelPayload, emptyChannelDraft } from '../src/app/(home)/notification-center-model.ts'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the NoDesk settings center hosts the notification center with a deep link', async () => {
	const settings = await read('src/app/(home)/ambient-settings-center.tsx')
	const center = await read('src/app/(home)/ambient-notification-center.tsx')
	const workbench = await read('src/app/(home)/ambient-workbench.tsx')

	assert.match(settings, /<AmbientNotificationCenter \/>/)
	assert.match(settings, /通知中心/)
	assert.match(workbench, /requested === 'notifications'/)
	for (const route of ['/api/admin/notifications?limit=100', '/api/admin/notification-channels', '/api/admin/notification-deliveries', '/test', '/api/admin/notifications/mark-all-read']) {
		assert.ok(center.includes(route), `notification center calls ${route}`)
	}
})

test('channel drafts never echo stored secrets and keep them when left blank', () => {
	const draft = channelDraftFromChannel({
		id: 3, type: 'telegram', name: 'TG', enabled: true, minSeverity: 'critical',
		config: { botToken: '', botTokenSet: true, chatId: '42' }, lastSuccessAt: null, lastError: null
	})
	assert.deepEqual(draft, { id: 3, type: 'telegram', name: 'TG', minSeverity: 'critical', config: { botToken: '', chatId: '42' }, secretsSet: { botToken: true } })
	assert.deepEqual(channelPayload(draft), { name: 'TG', minSeverity: 'critical', config: { botToken: '', chatId: '42' } })
})

test('channel payloads trim values, default the name and omit an empty SMTP port', () => {
	const email = { ...emptyChannelDraft('email'), config: { host: ' smtp.example.com ', port: '', to: 'me@example.com' } }
	assert.deepEqual(channelPayload(email), {
		name: CHANNEL_TYPES.email.label,
		minSeverity: 'warning',
		config: { host: 'smtp.example.com', user: '', password: '', from: '', to: 'me@example.com' }
	})
	assert.equal(channelPayload({ ...email, config: { ...email.config, port: '465' } }).config.port, 465)
	assert.deepEqual(emptyChannelDraft('bark').config, {})
})
