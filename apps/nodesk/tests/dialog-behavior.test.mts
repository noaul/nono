import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { activateDialog } from '../src/lib/dialog-behavior.ts'

const { JSDOM } = createRequire(new URL('../../../package.json', import.meta.url))('jsdom')

test('modal keyboard behavior wraps focus, skips hidden controls and restores its opener', () => {
	const dom = new JSDOM('<button id="opener">Open</button><section tabindex="-1"><button id="first">First</button><button tabindex="-1">Skip</button><button id="last">Last</button><button hidden>Hidden</button></section>')
	Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement })
	// jsdom has no layout; hidden controls report no client rectangles, visible controls report one.
	dom.window.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{}] }
	const opener = document.querySelector<HTMLButtonElement>('#opener')!
	const panel = document.querySelector<HTMLElement>('section')!
	opener.focus()
	const close = activateDialog(panel, { onClose() {} })
	assert.equal(document.activeElement, panel)
	const tab = (shiftKey = false) => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true }))
	tab(true)
	assert.equal(document.activeElement?.id, 'last')
	tab()
	assert.equal(document.activeElement?.id, 'first')
	close()
	assert.equal(document.activeElement, opener)
	assert.equal(document.body.style.overflow, '')
	dom.window.close()
})

test('only the top portalled dialog closes on Escape and scroll remains locked until all close', () => {
	const dom = new JSDOM('<button id="opener">Open</button><section id="outer" tabindex="-1"><button id="inner-opener">Nested</button></section><section id="inner" tabindex="-1"></section>')
	Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement })
	dom.window.HTMLElement.prototype.getClientRects = () => [{}]
	let outerClosed = 0
	let innerClosed = 0
	document.querySelector<HTMLElement>('#opener')!.focus()
	const stopOuter = activateDialog(document.querySelector<HTMLElement>('#outer')!, { onClose: () => { outerClosed++ } })
	document.querySelector<HTMLElement>('#inner-opener')!.focus()
	const stopInner = activateDialog(document.querySelector<HTMLElement>('#inner')!, { onClose: () => { innerClosed++ } })
	const tab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
	window.dispatchEvent(tab)
	assert.equal(tab.defaultPrevented, true)
	assert.equal(document.activeElement?.id, 'inner')
	window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
	assert.equal(innerClosed, 1)
	assert.equal(outerClosed, 0)
	stopInner()
	assert.equal(document.activeElement?.id, 'inner-opener')
	assert.equal(document.body.style.overflow, 'hidden')
	const handled = new dom.window.KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
	handled.preventDefault()
	window.dispatchEvent(handled)
	assert.equal(outerClosed, 0)
	stopOuter()
	assert.equal(document.activeElement?.id, 'opener')
	assert.equal(document.body.style.overflow, '')
	dom.window.close()
})
