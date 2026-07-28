'use client'

import { useAuthStore } from '@/hooks/use-auth'
import { LockKeyhole } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useI18n } from '@/i18n'

export function WriteAccessGate({ children }: { children: ReactNode }) {


	const { copy } = useI18n()
	const { isAuth, initialized } = useAuthStore()

	if (!initialized) {
		return <div className='text-secondary flex min-h-dvh items-center justify-center text-sm'>{copy('正在确认登录状态...', 'Checking your session…')}</div>
	}

	if (isAuth) return children

	return (
		<div className='flex min-h-dvh items-center justify-center px-4'>
			<div className='card relative w-full max-w-sm p-6 text-center'>
				<div className='bg-brand/15 text-brand mx-auto grid size-12 place-items-center rounded-full'>
					<LockKeyhole className='size-5' />
				</div>
				<h1 className='mt-4 text-lg font-semibold'>{copy('需要管理员登录', 'Admin sign-in required')}</h1>
				<p className='text-secondary mt-2 text-sm leading-6'>{copy('请先回到主页登录 Nono，再进行写作或内容编辑。', 'Go back to the home page and sign in to Nono before writing or editing.')}</p>
				<Link href='/' className='brand-btn mt-5 inline-flex'>
					{copy('返回主页', 'Back to home')}
				</Link>
			</div>
		</div>
	)
}
