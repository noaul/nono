// Popup/runtime translations. Deliberately free of any chrome.* dependency so the pure
// workflow module stays unit-testable; the popup calls setLocale() once at startup.
// Manifest-level strings (name, description, command titles) use Chrome's own _locales.

const zh = {
  connect: '连接',
  connectTitle: '连接 Nono',
  connectionSettings: '连接设置',
  closeSettings: '关闭设置',
  serverUrl: '服务地址',
  testConnection: '测试连接',
  saveAndStart: '保存并开始',
  tokenHint: '填入后台创建的 API Token。',
  language: '界面语言',
  readingPage: '读取当前网页...',
  readyToSave: '准备收藏',
  bookmarkName: '书签名称',
  aiTidy: 'AI 整理',
  saveTo: '保存到',
  refreshFolders: '刷新文件夹',
  folder: '文件夹',
  readyStatus: '准备保存。',
  saveThisPage: '收藏此页',
  edit: '编辑',
  collapse: '收起',
  optional: '可选',
  extraInfo: '补充信息',
  description: '描述',
  popupTitle: 'Nono 快速收藏',

  needServerUrl: '请输入 Nono 服务地址。',
  needValidServerUrl: '请输入有效的 Nono 服务地址。',
  needHttps: '服务地址必须使用 HTTPS；本机开发可使用 loopback HTTP。',
  tokenNeverExpires: 'Token 不过期',
  tokenExpired: 'Token 已过期',
  tokenExpiresIn: 'Token 还有 {days} 天过期',
  otherFolders: '其他文件夹',
  untitledBookmark: '未命名书签',

  invalidServerUrl: '服务地址无效。',
  connecting: '正在连接...',
  connected: '已连接',
  connectFailed: '连接失败，请检查服务地址与 Token。',
  pickThenSave: '选好位置后，一次点击即可收藏。',
  cannotReadPage: '无法读取当前网页。',
  useOnNormalTab: '请在普通网页标签中使用快速收藏。',
  pickFolderFirst: '请先选择一个文件夹。',
  saving: '收藏中...',
  saved: '已收藏到 Nono。',
  saveFailed: '收藏失败。',
  tidying: '整理中...',
  tidied: 'AI 已补充标题、描述与建议位置。',
  tidyFailed: 'AI 整理失败，仍可直接收藏。',
  duplicateWarning: '这个链接已收藏为「{name}」，仍可再次保存。',
  requestFailed: '请求失败',
  quickSaveMenu: '保存到 Nono（上次文件夹）',
  pickFolderMenu: '选择文件夹后保存到 Nono',
  bookmarkFailed: '收藏失败',
};

const en = {
  connect: 'Connection',
  connectTitle: 'Connect to Nono',
  connectionSettings: 'Connection settings',
  closeSettings: 'Close settings',
  serverUrl: 'Server URL',
  testConnection: 'Test connection',
  saveAndStart: 'Save and start',
  tokenHint: 'Paste an API token created in the Nono admin.',
  language: 'Language',
  readingPage: 'Reading the current page…',
  readyToSave: 'Ready to save',
  bookmarkName: 'Bookmark name',
  aiTidy: 'AI tidy',
  saveTo: 'Save to',
  refreshFolders: 'Refresh folders',
  folder: 'Folder',
  readyStatus: 'Ready to save.',
  saveThisPage: 'Save this page',
  edit: 'Edit',
  collapse: 'Collapse',
  optional: 'Optional',
  extraInfo: 'More details',
  description: 'Description',
  popupTitle: 'Nono quick save',

  needServerUrl: 'Enter your Nono server URL.',
  needValidServerUrl: 'Enter a valid Nono server URL.',
  needHttps: 'The server URL must use HTTPS; loopback HTTP is allowed for local development.',
  tokenNeverExpires: 'Token never expires',
  tokenExpired: 'Token has expired',
  tokenExpiresIn: 'Token expires in {days} days',
  otherFolders: 'Other folders',
  untitledBookmark: 'Untitled bookmark',

  invalidServerUrl: 'That server URL is not valid.',
  connecting: 'Connecting…',
  connected: 'Connected',
  connectFailed: 'Could not connect — check the server URL and token.',
  pickThenSave: 'Pick a spot, then save in one click.',
  cannotReadPage: 'Could not read the current page.',
  useOnNormalTab: 'Use quick save on a normal web page tab.',
  pickFolderFirst: 'Choose a folder first.',
  saving: 'Saving…',
  saved: 'Saved to Nono.',
  saveFailed: 'Could not save.',
  tidying: 'Tidying…',
  tidied: 'AI filled in the title, description, and a suggested folder.',
  tidyFailed: 'AI tidy failed — you can still save directly.',
  duplicateWarning: 'This link is already saved as “{name}”. You can still save it again.',
  requestFailed: 'Request failed',
  quickSaveMenu: 'Save to Nono (last folder)',
  pickFolderMenu: 'Choose a folder, then save to Nono',
  bookmarkFailed: 'Could not save the bookmark',
};

const catalogues = { zh, en };
export const LOCALE_STORAGE_KEY = 'nono:extension-locale';

// Chinese stays the default so an existing install keeps the wording it had.
let active = 'zh';

export function isLocale(value) {
  return value === 'zh' || value === 'en';
}

export function setLocale(value) {
  active = isLocale(value) ? value : 'zh';
  return active;
}

export function getLocale() {
  return active;
}

/** Maps a browser UI language ('zh-CN', 'en-GB') onto the two locales we ship. */
export function localeFromUiLanguage(value) {
  const tag = String(value || '').toLowerCase();
  if (tag.startsWith('zh')) return 'zh';
  if (tag.startsWith('en')) return 'en';
  return null;
}

export function t(key, params) {
  const template = catalogues[active]?.[key] ?? zh[key];
  if (template === undefined) return key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}
