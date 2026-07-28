import { toBase64Utf8, getRef, createTree, createCommit, updateRef, createBlob, type TreeItem } from '@/lib/github-client'
import { getAuthToken } from '@/lib/auth'
import { GITHUB_CONFIG } from '@/consts'
import { toast } from 'sonner'
import { localeCopy as copy } from '@/i18n/language'

export type PushSnippetsParams = {
	snippets: string[]
}

export async function pushSnippets(params: PushSnippetsParams): Promise<void> {
	const { snippets } = params

	const token = await getAuthToken()

	toast.info(copy('正在获取分支信息...', 'Fetching branch info…'))
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const latestCommitSha = refData.sha

	const commitMessage = `更新句子列表`

	toast.info(copy('正在准备文件...', 'Preparing files…'))

	const treeItems: TreeItem[] = []

	const snippetsJson = JSON.stringify(snippets, null, '\t')
	const snippetsBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(snippetsJson), 'base64')
	treeItems.push({
		path: 'src/app/snippets/list.json',
		mode: '100644',
		type: 'blob',
		sha: snippetsBlob.sha
	})

	toast.info(copy('正在创建文件树...', 'Creating file tree…'))
	const treeData = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, latestCommitSha)

	toast.info(copy('正在创建提交...', 'Creating commit…'))
	const commitData = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, commitMessage, treeData.sha, [latestCommitSha])

	toast.info(copy('正在更新分支...', 'Updating branch…'))
	await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`, commitData.sha)

	toast.success(copy('发布成功！', 'Published'))
}
