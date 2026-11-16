/**
 * 关系网（一级导航）：全局页，右上角切换小说。
 * 比具体小说里的关系图更偏数据：图 + 关系明细 + 节点中心度。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiFailure, type GraphResponse, type LibraryResponse } from '../api';
import { BookSwitch } from '../BookSwitch';
import { Graph } from '../Graph';
import { Empty, ErrorBar, Loading } from '../ui';
import { navigate } from '../router';

const KIND_LABEL: Record<string, string> = {
  contain: '包含',
  point: '引用',
  parallel: '并列',
  sequential: '先后',
  replace: '替代',
  oppose: '对立',
  support: '支持',
  depend: '依赖',
  cognate: '同源',
  erode: '侵蚀',
};

export function GraphPage({
  library,
  activeProjectId,
}: {
  library: LibraryResponse | null;
  activeProjectId: string | null;
}): React.ReactElement {
  const projects = library?.projects ?? [];
  const [pid, setPid] = useState<string | null>(activeProjectId ?? projects[0]?.id ?? null);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pid && projects.length > 0) setPid(activeProjectId ?? projects[0]!.id);
  }, [pid, projects, activeProjectId]);

  useEffect(() => {
    if (!pid) return;
    let cancelled = false;
    setGraph(null);
    setError(null);
    void api
      .get<GraphResponse>(`/project/${pid}/graph`)
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiFailure ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [pid]);

  const nodeById = useMemo(
    () => new Map((graph?.nodes ?? []).map((n) => [n.id, n])),
    [graph],
  );

  const degrees = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of graph?.nodes ?? []) m.set(n.id, 0);
    for (const e of graph?.edges ?? []) {
      m.set(e.source, (m.get(e.source) ?? 0) + 1);
      m.set(e.target, (m.get(e.target) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([id, degree]) => ({ id, degree, node: nodeById.get(id) }))
      .sort((a, b) => b.degree - a.degree);
  }, [graph, nodeById]);

  const edges = useMemo(() => {
    // 同一条关系可能同时来自正文双链和 frontmatter，明细里去重
    const map = new Map<string, GraphResponse['edges'][number]>();
    for (const e of graph?.edges ?? []) {
      const key = `${e.source}\u0000${e.target}\u0000${e.kind}`;
      if (!map.has(key)) map.set(key, e);
    }
    return [...map.values()].sort((a, b) => {
      const sa = nodeById.get(a.source)?.label ?? a.source;
      const sb = nodeById.get(b.source)?.label ?? b.source;
      return sa.localeCompare(sb, 'zh');
    });
  }, [graph, nodeById]);

  if (!library) return <div className="page"><Loading rows={5} /></div>;

  if (projects.length === 0 || !pid) {
    return (
      <div className="page">
        <Empty
          title="还没有小说"
          hint="关系网按小说查看；先建一本，再来看它的关系数据。"
          action={
            <button className="btn btn-primary" onClick={() => navigate('/library')}>
              去小说库
            </button>
          }
        />
      </div>
    );
  }

  const current = projects.find((p) => p.id === pid);
  const isolated = degrees.filter((d) => d.degree === 0).length;
  const kinds = new Set((graph?.edges ?? []).map((e) => e.kind)).size;

  const openNode = (path: string) => {
    navigate(`/project/note?project=${encodeURIComponent(pid)}&path=${encodeURIComponent(path)}`);
  };

  return (
    <div className="page graph-page">
      <header className="graph-page-head">
        <div>
          <h1 className="page-title serif">关系网</h1>
          <p className="page-sub">
            选一本小说，看它的关系数据：关系图、关系明细、节点中心度。
          </p>
        </div>
        <BookSwitch projects={projects} value={pid} onChange={setPid} />
      </header>

      {error && <ErrorBar message={error} />}

      {!graph ? (
        <Loading rows={6} />
      ) : graph.nodes.length === 0 ? (
        <Empty
          title={`《${current?.name ?? ''}》还没有关系`}
          hint="在正文里写 [[另一篇笔记]] 就会自动连上；也可以给条目加 relations。"
          action={
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/project/${pid}/characters`)}
            >
              从人物开始
            </button>
          }
        />
      ) : (
        <>
          <div className="graph-stat-strip">
            <div>
              <span className="graph-stat-value serif">{graph.nodes.length}</span>
              <span className="graph-stat-label">节点</span>
            </div>
            <div>
              <span className="graph-stat-value serif">{edges.length}</span>
              <span className="graph-stat-label">关系</span>
            </div>
            <div>
              <span className="graph-stat-value serif">{kinds}</span>
              <span className="graph-stat-label">关系类型</span>
            </div>
            <div>
              <span className="graph-stat-value serif">{isolated}</span>
              <span className="graph-stat-label">孤立节点</span>
            </div>
          </div>

          <div className="graph-main">
            <section className="graph-canvas-block">
              <Graph
                key={pid}
                data={graph}
                height={640}
                onOpen={openNode}
              />
            </section>

            <aside className="graph-aside">
              <section className="graph-aside-block">
                <div className="graph-aside-head">
                  <h2 className="serif">关系明细</h2>
                  <span>{edges.length} 条 · 含正文双链</span>
                </div>
                {edges.length === 0 ? (
                  <p className="graph-aside-empty">还没有关系。</p>
                ) : (
                  <ul className="graph-relations">
                    {edges.map((e, i) => {
                      const s = nodeById.get(e.source);
                      const t = nodeById.get(e.target);
                      return (
                        <li key={`${e.source}-${e.target}-${e.kind}-${i}`}>
                          <button className="graph-rel-node" onClick={() => openNode(e.source)}>
                            {s?.label ?? e.source.split('/').pop()}
                          </button>
                          <span className="graph-rel-kind" title={e.label}>
                            {KIND_LABEL[e.kind] ?? e.label ?? e.kind}
                          </span>
                          <button className="graph-rel-node" onClick={() => openNode(e.target)}>
                            {t?.label ?? e.target.split('/').pop()}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="graph-aside-block">
                <div className="graph-aside-head">
                  <h2 className="serif">中心节点</h2>
                  <span>按连接数</span>
                </div>
                <ol className="graph-degree-list">
                  {degrees.slice(0, 12).map((d, i) => (
                    <li key={d.id}>
                      <span className="graph-degree-no">{String(i + 1).padStart(2, '0')}</span>
                      <button className="graph-degree-name" onClick={() => openNode(d.id)}>
                        {d.node?.label ?? d.id}
                      </button>
                      <span className="graph-degree-type">{d.node?.type ?? '未归类'}</span>
                      <span className="graph-degree-count">{d.degree}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
