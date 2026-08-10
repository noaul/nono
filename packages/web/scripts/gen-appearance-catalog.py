# -*- coding: utf-8 -*-
"""Writes the appearance editor's catalogue entries into both locale files.

Every control in APPEARANCE_FIELDS needs a label in zh and en, and `en` is typed against
`typeof zh`, so the two blocks have to stay identically shaped. Generating both from one table
here is what keeps them in step.
"""
import io

GROUPS = [
    ('layout', '页面布局', 'Page layout'),
    ('folders', '文件夹与书签', 'Folders and bookmarks'),
    ('search', '搜索框与 NoTab', 'Search bar and NoTab'),
    ('glass', '玻璃质感', 'Glass appearance'),
    ('background', '背景显示', 'Background display'),
    ('scene', '动态场景', 'Dynamic scenes'),
    ('typography', '文字排版', 'Typography'),
]

FIELDS = [
    ('density', '页面密度', 'Page density'),
    ('maxContentWidth', '内容最大宽度', 'Max content width'),
    ('folderColumns', '文件夹列数', 'Folder columns'),
    ('folderGapX', '文件夹横向间距', 'Folder gap (horizontal)'),
    ('folderGapY', '文件夹纵向间距', 'Folder gap (vertical)'),
    ('pagePaddingX', '页面左右留白', 'Page side padding'),
    ('searchMaxWidth', '搜索框最大宽度', 'Max search bar width'),
    ('searchGridGap', '搜索框与网格间距', 'Search bar to grid gap'),
    ('cardColor', '面板底色', 'Panel base colour'),
    ('cardRadius', '面板圆角', 'Panel radius'),
    ('cardOpacity', '面板透明度', 'Panel opacity'),
    ('cardBlur', '面板模糊', 'Panel blur'),
    ('folderTitleGap', '标题与面板间距', 'Title to panel gap'),
    ('folderIconSize', '文件夹图标大小', 'Folder icon size'),
    ('bookmarkIconSize', '书签图标大小', 'Bookmark icon size'),
    ('bookmarkRowHeight', '书签行高', 'Bookmark row height'),
    ('bookmarkGapX', '书签横向间距', 'Bookmark gap (horizontal)'),
    ('bookmarkGapY', '书签纵向间距', 'Bookmark gap (vertical)'),
    ('folderShadow', '文件夹阴影强度', 'Folder shadow strength'),
    ('hoverScale', '悬停放大', 'Hover scale'),
    ('hoverHighlight', '悬停高亮强度', 'Hover highlight strength'),
    ('hoverAnimation', '悬停动画', 'Hover animation'),
    ('searchColor', '搜索框底色', 'Search bar base colour'),
    ('searchRadius', '搜索框圆角', 'Search bar radius'),
    ('searchOpacity', '搜索框透明度', 'Search bar opacity'),
    ('searchBlur', '搜索框模糊', 'Search bar blur'),
    ('searchHeight', '搜索框高度', 'Search bar height'),
    ('searchIconSize', '搜索图标大小', 'Search icon size'),
    ('searchTextSize', '搜索文字大小', 'Search text size'),
    ('notabHeight', 'NoTab 标签高度', 'NoTab tab height'),
    ('notabGap', 'NoTab 标签间距', 'NoTab tab spacing'),
    ('notabIndicator', '选中指示条粗细', 'Active indicator thickness'),
    ('notabAlign', 'NoTab 对齐', 'NoTab alignment'),
    ('notabOverflow', 'NoTab 溢出方式', 'NoTab overflow'),
    ('glassBorderOpacity', '描边透明度', 'Border opacity'),
    ('glassBorderWidth', '描边粗细', 'Border thickness'),
    ('glassShadowStrength', '阴影强度', 'Shadow strength'),
    ('glassShadowSpread', '阴影扩散', 'Shadow spread'),
    ('glassSaturation', '背景饱和度', 'Background saturation'),
    ('glassHighlight', '高光强度', 'Highlight strength'),
    ('glassDarkOverlay', '深色模式蒙层强度', 'Dark-mode overlay strength'),
    ('backgroundImageEnabled', '显示背景图', 'Background image'),
    ('backgroundBrightness', '背景亮度', 'Background brightness'),
    ('backgroundBlur', '背景模糊', 'Background blur'),
    ('backgroundOverlay', '蒙层透明度', 'Overlay opacity'),
    ('backgroundPosition', '背景位置', 'Background position'),
    ('backgroundSize', '背景缩放', 'Background sizing'),
    ('overlayLight', '浅色模式蒙层', 'Light-mode overlay'),
    ('overlayDark', '深色模式蒙层', 'Dark-mode overlay'),
    ('sceneEnabled', '启用动态场景', 'Dynamic scene'),
    ('sceneParticleSize', '粒子大小', 'Particle size'),
    ('sceneSpeed', '动画速度', 'Animation speed'),
    ('sceneWind', '风力强度', 'Wind strength'),
    ('sceneWindDirection', '风向', 'Wind direction'),
    ('sceneDepth', '景深强度', 'Depth intensity'),
    ('sceneForegroundBlur', '近景模糊', 'Foreground blur'),
    ('sceneCollision', '碰撞强度', 'Collision strength'),
    ('sceneSplash', '飞溅强度', 'Splash intensity'),
    ('sceneReducedMotion', '跟随系统减弱动效', 'Follow system reduced motion'),
    ('sceneLowPerformance', '低性能模式', 'Low-performance mode'),
    ('pageTitleColor', '标题颜色', 'Page title colour'),
    ('pageTitleSize', '标题字号', 'Page title size'),
    ('descriptionColor', '简介颜色', 'Description colour'),
    ('descriptionSize', '简介字号', 'Description size'),
    ('searchTextColor', '搜索文字颜色', 'Search text colour'),
    ('placeholderColor', '占位文字颜色', 'Placeholder colour'),
    ('fontWeight', '字重', 'Font weight'),
    ('fontFamily', '全局字体', 'Global font family'),
    ('fontFamilyZh', '中文字体', 'Chinese font'),
    ('fontFamilyEn', '英文字体', 'English font'),
    ('lineHeight', '行高', 'Line height'),
    ('bookmarkTextColor', '书签文字颜色', 'Bookmark text colour'),
    ('bookmarkTextSize', '书签文字大小', 'Bookmark text size'),
    ('notabTextColor', 'NoTab 文字颜色', 'NoTab text colour'),
    ('notabTextSize', 'NoTab 文字大小', 'NoTab text size'),
    ('folderTextColor', '文件夹文字颜色', 'Folder text colour'),
    ('folderTextSize', '文件夹文字大小', 'Folder text size'),
]

