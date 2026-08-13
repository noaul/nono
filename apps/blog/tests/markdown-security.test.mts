import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { renderMarkdown } from '../src/lib/markdown-renderer.ts'

test('sanitizes active HTML and unsafe URLs before React parsing', async () => {
	const { html } = await renderMarkdown(`
# Safe heading

<iframe srcdoc="<script>window.top.compromised = true</script>"></iframe>
<img src="x" onerror="window.compromised = true">
<a href="javascript:window.compromised = true">unsafe link</a>
<form action="/api/admin/account"><button>submit</button></form>
`)

	assert.match(html, /<h1 id="safe-heading">Safe heading<\/h1>/)
	assert.doesNotMatch(html, /<(?:iframe|script|form|button)\b/i)
	assert.doesNotMatch(html, /\son\w+\s*=/i)
	assert.doesNotMatch(html, /javascript\s*:/i)
})

test('production CSP does not allow arbitrary same-origin frames', async () => {
	const config = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8')

	assert.doesNotMatch(config, /frame-src 'self'/)
})
