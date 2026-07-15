const IMAGE_EXTENSIONS: Record<string, string> = {
	'image/avif': 'avif',
	'image/gif': 'gif',
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
}

export type UploadedImage = {
	type: 'file'
	file: Pick<File, 'type'>
	hash?: string
}

export function avatarAssetPath(item: UploadedImage): string {
	const extension = IMAGE_EXTENSIONS[item.file.type]
	if (!extension) throw new Error('Avatar 仅支持 PNG、JPG、WebP、GIF 或 AVIF 图片')

	const hash = item.hash?.toLowerCase() || ''
	if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Avatar 文件校验失败，请重新选择图片')

	return `/images/avatar-${hash}.${extension}`
}
