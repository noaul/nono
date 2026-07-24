import Card from '@/components/card'
import { useCenterStore } from '@/hooks/use-center'
import { useConfigStore } from './stores/config-store'
import { CARD_SPACING } from '@/consts'
import { HomeDraggableLayer } from './home-draggable-layer'
import { getArtCardSettings } from '@/lib/portal'

export default function ArtCard() {
	const center = useCenterStore()
	const { cardStyles, siteContent } = useConfigStore()
	const styles = cardStyles.artCard
	const hiCardStyles = cardStyles.hiCard

	const x = styles.offsetX !== null ? center.x + styles.offsetX : center.x - styles.width / 2
	const y = styles.offsetY !== null ? center.y + styles.offsetY : center.y - hiCardStyles.height / 2 - styles.height - CARD_SPACING

	const art = getArtCardSettings(siteContent)

	return (
		<HomeDraggableLayer cardKey='artCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card
				className='p-2 max-sm:!static max-sm:!w-full max-sm:!translate-none'
				order={styles.order}
				width={styles.width}
				height={styles.height}
				x={x}
				y={y}
				href={art.href || undefined}
				target={art.href ? '_blank' : undefined}>
				{siteContent.enableChristmas && (
					<>
						<img
							src='/images/christmas/snow-3.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 160, right: -8, top: -16, opacity: 0.9 }}
						/>
					</>
				)}

				<img src={art.imageUrl} alt='wall art' className='h-full w-full rounded-[32px] object-cover' />
			</Card>
		</HomeDraggableLayer>
	)
}
