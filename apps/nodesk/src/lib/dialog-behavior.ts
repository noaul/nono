const dialogs: HTMLElement[] = []
let scrollLocks = 0
let originalOverflow = ''
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

/** A shared stack keeps nested, portalled dialogs from handling each other's keyboard events. */
export function activateDialog(panel: HTMLElement, options: { onClose?: () => void; lockScroll?: boolean }) {
	const doc = panel.ownerDocument
	const view = doc.defaultView!
	const previous = doc.activeElement instanceof view.HTMLElement ? doc.activeElement : null
	dialogs.push(panel)
	if (options.lockScroll !== false) {
		if (scrollLocks++ === 0) originalOverflow = doc.body.style.overflow
		doc.body.style.overflow = 'hidden'
	}
	// Focusing the panel avoids bringing up a phone's keyboard before a field is chosen.
	if (!panel.contains(doc.activeElement)) panel.focus({ preventScroll: true })

	const onKeyDown = (event: KeyboardEvent) => {
		if (dialogs[dialogs.length - 1] !== panel || event.defaultPrevented) return
		if (event.key === 'Escape' && options.onClose) {
			event.preventDefault()
			event.stopImmediatePropagation()
			options.onClose()
			return
		}
		if (event.key !== 'Tab') return
		const items = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
			.filter(item => item.tabIndex >= 0 && item.getClientRects().length > 0 && view.getComputedStyle(item).visibility !== 'hidden')
		const first = items[0]
		const last = items[items.length - 1]
		if (!first || !last) {
			event.preventDefault()
			panel.focus()
		} else if (event.shiftKey && (doc.activeElement === first || doc.activeElement === panel || !panel.contains(doc.activeElement))) {
			event.preventDefault()
			last.focus()
		} else if (!event.shiftKey && (doc.activeElement === last || !panel.contains(doc.activeElement))) {
			event.preventDefault()
			first.focus()
		}
	}
	view.addEventListener('keydown', onKeyDown)
	let active = true
	return () => {
		if (!active) return
		active = false
		view.removeEventListener('keydown', onKeyDown)
		const wasTop = dialogs[dialogs.length - 1] === panel
		const index = dialogs.indexOf(panel)
		if (index !== -1) dialogs.splice(index, 1)
		if (options.lockScroll !== false && --scrollLocks === 0) doc.body.style.overflow = originalOverflow
		if (wasTop && previous?.isConnected) previous.focus({ preventScroll: true })
	}
}
