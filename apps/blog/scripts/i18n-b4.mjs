import { apply } from './i18n-apply.mjs'

const shared = [
	[`toast.error('请填写所有必填项')`, `toast.error(copy('请填写所有必填项', 'Fill in every required field'))`],
	[`toast.error('请至少添加一个标签')`, `toast.error(copy('请至少添加一个标签', 'Add at least one tag'))`],
	[`>更换</span>`, `>{copy('更换', 'Replace')}</span>`],
	[`\n					取消\n`, `\n					{copy('取消', 'Cancel')}\n`],
	[`\n				取消\n`, `\n				{copy('取消', 'Cancel')}\n`]
]

apply({
	'src/app/share/components/create-dialog.tsx': [
		...shared,
		[`toast.success(share ? '更新成功' : '添加成功')`, `toast.success(share ? copy('更新成功', 'Updated') : copy('添加成功', 'Added'))`],
		[`placeholder='资源名称'`, `placeholder={copy('资源名称', 'Resource name')}`],
		[`placeholder='标签，用逗号分隔（如：图片, 工具）'`, `placeholder={copy('标签，用逗号分隔（如：图片, 工具）', 'Tags, comma separated (e.g. images, tools)')}`],
		[`placeholder='资源介绍...'`, `placeholder={copy('资源介绍...', 'Describe the resource…')}`],
		[`{share ? '保存' : '添加'}`, `{share ? copy('保存', 'Save') : copy('添加', 'Add')}`]
	],
	'src/app/projects/components/create-dialog.tsx': [
		...shared,
		[`toast.success(project ? '更新成功' : '添加成功')`, `toast.success(project ? copy('更新成功', 'Updated') : copy('添加成功', 'Added'))`],
		[`placeholder='项目名称'`, `placeholder={copy('项目名称', 'Project name')}`],
		[`placeholder='年份'`, `placeholder={copy('年份', 'Year')}`],
		[`placeholder='标签，用逗号分隔（如：React, Vue）'`, `placeholder={copy('标签，用逗号分隔（如：React, Vue）', 'Tags, comma separated (e.g. React, Vue)')}`],
		[`placeholder='项目介绍...'`, `placeholder={copy('项目介绍...', 'Describe the project…')}`],
		[`placeholder='GitHub URL（可选）'`, `placeholder={copy('GitHub URL（可选）', 'GitHub URL (optional)')}`],
		[`placeholder='NPM URL（可选）'`, `placeholder={copy('NPM URL（可选）', 'NPM URL (optional)')}`],
		[`{project ? '保存' : '添加'}`, `{project ? copy('保存', 'Save') : copy('添加', 'Add')}`]
	],
	'src/app/bloggers/components/create-dialog.tsx': [
		...shared,
		[`toast.success(blogger ? '更新成功' : '添加成功')`, `toast.success(blogger ? copy('更新成功', 'Updated') : copy('添加成功', 'Added'))`],
		[`placeholder='博主名称'`, `placeholder={copy('博主名称', 'Blogger name')}`],
		[`placeholder='博主介绍...'`, `placeholder={copy('博主介绍...', 'Describe the blogger…')}`],
		[`{blogger ? '保存' : '添加'}`, `{blogger ? copy('保存', 'Save') : copy('添加', 'Add')}`]
	],
	'src/app/pictures/components/upload-dialog.tsx': [
		[`toast.error('请选择图片文件')`, `toast.error(copy('请选择图片文件', 'Choose an image file'))`],
		[`toast.error('请至少选择一张图片')`, `toast.error(copy('请至少选择一张图片', 'Choose at least one image'))`],
		[`>上传图片</h2>`, `>{copy('上传图片', 'Upload images')}</h2>`],
		[`>选择图片（可多选）</label>`, `>{copy('选择图片（可多选）', 'Choose images (multiple allowed)')}</label>`],
		[`>点击选择图片</p>`, `>{copy('点击选择图片', 'Click to choose images')}</p>`],
		['>共 {images.length} 张</div>', ">{copy(`共 ${images.length} 张`, `${images.length} total`)}</div>"],
		['>已选择 {images.length} 张图片</span>', ">{copy(`已选择 ${images.length} 张图片`, `${images.length} selected`)}</span>"],
		[`\n									继续添加\n`, `\n									{copy('继续添加', 'Add more')}\n`],
		[`>描述（可选，应用于本次所有图片）</label>`, `>{copy('描述（可选，应用于本次所有图片）', 'Description (optional, applied to all images)')}</label>`],
		[`placeholder='这组图片的说明...'`, `placeholder={copy('这组图片的说明...', 'Describe this batch…')}`],
		[`\n						取消\n`, `\n						{copy('取消', 'Cancel')}\n`],
		[`\n						确认上传\n`, `\n						{copy('确认上传', 'Upload')}\n`]
	],
	'src/app/write/components/actions.tsx': [
		[`toast.error('请先登录 Nono 后台')`, `toast.error(copy('请先登录 Nono 后台', 'Sign in to the Nono admin first'))`],
		[`window.confirm('放弃本次修改吗？')`, `window.confirm(copy('放弃本次修改吗？', 'Discard your changes?'))`],
		[`mode === 'edit' ? '更新' : '发布'`, `mode === 'edit' ? copy('更新', 'Update') : copy('发布', 'Publish')`],
		[`toast.info('请先登录 Nono 后台')`, `toast.info(copy('请先登录 Nono 后台', 'Sign in to the Nono admin first'))`],
		[
			'const confirmMsg = form?.title ? `确定删除《${form.title}》吗？该操作不可恢复。` : \'确定删除当前文章吗？该操作不可恢复。\'',
			"const confirmMsg = form?.title\n\t\t\t? copy(`确定删除《${form.title}》吗？该操作不可恢复。`, `Delete “${form.title}”? This cannot be undone.`)\n\t\t\t: copy('确定删除当前文章吗？该操作不可恢复。', 'Delete this post? This cannot be undone.')"
		],
		[`toast.success('已导入 Markdown 文件')`, `toast.success(copy('已导入 Markdown 文件', 'Markdown file imported'))`],
		[`toast.error('导入失败，请重试')`, `toast.error(copy('导入失败，请重试', 'Import failed — try again'))`],
		[`>编辑模式</div>`, `>{copy('编辑模式', 'Edit mode')}</div>`]
	]
})
