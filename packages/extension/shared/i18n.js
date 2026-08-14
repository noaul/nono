// Popup/runtime translations. Deliberately free of any chrome.* dependency so the pure
// workflow module stays unit-testable; the popup calls setLocale() once at startup.
// Manifest-level strings (name, description, command titles) use Chrome's own _locales.

const zh = {
  quickBookmark: '快速收藏',
  connect: '连接',
  connectTitle: '连接 NoNo',
  connectionSettings: '连接设置',
  closeSettings: '关闭设置',
  serverUrl: '服务地址',
  testConnection: '测试连接',
  saveAndStart: '保存并开始',
  tokenHint: '填入后台创建的 API Token。',
  privacyHint: '仅在你主动收藏时读取当前网页，并只发送到你配置的 NoNo 服务。',
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
  saveAnotherCopy: '另存一份',
  edit: '编辑',
  collapse: '收起',
  optional: '可选',
  extraInfo: '补充信息',
  description: '描述',
  popupTitle: 'NoNo 快速收藏',
  duplicateFound: '发现重复收藏',
  updateExisting: '更新已有',
  openSourceOn: '开源于',
  feedback: '反馈',

  needServerUrl: '请输入 NoNo 服务地址。',
  needValidServerUrl: '请输入有效的 NoNo 服务地址。',
  needHttps: '服务地址必须使用 HTTPS；本机开发可使用 loopback HTTP。',
  needToken: '请输入 API Token。',
  permissionRequired: '需要授权访问这个 NoNo 服务地址，请点击“保存并开始”。',
  permissionDenied: '未获得服务地址访问权限。',
  tokenNeverExpires: 'Token 不过期',
  tokenExpired: 'Token 已过期',
  tokenExpiresIn: 'Token 还有 {days} 天过期',
  otherFolders: '其他文件夹',
  untitledBookmark: '未命名书签',

  invalidServerUrl: '服务地址无效。',
  connecting: '正在连接...',
  savingSettings: '保存中...',
  connected: '已连接',
  connectFailed: '连接失败，请检查服务地址与 Token。',
  pickThenSave: '选好位置后，一次点击即可收藏。',
  noFolders: '还没有可用文件夹，请先在 NoNo 中创建。',
  noFoldersOption: '暂无文件夹',
  foldersRefreshed: '文件夹和重复状态已刷新。',
  refreshFailed: '刷新失败。',
  cannotReadPage: '无法读取当前网页。',
  useOnNormalTab: '请在普通网页标签中使用快速收藏。',
  pickFolderFirst: '请先选择一个文件夹。',
  saving: '收藏中...',
  saved: '已收藏到 NoNo。',
  saveFailed: '收藏失败。',
  tidying: '整理中...',
  tidied: 'AI 已补充标题、描述与建议位置。',
  tidyFailed: 'AI 整理失败，仍可直接收藏。',
  duplicateWarning: '已收藏为「{name}」，可更新原记录或另存一份。',
  updating: '更新中...',
  updatedExisting: '已有收藏已更新。',
  updateFailed: '更新已有收藏失败。',
  requestFailed: '请求失败',
  requestTimedOut: '请求超时，请检查服务是否可访问。',
  quickSaveMenu: '保存到 NoNo（上次文件夹）',
  pickFolderMenu: '选择文件夹后保存到 NoNo',
  bookmarkFailed: '收藏失败',
};

const en = {
  quickBookmark: 'Quick bookmark',
  connect: 'Connection',
  connectTitle: 'Connect to NoNo',
  connectionSettings: 'Connection settings',
  closeSettings: 'Close settings',
  serverUrl: 'Server URL',
  testConnection: 'Test connection',
  saveAndStart: 'Save and start',
  tokenHint: 'Paste an API token created in the NoNo admin.',
  privacyHint: 'The current page is read only when you save and is sent only to the NoNo service you configured.',
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
  saveAnotherCopy: 'Save another copy',
  edit: 'Edit',
  collapse: 'Collapse',
  optional: 'Optional',
  extraInfo: 'More details',
  description: 'Description',
  popupTitle: 'NoNo quick save',
  duplicateFound: 'Duplicate found',
  updateExisting: 'Update existing',
  openSourceOn: 'Open source on',
  feedback: 'Feedback',

  needServerUrl: 'Enter your NoNo server URL.',
  needValidServerUrl: 'Enter a valid NoNo server URL.',
  needHttps: 'The server URL must use HTTPS; loopback HTTP is allowed for local development.',
  needToken: 'Enter an API token.',
  permissionRequired: 'Access to this NoNo server is required. Select “Save and start” to grant it.',
  permissionDenied: 'Access to the server address was not granted.',
  tokenNeverExpires: 'Token never expires',
  tokenExpired: 'Token has expired',
  tokenExpiresIn: 'Token expires in {days} days',
  otherFolders: 'Other folders',
  untitledBookmark: 'Untitled bookmark',

  invalidServerUrl: 'That server URL is not valid.',
  connecting: 'Connecting…',
  savingSettings: 'Saving…',
  connected: 'Connected',
  connectFailed: 'Could not connect — check the server URL and token.',
  pickThenSave: 'Pick a spot, then save in one click.',
  noFolders: 'No folders are available yet. Create one in NoNo first.',
  noFoldersOption: 'No folders',
  foldersRefreshed: 'Folders and duplicate status refreshed.',
  refreshFailed: 'Could not refresh.',
  cannotReadPage: 'Could not read the current page.',
  useOnNormalTab: 'Use quick save on a normal web page tab.',
  pickFolderFirst: 'Choose a folder first.',
  saving: 'Saving…',
  saved: 'Saved to NoNo.',
  saveFailed: 'Could not save.',
  tidying: 'Tidying…',
  tidied: 'AI filled in the title, description, and a suggested folder.',
  tidyFailed: 'AI tidy failed — you can still save directly.',
  duplicateWarning: 'Already saved as “{name}”. Update it or save another copy.',
  updating: 'Updating…',
  updatedExisting: 'The existing bookmark was updated.',
  updateFailed: 'Could not update the existing bookmark.',
  requestFailed: 'Request failed',
  requestTimedOut: 'The request timed out. Check that the service is reachable.',
  quickSaveMenu: 'Save to NoNo (last folder)',
  pickFolderMenu: 'Choose a folder, then save to NoNo',
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
