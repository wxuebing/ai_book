/**
 * 左侧导航栏
 *
 * 依据：docs/01-信息架构.md 第 6 章、docs/04-视觉规范.md 第 6.1 节
 *
 * 铁律：
 *   - 一级（三大库）可折叠，右侧向下箭头；小说库/项目库另有墨绿加号
 *   - 二级点击展开/折叠，同级互斥；二级一律不加粗，靠缩进区分层级
 *   - 三级比二级再向内收
 *   - 工具库不分三级：每个二级就是一个功能页
 *   - 全局搜索在品牌区右侧（放大镜图标）
 *   - 设置 / 导入导出在右下角常驻工具条
 *   - 收缩 240px ↔ 64px，状态持久化
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { LibraryResponse, ToolItem } from './api';
import { navigate } from './router';
import { NavBookName } from './ui';
import { SearchPanel } from './SearchPanel';
import { ProjectContextMenu } from './ProjectContextMenu';

const COLLAPSE_KEY = 'loom:nav:collapsed';
const EXPAND_KEY = 'loom:nav:expanded';
const ROOT_OPEN_KEY = 'loom:nav:rootOpen';

export interface NavSelection {
  root: 'library' | 'ideas' | 'graph' | 'project' | 'settings' | 'tools' | 'bottom';
  secondary?: string;
  tertiary?: string;
}

interface Props {
  library: LibraryResponse | null;
  tools: ToolItem[];
  selection: NavSelection;
  onSelect: (sel: NavSelection) => void;
  activeProjectId: string | null;
  onNewProject: () => void;
  /** 右键菜单改完详情/归档后刷新 */
  onReload: () => Promise<void>;
}

/**
 * 项目库三级：五个主入口 + 关系网（关系网是具体信息，不进首页）
 *
 * 注意：三级**不在导航栏放加号**。新建入口在右侧页面里，
 * 用户明确：「不是让你在导航栏的右边添加+，是让你看向右边的那些添加项目功能」
 */
export const PROJECT_ENTRIES = [
  { id: 'outline', label: '大纲', hint: '全书骨架、分卷' },
  { id: 'ideas', label: '灵感', hint: '灵感宝库 · 与便签墙联动' },
  { id: 'chapterOutline', label: '章纲', hint: '每章单元规划' },
  { id: 'threads', label: '线索', hint: '主线 / 支线 / 短线' },
  { id: 'characters', label: '人物', hint: '人物设定与关系' },
  { id: 'settings', label: '设定', hint: '体系 / 境界 / 世界 / 势力' },
  { id: 'graph', label: '关系网', hint: '全书知识网络' },
  { id: 'manuscript', label: '正文', hint: '章节正文 · 写作 / 草稿 / 导出' },
];

