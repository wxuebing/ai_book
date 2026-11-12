/**
 * 项目库分区页（docs/01 第 4.4 节）
 *
 * 五个主入口，顺序即创作顺序：
 *   ① 大纲  ② 章纲  ③ 线索  ④ 人物  ⑤ 设定
 */

import React, { useEffect, useState } from 'react';
import {
  api,
  ApiFailure,
  type EntrySummary,
  type GraphResponse,
  type GroupResponse,
  type NoteDetail,
  type ProjectOverview,
} from '../api';
import { navigate } from '../router';
import { Btn, Crumbs, Empty, ErrorBar, Loading, PlusMark, Tag } from '../ui';
import { Graph } from '../Graph';
import { loadPrefs } from '../prefs';

/** 新建后是否直接打开，遵循设置里的「新建笔记后自动打开」 */
function openAfterCreate(path: string): void {
  if (loadPrefs().autoOpen) navigate(`/project/note?path=${encodeURIComponent(path)}`);
}
import { viewLabel } from './ProjectHome';
import { EntryDialog } from './EntryDialog';

interface Props {
  projectId: string;
  section: string;
  type?: string;
  onReload: () => Promise<void>;
}

const SECTION_META: Record<string, { label: string; hint: string; types: string[] }> = {
  outline: {
    label: '大纲',
    hint: '全书骨架、分卷。先有大纲，才有章纲；先有章纲，才写正文。',
    types: ['大纲'],
  },
  ideas: {
    label: '灵感',
    hint: '灵感宝库 —— 紧接大纲，是创作的源头。这里的条目会同步出现在统计页的便签墙上。',
    types: ['灵感'],
  },
  'chapter-outline': {
    label: '章纲',
    hint: '每章一篇，声明本章推进哪条线、出现谁、埋什么、收什么。这是「自上而下」的强制管道。',
    types: ['章纲'],
  },
  threads: {
    label: '线索',
    hint: '主线贯穿全书，支线展开多章，短线是钩子与爽点。',
    types: ['线索', '伏笔'],
  },
  characters: {
    label: '人物',
    hint: '人物卡与关系。多体系等级在卡片上直接显示成进度条。',
    types: ['人物'],
  },
  settings: {
    label: '设定',
    hint: '体系 / 境界 / 世界 / 势力 / 道具… 这一栏是动态生成的：新建一个类型，这里就多一项。',
    types: [],
  },
  graph: {
    label: '关系网',
    hint: '全书知识网络。属于「具体信息」，所以放在这里而不是首页。',
    types: [],
  },
};

