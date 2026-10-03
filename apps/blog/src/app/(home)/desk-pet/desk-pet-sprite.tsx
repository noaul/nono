/** The Nono sprite: parts are separate so CSS can animate them per pose (see desk-pet.css). */
export function DeskPetSprite() {
	return <span className='desk-pet-facing'>
		<span className='desk-pet-figure'>
			<svg className='desk-pet-svg' viewBox='0 0 44 38' width='100%' height='100%' focusable='false'>
				<defs>
					<linearGradient id='desk-pet-body-fill' x1='0' y1='0' x2='0' y2='1'>
						<stop offset='0%' stopColor='var(--pet-body-top)' />
						<stop offset='100%' stopColor='var(--pet-body-bottom)' />
					</linearGradient>
				</defs>
				<path className='desk-pet-wing desk-pet-wing-left' d='M9 16 C1 3 -7 14 -1 22 C2 25.5 7 24 10 20 Z' />
				<path className='desk-pet-wing desk-pet-wing-right' d='M35 16 C43 3 51 14 45 22 C42 25.5 37 24 34 20 Z' />
				<ellipse className='desk-pet-foot desk-pet-foot-left' cx='16' cy='34.4' rx='4' ry='2.6' />
				<ellipse className='desk-pet-foot desk-pet-foot-right' cx='28' cy='34.4' rx='4' ry='2.6' />
				<path className='desk-pet-body' d='M22 4 C33 4 39 11 39 21 C39 30 32 34 22 34 C12 34 5 30 5 21 C5 11 11 4 22 4 Z' fill='url(#desk-pet-body-fill)' />
				<ellipse className='desk-pet-shine' cx='16' cy='10' rx='5' ry='2.4' />
				<ellipse className='desk-pet-blush' cx='11.5' cy='23' rx='3.4' ry='2' />
				<ellipse className='desk-pet-blush' cx='32.5' cy='23' rx='3.4' ry='2' />
				<g className='desk-pet-eyes desk-pet-eyes-open'>
					<ellipse cx='16.5' cy='18' rx='2.3' ry='2.8' />
					<ellipse cx='27.5' cy='18' rx='2.3' ry='2.8' />
					<circle className='desk-pet-glint' cx='17.3' cy='16.9' r='0.8' />
					<circle className='desk-pet-glint' cx='28.3' cy='16.9' r='0.8' />
				</g>
				<g className='desk-pet-eyes desk-pet-eyes-happy'>
					<path d='M14 19 Q16.5 15.5 19 19' />
					<path d='M25 19 Q27.5 15.5 30 19' />
				</g>
				<g className='desk-pet-eyes desk-pet-eyes-sleep'>
					<path d='M14 18 Q16.5 20.5 19 18' />
					<path d='M25 18 Q27.5 20.5 30 18' />
				</g>
				<g className='desk-pet-eyes desk-pet-eyes-surprised'>
					<circle cx='16.5' cy='18' r='2.6' />
					<circle cx='27.5' cy='18' r='2.6' />
				</g>
				<path className='desk-pet-mouth' d='M20 24.5 Q22 26.5 24 24.5' />
			</svg>
			<span className='desk-pet-fx' />
		</span>
	</span>
}
