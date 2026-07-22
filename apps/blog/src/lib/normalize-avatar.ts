const AVATAR_SIZE = 512

type DecodedImage = {
	width: number
	height: number
	draw: (context: CanvasRenderingContext2D, sx: number, sy: number, size: number) => void
	dispose: () => void
}

async function decodeImage(file: File): Promise<DecodedImage> {
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(file)
			return {
				width: bitmap.width,
				height: bitmap.height,
				draw: (context, sx, sy, size) => context.drawImage(bitmap, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE),
				dispose: () => bitmap.close()
			}
		} catch {
			// Some browsers decode additional formats through <img> but not createImageBitmap.
		}
	}

	const objectUrl = URL.createObjectURL(file)
	try {
		const image = await new Promise<HTMLImageElement>((resolve, reject) => {
			const element = new Image()
			element.onload = () => resolve(element)
			element.onerror = () => reject(new Error('当前浏览器无法读取这张图片'))
			element.src = objectUrl
		})
		return {
			width: image.naturalWidth,
			height: image.naturalHeight,
			draw: (context, sx, sy, size) => context.drawImage(image, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE),
			dispose: () => URL.revokeObjectURL(objectUrl)
		}
	} catch (error) {
		URL.revokeObjectURL(objectUrl)
		throw error
	}
}

export async function normalizeAvatar(file: File): Promise<File> {
	const decoded = await decodeImage(file)
	try {
		if (!decoded.width || !decoded.height) throw new Error('图片尺寸无效')

		const canvas = document.createElement('canvas')
		canvas.width = AVATAR_SIZE
		canvas.height = AVATAR_SIZE
		const context = canvas.getContext('2d')
		if (!context) throw new Error('浏览器无法处理这张图片')

		const sourceSize = Math.min(decoded.width, decoded.height)
		const sourceX = (decoded.width - sourceSize) / 2
		const sourceY = (decoded.height - sourceSize) / 2
		decoded.draw(context, sourceX, sourceY, sourceSize)

		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(result => (result ? resolve(result) : reject(new Error('头像转换失败'))), 'image/webp', 0.9)
		})
		return new File([blob], 'avatar.webp', { type: 'image/webp', lastModified: Date.now() })
	} finally {
		decoded.dispose()
	}
}
