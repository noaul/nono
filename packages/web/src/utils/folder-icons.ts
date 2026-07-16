import type { Component } from 'vue';
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
  label: string;
  keywords: string[];
  component: Component;
  recommended?: boolean;
}

export const folderIconOptions: FolderIconOption[] = [
  { value: 'folder', label: '文件夹', keywords: ['目录', 'folder'], component: Folder, recommended: true },
  { value: 'folders', label: '多文件夹', keywords: ['目录', 'folders'], component: Folders, recommended: true },
  { value: 'category', label: '分类', keywords: ['网格', 'category'], component: LayoutGrid, recommended: true },
  { value: 'learning', label: '学习', keywords: ['书籍', '阅读', 'learning'], component: BookOpen, recommended: true },
  { value: 'work', label: '工作', keywords: ['办公', 'work'], component: Briefcase, recommended: true },
  { value: 'tools', label: '工具', keywords: ['扳手', 'toolbox', 'tools'], component: Wrench, recommended: true },
  { value: 'code', label: '开发', keywords: ['编程', '代码', 'code'], component: Code2, recommended: true },
  { value: 'game', label: '游戏', keywords: ['手柄', 'game'], component: Gamepad2, recommended: true },
  { value: 'shopping', label: '购物', keywords: ['商店', 'shopping'], component: ShoppingBag, recommended: true },
  { value: 'travel', label: '旅行', keywords: ['飞机', 'travel'], component: Plane, recommended: true },
  { value: 'design', label: '设计', keywords: ['画板', '创意', 'design'], component: Palette, recommended: true },
  { value: 'data', label: '数据', keywords: ['图表', '统计', 'data'], component: BarChart3, recommended: true },
  { value: 'home', label: '主页', keywords: ['首页', 'home'], component: House, recommended: true },
  { value: 'link', label: '链接', keywords: ['网址', 'link'], component: Link2, recommended: true },
  { value: 'bookmark', label: '收藏', keywords: ['书签', 'bookmark'], component: Bookmark, recommended: true },
  { value: 'star', label: '星标', keywords: ['推荐', 'star'], component: Star, recommended: true },
  { value: 'search', label: '搜索', keywords: ['查找', 'search'], component: Search },
  { value: 'settings', label: '设置', keywords: ['配置', 'settings'], component: Settings },
  { value: 'globe', label: '网站', keywords: ['全球', '网络', 'globe'], component: Globe2 },
  { value: 'app', label: '应用', keywords: ['程序', 'app'], component: AppWindow },
  { value: 'tag', label: '标签', keywords: ['分类', 'tag'], component: Tag },
  { value: 'sparkles', label: '精选', keywords: ['亮点', 'sparkles'], component: Sparkles },
  { value: 'bot', label: 'AI', keywords: ['机器人', '人工智能', 'ai'], component: Bot },
  { value: 'heart', label: '喜欢', keywords: ['爱心', 'heart'], component: Heart },
  { value: 'lock', label: '私密', keywords: ['安全', '密码', 'lock'], component: Lock },
  { value: 'pin', label: '固定', keywords: ['置顶', '图钉', 'pin'], component: Pin },
  { value: 'flask', label: '实验', keywords: ['科研', '测试', 'flask'], component: FlaskConical },
  { value: 'rocket', label: '项目', keywords: ['启动', '火箭', 'rocket'], component: Rocket },
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
