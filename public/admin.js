const root = document.querySelector('#admin-root');
const navItems = [
  ['overview', '▣', '总览'],
  ['site', '✺', '导航配置'],
  ['folders', '□', '文件夹'],
  ['links', '◇', '书签管理'],
  ['import', '⇄', '导入导出'],
  ['account', '○', '账户'],
];

const app = {
  view: location.hash.replace('#', '') || 'overview',
  session: null,
  data: null,
  linkFolderId: 'all',
  message: '',
};

init();

async function init() {
  root.addEventListener('click', handleClick);
  root.addEventListener('submit', handleSubmit);
  app.session = await api('/api/admin/session');
  if (!app.session.authenticated) {
    renderAuth(app.session.setupRequired ? 'setup' : 'login');
    return;
  }
  await loadState();
  renderApp();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(payload.error || payload.msg || '请求失败');
  }
  return payload;
}

async function loadState() {
  app.data = await api('/api/admin/state');
}

function renderAuth(mode) {
  const isSetup = mode === 'setup';
  root.innerHTML = `
    <main class="auth">
      <section class="auth-panel">
        <div class="brand" style="margin-bottom:20px">
          <div class="auth-logo">N</div>
          <div>
            <h1>${isSetup ? '初始化 Nono' : '登录控制台'}</h1>
            <p>${isSetup ? '创建本地管理员账号，之后就能管理导航。' : '输入管理员密码，继续编辑导航。'}</p>
          </div>
        </div>
        <form id="${isSetup ? 'setup-form' : 'login-form'}">
          <label class="field">
            <span>用户名</span>
            <input class="input" name="username" value="admin" autocomplete="username">
          </label>
          ${isSetup ? '<label class="field"><span>显示名称</span><input class="input" name="displayName" value="Nono Admin"></label>' : ''}
          <label class="field">
            <span>密码</span>
            <input class="input" name="password" type="password" autocomplete="${isSetup ? 'new-password' : 'current-password'}" required minlength="8">
          </label>
          <button class="btn primary" style="width:100%;margin-top:18px" type="submit">${isSetup ? '创建账号' : '登录'}</button>
        </form>
        ${app.message ? `<div class="message">${escapeHtml(app.message)}</div>` : ''}
      </section>
    </main>
  `;
}

function renderApp() {
  const site = app.data.site;
  root.innerHTML = `
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <div class="brand-logo">N</div>
          <div>
            <h1>Nono 控制台</h1>
            <p>${escapeHtml(site.name)} 的导航工作台</p>
          </div>
        </div>
        <div class="notice"><span>♢</span><strong>公告</strong><span>浏览器书签导入导出已就绪</span></div>
        <div class="top-actions">
          <a class="btn ghost" href="/" target="_blank" rel="noopener">◎ 查看主页</a>
          <button class="btn" data-action="logout">↳ 退出</button>
        </div>
      </header>
      <div class="workspace">
        <aside class="sidebar">
          ${navItems
            .map(
              ([id, icon, label]) =>
                `<button class="nav-button ${app.view === id ? 'active' : ''}" data-view="${id}"><span>${icon}</span>${label}</button>`,
            )
            .join('')}
        </aside>
        <main class="content">
          ${renderPage()}
        </main>
      </div>
    </div>
  `;
}

function renderPage() {
  if (app.view === 'site') return pageShell('导航配置', '调整站点资料、背景和搜索引擎。', renderSite());
  if (app.view === 'folders') return pageShell('文件夹', '管理分类、访问密码、引导语和展示顺序。', renderFolders());
  if (app.view === 'links') return pageShell('书签管理', '新增、批量编辑、排序和迁移你的导航书签。', renderLinks());
  if (app.view === 'import') return pageShell('导入导出', '与浏览器书签文件双向同步。', renderImportExport());
  if (app.view === 'account') return pageShell('账户', '更新密码和查看登录状态。', renderAccount());
  return pageShell('总览', '查看发布状态、容量使用和待处理事项。', renderOverview());
}

