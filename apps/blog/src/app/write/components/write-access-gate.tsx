'use client'

import { useAuthStore } from '@/hooks/use-auth'
import { LockKeyhole } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

export function WriteAccessGate({ children }: { children: ReactNode }) {
	const { isAuth, initialized } = useAuthStore()

	if (!initialized) {
		return <div className='text-secondary flex min-h-dvh items-center justify-center text-sm'>正在确认登录状态...</div>
	}

	if (isAuth) return children

	return (
		<div className='flex min-h-dvh items-center justify-center px-4'>
			<div className='card relative w-full max-w-sm p-6 text-center'>
				<div className='bg-brand/15 text-brand mx-auto grid size-12 place-items-center rounded-full'>
					<LockKeyhole className='size-5' />
				</div>
				<h1 className='mt-4 text-lg font-semibold'>需要管理员登录</h1>
				<p className='text-secondary mt-2 text-sm leading-6'>请先回到主页登录 Nono，再进行写作或内容编辑。</p>
				<Link href='/' className='brand-btn mt-5 inline-flex'>
					返回主页
				</Link>
			</div>
		</div>
	)
}
