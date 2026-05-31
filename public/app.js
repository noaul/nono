const username = location.pathname.replace(/^\/+/, '').split('/')[0] || 'admin';

const siteName = document.querySelector('#site-name');
const siteInfo = document.querySelector('#site-info');
const tabs = document.querySelector('#tabs');
const folders = document.querySelector('#folders');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
let activeSite = null;

function icon(name) {
  return name ? '●' : '○';
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

function render(payload) {
  const site = payload.data.site_info;
  const folderList = payload.data.folder_with_links;
  activeSite = site;

  document.title = `${site.name} 导航`;
  siteName.textContent = site.name;
  siteInfo.textContent = site.info;
  document.documentElement.style.setProperty(
    '--page-bg',
    site.bg_switch ? `url("${site.bg}")` : site.bg_color,
  );
  document.documentElement.style.setProperty('--text', site.font_color || '#ffffff');

  tabs.innerHTML = folderList
    .map((folder) => `<a href="#folder-${folder.id}">${escapeHtml(folder.name)}</a>`)
    .join('');

  folders.innerHTML = folderList
    .map((folder) => `
      <article class="folder" id="folder-${folder.id}">
        <h2>${icon(folder.icon)} ${escapeHtml(folder.name)}</h2>
        <div class="links">
          ${folder.links
            .map(
              (link) =>
                `<a class="link" href="${escapeAttribute(link.url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttribute(link.info || link.description || link.name)}">${icon(link.icon)} ${escapeHtml(link.name)}</a>`,
            )
            .join('')}
        </div>
      </article>
    `)
    .join('');
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const keyword = searchInput.value.trim();

  if (!keyword) {
    return;
  }

  const localHit = [...document.querySelectorAll('.link')].find((link) =>
    link.textContent.toLowerCase().includes(keyword.toLowerCase()),
  );

  if (localHit) {
    localHit.scrollIntoView({ behavior: 'smooth', block: 'center' });
    localHit.focus();
    return;
  }

  const template = activeSite?.search_url_template || 'https://www.google.com/search?q={query}';
  location.href = template.includes('{query}')
    ? template.replace('{query}', encodeURIComponent(keyword))
    : `${template}${encodeURIComponent(keyword)}`;
});

fetch(`/api/v1/allsiteandlinks/${encodeURIComponent(username)}`)
  .then((response) => response.json())
  .then((payload) => {
    if (payload.code !== 0) {
      throw new Error(payload.msg);
    }
    render(payload);
  })
  .catch((error) => {
    folders.innerHTML = `<p>加载失败：${error.message}</p>`;
  });
