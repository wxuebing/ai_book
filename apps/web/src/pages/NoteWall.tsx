/**
 * 便签墙（导航栏一级入口「便签墙」的独立页面）
 *
 * 用户需求：
 *   「导航栏当中的便签墙……为什么没有筛选小说的功能？是不是应该有个下拉框弹出小说选择，
 *    我写了十几本小说为什么不能选其中一本？」
 *   「便签墙可以添加图片元素、各种元素，不只便利签」
 *   「两个便签墙都叫便签墙」
 *
 * 顶部 = 小说下拉选择框（默认当前书，可切任意一本）；下方 = 该书便签墙。
 */

import React, { useEffect, useState } from 'react';
import { api, type LibraryResponse, type ProjectSummary } from '../api';
import { Crumbs, Loading } from '../ui';
import { IdeaWall } from '../IdeaWall';

interface Props {
  library: LibraryResponse | null;
  /** 默认选中的项目（来自路由 activeProjectId） */
  defaultProjectId: string | null;
  onReload: () => Promise<void>;
}

export function NoteWall({ library, defaultProjectId, onReload }: Props): React.ReactElement {
  const projects: ProjectSummary[] = library?.projects ?? [];
  const [pid, setPid] = useState<string | null>(
    defaultProjectId ?? library?.active ?? projects[0]?.id ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  // library 异步到货后，若还没选项目则补上默认
  useEffect(() => {
    if (!pid && projects.length > 0) {
      setPid(defaultProjectId ?? library?.active ?? projects[0]!.id);
    }
  }, [pid, projects, defaultProjectId, library?.active]);

  if (!library) return <div className="page"><Loading rows={5} /></div>;

  const current = projects.find((p) => p.id === pid) ?? projects[0] ?? null;

  if (projects.length === 0) {
    return (
      <div className="page">
        <Crumbs items={[{ label: '便签墙' }]} back={false} />
        <header className="page-head">
          <div>
            <h1 className="page-title serif">便签墙</h1>
            <p className="page-sub">还没有小说。先在小说库新建一本。</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="page">
      <Crumbs items={[{ label: '便签墙' }]} back={false} />

      <header className="page-head">
        <div>
          <h1 className="page-title serif">便签墙</h1>
          <p className="page-sub">
            记录每一本小说迸发出的零碎想法。文字便签、图片灵感都可以钉在这里。
          </p>
        </div>

        {/* 小说下拉选择框 */}
        <div className="book-switch">
          <button
            className="book-switch-trigger"
            onClick={() => setPickerOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
          >
            <span className="ellipsis">《{current?.name ?? '选择小说'}》</span>
            <span className="book-switch-caret" aria-hidden="true">▾</span>
          </button>
          {pickerOpen && (
            <>
              <div className="book-switch-backdrop" onClick={() => setPickerOpen(false)} />
              <ul className="book-switch-menu" role="listbox">
                {projects.map((p) => (
                  <li key={p.id}>
                    <button
                      className={`book-switch-item ${p.id === pid ? 'is-active' : ''}`}
                      role="option"
                      aria-selected={p.id === pid}
                      onClick={() => {
                        setPid(p.id);
                        setPickerOpen(false);
                      }}
                    >
                      <span className="ellipsis">《{p.name}》</span>
                      <span className="book-switch-meta">{p.notes} 篇</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </header>

      {pid && (
        <IdeaWall
          key={pid}
          projectId={pid}
          showHead={false}
          minWidth={160}
          onChange={onReload}
        />
      )}
    </div>
  );
}