function pageShell(title, description, body) {
  const publish = app.data.site.publishUrl || location.origin;
  return `
    <header class="page-head">
      <div class="page-title">
        <p><strong>Nono 工作台</strong></p>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
      <div class="publish">发布地址&nbsp; ${escapeHtml(publish)}</div>
    </header>
    <section class="section">
      ${body}
      ${app.message ? `<div class="message">${escapeHtml(app.message)}</div>` : ''}
    </section>
  `;
}

function renderOverview() {
  const stats = app.data.stats;
  const maxFolder = 188;
  const maxLink = 1999;
  return `
    <div class="panel">
      <div class="grid two" style="align-items:center">
        <div>
          <p class="hint">工作台总览</p>
          <h2>欢迎回来，${escapeHtml(app.data.user.displayName)}</h2>
          <p class="hint">专属链接 ${escapeHtml(app.data.site.publishUrl || location.origin)}</p>
        </div>
        <div class="top-actions">
          <a class="btn primary" href="/" target="_blank" rel="noopener">◎ 查看主页</a>
          <button class="btn" data-view="links">＋ 快捷添加</button>
          <button class="btn" data-view="import">⇄ 导入导出</button>
        </div>
      </div>
    </div>
    <div class="grid three">
      ${metric('文件夹容量', `${stats.folders}/${maxFolder}`, stats.folders, maxFolder, '剩余 ' + (maxFolder - stats.folders) + ' 个文件夹')}
      ${metric('书签容量', `${stats.links}/${maxLink}`, stats.links, maxLink, '剩余 ' + (maxLink - stats.links) + ' 个书签')}
      ${metric('加密文件夹', stats.protectedFolders, stats.protectedFolders, Math.max(1, stats.folders), stats.protectedFolders ? '已有访问保护' : '暂无访问保护')}
    </div>
    <div class="panel" style="margin-top:18px">
      <h2>工具与效率</h2>
      <p class="hint">常用入口集中放置，不打断主流程。</p>
      <div class="grid two" style="margin-top:16px">
        <button class="btn" data-view="links">＋ 新增书签</button>
        <button class="btn" data-view="import">⇄ 浏览器书签导入</button>
      </div>
    </div>
  `;
}

function metric(label, value, current, max, detail) {
  const width = Math.max(0, Math.min(100, Math.round((Number(current) / Number(max)) * 100)));
  return `
    <div class="metric">
      <span class="label">${label}</span>
      <strong>${value}</strong>
      <div class="progress"><span style="width:${width}%"></span></div>
      <p class="hint">${detail}</p>
    </div>
  `;
}

function renderSite() {
  const site = app.data.site;
  return `
    <form class="panel form-grid" id="site-form">
      ${field('站点名', 'name', site.name, 'span-4')}
      ${field('站点简介', 'description', site.description, 'span-8')}
      <label class="field span-3"><span>背景模式</span><select class="select" name="backgroundMode">
        <option value="image" ${site.backgroundMode !== 'color' ? 'selected' : ''}>图片背景</option>
        <option value="color" ${site.backgroundMode === 'color' ? 'selected' : ''}>纯色背景</option>
      </select></label>
      ${field('横版背景', 'backgroundImage', site.backgroundImage, 'span-5')}
      ${field('竖版背景', 'mobileBackgroundImage', site.mobileBackgroundImage, 'span-4')}
      ${field('背景色', 'backgroundColor', site.backgroundColor, 'span-3', 'color')}
      ${field('字体颜色', 'fontColor', site.fontColor, 'span-3', 'color')}
      ${field('发布地址', 'publishUrl', site.publishUrl || location.origin, 'span-6')}
      <label class="field span-3"><span>搜索引擎</span><select class="select" name="searchEngine">
        <option value="google" selected>Google</option>
        <option value="custom">自定义</option>
      </select></label>
      ${field('搜索模板', 'searchUrlTemplate', site.searchUrlTemplate, 'span-9')}
      <label class="field span-12"><span><input type="checkbox" name="localSearchFirst" ${site.localSearchFirst ? 'checked' : ''}> 优先站内搜索，未命中再跳转搜索引擎</span></label>
      <div class="span-12 top-actions"><button class="btn primary" type="submit">更新站点信息</button></div>
    </form>
  `;
}

