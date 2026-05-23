export const users = [
  {
    id: 1,
    name: 'admin',
    displayName: 'Nono',
    level: 2,
    isVip: true,
    vipTime: '9999-99-99',
    maxFolder: 188,
    maxLink: 1999,
  },
];

export const sites = [
  {
    id: 1,
    userId: 1,
    name: 'Nono',
    info: '一个可自托管的网址导航主页',
    view: 0,
    bg: 'https://api.dujin.org/bing/1920.php',
    mobile_bg: 'https://api.dujin.org/bing/1920.php',
    bg_switch: true,
    bg_color: '#000000',
    font_color: '#ffffff',
    bglizi: 0,
    lyb_id: '',
    music: { list: [], open: false },
    top_bottom: { top_switch: true, bottom_list: [] },
    subscribe: { list: [], open: false },
  },
];

export const folders = [
  {
    id: 1,
    userId: 1,
    name: '常用工具',
    icon: 'fa-star',
    weight: 100,
    need_password: false,
    info: '',
  },
  {
    id: 2,
    userId: 1,
    name: '开发资源',
    icon: 'fa-code',
    weight: 90,
    need_password: false,
    info: '',
  },
  {
    id: 3,
    userId: 1,
    name: 'AI 工具',
    icon: 'fa-magic',
    weight: 80,
    need_password: false,
    info: '',
  },
  {
    id: 4,
    userId: 1,
    name: '设计素材',
    icon: 'fa-picture-o',
    weight: 70,
    need_password: false,
    info: '',
  },
];

export const links = [
  { id: 1, folderId: 1, name: 'GitHub', url: 'https://github.com/', icon: 'fa-github', weight: 100 },
  { id: 2, folderId: 1, name: 'Wikipedia', url: 'https://www.wikipedia.org/', icon: 'fa-bookmark-o', weight: 90 },
  { id: 3, folderId: 1, name: 'MDN', url: 'https://developer.mozilla.org/', icon: 'fa-book', weight: 80 },
  { id: 4, folderId: 2, name: 'Node.js', url: 'https://nodejs.org/', icon: 'fa-code', weight: 100 },
  { id: 5, folderId: 2, name: 'Docker Docs', url: 'https://docs.docker.com/', icon: 'fa-cube', weight: 90 },
  { id: 6, folderId: 2, name: 'Vercel', url: 'https://vercel.com/', icon: 'fa-cloud', weight: 80 },
  { id: 7, folderId: 3, name: 'ChatGPT', url: 'https://chatgpt.com/', icon: 'fa-commenting-o', weight: 100 },
  { id: 8, folderId: 3, name: 'Claude', url: 'https://claude.ai/', icon: 'fa-comments-o', weight: 90 },
  { id: 9, folderId: 3, name: 'OpenAI Docs', url: 'https://platform.openai.com/docs', icon: 'fa-file-text-o', weight: 80 },
  { id: 10, folderId: 4, name: 'Unsplash', url: 'https://unsplash.com/', icon: 'fa-picture-o', weight: 100 },
  { id: 11, folderId: 4, name: 'Iconify', url: 'https://icon-sets.iconify.design/', icon: 'fa-smile-o', weight: 90 },
  { id: 12, folderId: 4, name: 'TinyPNG', url: 'https://tinypng.com/', icon: 'fa-compress', weight: 80 },
];
