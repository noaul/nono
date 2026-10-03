import type { Species } from './desk-pet-model'

/** The pet sprites: parts are separate so CSS can animate them per pose (see desk-pet.css). */
export function DeskPetSprite({ species }: { species: Species }) {
	return <>
		<span className='desk-pet-shadow' />
		<span className='desk-pet-facing'>
			<span className='desk-pet-figure'>
				{species.id === 'momo' ? <MomoSvg /> : <NonoSvg />}
				<span className='desk-pet-fx' />
				<span className='desk-pet-stars'><i>✦</i><i>✦</i><i>✦</i></span>
			</span>
		</span>
	</>
}

/** Every expression; CSS shows one set at a time from the pose and `data-dizzy`. */
function Eyes({ left, right, y }: { left: number; right: number; y: number }) {
	const spiral = (x: number) => `M${x} ${y} m-0.5 0 a0.5 0.5 0 1 1 1 0 a1.3 1.3 0 1 1 -2.4 0.2 a2.1 2.1 0 1 1 4 -0.5`
	return <>
		<g className='desk-pet-eyes desk-pet-eyes-open'>
			<ellipse cx={left} cy={y} rx='2.8' ry='3.4' />
			<ellipse cx={right} cy={y} rx='2.8' ry='3.4' />
			<circle className='desk-pet-glint' cx={left + 0.9} cy={y - 1.3} r='1.1' />
			<circle className='desk-pet-glint' cx={right + 0.9} cy={y - 1.3} r='1.1' />
			<circle className='desk-pet-glint' cx={left - 0.8} cy={y + 1.3} r='0.5' />
			<circle className='desk-pet-glint' cx={right - 0.8} cy={y + 1.3} r='0.5' />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-happy'>
			<path d={`M${left - 2.8} ${y + 1.2} Q${left} ${y - 2.8} ${left + 2.8} ${y + 1.2}`} />
			<path d={`M${right - 2.8} ${y + 1.2} Q${right} ${y - 2.8} ${right + 2.8} ${y + 1.2}`} />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-sleep'>
			<path d={`M${left - 2.8} ${y} Q${left} ${y + 2.8} ${left + 2.8} ${y}`} />
			<path d={`M${right - 2.8} ${y} Q${right} ${y + 2.8} ${right + 2.8} ${y}`} />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-surprised'>
			<circle cx={left} cy={y} r='3' />
			<circle cx={right} cy={y} r='3' />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-ouch'>
			<path d={`M${left - 2.4} ${y - 2.4} L${left + 1.8} ${y} L${left - 2.4} ${y + 2.4}`} />
			<path d={`M${right + 2.4} ${y - 2.4} L${right - 1.8} ${y} L${right + 2.4} ${y + 2.4}`} />
		</g>
		<g className='desk-pet-eyes desk-pet-eyes-spiral'>
			<path d={spiral(left)} />
			<path d={spiral(right)} />
		</g>
	</>
}

function BodyGradient({ id }: { id: string }) {
	return <radialGradient id={id} cx='0.4' cy='0.3' r='0.85'>
		<stop offset='0%' stopColor='var(--pet-body-light)' />
		<stop offset='45%' stopColor='var(--pet-body-top)' />
		<stop offset='100%' stopColor='var(--pet-body-bottom)' />
	</radialGradient>
}

function NonoSvg() {
	return <svg className='desk-pet-svg' viewBox='0 0 48 42' width='100%' height='100%' focusable='false'>
		<defs><BodyGradient id='desk-pet-nono-fill' /></defs>
		<path className='desk-pet-wing desk-pet-wing-left' d='M10 19 C2 6 -6 17 0 25 C3 28.5 8 27 11 23 Z' />
		<path className='desk-pet-wing desk-pet-wing-right' d='M38 19 C46 6 54 17 48 25 C45 28.5 40 27 37 23 Z' />
		<ellipse className='desk-pet-foot desk-pet-foot-left' cx='17' cy='38.6' rx='4.4' ry='2.8' />
		<ellipse className='desk-pet-foot desk-pet-foot-right' cx='31' cy='38.6' rx='4.4' ry='2.8' />
		<g className='desk-pet-sprout'>
			<path className='desk-pet-sprout-stem' d='M24 7 C24 4.6 24.4 3 25.4 1.6' />
			<path className='desk-pet-leaf' d='M25.4 1.8 C28.4 -0.8 32 0.6 32.6 2.6 C30.2 4.2 27 3.8 25.4 1.8 Z' />
			<path className='desk-pet-leaf' d='M24.4 3.4 C21.8 1.2 18.6 2 18.2 3.8 C20.4 5.2 23 5 24.4 3.4 Z' />
		</g>
		<path className='desk-pet-body' d='M24 6 C36 6 43 13.5 43 24 C43 34 35.5 38.5 24 38.5 C12.5 38.5 5 34 5 24 C5 13.5 12 6 24 6 Z' fill='url(#desk-pet-nono-fill)' />
		<path className='desk-pet-rim' d='M10.5 31 C15 36.4 33 36.4 37.5 31' />
		<ellipse className='desk-pet-shine' cx='16.5' cy='12.4' rx='6' ry='2.8' transform='rotate(-18 16.5 12.4)' />
		<circle className='desk-pet-shine' cx='24.4' cy='9.8' r='1.1' />
		<ellipse className='desk-pet-hand desk-pet-hand-left' cx='6.4' cy='27' rx='2.6' ry='3.4' />
		<ellipse className='desk-pet-hand desk-pet-hand-right' cx='41.6' cy='27' rx='2.6' ry='3.4' />
		<ellipse className='desk-pet-blush' cx='12.4' cy='27.2' rx='3.6' ry='2.1' />
		<ellipse className='desk-pet-blush' cx='35.6' cy='27.2' rx='3.6' ry='2.1' />
		<Eyes left={18} right={30} y={21.5} />
		<path className='desk-pet-mouth' d='M21.8 28.2 Q24 30.4 26.2 28.2' />
	</svg>
}

