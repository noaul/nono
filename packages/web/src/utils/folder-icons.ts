import type { Component } from 'vue';
import type { MessageKey } from '@/locales';
import {
  AppWindow,
  BarChart3,
  BookOpen,
  Bookmark,
  Bot,
  Briefcase,
  Code2,
  FlaskConical,
  Folder,
  Folders,
  Gamepad2,
  Globe2,
  Heart,
  House,
  LayoutGrid,
  Link2,
  Lock,
  Palette,
  Pin,
  Plane,
  Rocket,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Wrench,
} from 'lucide-vue-next';

export interface FolderIconOption {
  value: string;
  /** Catalogue key under folderIcons.*; the picker resolves it. */
  labelKey: MessageKey;
  keywords: string[];
  component: Component;
  recommended?: boolean;
}

export const folderIconOptions: FolderIconOption[] = [
  { value: 'folder', labelKey: 'folderIcons.folder', keywords: ['目录', 'folder'], component: Folder, recommended: true },
  { value: 'folders', labelKey: 'folderIcons.folders', keywords: ['目录', 'folders'], component: Folders, recommended: true },
  { value: 'category', labelKey: 'folderIcons.category', keywords: ['网格', 'category'], component: LayoutGrid, recommended: true },
  { value: 'learning', labelKey: 'folderIcons.learning', keywords: ['书籍', '阅读', 'learning'], component: BookOpen, recommended: true },
  { value: 'work', labelKey: 'folderIcons.work', keywords: ['办公', 'work'], component: Briefcase, recommended: true },
  { value: 'tools', labelKey: 'folderIcons.tools', keywords: ['扳手', 'toolbox', 'tools'], component: Wrench, recommended: true },
  { value: 'code', labelKey: 'folderIcons.code', keywords: ['编程', '代码', 'code'], component: Code2, recommended: true },
  { value: 'game', labelKey: 'folderIcons.game', keywords: ['手柄', 'game'], component: Gamepad2, recommended: true },
  { value: 'shopping', labelKey: 'folderIcons.shopping', keywords: ['商店', 'shopping'], component: ShoppingBag, recommended: true },
  { value: 'travel', labelKey: 'folderIcons.travel', keywords: ['飞机', 'travel'], component: Plane, recommended: true },
  { value: 'design', labelKey: 'folderIcons.design', keywords: ['画板', '创意', 'design'], component: Palette, recommended: true },
  { value: 'data', labelKey: 'folderIcons.data', keywords: ['图表', '统计', 'data'], component: BarChart3, recommended: true },
  { value: 'home', labelKey: 'folderIcons.home', keywords: ['首页', 'home'], component: House, recommended: true },
  { value: 'link', labelKey: 'folderIcons.link', keywords: ['网址', 'link'], component: Link2, recommended: true },
  { value: 'bookmark', labelKey: 'folderIcons.bookmark', keywords: ['书签', 'bookmark'], component: Bookmark, recommended: true },
  { value: 'star', labelKey: 'folderIcons.star', keywords: ['推荐', 'star'], component: Star, recommended: true },
  { value: 'search', labelKey: 'folderIcons.search', keywords: ['查找', 'search'], component: Search },
  { value: 'settings', labelKey: 'folderIcons.settings', keywords: ['配置', 'settings'], component: Settings },
  { value: 'globe', labelKey: 'folderIcons.globe', keywords: ['全球', '网络', 'globe'], component: Globe2 },
  { value: 'app', labelKey: 'folderIcons.app', keywords: ['程序', 'app'], component: AppWindow },
  { value: 'tag', labelKey: 'folderIcons.tag', keywords: ['分类', 'tag'], component: Tag },
  { value: 'sparkles', labelKey: 'folderIcons.sparkles', keywords: ['亮点', 'sparkles'], component: Sparkles },
  { value: 'bot', labelKey: 'folderIcons.bot', keywords: ['机器人', '人工智能', 'ai'], component: Bot },
  { value: 'heart', labelKey: 'folderIcons.heart', keywords: ['爱心', 'heart'], component: Heart },
  { value: 'lock', labelKey: 'folderIcons.lock', keywords: ['安全', '密码', 'lock'], component: Lock },
  { value: 'pin', labelKey: 'folderIcons.pin', keywords: ['置顶', '图钉', 'pin'], component: Pin },
  { value: 'flask', labelKey: 'folderIcons.flask', keywords: ['科研', '测试', 'flask'], component: FlaskConical },
  { value: 'rocket', labelKey: 'folderIcons.rocket', keywords: ['启动', '火箭', 'rocket'], component: Rocket },
];

const optionByValue = new Map(folderIconOptions.map((option) => [option.value, option]));
const aliases: Record<string, string> = {
  code2: 'code',
  toolbox: 'tools',
  wrench: 'tools',
};

export function getFolderIconOption(value?: string | null) {
  const normalized = value?.trim().toLocaleLowerCase() || '';
  return optionByValue.get(aliases[normalized] || normalized) || null;
}
