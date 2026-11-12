/**
 * 本地偏好（localStorage），供设置页与各页面共享。
 *
 * 只有真正被消费的选项才留在这里 —— 不做「看起来能配、实际无效」的开关。
 */

export interface Prefs {
  /** 新建笔记后自动打开 */
  autoOpen: boolean;
  /** 停止输入后自动保存 */
  autoSave: boolean;
  /** 正文/阅读区最大宽度（px） */
  editorWidth: number;
}

export const DEFAULT_PREFS: Prefs = {
  autoOpen: true,
  autoSave: true,
  editorWidth: 760,
};

const KEY = 'loom:prefs';

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      autoOpen: typeof parsed.autoOpen === 'boolean' ? parsed.autoOpen : DEFAULT_PREFS.autoOpen,
      autoSave: typeof parsed.autoSave === 'boolean' ? parsed.autoSave : DEFAULT_PREFS.autoSave,
      editorWidth:
        typeof parsed.editorWidth === 'number' && Number.isFinite(parsed.editorWidth)
          ? Math.min(Math.max(parsed.editorWidth, 560), 1100)
          : DEFAULT_PREFS.editorWidth,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* 隐私模式下 localStorage 可能不可写，忽略 */
  }
}