function renderFolders() {
  const rows = [...app.data.folders].sort(sortByOrder);
  return `
    <form class="panel form-grid" id="folder-create-form">
      <div class="span-12"><h2>新增文件夹</h2><p class="hint">用于组织你的导航分类，可选图标、访问密码和引导语。</p></div>
      ${field('图标', 'icon', '', 'span-3', 'text', '如 star')}
      ${field('名称', 'name', '', 'span-3', 'text', '最多 16 个字')}
      ${field('引导语', 'description', '', 'span-4', 'text', '文件夹提示语')}
      <div class="span-2"><button class="btn primary" type="submit" style="width:100%">＋ 新增文件夹</button></div>
    </form>
    <div class="panel">
      <div class="grid two" style="align-items:center"><div><h2>文件夹管理</h2><p class="hint">单行更新会立即保存；排序用上移/下移。</p></div></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>图标</th><th>名称</th><th>引导语</th><th>书签</th><th style="text-align:right">操作</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (folder, index) => `<tr data-folder-row="${folder.id}">
                <td><input class="input" name="icon" value="${escapeAttribute(folder.icon)}"></td>
                <td><input class="input" name="name" value="${escapeAttribute(folder.name)}"></td>
                <td><input class="input" name="description" value="${escapeAttribute(folder.description || '')}"></td>
                <td>${app.data.links.filter((link) => link.folderId === folder.id).length}</td>
                <td><div class="row-actions">
                  <button class="btn" data-action="move-folder" data-id="${folder.id}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>↑</button>
                  <button class="btn" data-action="move-folder" data-id="${folder.id}" data-direction="1" ${index === rows.length - 1 ? 'disabled' : ''}>↓</button>
                  <button class="btn primary" data-action="update-folder" data-id="${folder.id}">更新</button>
                  <button class="btn red" data-action="delete-folder" data-id="${folder.id}">删除</button>
                </div></td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table></div>
    </div>
  `;
}

function renderLinks() {
  const folders = [...app.data.folders].sort(sortByOrder);
  const selectedFolder = app.linkFolderId === 'all' ? folders[0]?.id : Number(app.linkFolderId);
  const rows = [...app.data.links].filter((link) => !selectedFolder || link.folderId === selectedFolder).sort(sortByOrder);
  return `
    <form class="panel form-grid" id="link-create-form">
      <div class="span-12"><h2>新增书签</h2><p class="hint">把链接放进指定文件夹后，会立即出现在公开导航页。</p></div>
      ${field('名称', 'name', '', 'span-3', 'text', '最多 24 个字')}
      ${field('链接', 'url', '', 'span-5', 'url', 'https://')}
      <label class="field span-2"><span>文件夹</span><select class="select" name="folderId">${folderOptions(folders, selectedFolder)}</select></label>
      ${field('图标', 'icon', '', 'span-2', 'text', '可为空')}
      ${field('简介', 'description', '', 'span-10', 'text', '鼠标经过时的提示语，也可用于站内搜索')}
      <div class="span-2"><button class="btn primary" type="submit" style="width:100%">＋ 新增书签</button></div>
    </form>
    <div class="panel">
      <h2>书签管理</h2>
      <p class="hint">先选择文件夹，再编辑、迁移、排序或删除其中的书签。</p>
      <div class="pills">
        ${folders.map((folder) => `<button class="pill ${selectedFolder === folder.id ? 'active' : ''}" data-link-folder="${folder.id}">□ ${escapeHtml(folder.name)}</button>`).join('')}
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>图标</th><th>名称</th><th>链接</th><th>简介</th><th>文件夹</th><th style="text-align:right">操作</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (link, index) => `<tr data-link-row="${link.id}">
                <td><input class="input" name="icon" value="${escapeAttribute(link.icon)}"></td>
                <td><input class="input" name="name" value="${escapeAttribute(link.name)}"></td>
                <td><input class="input" name="url" value="${escapeAttribute(link.url)}"></td>
                <td><input class="input" name="description" value="${escapeAttribute(link.description || '')}"></td>
                <td><select class="select" name="folderId">${folderOptions(folders, link.folderId)}</select></td>
                <td><div class="row-actions">
                  <button class="btn" data-action="move-link" data-id="${link.id}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>↑</button>
                  <button class="btn" data-action="move-link" data-id="${link.id}" data-direction="1" ${index === rows.length - 1 ? 'disabled' : ''}>↓</button>
                  <a class="btn green" href="${escapeAttribute(link.url)}" target="_blank" rel="noopener">◎</a>
                  <button class="btn primary" data-action="update-link" data-id="${link.id}">更新</button>
                  <button class="btn red" data-action="delete-link" data-id="${link.id}">删</button>
                </div></td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table></div>
    </div>
  `;
}

