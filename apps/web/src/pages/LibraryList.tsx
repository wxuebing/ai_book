/**
 * 小说库列表（docs/01 第 3 章）
 *
 * 定位：「就跟看员工，一个公司的办公体系当中看他的员工的信息」
 * 像员工名录：一眼看到有哪些书、各自什么状态，可点进去看详情、可编辑、可删除。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { api, type LibraryResponse, type ProjectSummary } from '../api';
import { navigate } from '../router';
import { Btn, Empty, Loading, PlusMark, Tag } from '../ui';
import { CreateProjectDialog } from './CreateProjectDialog';
import { formatDate } from '../format';

interface Props {
  library: LibraryResponse | null;
  onReload: () => Promise<void>;
  welcome?: boolean;
  onNewProject?: () => void;
}

type SortKey = 'updated' | 'words' | 'created';

export function LibraryList({ library, onReload, welcome, onNewProject }: Props): React.ReactElement {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [creating, setCreating] = useState(false);
  /** 窄下拉选书（docs/01 3.1）—— 弹窗很窄、可滚动 */
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  const projects = useMemo(() => {
    const list = [...(library?.projects ?? [])];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
        )
      : list;
    filtered.sort((a, b) => {
      if (sort === 'words') return b.words - a.words;
      if (sort === 'created') return a.createdAt < b.createdAt ? 1 : -1;
      return a.updated < b.updated ? 1 : -1;
    });
    return filtered;
  }, [library, query, sort]);

  const totalWords = (library?.projects ?? []).reduce((a, p) => a + p.words, 0);

  const openCreate = () => {
    if (onNewProject) onNewProject();
    else setCreating(true);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title serif">{welcome ? '流云织小说工作台' : '小说库'}</h1>
          <p className="page-sub">
            {welcome
              ? '以 Obsidian 库为底层知识底座 —— 它不是笔记软件，是一台「记住」整本书的机器。'
              : `${library?.projects.length ?? 0} 本 · 共 ${totalWords.toLocaleString('zh-CN')} 字`}
          </p>
        </div>
        <div className="page-actions">
          {/* 窄下拉选书（docs/01 3.1）—— 在右侧页面里，不在导航栏 */}
          {!welcome && (library?.projects.length ?? 0) > 0 && (
            <div className="book-picker" ref={pickerRef}>
              <button
                className="book-picker-trigger"
                onClick={() => setPickerOpen((v) => !v)}
                aria-expanded={pickerOpen}
                title="选择小说"
              >
                <span className="ellipsis">
                  《{library?.projects.find((p) => p.id === library.active)?.name ?? '选择小说'}》
                </span>
                <span className="book-picker-caret" aria-hidden="true">▾</span>
              </button>
              {pickerOpen && (
                <div className="book-picker-menu" role="menu">
                  {library?.projects.map((p) => (
                    <button
                      key={p.id}
                      className={`book-picker-item ${p.id === library.active ? 'is-active' : ''}`}
                      onClick={() => {
                        setPickerOpen(false);
                        navigate(`/library/${p.id}`);
                      }}
                      title={p.name}
                    >
                      <span className="ellipsis">《{p.name}》</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Btn variant="create" icon={<PlusMark />} onClick={openCreate}>
            新建小说
          </Btn>
        </div>
      </header>

      {library && library.projects.length > 0 && (
        <div className="toolbar">
          <input
            className="input"
            type="search"
            placeholder="按书名或简介过滤…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索小说"
          />
          <div className="toolbar-right">
            <label className="select-wrap">
              <span className="sr-only">排序</span>
              <select
                className="select"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                <option value="updated">按最后编辑</option>
                <option value="words">按字数</option>
                <option value="created">按创建时间</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {!library ? (
        <Loading rows={6} />
      ) : library.projects.length === 0 ? (
        <Empty
          title="还没有小说"
          hint="新建第一本，它会是一个标准的 Obsidian 库 —— 用 Obsidian 打开同一个文件夹，能看到完整内容与原生关系图。"
          action={
            <Btn variant="create" icon={<PlusMark />} onClick={openCreate}>
              新建第一本
            </Btn>
          }
        />
      ) : projects.length === 0 ? (
        <Empty
          title="没有匹配的书"
          hint={`没有书名或简介包含「${query}」的小说。`}
          action={<Btn onClick={() => setQuery('')}>清除过滤</Btn>}
        />
      ) : (
        <div className="card-grid">
          {projects.map((p) => (
            <BookCard key={p.id} project={p} active={p.id === library.active} onReload={onReload} />
          ))}
        </div>
      )}

      {creating && (
        <CreateProjectDialog
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            await onReload();
            navigate(`/project/${id}`);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 书籍卡片
// ─────────────────────────────────────────────────────────────

function BookCard({
  project,
  active,
  onReload,
}: {
  project: ProjectSummary;
  active: boolean;
  onReload: () => Promise<void>;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      await api.post(`/library/${project.id}/activate`);
      await onReload();
      navigate(`/project/${project.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`book-card ${active ? 'is-active' : ''}`}>
      <div className="book-card-head">
        <h2 className="book-card-title serif ellipsis" title={project.name}>
          {project.name}
        </h2>
        {active && <span className="book-card-active">当前</span>}
      </div>

      <p className="book-card-desc clamp-2">
        {project.description || <span className="text-mute">还没有简介</span>}
      </p>

      <div className="book-card-stats">
        <span>{project.words.toLocaleString('zh-CN')} 字</span>
        <span className="dot" aria-hidden="true">·</span>
        <span>{project.chapters} 章</span>
        <span className="dot" aria-hidden="true">·</span>
        <span>{project.notes} 篇</span>
      </div>

      {project.packs.length > 0 && (
        <div className="book-card-packs">
          {project.packs.map((pk) => (
            <Tag key={pk}>{pk}</Tag>
          ))}
        </div>
      )}

      <div className="book-card-foot">
        <span className="text-mute">{formatDate(project.updated)}</span>
        <div className="book-card-actions">
          <Btn size="sm" variant="ghost" onClick={() => navigate(`/library/${project.id}/info`)}>
            详情
          </Btn>
          <Btn size="sm" variant="primary" onClick={() => void open()} disabled={busy}>
            {busy ? '打开中…' : '打开'}
          </Btn>
        </div>
      </div>
    </article>
  );
}