OPTIONS = [
    ('density', [
        ('compact', '紧凑', 'Compact'),
        ('balanced', '均衡', 'Balanced'),
        ('spacious', '宽松', 'Spacious'),
    ]),
    ('notabAlign', [('left', '靠左', 'Left'), ('center', '居中', 'Center')]),
    ('notabOverflow', [('scroll', '横向滚动', 'Horizontal scroll'), ('wrap', '自动换行', 'Wrap')]),
    ('backgroundPosition', [
        ('center', '居中', 'Center'),
        ('top', '顶部', 'Top'),
        ('bottom', '底部', 'Bottom'),
    ]),
    ('backgroundSize', [
        ('cover', '铺满', 'Cover'),
        ('contain', '完整显示', 'Contain'),
        ('auto', '原始大小', 'Original'),
    ]),
    ('fontFamily', [
        ('system', '系统默认', 'System'),
        ('sans', '无衬线', 'Sans-serif'),
        ('serif', '衬线', 'Serif'),
        ('rounded', '圆体', 'Rounded'),
        ('mono', '等宽', 'Monospace'),
    ]),
    ('fontFamilyZh', [
        ('inherit', '跟随全局', 'Follow global'),
        ('heiti', '黑体', 'Heiti'),
        ('songti', '宋体', 'Songti'),
        ('kaiti', '楷体', 'Kaiti'),
        ('yuanti', '圆体', 'Yuanti'),
    ]),
    ('fontFamilyEn', [
        ('inherit', '跟随全局', 'Follow global'),
        ('inter', 'Inter', 'Inter'),
        ('georgia', 'Georgia', 'Georgia'),
        ('jetbrains', 'JetBrains Mono', 'JetBrains Mono'),
    ]),
]

EDITOR = [
    ('searchPlaceholder', '搜索设置项', 'Search settings'),
    ('searchNoMatch', '没有匹配的设置项', 'No settings match'),
    ('searchClear', '清除搜索', 'Clear search'),
    ('advanced', '高级选项', 'Advanced'),
    ('changed', '已修改', 'Changed'),
    ('changedCount', '已改 {count} 项', '{count} changed'),
    ('resetGroup', '重置本组', 'Reset group'),
    ('resetAll', '全部重置', 'Reset all'),
    ('resetAllConfirm', '确定把所有外观设置恢复默认？', 'Reset every appearance setting to its default?'),
    ('livePreview', '改动会立即预览，保存后对所有访客生效', 'Changes preview immediately; saving applies them for every visitor'),
    ('densityHint', '预设只是快捷起点，之后每一项仍可单独调整', 'A preset is a starting point — every value stays individually adjustable'),
    ('sceneHint', '只显示当前场景用得到的选项', 'Only the options the current scene actually uses are shown'),
    ('backgroundHint', '仅影响你自己设置的主页背景图', 'Applies only to your own homepage background image'),
    ('unsaved', '有未保存的改动', 'Unsaved changes'),
    ('saved', '已保存', 'Saved'),
    ('closeConfirm', '有未保存的改动，确定关闭？', 'You have unsaved changes. Close anyway?'),
]


def quote(value):
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


def render(index):
    out = ['    groups: {']
    for row in GROUPS:
        out.append('      %s: %s,' % (row[0], quote(row[index])))
    out.append('    },')
    out.append('    fields: {')
    for row in FIELDS:
        out.append('      %s: %s,' % (row[0], quote(row[index])))
    out.append('    },')
    out.append('    options: {')
    for group, opts in OPTIONS:
        out.append('      %s: {' % group)
        for row in opts:
            out.append('        %s: %s,' % (row[0], quote(row[index])))
        out.append('      },')
    out.append('    },')
    out.append('    editor: {')
    for row in EDITOR:
        out.append('      %s: %s,' % (row[0], quote(row[index])))
    out.append('    },')
    return '\n'.join(out)


for path, index in (('src/locales/zh.ts', 1), ('src/locales/en.ts', 2)):
    source = io.open(path, encoding='utf-8').read()
    if '    groups: {' in source:
        raise SystemExit('%s already patched' % path)
    anchor = source.index('    fontColor: ')
    insert_at = source.index('\n', anchor) + 1
    patched = source[:insert_at] + render(index) + '\n' + source[insert_at:]
    io.open(path, 'w', encoding='utf-8').write(patched)
    print('patched', path)
