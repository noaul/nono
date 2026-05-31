const now = () => new Date().toISOString();

export function createDefaultState() {
  const createdAt = now();

  return {
    version: 1,
    site: {
      id: 1,
      userId: 1,
      name: 'Nono',
      description: '一个可自托管的网址导航主页',
      slug: 'admin',
      backgroundMode: 'image',
      backgroundImage: 'https://api.dujin.org/bing/1920.php',
      mobileBackgroundImage: 'https://api.dujin.org/bing/1920.php',
      backgroundColor: '#000000',
      fontColor: '#ffffff',
      searchEngine: 'google',
      searchUrlTemplate: 'https://www.google.com/search?q={query}',
      localSearchFirst: true,
      publishUrl: '',
      view: 0,
      createdAt,
      updatedAt: createdAt,
    },
    users: [
      {
        id: 1,
        username: 'admin',
        name: 'admin',
        displayName: 'Nono',
        level: 2,
        isVip: true,
        vipTime: '9999-99-99',
        maxFolder: 188,
        maxLink: 1999,
        passwordHash: '',
        passwordSalt: '',
        createdAt,
        updatedAt: createdAt,
      },
    ],
    folders: [
      folder(1, '常用工具', 'star', 100, createdAt),
      folder(2, '开发资源', 'code', 90, createdAt),
      folder(3, 'AI 工具', 'sparkles', 80, createdAt),
      folder(4, '设计素材', 'image', 70, createdAt),
    ],
    links: [
      link(1, 1, 'GitHub', 'https://github.com/', 'github', 100, createdAt),
      link(2, 1, 'Wikipedia', 'https://www.wikipedia.org/', 'book', 90, createdAt),
      link(3, 1, 'MDN', 'https://developer.mozilla.org/', 'book-open', 80, createdAt),
      link(4, 2, 'Node.js', 'https://nodejs.org/', 'code', 100, createdAt),
      link(5, 2, 'Docker Docs', 'https://docs.docker.com/', 'box', 90, createdAt),
      link(6, 2, 'Vercel', 'https://vercel.com/', 'cloud', 80, createdAt),
      link(7, 3, 'ChatGPT', 'https://chatgpt.com/', 'message-circle', 100, createdAt),
      link(8, 3, 'Claude', 'https://claude.ai/', 'messages-square', 90, createdAt),
      link(9, 3, 'OpenAI Docs', 'https://platform.openai.com/docs', 'file-text', 80, createdAt),
      link(10, 4, 'Unsplash', 'https://unsplash.com/', 'image', 100, createdAt),
      link(11, 4, 'Iconify', 'https://icon-sets.iconify.design/', 'smile', 90, createdAt),
      link(12, 4, 'TinyPNG', 'https://tinypng.com/', 'minimize', 80, createdAt),
    ],
  };
}

function folder(id, name, icon, sortOrder, createdAt) {
  return {
    id,
    userId: 1,
    parentId: null,
    name,
    icon,
    description: '',
    passwordHash: '',
    passwordHint: '',
    sortOrder,
    weight: sortOrder,
    need_password: false,
    info: '',
    createdAt,
    updatedAt: createdAt,
  };
}

function link(id, folderId, name, url, icon, sortOrder, createdAt) {
  return {
    id,
    folderId,
    name,
    url,
    icon,
    description: '',
    sortOrder,
    weight: sortOrder,
    createdAt,
    updatedAt: createdAt,
  };
}