function renderImportExport() {
  return `
    <div class="grid two">
      <form class="panel" id="import-form">
        <h2>浏览器书签导入</h2>
        <p class="hint">支持 Chrome、Edge、Firefox 导出的 HTML 书签文件。</p>
        <label class="field">
          <span>选择 HTML 文件</span>
          <input class="input" name="file" type="file" accept=".html,.htm,text/html" required>
        </label>
        <button class="btn primary" type="submit" style="margin-top:16px">导入书签</button>
      </form>
      <div class="panel">
        <h2>书签备份</h2>
        <p class="hint">导出为浏览器可再次导入的 Netscape Bookmark HTML。</p>
        <button class="btn primary" data-action="export-bookmarks" style="margin-top:16px">下载 nono-bookmarks.html</button>
      </div>
    </div>
  `;
}

function renderAccount() {
  return `
    <div class="grid two">
      <form class="panel" id="password-form">
        <h2>密码修改</h2>
        <p class="hint">本地部署建议使用独立强密码。</p>
        <label class="field"><span>新密码</span><input class="input" name="password" type="password" minlength="8" required></label>
        <button class="btn primary" type="submit" style="margin-top:16px">更改密码</button>
      </form>
      <div class="panel">
        <h2>账号状态</h2>
        <p class="hint">当前账号：${escapeHtml(app.data.user.username)}</p>
        <p class="hint">显示名称：${escapeHtml(app.data.user.displayName)}</p>
      </div>
    </div>
  `;
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === 'setup-form') {
      app.session = await api('/api/admin/setup', { method: 'POST', body: JSON.stringify(formObject(form)) });
      await loadState();
      renderApp();
    } else if (form.id === 'login-form') {
      app.session = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(formObject(form)) });
      await loadState();
      renderApp();
    } else if (form.id === 'site-form') {
      const body = formObject(form);
      body.localSearchFirst = form.localSearchFirst.checked;
      await api('/api/admin/site', { method: 'PUT', body: JSON.stringify(body) });
      await refresh('站点信息已更新。');
    } else if (form.id === 'folder-create-form') {
      await api('/api/admin/folders', { method: 'POST', body: JSON.stringify(formObject(form)) });
      await refresh('文件夹已新增。');
    } else if (form.id === 'link-create-form') {
      await api('/api/admin/links', { method: 'POST', body: JSON.stringify(formObject(form)) });
      await refresh('书签已新增。');
    } else if (form.id === 'import-form') {
      const file = form.file.files[0];
      const html = await file.text();
      const result = await api('/api/admin/bookmarks/import', { method: 'POST', body: JSON.stringify({ html }) });
      await refresh(`导入完成：新增 ${result.summary.addedFolders} 个文件夹，${result.summary.addedLinks} 个书签，跳过 ${result.summary.skippedDuplicates} 个重复链接。`);
    } else if (form.id === 'password-form') {
      await api('/api/admin/account/password', { method: 'POST', body: JSON.stringify(formObject(form)) });
      await refresh('密码已更新。');
    }
  } catch (error) {
    app.message = error.message;
    app.session?.authenticated ? renderApp() : renderAuth(form.id === 'setup-form' ? 'setup' : 'login');
  }
}

