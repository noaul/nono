// Converts JSX text nodes that sit alone on a line ("\t\t取消") into copy(zh, en) using a
// shared dictionary of recurring UI words. Anything not in the dictionary is left alone and
// reported, so nothing gets a guessed translation.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const DICT = {
	取消: 'Cancel',
	保存: 'Save',
	删除: 'Delete',
	编辑: 'Edit',
	添加: 'Add',
	新增: 'Add',
	确认: 'Confirm',
	关闭: 'Close',
	管理: 'Manage',
	更多: 'More',
	重置: 'Reset',
	预览: 'Preview',
	发布: 'Publish',
	更新: 'Update',
	导入: 'Import',
	导出: 'Export',
	上传: 'Upload',
	下载: 'Download',
	分类: 'Category',
	标签: 'Tags',
	返回: 'Back',
	提交: 'Submit',
	继续添加: 'Add more',
	确认上传: 'Upload',
	取消编辑: 'Cancel',
	保存修改: 'Save changes',
	全选: 'Select all',
	取消全选: 'Deselect all',
	今天: 'Today',
	加载中: 'Loading…',
	'加载中...': 'Loading…',
	保存中: 'Saving…',
	'保存中...': 'Saving…',
	暂无内容: 'Nothing here yet',
	暂无数据: 'No data',
	编辑模式: 'Edit mode',
	复制: 'Copy',
	已复制: 'Copied',
	清空: 'Clear',
	应用: 'Apply',
	下一首: 'Next track',
	随机配色: 'Randomise'
}

const files = execSync('git ls-files src', { cwd: process.cwd(), encoding: 'utf8' })
	.split('\n')
	.filter(f => /\.tsx$/.test(f))

let converted = 0
const unknown = new Map()

for (const file of files) {
	let source = readFileSync(file, 'utf8')
	if (!/[一-鿿]/.test(source)) continue
	const next = source.replace(/^(\t+)([^\s<>{}'"`/][^<>{}\n]*)$/gm, (line, indent, text) => {
		const trimmed = text.trim()
		if (!/[一-鿿]/.test(trimmed)) return line
		const en = DICT[trimmed]
		if (!en) {
			unknown.set(trimmed, (unknown.get(trimmed) || 0) + 1)
			return line
		}
		converted += 1
		return `${indent}{copy('${trimmed}', '${en}')}`
	})
	if (next !== source) writeFileSync(file, next)
}

console.log(`converted ${converted} bare JSX text nodes`)
console.log(`${unknown.size} distinct strings still need a translation`)
for (const [text, count] of [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
	console.log(`  ${count}x  ${text}`)
}
