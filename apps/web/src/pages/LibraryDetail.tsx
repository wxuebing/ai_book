/**
 * 小说详情（基本信息 / 统计 / 编辑 / 删除）
 * docs/01 第 3.3 节：这 5 项对应「员工档案」的完整操作 —— 看、看数据、改、进去、开除
 */

import React, { useEffect, useState } from 'react';
import {
  api,
  ApiFailure,
  type GraphResponse,
  type LibraryResponse,
  type ProjectOverview,
  type ProjectSummary,
} from '../api';
import { navigate } from '../router';
import { BookName, Btn, Crumbs, Empty, ErrorBar, Loading } from '../ui';
import { IdeaWall } from '../IdeaWall';
import { formatDate } from '../format';

interface Props {
  library: LibraryResponse | null;
  projectId: string;
  tab: string;
  onReload: () => Promise<void>;
}

export function LibraryDetail({ library, projectId, tab, onReload }: Props): React.ReactElement {
  const project = library?.projects.find((p) => p.id === projectId);
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadOverview = React.useCallback(() => {
    void api
      .get<ProjectOverview>(`/project/${projectId}`)
      .then(setOverview)
      .catch((err) => setError(err instanceof ApiFailure ? err.message : String(err)));
  }, [projectId]);

  useEffect(() => {
    // 仪表盘首页也要统计（不只在 stats tab）
    reloadOverview();
  }, [reloadOverview]);

  if (!library) return <Loading rows={5} />;
  if (!project) {
    return (
      <div className="page">
        <Empty
          title="找不到这本书"
          hint={`id ${projectId} 不在小说库里，可能已被删除。`}
          action={<Btn onClick={() => navigate('/library')}>回到小说库</Btn>}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <Crumbs
        items={[
          { label: '小说库', to: '/library' },
          { label: project.name },
          ...(tab === 'edit' ? [{ label: '编辑' }] : []),
        ]}
        backFallback="/library"
      />

      {error && <ErrorBar message={error} />}

      {/* ── 基本信息：卡片式数据监控台（docs/01 3.3）──
          方片按重要性切分面积（"切蛋糕"），不是均分网格。
          统计详情已并入本页（不再有单独的「统计」二级页）。 */}
      {tab === 'edit' ? (
        <EditForm project={project} onReload={onReload} />
      ) : (
        <DashboardCards project={project} overview={overview} onReload={onReload} onChange={reloadOverview} />
      )}
    </div>
  );
}


/**
 * 基本信息（docs/01 第 3.3.1 节）—— 现在只在「编辑」tab 里作为完整表格出现。
 *
 * 用户原话：「表格规整、分层明显，有颜色、以及竖线划分，书名自动添加书名号，
 *   字体都要改的清晰些。并且可以改的东西，当前页面就可以改，添加图标按钮与相应功能」
 *
 * 仪表盘首页（DashboardCards）提供高频字段的行内编辑；
 * 这里是完整字段表（含只读的派生字段），供想一次看全的用户使用。
 */
function InfoTable({
  project,
  onReload,
}: {
  project: ProjectSummary;
  onReload: () => Promise<void>;
}): React.ReactElement {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startEdit = (key: string, value: string) => {
    setEditing(key);
    setDraft(value);
    setErr(null);
  };

  const cancel = () => {
    setEditing(null);
    setDraft('');
    setErr(null);
  };

  const save = async (key: string) => {
    setBusy(true);
    setErr(null);
    try {
      // 目录名单独走 dirName 字段；书名走 name（会同步重命名目录）
      const body =
        key === 'name'
          ? { name: draft.trim() }
          : key === 'description'
            ? { description: draft }
            : key === 'dirName'
              ? { dirName: draft.trim() }
              : {};
      await api.patch(`/library/${project.id}`, body);
      await onReload();
      setEditing(null);
    } catch (e) {
      setErr(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * 一行：标签 + 值（可编辑时带**常态显示**的文字按钮）
   *
   * 用户原话：「这个图标不显眼，且只有鼠标移上去才显示，改成常态显示的文字按钮」
   */
  const Row = ({
    k,
    label,
    value,
    editable,
    raw,
  }: {
    k: string;
    label: string;
    value: React.ReactNode;
    editable?: boolean;
    raw?: string;
  }): React.ReactElement => {
    const isEditing = editing === k;
    return (
      <tr className={isEditing ? 'is-editing' : ''}>
        <th className="info-label">{label}</th>
        <td className="info-value">
          {isEditing ? (
            <div className="info-edit">
              {k === 'description' ? (
                <textarea
                  className="input textarea"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  autoFocus
                />
              ) : (
                <input
                  className="input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save(k);
                    if (e.key === 'Escape') cancel();
                  }}
                />
              )}
              <div className="info-edit-actions">
                <button className="text-btn is-ok" onClick={() => void save(k)} disabled={busy}>
                  保存
                </button>
                <button className="text-btn" onClick={cancel} disabled={busy}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="info-value-row">
              <span className="info-value-text">{value}</span>
              {editable && (
                <button
                  className="text-btn info-edit-btn"
                  onClick={() => startEdit(k, raw ?? '')}
                  title={`修改${label}`}
                >
                  修改
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
    );
  };

  return (
    <section className="section">
      <h2 className="section-title serif">基本信息</h2>
      <p className="section-desc">
        书名、简介、目录名都可以直接在本页修改 —— 点「修改」，改完点「保存」。
      </p>

      {err && <ErrorBar message={err} />}

      <div className="info-table-wrap">
        <table className="info-table">
          <thead>
            <tr>
              <th className="info-th-label">字段</th>
              <th className="info-th-value">内容</th>
            </tr>
          </thead>
          <tbody>
            <Row
              k="name"
              label="书名"
              editable
              raw={project.name}
              value={<BookName name={project.name} />}
            />
            <Row
              k="description"
              label="简介"
              editable
              raw={project.description}
              value={project.description || <span className="text-mute">未填写</span>}
            />
            <Row
              k="dirName"
              label="目录名"
              editable
              raw={project.dirName}
              value={<code>{project.dirName}</code>}
            />
            <Row
              k="packs"
              label="素材包"
              value={project.packs.length ? project.packs.join('、') : <span className="text-mute">无</span>}
            />
            <Row k="words" label="字数" value={`${project.words.toLocaleString('zh-CN')} 字`} />
            <Row k="chapters" label="章节" value={`${project.chapters} 章`} />
            <Row k="notes" label="笔记" value={`${project.notes} 篇`} />
            <Row k="created" label="创建" value={formatDate(project.createdAt)} />
            <Row k="updated" label="最后编辑" value={formatDate(project.updated)} />
            <Row k="path" label="路径" value={<code className="path-code">{project.path}</code>} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// 卡片式数据监控台（docs/01 第 3.3 节）
//
// 用户原话：「这就是真正的照搬了一个数据监管控制台的页面设计知道吗
//   这就是卡片的一个页面的卡片形式的跟那种切蛋糕似的划分
//   是你一个页面占多少我就把你这个四边形给设计多大」
//
// 方片按重要性分配面积，不等大：
//   [封面+基本信息 ~65%] [编辑 ~35%]
//   [统计 全宽一排]
// ─────────────────────────────────────────────────────────────

function DashboardCards({
  project,
  overview,
  onReload,
  onChange,
}: {
  project: ProjectSummary;
  overview: ProjectOverview | null;
  onReload: () => Promise<void>;
  onChange?: () => void;
}): React.ReactElement {
  const [uploading, setUploading] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  // 关系网（右侧窄方片：文字描述，截取连接最多的一部分）
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);

  // 就地编辑：书名 / 简介 / 目录名
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const [draftDesc, setDraftDesc] = useState(project.description);
  const [draftDir, setDraftDir] = useState(project.dirName);
  const [saving, setSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  const saveEdit = async () => {
    setSaving(true);
    setEditErr(null);
    try {
      await api.patch(`/library/${project.id}`, {
        name: draftName.trim(),
        description: draftDesc,
        dirName: draftDir.trim(),
      });
      await onReload();
      setEditing(false);
    } catch (e) {
      setEditErr(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const fileRef = React.useRef<HTMLInputElement | null>(null);

  // 检查是否已有封面
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/project/${project.id}/cover`, { method: 'HEAD' })
      .then((r) => {
        if (!cancelled && r.ok) setCoverUrl(`/api/project/${project.id}/cover?v=${Date.now()}`);
      })
      .catch(() => {
        /* 没有封面就用占位图标 */
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // 拉取关系图数据（用于右侧文字关系网面板）
  useEffect(() => {
    let cancelled = false;
    setGraphLoading(true);
    void api
      .get<GraphResponse>(`/project/${project.id}/graph`)
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch(() => {
        /* 关系网拉不到就不显示，不阻塞基本信息 */
      })
      .finally(() => {
        if (!cancelled) setGraphLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      // 分块转 base64：整段 spread 在几 MB 的图片上会爆调用栈
      const bytes = new Uint8Array(buf);
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(bin);
      await api.post(`/project/${project.id}/cover`, {
        data: b64,
        mime: file.type || 'image/jpeg',
      });
      setCoverUrl(`/api/project/${project.id}/cover?v=${Date.now()}`);
      await onReload();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="dash">
      {/* 上排：基本信息（宽） + 编辑（窄） */}
      <div className="dash-top">
        {/* ── 封面 + 基本信息：宽方片 ── */}
        <section className="dash-card dash-main">
          <div className="dash-main-body">
            {/* 封面：左上角，3:4，空态显示占位图标 */}
            <button
              className={`dash-cover ${coverUrl ? 'has-image' : ''}`}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title={coverUrl ? '点击更换封面' : '点击上传封面'}
            >
              {coverUrl ? (
                <img src={coverUrl} alt={`《${project.name}》封面`} />
              ) : (
                <span className="dash-cover-placeholder">
                  <IconBook />
                </span>
              )}
              <span className="dash-cover-hint">
                {uploading ? '上传中…' : coverUrl ? '更换' : '上传封面'}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />

            <div className="dash-main-info">
              {editing ? (
                <div className="dash-edit">
                  <label className="dash-field">
                    <span>书名</span>
                    <input
                      className="input"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      autoFocus
                    />
                  </label>
                  <label className="dash-field">
                    <span>简介</span>
                    <textarea
                      className="input textarea"
                      value={draftDesc}
                      onChange={(e) => setDraftDesc(e.target.value)}
                      rows={2}
                    />
                  </label>
                  <label className="dash-field">
                    <span>目录名</span>
                    <input
                      className="input"
                      value={draftDir}
                      onChange={(e) => setDraftDir(e.target.value)}
                    />
                  </label>
                  {editErr && <ErrorBar message={editErr} />}
                  <div className="dash-edit-actions">
                    <Btn variant="quiet" onClick={() => setEditing(false)} disabled={saving}>
                      取消
                    </Btn>
                    <Btn variant="primary" onClick={() => void saveEdit()} disabled={saving}>
                      {saving ? '保存中…' : '保存'}
                    </Btn>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="dash-title serif">
                    <BookName name={project.name} />
                  </h1>
                  <p className="dash-desc">{project.description || '还没有简介'}</p>
                  <div className="dash-meta">
                    <span>{project.words.toLocaleString('zh-CN')} 字</span>
                    <span className="dash-dot" aria-hidden="true">·</span>
                    <span>{project.notes} 篇</span>
                    <span className="dash-dot" aria-hidden="true">·</span>
                    <span>{overview?.types ?? 0} 类型</span>
                    <span className="dash-dot" aria-hidden="true">·</span>
                    <span>{overview?.relations ?? 0} 关系</span>
                    <span className="dash-dot" aria-hidden="true">·</span>
                    <span className="dash-dirname">目录 {project.dirName}</span>
                  </div>
                  <div className="dash-main-actions">
                    {/* 打开项目：按钮（docs/01 3.3.2） */}
                    <Btn variant="primary" onClick={() => navigate(`/project/${project.id}`)}>
                      打开项目
                    </Btn>
                    <button className="text-btn" onClick={() => setEditing(true)}>
                      修改信息
                    </button>
                    <span className="dash-updated">{formatDate(project.updated)} 更新</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── 关系网：窄方片（文字描述，不是力导向球体图）──
            用户要求：右侧编辑卡片换成关系网，从全量关系里截取连接最多的一部分，
            用文字列出「A →（关系）→ B」，而不是球体与球体之间的图形 */}
        <section className="dash-card dash-side dash-rel">
          <div className="dash-rel-head">
            <h2 className="dash-rel-title serif">关系网</h2>
            {graph && (
              <span className="dash-rel-count">
                {graph.nodes.length} 节点 · {graph.edges.length} 关系
              </span>
            )}
          </div>
          <RelationList graph={graph} loading={graphLoading} />
          {graph && graph.edges.length > 0 && (
            <button
              className="text-btn dash-rel-more"
              onClick={() => navigate(`/project/${project.id}/graph`)}
            >
              查看完整关系网
            </button>
          )}
        </section>
      </div>

      {/* 统计长条方片 */}
      <section className="dash-card dash-stats">
        <div className="dash-stats-head">
          <h2 className="dash-stats-title serif">统计</h2>
        </div>
        <div className="dash-stat-row">
          <DashStat label="总字数" value={(overview?.words ?? project.words).toLocaleString('zh-CN')} />
          <DashStat label="笔记" value={overview?.notes ?? project.notes} />
          <DashStat label="已归类" value={overview?.typed ?? 0} />
          <DashStat label="未归类" value={overview?.untyped ?? 0} />
          <DashStat label="类型" value={overview?.types ?? 0} />
          <DashStat label="关系" value={overview?.relations ?? 0} />
        </div>
      </section>

      {/* ── 统计详情：直接展开在本页，顺延在统计下方（不再有二级「查看详情」页）── */}
      {overview && (
        <div className="dash-stats-detail">
          {/* 左：类型分布 */}
          <section className="dash-card dash-dist">
            <div className="dash-stats-head">
              <h2 className="dash-stats-title serif">类型分布</h2>
              <span className="dash-rel-count">{overview.groups.length} 个类型</span>
            </div>
            <div className="dist dist-tight">
              {overview.groups.map((g) => {
                const max = Math.max(...overview.groups.map((x) => x.count), 1);
                return (
                  <div key={g.type} className="dist-row">
                    <span className="dist-label ellipsis" title={g.label}>{g.label}</span>
                    <div className="dist-track">
                      <div
                        className="dist-fill"
                        style={{ width: `${(g.count / max) * 100}%`, background: g.color }}
                      />
                    </div>
                    <span className="dist-pill">{g.count}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 右：作用域坐标（并排） */}
          <section className="dash-card dash-scope">
            <div className="dash-stats-head">
              <h2 className="dash-stats-title serif">作用域坐标</h2>
            </div>
            <div className="scope-inline">
              <div className="scope-inline-group">
                <span className="scope-inline-label">空间</span>
                <div className="scope-inline-tags">
                  {overview.scopes.spaces.length > 0 ? (
                    overview.scopes.spaces.map((s) => (
                      <span key={s} className="tag">{s}</span>
                    ))
                  ) : (
                    <span className="text-mute">未声明</span>
                  )}
                </div>
              </div>
              <div className="scope-inline-group">
                <span className="scope-inline-label">时间</span>
                <div className="scope-inline-tags">
                  {overview.scopes.times.length > 0 ? (
                    overview.scopes.times.map((t) => (
                      <span key={t} className="tag">{t}</span>
                    ))
                  ) : (
                    <span className="text-mute">未声明</span>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* 便签墙：全宽 */}
      <IdeaWall projectId={project.id} limit={12} minWidth={150} onChange={onChange} />
    </div>
  );
}

function DashStat({ label, value }: { label: string; value: number | string }): React.ReactElement {
  return (
    <div className="dash-stat">
      <span className="dash-stat-value">{value}</span>
      <span className="dash-stat-label">{label}</span>
    </div>
  );
}

/** 关系类型 → 中文（与 core/types.ts 的 RelationKind 一一对应） */
const REL_KIND_LABEL: Record<string, string> = {
  parallel: '并行',
  sequential: '串行',
  replace: '替换',
  oppose: '对立',
  support: '支撑',
  depend: '依赖',
  cognate: '同源',
  erode: '侵蚀',
  contain: '包含',
  point: '指向',
};

/**
 * 关系网文字面板。
 *
 * 用户要求：不要力导向球体图；从全量关系里「截取连接最多的一部分」，
 * 用文字列出「A →（关系）→ B」。
 * 取法：按每条边两端节点的连接度之和排序，取前 N 条最有分量的关系。
 */
function RelationList({
  graph,
  loading,
  limit = 12,
}: {
  graph: GraphResponse | null;
  loading: boolean;
  limit?: number;
}): React.ReactElement {
  if (loading) {
    return <div className="dash-rel-empty text-mute">关系加载中…</div>;
  }
  if (!graph || graph.edges.length === 0) {
    return <div className="dash-rel-empty text-mute">还没有关系</div>;
  }

  // 节点 id → 显示名
  const labelOf = new Map(graph.nodes.map((n) => [n.id, n.label]));
  // 每个节点的连接度
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  // 按两端度数之和降序，取前 limit 条
  const top = [...graph.edges]
    .map((e) => ({
      e,
      weight: (degree.get(e.source) ?? 0) + (degree.get(e.target) ?? 0),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((x) => x.e);

  return (
    <ul className="dash-rel-list">
      {top.map((e, i) => {
        const kindLabel = REL_KIND_LABEL[e.kind] ?? e.label ?? e.kind;
        return (
          <li key={`${e.source}-${e.target}-${e.kind}-${i}`} className="dash-rel-row">
            <span className="dash-rel-node" title={e.source}>
              {labelOf.get(e.source) ?? e.source}
            </span>
            <span className="dash-rel-arrow" aria-label={`关系：${kindLabel}`}>
              <span className="dash-rel-kind">{kindLabel}</span>
              <span className="dash-rel-arrow-glyph" aria-hidden="true">→</span>
            </span>
            <span className="dash-rel-node" title={e.target}>
              {labelOf.get(e.target) ?? e.target}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 封面空态占位图标：书形轮廓 */
function IconBook(): React.ReactElement {
  return (
    <svg viewBox="0 0 40 52" width="40" height="52" fill="none" aria-hidden="true">
      <path
        d="M4.5 4.5h22a6 6 0 016 6v37h-22a6 6 0 01-6-6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 4.5v43" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 16h11M16 23h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

function IconCheck(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M3 8.4l3.2 3.2L13 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconX(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function EditForm({
  project,
  onReload,
}: {
  project: ProjectSummary;
  onReload: () => Promise<void>;
}): React.ReactElement {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch(`/library/${project.id}`, { name, description });
      await onReload();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2400);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.del(`/library/${project.id}`);
      await onReload();
      navigate('/library');
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
      setDeleting(false);
    }
  };

  return (
    <>
      <section className="section">
        <h2 className="section-title serif">编辑</h2>
        <p className="section-desc">
          改书名会同时重命名目录。已有的 <code>[[双链]]</code> 按笔记名解析，不受影响。
        </p>

        <label className="field">
          <span className="field-label">书名</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <span className="field-label">简介</span>
          <textarea
            className="input textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </label>

        {error && <ErrorBar message={error} />}

        <div className="form-foot">
          <Btn variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </Btn>
          {saved && <span className="save-ok">已保存</span>}
        </div>
      </section>

      {/* 删除并入编辑页：低频且不可逆的动作，不该和日常入口并列 */}
      <section className="section section-danger">
        <h2 className="section-title serif">危险操作</h2>
        <p className="section-desc">
          删除会把整本书移到工作区的 <code>.trash/</code> 目录 —— 不会真删，可以手工恢复。
        </p>
        {confirming ? (
          <div className="confirm-row">
            <span className="confirm-text">确定要移入回收站？</span>
            <Btn variant="quiet" onClick={() => setConfirming(false)} disabled={deleting}>取消</Btn>
            <Btn variant="danger" onClick={() => void doDelete()} disabled={deleting}>
              {deleting ? '处理中…' : '确认删除'}
            </Btn>
          </div>
        ) : (
          <Btn variant="danger" onClick={() => setConfirming(true)}>删除这本小说</Btn>
        )}
      </section>
    </>
  );
}