async function handleClick(event) {
  const button = event.target.closest('button, a');
  if (!button) return;
  if (button.dataset.view) {
    event.preventDefault();
    app.view = button.dataset.view;
    history.replaceState(null, '', `#${app.view}`);
    app.message = '';
    renderApp();
    return;
  }
  if (button.dataset.linkFolder) {
    event.preventDefault();
    app.linkFolderId = button.dataset.linkFolder;
    renderApp();
    return;
  }
  const action = button.dataset.action;
  if (!action) return;
  event.preventDefault();
  try {
    if (action === 'logout') {
      await api('/api/admin/logout', { method: 'POST', body: '{}' });
      location.reload();
    } else if (action === 'export-bookmarks') {
      location.href = '/api/admin/bookmarks/export';
    } else if (action === 'update-folder') {
      await updateFolder(button.dataset.id);
    } else if (action === 'delete-folder') {
      if (confirm('删除文件夹会同时删除其中的书签，确定继续？')) {
        await api(`/api/admin/folders/${button.dataset.id}`, { method: 'DELETE' });
        await refresh('文件夹已删除。');
      }
    } else if (action === 'move-folder') {
      await moveItem('folders', Number(button.dataset.id), Number(button.dataset.direction));
    } else if (action === 'update-link') {
      await updateLink(button.dataset.id);
    } else if (action === 'delete-link') {
      await api(`/api/admin/links/${button.dataset.id}`, { method: 'DELETE' });
      await refresh('书签已删除。');
    } else if (action === 'move-link') {
      await moveItem('links', Number(button.dataset.id), Number(button.dataset.direction));
    }
  } catch (error) {
    app.message = error.message;
    renderApp();
  }
}

async function updateFolder(id) {
  const row = root.querySelector(`[data-folder-row="${id}"]`);
  await api(`/api/admin/folders/${id}`, { method: 'PUT', body: JSON.stringify(rowObject(row)) });
  await refresh('文件夹已更新。');
}

async function updateLink(id) {
  const row = root.querySelector(`[data-link-row="${id}"]`);
  await api(`/api/admin/links/${id}`, { method: 'PUT', body: JSON.stringify(rowObject(row)) });
  await refresh('书签已更新。');
}

async function moveItem(resource, id, direction) {
  const items = resource === 'folders'
    ? [...app.data.folders].sort(sortByOrder)
    : [...app.data.links].filter((link) => link.folderId === Number(app.linkFolderId)).sort(sortByOrder);
  const index = items.findIndex((item) => item.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return;
  const moved = [...items];
  [moved[index], moved[next]] = [moved[next], moved[index]];
  await api('/api/admin/reorder', {
    method: 'PUT',
    body: JSON.stringify({ resource, ids: moved.map((item) => item.id) }),
  });
  await refresh('顺序已更新。');
}

async function refresh(message) {
  app.message = message;
  await loadState();
  renderApp();
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function rowObject(row) {
  const data = {};
  for (const field of row.querySelectorAll('input, select, textarea')) {
    data[field.name] = field.value;
  }
  return data;
}

function field(label, name, value, span, type = 'text', placeholder = '') {
  return `<label class="field ${span}"><span>${label}</span><input class="input" name="${name}" type="${type}" value="${escapeAttribute(value || '')}" placeholder="${escapeAttribute(placeholder)}"></label>`;
}

function folderOptions(folders, selected) {
  return folders
    .map((folder) => `<option value="${folder.id}" ${Number(selected) === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`)
    .join('');
}

function sortByOrder(left, right) {
  return right.sortOrder - left.sortOrder || left.id - right.id;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}
