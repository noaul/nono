import type { Species } from './desk-pet-model'

/** The pet sprites: parts are separate so CSS can animate them per pose (see desk-pet.css). */
export function DeskPetSprite({ species }: { species: Species }) {
	return <span className='desk-pet-facing'>
		<span className='desk-pet-figure'>
			{species.id === 'momo' ? <MomoSvg /> : <NonoSvg />}
			<span className='desk-pet-fx' />
		</span>
	</span>
}

function Eyes({ left, right, y }: { left: number; right: number; y: number }) {
	return <>
		<g className='desk-pet-eyes desk-pet-eyes-open'>
			<ellipse cx={left} cy={y} rx='2.3' ry='2.8' />
			<ellipse cx={right} cy={y} rx='2.3' ry='2.8' />
			<circle className='desk-pet-glint' cx={left + 0.8} cy={y - 1.1} r='0.8' />
			<circle className='desk-pet-glint' cx={right + 0.8} cy={y - 1.1} r='0.8' />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-happy'>
			<path d={`M${left - 2.5} ${y + 1} Q${left} ${y - 2.5} ${left + 2.5} ${y + 1}`} />
			<path d={`M${right - 2.5} ${y + 1} Q${right} ${y - 2.5} ${right + 2.5} ${y + 1}`} />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-sleep'>
			<path d={`M${left - 2.5} ${y} Q${left} ${y + 2.5} ${left + 2.5} ${y}`} />
			<path d={`M${right - 2.5} ${y} Q${right} ${y + 2.5} ${right + 2.5} ${y}`} />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-surprised'>
			<circle cx={left} cy={y} r='2.6' />
			<circle cx={right} cy={y} r='2.6' />
		</g>
	</>
}

function NonoSvg() {
	return <svg className='desk-pet-svg' viewBox='0 0 44 38' width='100%' height='100%' focusable='false'>
		<defs>
			<linearGradient id='desk-pet-nono-fill' x1='0' y1='0' x2='0' y2='1'>
				<stop offset='0%' stopColor='var(--pet-body-top)' />
				<stop offset='100%' stopColor='var(--pet-body-bottom)' />
			</linearGradient>
		</defs>
		<path className='desk-pet-wing desk-pet-wing-left' d='M9 16 C1 3 -7 14 -1 22 C2 25.5 7 24 10 20 Z' />
		<path className='desk-pet-wing desk-pet-wing-right' d='M35 16 C43 3 51 14 45 22 C42 25.5 37 24 34 20 Z' />
		<ellipse className='desk-pet-foot desk-pet-foot-left' cx='16' cy='34.4' rx='4' ry='2.6' />
		<ellipse className='desk-pet-foot desk-pet-foot-right' cx='28' cy='34.4' rx='4' ry='2.6' />
		<path className='desk-pet-body' d='M22 4 C33 4 39 11 39 21 C39 30 32 34 22 34 C12 34 5 30 5 21 C5 11 11 4 22 4 Z' fill='url(#desk-pet-nono-fill)' />
		<ellipse className='desk-pet-shine' cx='16' cy='10' rx='5' ry='2.4' />
		<ellipse className='desk-pet-blush' cx='11.5' cy='23' rx='3.4' ry='2' />
		<ellipse className='desk-pet-blush' cx='32.5' cy='23' rx='3.4' ry='2' />
		<Eyes left={16.5} right={27.5} y={18} />
		<path className='desk-pet-mouth' d='M20 24.5 Q22 26.5 24 24.5' />
	</svg>
}

function MomoSvg() {
	return <svg className='desk-pet-svg' viewBox='0 0 46 40' width='100%' height='100%' focusable='false'>
		<defs>
			<linearGradient id='desk-pet-momo-fill' x1='0' y1='0' x2='0' y2='1'>
				<stop offset='0%' stopColor='var(--pet-body-top)' />
				<stop offset='100%' stopColor='var(--pet-body-bottom)' />
			</linearGradient>
		</defs>
		<path className='desk-pet-tail' d='M35 31 C44 31 47 22 43 15 C41.6 12.8 38.6 13.8 39.6 16.4 C41.6 21 40 26.6 34.6 27 Z' />
		<ellipse className='desk-pet-foot desk-pet-foot-left' cx='16.5' cy='36.6' rx='4.2' ry='2.6' />
		<ellipse className='desk-pet-foot desk-pet-foot-right' cx='29.5' cy='36.6' rx='4.2' ry='2.6' />
		<path className='desk-pet-ear' d='M9.5 17 L11 2.5 L21 9.5 Z' />
		<path className='desk-pet-ear' d='M36.5 17 L35 2.5 L25 9.5 Z' />
		<path className='desk-pet-ear-inner' d='M12.4 13 L13 6.4 L17.6 9.6 Z' />
		<path className='desk-pet-ear-inner' d='M33.6 13 L33 6.4 L28.4 9.6 Z' />
		<path className='desk-pet-body' d='M23 7.5 C33.5 7.5 39 14 39 23.5 C39 32.5 32.5 36.5 23 36.5 C13.5 36.5 7 32.5 7 23.5 C7 14 12.5 7.5 23 7.5 Z' fill='url(#desk-pet-momo-fill)' />
		<ellipse className='desk-pet-belly' cx='23' cy='29.5' rx='9.5' ry='6.5' />
		<path className='desk-pet-stripe' d='M19.6 9.6 L20.6 13.6 M23 9 V13.4 M26.4 9.6 L25.4 13.6' />
		<ellipse className='desk-pet-blush' cx='12.6' cy='25.6' rx='3.2' ry='1.9' />
		<ellipse className='desk-pet-blush' cx='33.4' cy='25.6' rx='3.2' ry='1.9' />
		<Eyes left={17.5} right={28.5} y={20.5} />
		<path className='desk-pet-nose' d='M21.8 24.2 L24.2 24.2 L23 25.6 Z' />
		<path className='desk-pet-mouth' d='M20.8 26.4 Q21.9 27.6 23 26.4 Q24.1 27.6 25.2 26.4' />
		<path className='desk-pet-whisker' d='M6.5 24 L13.5 25 M6.8 27.4 L13.6 26.6 M39.5 24 L32.5 25 M39.2 27.4 L32.4 26.6' />
	</svg>
}
