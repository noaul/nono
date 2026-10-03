'use client'

import { useEffect } from 'react'

export default function Page() {
	useEffect(() => {
		window.location.href = 'https://key.afilmory.art/'
	}, [])

	return (
		<div className='flex h-screen w-full items-center justify-center'>
			<p>Redirecting to https://key.afilmory.art/ ...</p>
		</div>
	)
}
