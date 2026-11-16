/**
 * 外观主题系统
 *
 * 设计思路：整套配色都走 tokens.css 里的 CSS 变量（--liuyun-* / --qingtan-* /
 * --ink-* / --scene-*），所以换主题 = 在 <html data-theme="..."> 上换一组变量，
 * 全站自动换肤，组件代码无需感知。
 *
 * 六套古风主题，各配一套山川溪竹背景（Backdrop.tsx 用 --scene-* 上色）：
 *   云岫墨韵 · 青绿山水 · 烟雨江南 · 朱砂笺 · 月白霜天 · 竹影清风
 */

export type ThemeId =
  | 'moyun'
  | 'qinglv'
  | 'yanyu'
  | 'zhusha'
  | 'yuebai'
  | 'zhuying';

export interface ThemeMeta {
  id: ThemeId;
  /** 中文主题名 */
  name: string;
  /** 一句气质描述 */
  tagline: string;
  /** 预览用：纸色 */
  paper: string;
  /** 预览用：墨色 */
  ink: string;
  /** 预览用：主色（朱砂/石绿/靛蓝…） */
  accent: string;
  /** 预览用：远山色 */
  far: string;
  /**
   * 玻璃明暗基准（2026-11-16）
   *
   * 亮色主题用偏白的灰，暗色主题必须用偏深的灰，否则文字会失读。
   * 只影响结构层（卡片/表格/弹窗），不影响氛围层。
   */
  glass?: 'light' | 'dark';
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'moyun',
    name: '云岫墨韵',
    tagline: '流云白 · 清潭蓝，宣纸托墨的素净',
    paper: '#f8f6f2',
    ink: '#1a2e34',
    accent: '#4e7f8c',
    far: '#b9cdd4',
    glass: 'light',
  },
  {
    id: 'qinglv',
    name: '青绿山水',
    tagline: '石绿青碧，千里江山一卷',
    paper: '#f6f7ee',
    ink: '#1c3327',
    accent: '#4f8a63',
    far: '#b8cdb0',
    glass: 'light',
  },
  {
    id: 'yanyu',
    name: '烟雨江南',
    tagline: '青灰如雨，小桥流水人家',
    paper: '#eef2f3',
    ink: '#24343a',
    accent: '#5f8189',
    far: '#c2d2d6',
    glass: 'light',
  },
  {
    id: 'zhusha',
    name: '朱砂笺',
    tagline: '暖笺朱印，一点绛色点秋山',
    paper: '#f9efe1',
    ink: '#3a2622',
    accent: '#b6503a',
    far: '#e0c3a8',
    glass: 'light',
  },
  {
    id: 'yuebai',
    name: '月白霜天',
    tagline: '月白如霜，雪山清冷一痕',
    paper: '#eef3f7',
    ink: '#1f2c38',
    accent: '#587f9f',
    far: '#c3d3e2',
    glass: 'light',
  },
  {
    id: 'zhuying',
    name: '竹影清风',
    tagline: '修竹疏影，清风过处叶低垂',
    paper: '#f1f6ea',
    ink: '#22301f',
    accent: '#5f8a53',
    far: '#c6d8b6',
    glass: 'light',
  },
];

const KEY = 'loom:theme';
const DEFAULT: ThemeId = 'moyun';

export function loadTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.some((t) => t.id === v) ? (v as ThemeId) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function saveTheme(id: ThemeId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* 隐私模式下可能不可写，忽略 */
  }
}

export function applyTheme(id: ThemeId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = id;
    // 结构层玻璃的明暗基准：亮色主题用偏白灰，暗色用偏深灰
    const meta = THEMES.find((t) => t.id === id);
    document.documentElement.dataset.glass = meta?.glass ?? 'light';
  }
}

/** 读取当前生效主题（组件外读取用） */
export function currentTheme(): ThemeId {
  if (typeof document === 'undefined') return DEFAULT;
  const v = document.documentElement.dataset.theme;
  return THEMES.some((t) => t.id === v) ? (v as ThemeId) : DEFAULT;
}

/** 启动时调用一次：把已保存的主题落到 <html> 上 */
export function initTheme(): ThemeId {
  const id = loadTheme();
  applyTheme(id);
  return id;
}
