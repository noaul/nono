const username = location.pathname.replace(/^\/+/, '').split('/')[0] || 'admin';

const siteName = document.querySelector('#site-name');
const siteInfo = document.querySelector('#site-info');
const tabs = document.querySelector('#tabs');
const folders = document.querySelector('#folders');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');

function icon(name) {
  return name ? '●' : '○';
}

function render(payload) {
  const site = payload.data.site_info;
  const folderList = payload.data.folder_with_links;

  document.title = `${site.name} 导航`;
  siteName.textContent = site.name;
  siteInfo.textContent = site.info;
  document.documentElement.style.setProperty('--page-bg', `url("${site.bg}")`);

  tabs.innerHTML = folderList
    .map((folder) => `<a href="#folder-${folder.id}">${folder.name}</a>`)
    .join('');

  folders.innerHTML = folderList
    .map((folder) => `
      <article class="folder" id="folder-${folder.id}">
        <h2>${icon(folder.icon)} ${folder.name}</h2>
        <div class="links">
          ${folder.links
            .map((link) => `<a class="link" href="${link.url}" target="_blank" rel="noopener noreferrer">${icon(link.icon)} ${link.name}</a>`)
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

  location.href = `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`;
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
