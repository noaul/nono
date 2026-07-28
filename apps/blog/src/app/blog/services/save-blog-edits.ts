import { toast } from 'sonner'
import { GITHUB_CONFIG } from '@/consts'
import { getAuthToken } from '@/lib/auth'
import { createBlob, createCommit, createTree, getRef, listRepoFilesRecursive, toBase64Utf8, type TreeItem, updateRef } from '@/lib/github-client'
import type { BlogIndexItem } from '@/lib/blog-index'
import { localeCopy as copy } from '@/i18n/language'

export async function saveBlogEdits(originalItems: BlogIndexItem[], nextItems: BlogIndexItem[], categories: string[]): Promise<void> {
	const removedSlugs = originalItems.filter(item => !nextItems.some(next => next.slug === item.slug)).map(item => item.slug)
	const uniqueRemoved = Array.from(new Set(removedSlugs.filter(Boolean)))

	const token = await getAuthToken()

	toast.info(copy('正在获取分支信息...', 'Fetching branch info…'))
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const latestCommitSha = refData.sha

	const treeItems: TreeItem[] = []

	for (const slug of uniqueRemoved) {
		toast.info(copy(`正在收集 ${slug} 文件...`, `Collecting files for ${slug}…`))
		const basePath = `public/blogs/${slug}`
		const files = await listRepoFilesRecursive(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, basePath, GITHUB_CONFIG.BRANCH)

		for (const path of files) {
			treeItems.push({
				path,
				mode: '100644',
				type: 'blob',
				sha: null
			})
		}
	}

	toast.info(copy('正在更新索引...', 'Updating index…'))
	const sortedItems = [...nextItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
	const indexJson = JSON.stringify(sortedItems, null, 2)
	const indexBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(indexJson), 'base64')
	treeItems.push({
		path: 'public/blogs/index.json',
		mode: '100644',
		type: 'blob',
		sha: indexBlob.sha
	})

	toast.info(copy('正在更新分类...', 'Updating categories…'))
	const uniqueCategories = Array.from(new Set(categories.map(c => c.trim()).filter(Boolean)))
	const categoriesJson = JSON.stringify({ categories: uniqueCategories }, null, 2)
	const categoriesBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(categoriesJson), 'base64')
	treeItems.push({
		path: 'public/blogs/categories.json',
		mode: '100644',
		type: 'blob',
		sha: categoriesBlob.sha
	})

	toast.info(copy('正在创建提交...', 'Creating commit…'))
	const treeData = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, latestCommitSha)
	const actionLabels: string[] = []
	if (uniqueRemoved.length > 0) {
		actionLabels.push(`删除:${uniqueRemoved.join(',')}`)
	}
	actionLabels.push(copy('更新索引', 'Update index'))
	if (uniqueCategories.length > 0) {
		actionLabels.push(copy('更新分类', 'Update categories'))
	}
	const commitLabel = actionLabels.join(' | ')
	const commitData = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, commitLabel, treeData.sha, [latestCommitSha])

	toast.info(copy('正在更新分支...', 'Updating branch…'))
	await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`, commitData.sha)

	toast.success(copy('保存成功！请等待页面部署后刷新', 'Saved — refresh once the page redeploys'))
}
