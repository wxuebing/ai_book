/**
 * 项目概览（首页）
 *
 * docs/01 第 4.3 节：**关系网属于「具体信息」，不在首页铺开**，收进三级目录。
 * 首页只放可扫视的规模与类型卡片 —— 一屏看懂这本书有多大、由什么组成。
 */

import React, { useEffect, useState } from 'react';
import { api, ApiFailure, type ProjectOverview, type TypeGroup } from '../api';
import { navigate } from '../router';
import { Btn, Crumbs, Empty, ErrorBar, Loading, PlusMark, Stat, Tag } from '../ui';

interface Props {
  projectId: string | null;
  onReload: () => Promise<void>;
  library: { projects: Array<{ id: string; name: string }> } | null;
}

export function ProjectHome({ projectId, onReload, library }: Props): React.ReactElement {
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setOverview(null);
    setError(null);
    void api
      .get<ProjectOverview>(`/project/${projectId}`)
      .then(setOverview)
      .catch((err) => setError(err instanceof ApiFailure ? err.message : String(err)));
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="page">
        <Empty
          title="还没有激活的小说"
          hint="项目库展示的是「当前这本书里有什么」。先选一本，或新建一本。"
          action={
            <div className="empty-actions">
              <Btn variant="primary" onClick={() => navigate('/library')}>去小说库</Btn>
            </div>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorBar message={error} onRetry={() => void onReload()} />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="page">
        <Loading rows={7} />
      </div>
    );
  }

  return (
    <div className="page">
      <Crumbs items={[{ label: '项目库', to: '/project' }, { label: overview.name }]} />

      <header className="page-head">
        <div>
          <h1 className="page-title serif">{overview.name}</h1>
          <p className="page-sub">
            {overview.notes} 篇 · {overview.types} 个类型 · {overview.relations} 条关系
            {overview.untyped > 0 && ` · ${overview.untyped} 篇未归类`}
          </p>
        </div>
        <div className="page-actions">
          <Btn variant="ghost" onClick={() => navigate(`/project/${projectId}/outline`)}>大纲</Btn>
          <Btn variant="primary" onClick={() => navigate(`/project/${projectId}/settings`)}>
            设定
          </Btn>
        </div>
      </header>

      <div className="stat-row">
        <Stat label="总字数" value={overview.words} />
        <Stat label="笔记" value={overview.notes} />
        <Stat label="类型" value={overview.types} />
        <Stat label="关系" value={overview.relations} />
        <Stat label="概念" value={overview.concepts} />
        <Stat label="未归类" value={overview.untyped} />
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title serif">类型</h2>
          <span className="section-note">点进去看这一类的全部条目</span>
        </div>
        {overview.groups.length === 0 ? (
          <Empty
            title="还没有类型"
            hint="类型也是笔记 —— 新建一个类型只是写一篇笔记，不改代码。"
            action={<Btn variant="create" icon={<PlusMark />} onClick={() => navigate('/tools/types')}>新建类型</Btn>}
          />
        ) : (
          <div className="type-grid">
            {overview.groups.map((g) => (
              <TypeCard key={g.type} group={g} projectId={projectId} />
            ))}
          </div>
        )}
      </section>

      {overview.scopes.spaces.length > 0 || overview.scopes.times.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title serif">作用域坐标</h2>
            <span className="section-note">系统据此算出「此刻生效的规则集合」</span>
          </div>
          <div className="scope-box">
            {overview.scopes.spaces.length > 0 && (
              <div className="scope-line">
                <span className="scope-key">空间</span>
                {overview.scopes.spaces.map((s) => (
                  <Tag key={s}>{s}</Tag>
                ))}
              </div>
            )}
            {overview.scopes.times.length > 0 && (
              <div className="scope-line">
                <span className="scope-key">时间</span>
                {overview.scopes.times.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TypeCard({ group, projectId }: { group: TypeGroup; projectId: string }): React.ReactElement {
  return (
    <button
      className="type-card"
      onClick={() =>
        navigate(`/project/${projectId}/settings/${encodeURIComponent(group.type)}`)
      }
      style={{ ['--type-color' as string]: group.color }}
    >
      <span className="type-card-bar" aria-hidden="true" />
      <span className="type-card-body">
        <span className="type-card-name serif">{group.label}</span>
        <span className="type-card-meta">
          {group.count} 条 · {viewLabel(group.view)}
        </span>
      </span>
    </button>
  );
}

export function viewLabel(view: string): string {
  switch (view) {
    case 'list': return '列表';
    case 'ladder': return '阶梯';
    case 'tree': return '树';
    case 'graph': return '图';
    case 'timeline': return '时间轴';
    case 'swimlane': return '泳道';
    case 'table': return '表格';
    default: return view;
  }
}
