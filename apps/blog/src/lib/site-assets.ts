export type UploadedImage = {
	type: 'file'
	file: Pick<File, 'type'>
	hash?: string
}

export function avatarAssetPath(item: UploadedImage): string {
	if (item.file.type !== 'image/webp') throw new Error('头像处理失败，请重新选择图片')

	const hash = item.hash?.toLowerCase() || ''
	if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Avatar 文件校验失败，请重新选择图片')

	return `/images/avatar-${hash}.webp`
}
