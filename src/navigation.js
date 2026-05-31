export function getNavigationByUsername(state, username) {
  const target = state.users.find((user) => user.username === username || user.name === username);

  if (!target) {
    return null;
  }

  const folderList = state.folders
    .filter((folder) => folder.userId === target.id)
    .sort((left, right) => right.sortOrder - left.sortOrder || left.id - right.id)
    .map((folder) => ({
      id: folder.id,
      userId: folder.userId,
      parentId: folder.parentId,
      parent_id: folder.parentId,
      name: folder.name,
      icon: folder.icon,
      weight: folder.sortOrder,
      sort_order: folder.sortOrder,
      need_password: Boolean(folder.passwordHash),
      password_hint: folder.passwordHint,
      info: folder.description || folder.info || '',
      links: state.links
        .filter((link) => link.folderId === folder.id)
        .sort((left, right) => right.sortOrder - left.sortOrder || left.id - right.id)
        .map(publicLink),
    }));

  return {
    site_info: publicSite(state.site),
    folder_with_links: folderList,
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

export function adminState(state, user) {
  return {
    site: state.site,
    folders: state.folders,
    links: state.links,
    stats: {
      folders: state.folders.length,
      links: state.links.length,
      protectedFolders: state.folders.filter((folder) => folder.passwordHash).length,
      updatedAt: latestUpdatedAt(state),
    },
    user: user
      ? {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
        }
      : null,
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.username,
    max_folder: user.maxFolder,
    max_link: user.maxLink,
    is_vip: user.isVip,
    level: user.level,
    vip_time: user.vipTime,
  };
}

function publicSite(site) {
  return {
    id: site.id,
    userId: site.userId,
    name: site.name,
    info: site.description,
    view: site.view || 0,
    bg: site.backgroundImage,
    mobile_bg: site.mobileBackgroundImage,
    bg_switch: site.backgroundMode !== 'color',
    bg_color: site.backgroundColor,
    font_color: site.fontColor,
    bglizi: 0,
    lyb_id: '',
    music: JSON.stringify({ list: [], open: false }),
    top_bottom: JSON.stringify({ top_switch: true, bottom_list: [] }),
    subscribe: JSON.stringify({ list: [], open: false }),
    search_engine: site.searchEngine,
    search_url_template: site.searchUrlTemplate,
    local_search_first: site.localSearchFirst,
    publish_url: site.publishUrl,
  };
}

function publicLink(link) {
  return {
    id: link.id,
    folderId: link.folderId,
    folder_id: link.folderId,
    name: link.name,
    url: link.url,
    icon: link.icon,
    weight: link.sortOrder,
    sort_order: link.sortOrder,
    info: link.description,
    description: link.description,
  };
}

function latestUpdatedAt(state) {
  const values = [state.site, ...state.folders, ...state.links]
    .map((item) => item.updatedAt || item.createdAt)
    .filter(Boolean)
    .sort();
  return values.at(-1) || '';
}
