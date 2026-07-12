'use client'

import { ArrowUpRight, Compass } from 'lucide-react'
import { getPortalSettings } from '@/lib/portal'
import { useConfigStore } from './stores/config-store'

export function PortalShortcut() {
	const siteContent = useConfigStore(state => state.siteContent)
	const portal = getPortalSettings(siteContent.portal)

	if (!portal.enabled || !portal.url) return null

	return (
		<a
			href={portal.url}
			target={portal.openInNewTab ? '_blank' : undefined}
			rel={portal.openInNewTab ? 'noreferrer' : undefined}
			aria-label={portal.label}
			data-testid='portal-corner-link'
			className='group fixed top-5 right-5 z-30 flex h-11 max-w-[min(280px,calc(100vw-2rem))] items-center gap-2 rounded-lg border border-white/60 bg-white/45 px-3.5 text-sm font-semibold text-[var(--color-primary)] shadow-[0_14px_38px_rgba(48,40,36,0.16)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:bg-white/68 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] max-sm:top-20 max-sm:right-4'>
			<Compass className='size-[18px] shrink-0 text-[var(--color-brand)]' aria-hidden='true' />
			<span className='truncate'>{portal.label}</span>
			<ArrowUpRight className='size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5' aria-hidden='true' />
		</a>
	)
}
