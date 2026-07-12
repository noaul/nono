function normalizePath(path: string): string {
	return path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
}

export function toRepoPath(path: string, rootPath: string): string {
	const normalizedPath = normalizePath(path)
	const normalizedRoot = normalizePath(rootPath)

	if (!normalizedRoot || normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)) {
		return normalizedPath
	}

	return normalizedPath ? `${normalizedRoot}/${normalizedPath}` : normalizedRoot
}

export function fromRepoPath(path: string, rootPath: string): string {
	const normalizedPath = normalizePath(path)
	const normalizedRoot = normalizePath(rootPath)

	if (!normalizedRoot) return normalizedPath
	if (normalizedPath === normalizedRoot) return ''
	if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
		return normalizedPath.slice(normalizedRoot.length + 1)
	}

	return normalizedPath
}