export function ProjectSection({ projectId, section, type, onReload }: Props): React.ReactElement {
  const meta = SECTION_META[section] ?? SECTION_META.settings!;
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOverview(null);
    void api
      .get<ProjectOverview>(`/project/${projectId}`)
      .then(setOverview)
      .catch((err) => setError(err instanceof ApiFailure ? err.message : String(err)));
  }, [projectId]);

  if (error) return <div className="page"><ErrorBar message={error} /></div>;
  if (!overview) return <div className="page"><Loading rows={5} /></div>;

  return (
    <div className="page">
      <Crumbs
        items={[
          { label: '项目库', to: `/project/${projectId}` },
          { label: overview.name },
          { label: meta.label },
        ]}
      />
      <header className="page-head">
        <div>
          <h1 className="page-title serif">{meta.label}</h1>
          <p className="page-sub">{meta.hint}</p>
        </div>
      </header>

      {section === 'graph' ? (
        <GraphSection projectId={projectId} />
      ) : section === 'settings' && type ? (
        <EntryList projectId={projectId} type={type} onReload={onReload} />
      ) : section === 'settings' ? (
        <SettingsSection projectId={projectId} groups={overview.groups} type={type} onReload={onReload} />
      ) : (
        <TypedSection
          projectId={projectId}
          types={meta.types}
          groups={overview.groups}
          sectionLabel={meta.label}
          onReload={onReload}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 关系网（从首页移入三级目录）
// ─────────────────────────────────────────────────────────────

function GraphSection({ projectId }: { projectId: string }): React.ReactElement {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<GraphResponse>(`/project/${projectId}/graph`)
      .then(setGraph)
      .catch((err) => setError(err instanceof ApiFailure ? err.message : String(err)));
  }, [projectId]);

  if (error) return <ErrorBar message={error} />;
  if (!graph) return <Loading rows={5} />;

  if (graph.nodes.length === 0) {
    return (
      <Empty
        title="还没有关系"
        hint="在正文里写 [[另一篇笔记]] 就会自动连上。"
        action={<Btn variant="primary" onClick={() => navigate(`/project/${projectId}/characters`)}>从人物开始</Btn>}
      />
    );
  }

  return (
    <>
      <div className="section-head">
        <h2 className="section-title serif">
          关系网
          <span className="section-count">
            {graph.nodes.length} 节点 · {graph.edges.length} 条边
          </span>
        </h2>
        <span className="section-note">拖拽节点可移动，滚轮缩放，点节点看详情</span>
      </div>
      <Graph
        data={graph}
        height={600}
        onOpen={(p) => navigate(`/project/note?path=${encodeURIComponent(p)}`)}
      />
    </>
  );
}

/**
 * 设定：多行多列检索（docs/01 第 4 章）
 *
 * 用户原话：「什么叫做多排多列检索...电影的上映时间地点是不是分地区的
 *   还有类别那么它的地区是不是还分中国日本欧美等等地区懂不懂什么叫做多排多列了」
 *
 * 结构：
 *   行 = 维度（地区 / 类别 / 时代…）
 *   列 = 该维度的一个取值，横向铺开成 chip
 *   下方 = 检索结果（多行多列网格）+ 新建设定
 */
function SettingsSection({
  projectId,
  groups,
  type,
  onReload,
}: {
  projectId: string;
  groups: ProjectOverview['groups'];
  type?: string;
  onReload: () => Promise<void>;
}): React.ReactElement {
  // 选中的筛选值：维度 → 取值集合
  const [picked, setPicked] = useState<Record<string, Set<string>>>({});

  const toggleValue = (dim: string, value: string) => {
    setPicked((prev) => {
      const next = { ...prev };
      const set = new Set(next[dim] ?? []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      next[dim] = set;
      return next;
    });
  };

  /** 维度行：类型作为「类别」，作用域作为「地区 / 时代」 */
  const dims: Array<{ key: string; label: string; values: string[] }> = [
    {
      key: '类别',
      label: '类别',
      values: groups.filter((g) => g.count > 0).map((g) => g.label),
    },
  ];

  // 从条目里收集作用域取值
  const [scopes, setScopes] = useState<{ spaces: string[]; times: string[] }>({
    spaces: [],
    times: [],
  });

  useEffect(() => {
    void api
      .get<ProjectOverview>(`/project/${projectId}`)
      .then((o) => setScopes({ spaces: o.scopes.spaces, times: o.scopes.times }))
      .catch(() => undefined);
  }, [projectId]);

  if (scopes.spaces.length > 0) {
    dims.push({ key: '空间', label: '空间', values: scopes.spaces });
  }
  if (scopes.times.length > 0) {
    dims.push({ key: '时间', label: '时间', values: scopes.times });
  }

  /** 是否有任何筛选生效 */
  const hasFilter = Object.values(picked).some((s) => s.size > 0);

  /** 过滤后的分组 */
  const shownGroups = hasFilter
    ? groups.filter((g) => {
        const cat = picked['类别'];
        if (cat && cat.size > 0 && !cat.has(g.label)) return false;
        return true;
      })
    : groups.filter((g) => g.count > 0);

  // ── 检索结果：拉取匹配类型下的**条目**（不是类型卡片）──
  type ResEntry = EntrySummary & { __type: string };
  const [entries, setEntries] = useState<ResEntry[] | null>(null);
  const [dlg, setDlg] = useState<{ path: string; mode: 'detail' | 'edit' } | null>(null);
  const typeKey = shownGroups.map((g) => g.type).join('|');

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    const types = shownGroups.filter((g) => g.count > 0).map((g) => g.type);
    void Promise.all(
      types.map((t) =>
        api
          .get<GroupResponse>(`/project/${projectId}/group/${encodeURIComponent(t)}`)
          .then((d) => d.notes.map((n) => ({ ...n, __type: t })))
          .catch(() => [] as ResEntry[]),
      ),
    ).then((chunks) => {
      if (cancelled) return;
      const flat = chunks.flat();
      // 排序：先按类型（保持 groups 顺序），再按标题
      const order = new Map(types.map((t, i) => [t, i]));
      flat.sort((a, b) => {
        const oa = order.get(a.__type) ?? 99;
        const ob = order.get(b.__type) ?? 99;
        if (oa !== ob) return oa - ob;
        return a.title.localeCompare(b.title, 'zh');
      });
      setEntries(flat);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, typeKey]);

  return (
    <>
      <div className="section-head">
        <h2 className="section-title serif">
          设定检索
          <span className="section-count">{shownGroups.length} 类</span>
        </h2>
        <div className="section-actions">
          {hasFilter && (
            <button className="text-btn" onClick={() => setPicked({})}>
              清除筛选
            </button>
          )}
          <Btn size="sm" variant="ghost" onClick={() => navigate('/settings/types')}>
            类型管理
          </Btn>
        </div>
      </div>

      {/* ── 多行多列检索：行=维度，列=取值 ── */}
      <div className="dim-table">
        {dims.map((d) => (
          <div key={d.key} className="dim-row">
            <div className="dim-key">{d.label}</div>
            <div className="dim-values">
              {d.values.length === 0 ? (
                <span className="text-mute">暂无</span>
              ) : (
                d.values.map((v) => (
                  <button
                    key={v}
                    className={`dim-chip ${picked[d.key]?.has(v) ? 'is-on' : ''}`}
                    onClick={() => toggleValue(d.key, v)}
                  >
                    {v}
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── 检索结果：展示匹配到的「条目」详细内容（不是类型卡片）── */}
      <section className="section">
        <div className="section-head">
          <h2 className="section-title serif">
            检索结果
            {entries && <span className="section-count">{entries.length} 条</span>}
          </h2>
          <span className="section-note">点卡片看详情 · 点笔图标改内容</span>
        </div>
        {shownGroups.length === 0 ? (
          <Empty
            title="没有匹配的设定"
            hint="换个筛选条件，或新建一个设定。"
            action={
              <Btn variant="create" icon={<PlusMark />} onClick={() => navigate('/settings/types')}>
                新建类型
              </Btn>
            }
          />
        ) : entries === null ? (
          <Loading rows={3} />
        ) : entries.length === 0 ? (
          <Empty title="这些类型下还没有条目" hint="点「新建设定」写第一条。" />
        ) : (
          <div className="entry-grid">
            {entries.map((n) => (
              <div
                key={n.path}
                className="entry-card entry-card-clickable"
                onClick={() => setDlg({ path: n.path, mode: 'detail' })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setDlg({ path: n.path, mode: 'detail' });
                }}
              >
                <span className="entry-card-bar" aria-hidden="true" />
                <button
                  className="entry-card-pen"
                  title="编辑这个设定"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDlg({ path: n.path, mode: 'edit' });
                  }}
                >
                  <PenIcon />
                </button>
                <span className="entry-card-title serif ellipsis">{n.title}</span>
                <span className="entry-card-excerpt clamp-2">{n.excerpt || '（空）'}</span>
                <span className="entry-card-foot">
                  <span>{n.words} 字</span>
                  {n.type && <Tag>{n.type}</Tag>}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 底部：新建设定 ── */}
      <section className="section">
        <div className="section-head">
          <h2 className="section-title serif">新建设定</h2>
          <span className="section-note">类型是分组的组头，建完这里就多一格</span>
        </div>
        <div className="page-actions">
          <Btn variant="create" icon={<PlusMark />} onClick={() => navigate('/settings/types')}>
            新建类型
          </Btn>
        </div>
      </section>

      {dlg && (
        <EntryDialog
          projectId={projectId}
          path={dlg.path}
          mode={dlg.mode}
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null);
            void onReload();
            // 重新拉条目
            setEntries(null);
          }}        />
      )}
    </>
  );
}

function PenIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
      <path
        d="M11.2 2.6l2.2 2.2-8.2 8.2-3 .8.8-3z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 一个类型分组卡：组头 + 条目列表 + 组头加号 */
function TypeGroupCard({
  projectId,
  group,
  onReload,
}: {
  projectId: string;
  group: ProjectOverview['groups'][number];
  onReload: () => Promise<void>;
}): React.ReactElement {
  const [entries, setEntries] = useState<EntrySummary[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<GroupResponse>(`/project/${projectId}/group/${encodeURIComponent(group.type)}`)
      .then((d) => {
        if (!cancelled) setEntries(d.notes);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, group.type]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ path: string }>(`/project/${projectId}/entry`, {
        title: `新${group.label}`,
        type: group.type === '__untyped' ? null : group.type,
        body: `# 新${group.label}\n\n`,
      });
      await onReload();
      openAfterCreate(r.path);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group-card" style={{ ['--group-color' as string]: group.color }}>
      {/* 组头：独立一行，与组内条目用分隔线隔开 */}
      <div className="group-head">
        <span className="group-bar" aria-hidden="true" />
        <span className="group-name serif ellipsis" title={group.label}>{group.label}</span>
        <span className="group-count">{group.count}</span>
        <button
          className="group-add"
          onClick={(e) => {
            e.stopPropagation();
            void create();
          }}
          disabled={busy}
          title={`在「${group.label}」下新建`}
          aria-label={`在「${group.label}」下新建`}
        >
          <PlusMark size={10} />
        </button>
      </div>

      {/* 组内条目 */}
      <div className="group-body">
        {entries === null ? (
          <div className="group-loading">加载中…</div>
        ) : entries.length === 0 ? (
          <div className="group-empty">还没有条目</div>
        ) : (
          <ul className="group-list">
            {entries.slice(0, 8).map((n) => (
              <li key={n.path}>
                <button
                  className="group-item"
                  onClick={() => navigate(`/project/note?path=${encodeURIComponent(n.path)}`)}
                  title={n.title}
                >
                  <span className="group-item-title ellipsis">{n.title}</span>
                  <span className="group-item-words">{n.words}</span>
                </button>
              </li>
            ))}
            {entries.length > 8 && (
              <li>
                <button
                  className="group-more"
                  onClick={() => navigate(`/project/${projectId}/settings/${encodeURIComponent(group.type)}`)}
                >
                  还有 {entries.length - 8} 条 →
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 固定类型分区（大纲 / 章纲 / 线索 / 人物）
// ─────────────────────────────────────────────────────────────

function TypedSection({
  projectId,
  types,
  groups,
  sectionLabel,
  onReload,
}: {
  projectId: string;
  types: string[];
  groups: ProjectOverview['groups'];
  sectionLabel: string;
  onReload: () => Promise<void>;
}): React.ReactElement {
  // 优先用第一个存在的类型；都不存在则引导去建
  const existing = types.filter((t) => groups.some((g) => g.type === t));

  if (existing.length === 0) {
    return (
      <Empty
        title={`还没有${sectionLabel}`}
        hint={`建第一篇${sectionLabel}。类型可以先不填，之后再归类 —— 内核永不阻塞创作。`}
        action={
          <Btn
            variant="create"
            icon={<PlusMark />}
            onClick={() =>
              void api
                .post<{ path: string }>(`/project/${projectId}/entry`, {
                  title: `未命名${sectionLabel}`,
                  type: types[0] ?? null,
                  body: `# 未命名${sectionLabel}\n\n`,
                })
                .then(async (r) => {
                  await onReload();
                  openAfterCreate(r.path);
                })
            }
          >
            新建第一篇{sectionLabel}
          </Btn>
        }
      />
    );
  }

  return (
    <>
      {existing.map((t) => (
        <EntryList key={t} projectId={projectId} type={t} onReload={onReload} />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 条目列表（按视图渲染）
// ─────────────────────────────────────────────────────────────

export function EntryList({
  projectId,
  type,
  onReload,
}: {
  projectId: string;
  type: string;
  onReload: () => Promise<void>;
}): React.ReactElement {
  const [data, setData] = useState<GroupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    void api
      .get<GroupResponse>(`/project/${projectId}/group/${encodeURIComponent(type)}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiFailure ? err.message : String(err)));
  }, [projectId, type]);

  if (error) return <ErrorBar message={error} />;
  if (!data) return <Loading rows={3} />;

  const create = async () => {
    const r = await api.post<{ path: string }>(`/project/${projectId}/entry`, {
      title: `新${data.label}`,
      type: data.type === '__untyped' ? null : data.type,
      body: `# 新${data.label}\n\n`,
    });
    await onReload();
    openAfterCreate(r.path);
  };

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title serif">
          {data.label}
          <span className="section-count">{data.notes.length}</span>
          <span className="section-view">{viewLabel(data.view)}视图</span>
        </h2>
        {/* 新建按钮要显眼：create 变体（更大更深带投影）+ 前置加号 */}
        <Btn variant="create" size="sm" icon={<PlusMark />} onClick={() => void create()}>
          新建{data.label}
        </Btn>
      </div>

      {data.notes.length === 0 ? (
        <Empty
          title={`还没有${data.label}`}
          hint="点右上角新建。正文里写 [[名字]] 也能直接生成条目。"
          action={
            <Btn variant="create" icon={<PlusMark />} onClick={() => void create()}>
              新建第一篇{data.label}
            </Btn>
          }
        />
      ) : data.view === 'ladder' ? (
        <LadderView notes={data.notes} />
      ) : data.view === 'tree' ? (
        <TreeView notes={data.notes} />
      ) : data.view === 'timeline' ? (
        <TimelineView notes={data.notes} />
      ) : data.view === 'table' ? (
        <TableView notes={data.notes} fields={data.fields} />
      ) : data.view === 'swimlane' ? (
        <SwimlaneView notes={data.notes} />
      ) : (
        <CardView notes={data.notes} color={data.color} />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// 视图：卡片（list）
// ─────────────────────────────────────────────────────────────

function CardView({
  notes,
  color,
}: {
  notes: EntrySummary[];
  color: string;
}): React.ReactElement {
  return (
    <div className="entry-grid">
      {notes.map((n) => (
        <button
          key={n.path}
          className="entry-card"
          onClick={() => navigate(`/project/note?path=${encodeURIComponent(n.path)}`)}
          style={{ ['--entry-color' as string]: color }}
        >
          <span className="entry-card-bar" aria-hidden="true" />
          <span className="entry-card-title serif ellipsis">{n.title}</span>
          <span className="entry-card-excerpt clamp-2">{n.excerpt || '（空）'}</span>
          <span className="entry-card-foot">
            <span>{n.words} 字</span>
            {n.type && <Tag>{n.type}</Tag>}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 视图：泳道（swimlane）—— 按卷/空间/状态分组，横向对比
// ─────────────────────────────────────────────────────────────

function SwimlaneView({ notes }: { notes: EntrySummary[] }): React.ReactElement {
  const lanes = new Map<string, EntrySummary[]>();
  for (const n of notes) {
    const fm = (n.frontmatter ?? {}) as Record<string, unknown>;
    const key =
      (typeof fm.arc === 'string' && fm.arc.trim()) ||
      (typeof fm.space === 'string' && fm.space.trim()) ||
      (typeof fm.status === 'string' && fm.status.trim()) ||
      '未分组';
    const arr = lanes.get(key);
    if (arr) arr.push(n);
    else lanes.set(key, [n]);
  }

  return (
    <div className="swimlane">
      {[...lanes.entries()].map(([lane, list]) => (
        <section className="swimlane-row" key={lane}>
          <header className="swimlane-head">
            <span className="swimlane-title serif">{lane}</span>
            <span className="swimlane-count">{list.length}</span>
          </header>
          <div className="swimlane-track">
            {list.map((n) => (
              <button
                key={n.path}
                className="swimlane-card"
                onClick={() => navigate(`/project/note?path=${encodeURIComponent(n.path)}`)}
                title={n.title}
              >
                <span className="swimlane-card-title ellipsis">{n.title}</span>
                <span className="swimlane-card-meta">{n.words} 字</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 视图：阶梯（ladder）—— 用 order 排序
// ─────────────────────────────────────────────────────────────

function LadderView({ notes }: { notes: EntrySummary[] }): React.ReactElement {
  const sorted = [...notes].sort((a, b) => {
    const oa = Number(a.frontmatter.order ?? 999);
    const ob = Number(b.frontmatter.order ?? 999);
    return oa - ob;
  });
  const maxOrder = Math.max(...sorted.map((n) => Number(n.frontmatter.order ?? 0)), 1);

  return (
    <ol className="ladder">
      {sorted.map((n, i) => {
        const order = Number(n.frontmatter.order ?? 0);
        const ratio = maxOrder > 0 ? order / maxOrder : 0;
        return (
          <li key={n.path} className="ladder-row">
            <span className="ladder-index mono">{order || i + 1}</span>
            <button
              className="ladder-body"
              onClick={() => navigate(`/project/note?path=${encodeURIComponent(n.path)}`)}
            >
              <span className="ladder-title serif">{n.title}</span>
              <span className="ladder-bar" aria-hidden="true">
                <span className="ladder-fill" style={{ width: `${Math.max(6, ratio * 100)}%` }} />
              </span>
              <span className="ladder-excerpt ellipsis">{n.excerpt}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────────────────────────────────────────────────────
// 视图：树（tree）—— 用 parent 归并
// ─────────────────────────────────────────────────────────────

function TreeView({ notes }: { notes: EntrySummary[] }): React.ReactElement {
  const byParent = new Map<string, EntrySummary[]>();
  const roots: EntrySummary[] = [];
  const titles = new Set(notes.map((n) => n.title));

  for (const n of notes) {
    const p = typeof n.frontmatter.parent === 'string' ? n.frontmatter.parent : null;
    if (p && titles.has(p)) {
      const arr = byParent.get(p);
      if (arr) arr.push(n);
      else byParent.set(p, [n]);
    } else {
      roots.push(n);
    }
  }

  const render = (n: EntrySummary, depth: number): React.ReactElement => {
    const children = byParent.get(n.title) ?? [];
    return (
      <li key={n.path} className="tree-node">
        <button
          className="tree-row"
          style={{ paddingLeft: `${depth * 18 + 10}px` }}
          onClick={() => navigate(`/project/note?path=${encodeURIComponent(n.path)}`)}
        >
          {children.length > 0 && <span className="tree-mark" aria-hidden="true">▾</span>}
          <span className="tree-title">{n.title}</span>
          <span className="tree-meta">{n.words} 字</span>
        </button>
        {children.length > 0 && (
          <ul className="tree-children">
            {children.map((c) => render(c, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return <ul className="tree">{roots.map((n) => render(n, 0))}</ul>;
}

// ─────────────────────────────────────────────────────────────
// 视图：时间轴（timeline）—— 用 date/time 排序
// ─────────────────────────────────────────────────────────────

function TimelineView({ notes }: { notes: EntrySummary[] }): React.ReactElement {
  const sorted = [...notes].sort((a, b) => {
    const da = String(a.frontmatter.date ?? a.frontmatter.time ?? '');
    const db = String(b.frontmatter.date ?? b.frontmatter.time ?? '');
    return da.localeCompare(db);
  });

  return (
    <ol className="timeline">
      {sorted.map((n) => {
        const when = String(n.frontmatter.date ?? n.frontmatter.time ?? '');
        return (
          <li key={n.path} className="timeline-row">
            <span className="timeline-when mono">{when || '—'}</span>
            <span className="timeline-dot" aria-hidden="true" />
            <button
              className="timeline-body"
              onClick={() => navigate(`/project/note?path=${encodeURIComponent(n.path)}`)}
            >
              <span className="timeline-title serif">{n.title}</span>
              <span className="timeline-excerpt clamp-2">{n.excerpt}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────────────────────────────────────────────────────
// 视图：表格（table）
// ─────────────────────────────────────────────────────────────

function TableView({
  notes,
  fields,
}: {
  notes: EntrySummary[];
  fields: GroupResponse['fields'];
}): React.ReactElement {
  // 表格列：声明字段 ∪ 实际出现的字段
  const keys = new Set<string>();
  for (const f of fields) keys.add(f.key);
  for (const n of notes) {
    for (const k of Object.keys(n.frontmatter)) {
      if (!['title', 'type', 'relations', 'scope', 'paths'].includes(k)) keys.add(k);
    }
  }
  const cols = Array.from(keys).slice(0, 8);

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>名称</th>
            {cols.map((c) => (
              <th key={c}>{fields.find((f) => f.key === c)?.label ?? c}</th>
            ))}
            <th>字数</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((n) => (
            <tr
              key={n.path}
              onClick={() => navigate(`/project/note?path=${encodeURIComponent(n.path)}`)}
            >
              <td className="data-table-name">{n.title}</td>
              {cols.map((c) => (
                <td key={c}>{renderCell(n.frontmatter[c])}</td>
              ))}
              <td className="mono">{n.words}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (Array.isArray(v)) return v.join('、');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}


void React;
void (undefined as unknown as NoteDetail);
