'use client'

import { localeCopy as copy } from '../i18n/language.ts'
export type UploadedImage = {
	type: 'file'
	file: Pick<File, 'type'>
	hash?: string
}

export function avatarAssetPath(item: UploadedImage): string {
	if (item.file.type !== 'image/webp') throw new Error(copy('头像处理失败，请重新选择图片', 'Avatar processing failed — choose another image'))

	const hash = item.hash?.toLowerCase() || ''
	if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(copy('Avatar 文件校验失败，请重新选择图片', 'Avatar file check failed — choose another image'))

	return `/images/avatar-${hash}.webp`
}
