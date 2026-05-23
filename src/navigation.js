import { folders, links, sites, users } from './data.js';

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    max_folder: user.maxFolder,
    max_link: user.maxLink,
    is_vip: user.isVip,
    level: user.level,
    vip_time: user.vipTime,
  };
}

function publicSite(site) {
  return {
    ...site,
    music: JSON.stringify(site.music),
    top_bottom: JSON.stringify(site.top_bottom),
    subscribe: JSON.stringify(site.subscribe),
  };
}

export function getNavigationByUsername(username) {
  const target = users.find((user) => user.name === username);

  if (!target) {
    return null;
  }

  const site = sites.find((item) => item.userId === target.id);
  const sortedFolders = folders
    .filter((folder) => folder.userId === target.id)
    .sort((left, right) => right.weight - left.weight)
    .map((folder) => ({
      ...folder,
      links: links
        .filter((link) => link.folderId === folder.id)
        .sort((left, right) => right.weight - left.weight),
    }));

  return {
    site_info: publicSite(site),
    folder_with_links: sortedFolders,
    me: {
      id: 0,
      name: '',
      max_folder: 0,
      max_link: 0,
      is_vip: false,
      level: 0,
      vip_time: '0001-01-01',
    },
    target: publicUser(target),
  };
}
