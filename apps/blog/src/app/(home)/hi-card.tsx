import { useCenterStore } from '@/hooks/use-center'
import Card from '@/components/card'
import { useConfigStore } from './stores/config-store'
import { HomeDraggableLayer } from './home-draggable-layer'
import { ArrowUpRight } from 'lucide-react'
import { getPortalSettings } from '@/lib/portal'

function getGreeting() {
	const hour = new Date().getHours()

	if (hour >= 6 && hour < 12) {
		return 'Good Morning'
	} else if (hour >= 12 && hour < 18) {
		return 'Good Afternoon'
	} else if (hour >= 18 && hour < 22) {
		return 'Good Evening'
	} else {
		return 'Good Night'
	}
}

export default function HiCard() {
	const center = useCenterStore()
	const { cardStyles, siteContent } = useConfigStore()
	const greeting = getGreeting()
	const styles = cardStyles.hiCard
	const username = siteContent.meta.username || 'Suni'
	const portal = getPortalSettings(siteContent.portal)
	const avatar = (
		<span className='group relative mx-auto block w-fit rounded-full focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-[var(--color-brand)]'>
			<img
				src={portal.imageUrl || '/images/avatar.png'}
				alt={portal.enabled && portal.url ? portal.label : `${username} avatar`}
				className='mx-auto rounded-full object-cover transition-transform duration-200 group-hover:scale-[1.03]'
				style={{ width: 120, height: 120, boxShadow: '0 16px 32px -5px #E2D9CE' }}
			/>
			{portal.enabled && portal.url && (
				<span className='bg-brand absolute right-0 bottom-0 grid size-8 place-items-center rounded-full border-2 border-white text-white shadow-md'>
					<ArrowUpRight className='size-4' aria-hidden='true' />
				</span>
			)}
		</span>
	)

	const x = styles.offsetX !== null ? center.x + styles.offsetX : center.x - styles.width / 2
	const y = styles.offsetY !== null ? center.y + styles.offsetY : center.y - styles.height / 2

	return (
		<HomeDraggableLayer cardKey='hiCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card order={styles.order} width={styles.width} height={styles.height} x={x} y={y} className='relative text-center max-sm:static max-sm:translate-0'>
				{siteContent.enableChristmas && (
					<>
						<img
							src='/images/christmas/snow-1.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 180, left: -20, top: -25, opacity: 0.9 }}
						/>
						<img
							src='/images/christmas/snow-2.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 160, bottom: -12, right: -8, opacity: 0.9 }}
						/>
					</>
				)}
				{portal.enabled && portal.url ? (
					<a
						href={portal.url}
						target={portal.openInNewTab ? '_blank' : undefined}
						rel={portal.openInNewTab ? 'noreferrer' : undefined}
						aria-label={portal.label}
						data-testid='portal-center-link'>
						{avatar}
					</a>
				) : (
					avatar
				)}
				<h1 className='font-averia mt-3 text-2xl'>
					{greeting} <br /> I'm <span className='text-linear text-[32px]'>{username}</span> , Nice to <br /> meet you!
				</h1>
			</Card>
		</HomeDraggableLayer>
	)
}
