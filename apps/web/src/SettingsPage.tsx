/**
 * 设置页（docs/01 第 2.2 节）
 *
 * 用户原话：「二级导航栏和这个一级导航栏也是一样的都是左右结构不是上下结构
 *   都是在左边从第一排往下一直顺着沿知道吗」
 * 「在右边再画一个长方形然后从上往下顺延」
 *
 * 三栏：一级导航（Nav 自己） | 二级导航栏（这个文件） | 内容区
 *
 * 二级导航 10 项：普通编辑 / 信息关系网 / MCP / 一致性检查 / 统计 /
 *   类型管理 / 模板管理 / 插件 / Skills / 回收站
 *
 * 注意：统计、一致性检查、关系网**不在**主项目导航里 ——
 * 它们是加工工具，放在设置层；打开时作用于当前激活的书。
 */

import React from 'react';
import { navigate } from './router';
import { ToolPage } from './pages/ToolPage';
import { PlainSettings } from './pages/PlainSettings';
import { TrashPage } from './pages/TrashPage';
import type { LibraryResponse, ToolItem } from './api';

export interface SettingsTab {
  id: string;
  label: string;
}

/** 二级导航（docs/01 2.2；工具能力并入设置，全部可达） */
export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'plain', label: '普通编辑' },
  { id: 'links', label: '信息关系网' },
  { id: 'mcp', label: 'MCP' },
  { id: 'check', label: '一致性检查' },
  { id: 'stats', label: '统计' },
  { id: 'types', label: '类型管理' },
  { id: 'templates', label: '模板管理' },
  { id: 'plugins', label: '插件' },
  { id: 'skills', label: 'Skills' },
  { id: 'trash', label: '回收站' },
];

interface Props {
  tab: string;
  library: LibraryResponse | null;
  tools: ToolItem[];
  activeProjectId: string | null;
  onReload: () => Promise<void>;
}

export function SettingsPage({
  tab,
  library,
  tools,
  activeProjectId,
  onReload,
}: Props): React.ReactElement {
  const current = SETTINGS_TABS.find((t) => t.id === tab) ?? SETTINGS_TABS[0]!;

  return (
    <div className="settings-shell">
      {/* ── 二级导航栏：长方形，纵向顺延 ── */}
      <nav className="settings-subnav" aria-label="设置二级导航">
        <div className="settings-subnav-title">设置</div>
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            className={`settings-subnav-item ${t.id === current.id ? 'is-active' : ''}`}
            onClick={() => navigate(`/settings/${t.id}`)}
            title={t.label}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── 内容区 ── */}
      <div className="settings-content">
        {current.id === 'plain' ? (
          <PlainSettings library={library} onReload={onReload} />
        ) : current.id === 'trash' ? (
          <TrashPage onReload={onReload} />
        ) : (
          <ToolPage tool={current.id} tools={tools} activeProjectId={activeProjectId} />
        )}
      </div>
    </div>
  );
}