function MomoSvg() {
	return <svg className='desk-pet-svg' viewBox='0 0 50 44' width='100%' height='100%' focusable='false'>
		<defs>
			<BodyGradient id='desk-pet-momo-fill' />
			<linearGradient id='desk-pet-momo-ear' x1='0' y1='0' x2='0' y2='1'>
				<stop offset='0%' stopColor='#ffd3cc' />
				<stop offset='100%' stopColor='#ff9fa8' />
			</linearGradient>
		</defs>
		<g className='desk-pet-tail'>
			<path className='desk-pet-tail-fur' d='M38 34 C48 34 51.5 24 46.8 16.4 C45.2 13.8 41.6 15.2 42.8 18 C45 23 43.4 29.4 37.6 30 Z' />
			<path className='desk-pet-tail-stripe' d='M44.6 22.6 L47.8 21.6 M44.4 27.6 L47.6 28' />
			<path className='desk-pet-tail-tip' d='M46.8 16.4 C45.2 13.8 41.6 15.2 42.8 18 C43.8 18.8 45.8 18.4 46.9 17.2 Z' />
		</g>
		<ellipse className='desk-pet-foot desk-pet-foot-left' cx='18' cy='40.4' rx='4.8' ry='2.9' />
		<ellipse className='desk-pet-foot desk-pet-foot-right' cx='32' cy='40.4' rx='4.8' ry='2.9' />
		<ellipse className='desk-pet-bean' cx='18' cy='41.2' rx='1.6' ry='1' />
		<ellipse className='desk-pet-bean' cx='32' cy='41.2' rx='1.6' ry='1' />
		<path className='desk-pet-ear' d='M10.6 19 L12 3 L22.6 10.6 Z' />
		<path className='desk-pet-ear' d='M39.4 19 L38 3 L27.4 10.6 Z' />
		<path className='desk-pet-ear-inner' d='M13.4 15 L14 6.6 L19.2 10.4 Z' fill='url(#desk-pet-momo-ear)' />
		<path className='desk-pet-ear-inner' d='M36.6 15 L36 6.6 L30.8 10.4 Z' fill='url(#desk-pet-momo-ear)' />
		<path className='desk-pet-fluff' d='M8.6 26 L5.2 27.8 L8.4 28.8 L5.8 31.2 L9.6 31.4 Z' />
		<path className='desk-pet-fluff' d='M41.4 26 L44.8 27.8 L41.6 28.8 L44.2 31.2 L40.4 31.4 Z' />
		<path className='desk-pet-body' d='M25 8 C36.5 8 42.5 15 42.5 25.5 C42.5 35.5 35.5 40 25 40 C14.5 40 7.5 35.5 7.5 25.5 C7.5 15 13.5 8 25 8 Z' fill='url(#desk-pet-momo-fill)' />
		<path className='desk-pet-rim' d='M12.5 33 C17 38.4 33 38.4 37.5 33' />
		<ellipse className='desk-pet-belly' cx='25' cy='34.6' rx='9.6' ry='5.2' />
		<ellipse className='desk-pet-muzzle' cx='25' cy='28.4' rx='5.8' ry='3.8' />
		<path className='desk-pet-stripe' d='M21.6 10.4 L22.6 14.6 M25 9.8 V14.4 M28.4 10.4 L27.4 14.6' />
		<ellipse className='desk-pet-shine' cx='17.6' cy='13.4' rx='4.6' ry='2.2' transform='rotate(-20 17.6 13.4)' />
		<path className='desk-pet-collar' d='M13.6 32.4 Q25 38.2 36.4 32.4' />
		<g className='desk-pet-bell'>
			<circle cx='25' cy='36.4' r='2.4' />
			<path d='M23.3 36.8 H26.7 M25 37.2 V38.6' />
		</g>
		<ellipse className='desk-pet-paw desk-pet-paw-left' cx='12.6' cy='30' rx='3.4' ry='2.8' />
		<ellipse className='desk-pet-paw desk-pet-paw-right' cx='37.4' cy='30' rx='3.4' ry='2.8' />
		<ellipse className='desk-pet-blush' cx='14.2' cy='27.6' rx='3.2' ry='1.9' />
		<ellipse className='desk-pet-blush' cx='35.8' cy='27.6' rx='3.2' ry='1.9' />
		<Eyes left={19.5} right={30.5} y={22.4} />
		<path className='desk-pet-nose' d='M23.7 26.6 L26.3 26.6 L25 28 Z' />
		<path className='desk-pet-mouth' d='M22.6 29 Q23.8 30.2 25 29 Q26.2 30.2 27.4 29' />
		<path className='desk-pet-whisker' d='M7 25.6 L14.6 26.6 M7.4 29.4 L14.6 28.4 M43 25.6 L35.4 26.6 M42.6 29.4 L35.4 28.4' />
	</svg>
}