export function Nav({
  library,
  tools,
  selection,
  onSelect,
  activeProjectId,
  onNewProject,
  onReload,
}: Props): React.ReactElement {
  const [ctx, setCtx] = useState<{ project: LibraryResponse['projects'][number]; x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  /** 二级展开状态：每个一级下最多一个二级展开（同级互斥） */
  const [expanded, setExpanded] = useState<Record<string, string | null>>(() => {
    try {
      const raw = localStorage.getItem(EXPAND_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string | null>) : {};
    } catch {
      return {};
    }
  });

  /** 一级折叠状态：三个库都能收起 */
  const [rootOpen, setRootOpen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(ROOT_OPEN_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      /* 忽略 */
    }
    return { library: true, project: true, tools: true };
  });

  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* 隐私模式忽略 */
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPAND_KEY, JSON.stringify(expanded));
    } catch {
      /* 忽略 */
    }
  }, [expanded]);

  useEffect(() => {
    try {
      localStorage.setItem(ROOT_OPEN_KEY, JSON.stringify(rootOpen));
    } catch {
      /* 忽略 */
    }
  }, [rootOpen]);

  /** 同级互斥：展开一个，收起其他 */
  const toggle = (root: string, id: string) => {
    setExpanded((prev) => ({
      ...prev,
      [root]: prev[root] === id ? null : id,
    }));
  };

  const toggleRoot = (root: string) => {
    setRootOpen((prev) => ({ ...prev, [root]: !prev[root] }));
  };

  const projects = library?.projects ?? [];

  const style = useMemo(
    () => ({ width: collapsed ? 'var(--nav-w-collapsed)' : 'var(--nav-w)' }),
    [collapsed],
  );

  return (
    <aside className={`nav ${collapsed ? 'is-collapsed' : ''}`} style={style} aria-label="主导航">
      {/* ═══════════ 品牌区 ═══════════
          展开态：logo + 「流云织」+ 搜索 + 收放（横向一排）
          收缩态：logo 在最顶，收放图标次之，搜索图标再次之（纵向）
          docs/04 6.1 */}
      <div className="nav-brand">
        <div className="nav-brand-main">
          <img
            className="nav-logo"
            src="/logo-128.png"
            srcSet="/logo-64.png 64w, /logo-128.png 128w, /logo-256.png 256w"
            sizes="32px"
            alt="流云织"
            width={32}
            height={32}
            draggable={false}
          />
          {!collapsed && <span className="nav-brand-name serif">流云织</span>}
        </div>

        <div className="nav-brand-actions">
          <button
            className="nav-collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展开导航' : '收起导航'}
            aria-label={collapsed ? '展开导航' : '收起导航'}
            aria-expanded={!collapsed}
          >
            <IconSidebar />
          </button>
          <button
            className="nav-search-btn"
            onClick={() => setSearchOpen(true)}
            title="全局搜索"
            aria-label="全局搜索"
          >
            <IconSearch />
          </button>
        </div>
      </div>

      <div className="nav-scroll">
        {/* ═══════════ 一级 1：小说库（docs/01 2.1）
            点进去后右侧页面顶部有窄下拉选书，导航栏里**不再列书** ═══════════ */}
        <section className="nav-root">
          <div className="nav-root-row">
            <button
              className={`nav-root-head ${selection.root === 'library' ? 'is-active' : ''}`}
              onClick={() => {
                onSelect({ root: 'library' });
                navigate('/library');
              }}
              title="小说库"
            >
              <IconLibrary />
              {!collapsed && <span className="nav-root-label">小说库</span>}
            </button>
            {!collapsed && (
              <button
                className="nav-plus"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewProject();
                }}
                title="新建小说"
                aria-label="新建小说"
              >
                <IconPlus />
              </button>
            )}
          </div>
        </section>

        {/* ═══════════ 一级 2：便签墙 ═══════════ */}
        <section className="nav-root">
          <div className="nav-root-row">
            <button
              className={`nav-root-head ${selection.root === 'ideas' ? 'is-active' : ''}`}
              onClick={() => {
                onSelect({ root: 'ideas' });
                navigate('/ideas');
              }}
              title="便签墙"
            >
              <IconIdea />
              {!collapsed && <span className="nav-root-label">便签墙</span>}
            </button>
          </div>
        </section>

        {/* ═══════════ 一级 3：关系网 ═══════════ */}
        <section className="nav-root">
          <div className="nav-root-row">
            <button
              className={`nav-root-head ${selection.root === 'graph' ? 'is-active' : ''}`}
              onClick={() => {
                onSelect({ root: 'graph' });
                if (activeProjectId) navigate(`/project/${activeProjectId}/graph`);
              }}
              title="关系网"
            >
              <IconGraph />
              {!collapsed && <span className="nav-root-label">关系网</span>}
            </button>
          </div>
        </section>

        {/* ═══════════ 空白间隔（docs/01 2.1）═══════════ */}
        <div className="nav-gap" aria-hidden="true" />

        {/* ═══════════ 一级：工作区（原「项目库」，docs/01 第 4 章）═══════════ */}
        <section className="nav-root">
          <div className="nav-root-row">
            <button
              className={`nav-root-head ${selection.root === 'project' ? 'is-active' : ''}`}
              onClick={() => {
                toggleRoot('project');
                onSelect({ root: 'project' });
                if (activeProjectId) navigate(`/project/${activeProjectId}`);
              }}
              aria-expanded={rootOpen.project !== false}
            >
              <IconProject />
              {!collapsed && <span className="nav-root-label">工作区</span>}
              {!collapsed && (
                <span className={`nav-caret ${rootOpen.project !== false ? 'is-open' : ''}`} aria-hidden="true">
                  <IconSolidCaret />
                </span>
              )}
            </button>
            {!collapsed && (
              <button
                className="nav-plus"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewProject();
                }}
                title="添加项目"
                aria-label="添加项目"
              >
                <IconPlus />
              </button>
            )}
          </div>

          {!collapsed && rootOpen.project !== false && (
            <div className="nav-children">
              {projects.length === 0 && <div className="nav-empty">先建一本小说</div>}
              {projects.map((p) => {
                const isActiveBook = p.id === activeProjectId;
                return (
                  <div key={p.id} className="nav-node">
                    <button
                      className={`nav-item level-2 ${isActiveBook ? 'is-current-book' : ''} ${selection.root === 'project' && selection.secondary === p.id ? 'is-active' : ''}`}
                      onClick={() => {
                        onSelect({ root: 'project', secondary: p.id });
                        navigate(`/project/${p.id}`);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setCtx({ project: p, x: e.clientX, y: e.clientY });
                      }}
                      title={p.name}
                    >
                      <span className="nav-item-text ellipsis">
                        <NavBookName name={p.name} />
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ═══════════ 底部常驻工具条（docs/01 2.1）
          左：设置（齿轮）  右：导入导出
          设置不在一级导航 —— 任何软件设置都在底部或角落 ═══════════ */}
      <div className="nav-bottom">
        <button
          className={`nav-bottom-btn ${selection.root === 'settings' ? 'is-active' : ''}`}
          onClick={() => {
            onSelect({ root: 'settings' });
            navigate('/settings/plain');
          }}
          title="设置"
          aria-label="设置"
        >
          <IconGear />
        </button>
        <button
          className={`nav-bottom-btn ${selection.root === 'bottom' && selection.secondary === 'io' ? 'is-active' : ''}`}
          onClick={() => {
            onSelect({ root: 'bottom', secondary: 'io' });
            navigate('/bottom/io');
          }}
          title="导入导出"
          aria-label="导入导出"
        >
          <IconImportExport />
        </button>
      </div>

      {/* 底部状态（收缩箭头已移到品牌区） */}
      {!collapsed && (
        <div className="nav-foot">
          <span className="nav-foot-dot" aria-hidden="true" />
          <span className="ellipsis">
            {projects.find((p) => p.id === activeProjectId)?.name ?? '未选择小说'}
          </span>
        </div>
      )}

      {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}

      {/* 项目右键菜单（改详情 / 归档 / 删除） */}
      {ctx && (
        <ProjectContextMenu
          project={ctx.project}
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          onReload={onReload}
        />
      )}
    </aside>
  );
}

export function routeOfEntry(id: string): string {
  switch (id) {
    case 'outline': return 'outline';
    case 'chapterOutline': return 'chapter-outline';
    case 'threads': return 'threads';
    case 'characters': return 'characters';
    case 'settings': return 'settings';
    case 'graph': return 'graph';
    default: return id;
  }
}

// BookName 已抽到 ui.tsx（导航栏与基本信息页共用，避免两处实现分叉）

// ─────────────────────────────────────────────────────────────
// 图标（内联 SVG，零图片资源）
// ─────────────────────────────────────────────────────────────

function IconSolidCaret(): React.ReactElement {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
      <path d="M2.6 4.4h6.8L6 8.4z" fill="currentColor" />
    </svg>
  );
}

function IconLineCaret(): React.ReactElement {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** 侧边栏收放图标：圆角矩形外框 + 内部靠左一道竖线 */
function IconSidebar(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" fill="none" aria-hidden="true">
      <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.8 2.6v10.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconPlus(): React.ReactElement {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
      <path d="M6 2.4v7.2M2.4 6h7.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" fill="none">
      <circle cx="7" cy="7" r="4.3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.2 10.2L13.6 13.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconLibrary(): React.ReactElement {
  return (
    <span className="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="17" height="17" fill="none">
        <path d="M2 3.2h5v10.6H2zM9 3.2h5v10.6H9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M3.6 5.6h1.8M10.6 5.6h1.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".5" />
      </svg>
    </span>
  );
}

function IconProject(): React.ReactElement {
  return (
    <span className="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="17" height="17" fill="none">
        <path d="M2 4.2h4.2l1.3 1.6H14v6.6H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M2 7.4h12" stroke="currentColor" strokeWidth="1" opacity=".45" />
      </svg>
    </span>
  );
}

/** 工具库图标：扳手+齿轮感，与「书籍/文件夹」明确区分 */
function IconTools(): React.ReactElement {
  return (
    <span className="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="17" height="17" fill="none">
        <path
          d="M10.6 2.2a3.1 3.1 0 0 0-2.9 4.2L2.4 11.7a1.4 1.4 0 0 0 2 2l5.3-5.3a3.1 3.1 0 0 0 4.2-2.9l-1.9 1.9-1.6-.5-.5-1.6 1.7-2.1z"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
        <circle cx="3.5" cy="12.5" r="0.9" fill="currentColor" />
      </svg>
    </span>
  );
}

/** 设置：齿轮（带齿，绝非小太阳） */
function IconGear(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
      <path
        d="M12 15.4a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M19.2 13.1a1.6 1.6 0 00.32 1.77l.06.06a1.94 1.94 0 11-2.75 2.75l-.06-.06a1.6 1.6 0 00-1.77-.32 1.6 1.6 0 00-.97 1.47v.16a1.94 1.94 0 11-3.88 0v-.09a1.6 1.6 0 00-1.05-1.47 1.6 1.6 0 00-1.77.32l-.06.06a1.94 1.94 0 11-2.75-2.75l.06-.06a1.6 1.6 0 00.32-1.77 1.6 1.6 0 00-1.47-.97H4a1.94 1.94 0 110-3.88h.09a1.6 1.6 0 001.47-1.05 1.6 1.6 0 00-.32-1.77l-.06-.06a1.94 1.94 0 112.75-2.75l.06.06a1.6 1.6 0 001.77.32H9.9a1.6 1.6 0 00.97-1.47V4a1.94 1.94 0 113.88 0v.09a1.6 1.6 0 00.97 1.47 1.6 1.6 0 001.77-.32l.06-.06a1.94 1.94 0 112.75 2.75l-.06.06a1.6 1.6 0 00-.32 1.77V9.9a1.6 1.6 0 001.47.97H20a1.94 1.94 0 110 3.88h-.09a1.6 1.6 0 00-1.47.97z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTransfer(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
      <path d="M2.6 5.4h9.2M9.4 3.2l2.4 2.2-2.4 2.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.4 10.6H4.2M6.6 8.4l-2.4 2.2 2.4 2.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
    </svg>
  );
}

/** 灵感墙：灯泡 */
function IconIdea(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" fill="none">
      <path
        d="M8 1.8a4.2 4.2 0 00-2.4 7.6v1.3h4.8V9.4A4.2 4.2 0 008 1.8z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M6.4 13.2h3.2M7 14.6h2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

/** 关系网：三点连线 */
function IconGraph(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" fill="none">
      <path d="M4 5.2l8 5.6M4 10.8l8-5.6" stroke="currentColor" strokeWidth="1.1" opacity=".7" />
      <circle cx="3.2" cy="4.4" r="1.7" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12.8" cy="11.6" r="1.7" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12.8" cy="4.4" r="1.7" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="3.2" cy="11.6" r="1.7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** 导入导出：左入右出两支箭头 + 底部托盘，方向清晰 */
function IconImportExport(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
      {/* 左：导入（向下进托盘） */}
      <path d="M5 2v6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M2.9 5.9L5 8l2.1-2.1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      {/* 右：导出（向上出） */}
      <path d="M11 8V2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M8.9 4.1L11 2l2.1 2.1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      {/* 底部托盘 */}
      <path d="M2.6 11.2v1.4a1 1 0 001 1h8.8a1 1 0 001-1v-1.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 回收站 / 归档：垃圾桶轮廓 */
function IconTrash(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
      <path
        d="M2.8 4.4h10.4M6 4.4V2.9h4v1.5M4.3 4.4l.7 8.9h6l.7-8.9"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
