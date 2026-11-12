/**
 * 工具库页面（docs/01 第 5 章）
 *
 * 铁律：工具库不分三级 —— 每个二级就是一个功能页，点进去就是那一个功能的全部内容。
 * MCP 对内对外合并在同一页，用分段切换。
 */

import React, { useEffect, useState } from 'react';
import {
  api,
  ApiFailure,
  type CheckResponse,
  type GraphResponse,
  type LibraryResponse,
  type McpOutInfo,
  type SearchHit,
  type ToolItem,
} from '../api';
import { navigate } from '../router';
import { Btn, Crumbs, Empty, ErrorBar, Loading, PlusMark, Tag } from '../ui';
import { Graph } from '../Graph';
import { StatsBoard } from './StatsBoard';

interface Props {
  tools: ToolItem[];
  tool: string;
  activeProjectId: string | null;
}

export function ToolPage({ tools, tool, activeProjectId }: Props): React.ReactElement {
  const item = tools.find((x) => x.id === tool);
  const label = item?.label ?? tool;

  return (
    <div className="page">
      <Crumbs items={[{ label: '设置', to: '/settings/links' }, { label }]} />
      <header className="page-head">
        <div>
          <h1 className="page-title serif">{label}</h1>
          <p className="page-sub">{item?.hint ?? ''}</p>
        </div>
      </header>

      {tool === 'links' ? (
        <LinksTool activeProjectId={activeProjectId} />
      ) : tool === 'mcp' ? (
        <McpTool />
      ) : tool === 'check' ? (
        <CheckTool activeProjectId={activeProjectId} />
      ) : tool === 'types' ? (
        <TypesTool activeProjectId={activeProjectId} />
      ) : tool === 'stats' ? (
        <StatsBoard activeProjectId={activeProjectId} />
      ) : tool === 'skills' || tool === 'plugins' || tool === 'templates' ? (
        <Placeholder tool={tool} />
      ) : (
        <Empty
          title="没有这个工具"
          hint={`设置里没有「${tool}」。`}
          action={<Btn onClick={() => navigate('/settings/links')}>回到信息关系网</Btn>}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 知识链接（排第一）
// ─────────────────────────────────────────────────────────────

type LinksView = 'graph' | 'orphan' | 'trace';

function LinksTool({ activeProjectId }: { activeProjectId: string | null }): React.ReactElement {
  const [view, setView] = useState<LinksView>('graph');
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProjectId) return;
    void api
      .get<GraphResponse>(`/project/${activeProjectId}/graph`)
      .then(setGraph)
      .catch((err) => setError(err instanceof ApiFailure ? err.message : String(err)));
  }, [activeProjectId]);

  if (!activeProjectId) {
    return (
      <Empty
        title="先选一本小说"
        hint="知识链接作用于当前这本书。"
        action={<Btn onClick={() => navigate('/library')}>去小说库</Btn>}
      />
    );
  }
  if (error) return <ErrorBar message={error} />;
  if (!graph) return <Loading rows={5} />;

  return (
    <>
      {/* 同页切换视图，不拆成三级 */}
      <div className="segmented">
        <button className={`seg ${view === 'graph' ? 'is-on' : ''}`} onClick={() => setView('graph')}>
          关系图
        </button>
        <button className={`seg ${view === 'orphan' ? 'is-on' : ''}`} onClick={() => setView('orphan')}>
          孤立项
        </button>
        <button className={`seg ${view === 'trace' ? 'is-on' : ''}`} onClick={() => setView('trace')}>
          全链路回溯
        </button>
      </div>

      {view === 'graph' && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title serif">关系图</h2>
            <span className="section-note">
              {graph.nodes.length} 节点 · {graph.edges.length} 条边
            </span>
          </div>
          {graph.nodes.length === 0 ? (
            <Empty title="还没有笔记" hint="写第一篇，或在正文里用 [[双链]] 连接。" />
          ) : (
            <Graph
              data={graph}
              height={580}
              onOpen={(p) => navigate(`/project/note?path=${encodeURIComponent(p)}`)}
            />
          )}
        </section>
      )}

      {view === 'orphan' && <OrphanList graph={graph} />}

      {view === 'trace' && <TraceTool activeProjectId={activeProjectId} nodes={graph.nodes} />}
    </>
  );
}

function OrphanList({ graph }: { graph: GraphResponse }): React.ReactElement {
  const linked = new Set<string>();
  for (const e of graph.edges) {
    linked.add(e.source);
    linked.add(e.target);
  }
  const orphans = graph.nodes.filter((n) => !linked.has(n.id));

  return (
    <section className="section">
      <h2 className="section-title serif">
        孤立项<span className="section-count">{orphans.length}</span>
      </h2>
      <p className="section-desc">没连上任何东西的笔记。它们最容易在写作时被忘掉。</p>
      {orphans.length === 0 ? (
        <Empty title="没有孤立项" hint="所有笔记都至少有一条连接。" />
      ) : (
        <ul className="orphan-list">
          {orphans.map((n) => (
            <li key={n.id}>
              <button
                className="orphan-item"
                onClick={() => navigate(`/project/note?path=${encodeURIComponent(n.id)}`)}
              >
                <span className="orphan-dot" style={{ background: n.color }} aria-hidden="true" />
                <span className="ellipsis">{n.label}</span>
                <span className="orphan-type">{n.type ?? '未归类'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TraceTool({
  activeProjectId,
  nodes,
}: {
  activeProjectId: string;
  nodes: GraphResponse['nodes'];
}): React.ReactElement {
  const [path, setPath] = useState('');
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [result, setResult] = useState<
    Array<{ depth: number; path: string; title: string; type: string | null; via: string }>
  >([]);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!path) return;
    setBusy(true);
    try {
      const r = await api.get<{ nodes: typeof result }>(
        `/project/${activeProjectId}/trace?path=${encodeURIComponent(path)}&direction=${direction}&depth=6`,
      );
      setResult(r.nodes);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <h2 className="section-title serif">全链路回溯</h2>
      <p className="section-desc">
        向上看它服务于什么，向下看它落到哪些章节 —— 这就是「无论相隔多远都能连上」的兑现。
      </p>
      <div className="trace-form">
        <select className="select" value={path} onChange={(e) => setPath(e.target.value)}>
          <option value="">选一篇笔记…</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>{n.label}</option>
          ))}
        </select>
        <select
          className="select"
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'up' | 'down')}
        >
          <option value="down">向下（它引用了谁）</option>
          <option value="up">向上（谁引用了它）</option>
        </select>
        <Btn variant="primary" onClick={() => void run()} disabled={busy || !path}>
          {busy ? '追溯中…' : '开始追溯'}
        </Btn>
      </div>

      {result.length > 0 && (
        <ul className="trace-list">
          {result.map((r) => (
            <li key={r.path} className="trace-row" style={{ paddingLeft: `${(r.depth - 1) * 20}px` }}>
              <span className="trace-depth mono">L{r.depth}</span>
              <button
                className="trace-title"
                onClick={() => navigate(`/project/note?path=${encodeURIComponent(r.path)}`)}
              >
                {r.title}
              </button>
              {r.via && <span className="trace-via">经 {r.via}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// MCP（对内对外同一页，分段切换）
// ─────────────────────────────────────────────────────────────

function McpTool(): React.ReactElement {
  const [side, setSide] = useState<'out' | 'in'>('out');

  return (
    <>
      <div className="segmented">
        <button className={`seg ${side === 'out' ? 'is-on' : ''}`} onClick={() => setSide('out')}>
          对外 · 其他 agent 接入本工作台
        </button>
        <button className={`seg ${side === 'in' ? 'is-on' : ''}`} onClick={() => setSide('in')}>
          对内 · 接入外部 MCP
        </button>
      </div>

      {side === 'out' ? <McpOutSection /> : <McpInSection />}
    </>
  );
}

function McpOutSection(): React.ReactElement {
  const [info, setInfo] = useState<McpOutInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<McpOutInfo>('/tools/mcp-out')
      .then(setInfo)
      .catch((err) => setError(err instanceof ApiFailure ? err.message : String(err)));
  }, []);

  if (error) return <ErrorBar message={error} />;
  if (!info) return <Loading rows={5} />;

  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-value serif">{info.counts.total}</div>
          <div className="stat-label">暴露的工具</div>
        </div>
        <div className="stat">
          <div className="stat-value serif">{info.counts.readOnly}</div>
          <div className="stat-label">只读</div>
        </div>
        <div className="stat">
          <div className="stat-value serif">{info.counts.write}</div>
          <div className="stat-label">写入</div>
        </div>
        <div className="stat">
          <div className="stat-value serif">{info.connectedClients}</div>
          <div className="stat-label">在线客户端</div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title serif">服务状态</h2>
        <dl className="kv">
          <div className="kv-row">
            <dt className="kv-key">服务名</dt>
            <dd className="kv-val">{info.server.name} · v{info.server.version}</dd>
          </div>
          <div className="kv-row">
            <dt className="kv-key">协议版本</dt>
            <dd className="kv-val mono">{info.server.protocolVersion}</dd>
          </div>
          <div className="kv-row">
            <dt className="kv-key">传输</dt>
            <dd className="kv-val">{info.transports.join(' · ')}</dd>
          </div>
          <div className="kv-row">
            <dt className="kv-key">HTTP 端点</dt>
            <dd className="kv-val mono">{info.endpoints.http}</dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <h2 className="section-title serif">暴露的工具</h2>
        <p className="section-desc">
          每个工具的描述都面向叙事动作，不面向数据库表 —— 接进来的 agent 才知道什么时候该用哪个。
        </p>
        <div className="tool-list">
          {info.tools.map((t) => (
            <div key={t.name} className="tool-item">
              <div className="tool-item-head">
                <code className="tool-name">{t.name}</code>
                <Tag color={t.readOnly ? '#4E9C7A' : '#C4735A'}>{t.readOnly ? '只读' : '写入'}</Tag>
              </div>
              <div className="tool-title">{t.title}</div>
              <p className="tool-desc">{t.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title serif">怎么接</h2>
        <p className="section-desc">stdio 给桌面客户端，streamable-http 给远程 agent。</p>
        <pre className="code-block">{`{
  "mcpServers": {
    "liuyun-loom": {
      "command": "node",
      "args": ["<项目路径>/apps/server/src/mcp-stdio.ts"],
      "env": { "LOOM_WORKSPACE": "<工作区路径>" }
    }
  }
}`}</pre>
      </section>
    </>
  );
}

interface McpInServer {
  id: string;
  name: string;
  command?: string;
  url?: string;
  enabled: boolean;
}

interface McpInStatus {
  id: string;
  name: string;
  transport: string;
  connected: boolean;
  tools: Array<{ name: string; description: string }>;
  error: string | null;
}

function McpInSection(): React.ReactElement {
  const [servers, setServers] = useState<McpInServer[]>([]);
  const [statuses, setStatuses] = useState<McpInStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const d = await api.get<{ servers: McpInServer[]; statuses: McpInStatus[] }>('/tools/mcp-in');
      setServers(d.servers);
      setStatuses(d.statuses);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const test = async (id: string) => {
    setBusy(id);
    try {
      await api.post(`/tools/mcp-in/${id}/test`);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    await api.del(`/tools/mcp-in/${id}`);
    await reload();
  };

  return (
    <>
      {error && <ErrorBar message={error} />}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title serif">已接入</h2>
          <span className="section-note">{servers.length} 个外部服务</span>
        </div>

        {servers.length === 0 ? (
          <Empty
            title="还没有接入外部 MCP"
            hint="接入外部服务后，本工作台可以在写作时调用它们（搜索、翻译、生成……）。"
          />
        ) : (
          <ul className="mcp-list">
            {servers.map((s) => {
              const st = statuses.find((x) => x.id === s.id);
              return (
                <li key={s.id} className="mcp-item">
                  <div className="mcp-item-head">
                    <span className="mcp-name">{s.name}</span>
                    <Tag color={s.url ? '#4E9CA8' : '#8A93A8'}>{s.url ? 'http' : 'stdio'}</Tag>
                    {st && (
                      <Tag color={st.connected ? '#4E9C7A' : '#B0605A'}>
                        {st.connected ? `已连接 · ${st.tools.length} 工具` : '未连接'}
                      </Tag>
                    )}
                  </div>
                  <div className="mcp-target mono">{s.url ?? s.command ?? ''}</div>
                  {st?.error && <div className="mcp-error">{st.error}</div>}
                  {st && st.tools.length > 0 && (
                    <div className="mcp-tools">
                      {st.tools.map((t) => (
                        <code key={t.name} className="mcp-tool">{t.name}</code>
                      ))}
                    </div>
                  )}
                  <div className="mcp-actions">
                    <Btn size="sm" onClick={() => void test(s.id)} disabled={busy === s.id}>
                      {busy === s.id ? '测试中…' : '连接测试'}
                    </Btn>
                    <Btn size="sm" variant="danger" onClick={() => void remove(s.id)}>移除</Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AddMcpForm onAdded={() => void reload()} />
    </>
  );
}

function AddMcpForm({ onAdded }: { onAdded: () => void }): React.ReactElement {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'stdio' | 'http'>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim() === '') {
      setError('服务名不能为空');
      return;
    }
    try {
      await api.post('/tools/mcp-in', {
        name: name.trim(),
        ...(mode === 'stdio'
          ? { command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [] }
          : { url: url.trim() }),
      });
      setName('');
      setCommand('');
      setArgs('');
      setUrl('');
      setError(null);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    }
  };

  return (
    <section className="section">
      <h2 className="section-title serif">添加服务</h2>
      <div className="segmented">
        <button className={`seg ${mode === 'stdio' ? 'is-on' : ''}`} onClick={() => setMode('stdio')}>
          stdio
        </button>
        <button className={`seg ${mode === 'http' ? 'is-on' : ''}`} onClick={() => setMode('http')}>
          http
        </button>
      </div>

      <label className="field">
        <span className="field-label">服务名</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：search" />
      </label>

      {mode === 'stdio' ? (
        <>
          <label className="field">
            <span className="field-label">命令</span>
            <input className="input mono" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />
          </label>
          <label className="field">
            <span className="field-label">参数（空格分隔）</span>
            <input className="input mono" value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @some/mcp-search" />
          </label>
        </>
      ) : (
        <label className="field">
          <span className="field-label">URL</span>
          <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:3000/mcp" />
        </label>
      )}

      {error && <ErrorBar message={error} />}
      <Btn variant="create" icon={<PlusMark />} onClick={() => void submit()}>添加服务</Btn>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// 一致性检查（四类同页对比）
// ─────────────────────────────────────────────────────────────

function CheckTool({ activeProjectId }: { activeProjectId: string | null }): React.ReactElement {
  const [data, setData] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProjectId) return;
    void api
      .get<CheckResponse>(`/project/${activeProjectId}/check`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiFailure ? err.message : String(err)));
  }, [activeProjectId]);

  if (!activeProjectId) return <Empty title="先选一本小说" hint="检查作用于当前这本书。" />;
  if (error) return <ErrorBar message={error} />;
  if (!data) return <Loading rows={4} />;

  const total =
    data.broken.length + data.scopeConflicts.length + data.conceptConflicts.length + data.untyped.length;

  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-value serif">{total}</div>
          <div className="stat-label">问题总数</div>
        </div>
        <div className="stat">
          <div className="stat-value serif">{data.broken.length}</div>
          <div className="stat-label">断链</div>
        </div>
        <div className="stat">
          <div className="stat-value serif">{data.scopeConflicts.length}</div>
          <div className="stat-label">作用域冲突</div>
        </div>
        <div className="stat">
          <div className="stat-value serif">{data.conceptConflicts.length}</div>
          <div className="stat-label">概念冲突</div>
        </div>
        <div className="stat">
          <div className="stat-value serif">{data.untyped.length}</div>
          <div className="stat-label">未归类</div>
        </div>
      </div>

      {total === 0 && <Empty title="没有发现问题" hint="断链、冲突、未归类都清干净了。" />}

      {data.broken.length > 0 && (
        <section className="section">
          <h2 className="section-title serif">
            断链<span className="section-count">{data.broken.length}</span>
          </h2>
          <p className="section-desc">指向不存在笔记的链接。要么补建，要么改正。</p>
          <ul className="issue-list">
            {data.broken.map((b, i) => (
              <li key={i} className="issue-row">
                <button
                  className="issue-source"
                  onClick={() => navigate(`/project/note?path=${encodeURIComponent(b.source)}`)}
                >
                  {b.source}
                </button>
                <span className="issue-arrow" aria-hidden="true">→</span>
                <code className="issue-target">{b.raw}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.scopeConflicts.length > 0 && (
        <section className="section">
          <h2 className="section-title serif">作用域冲突</h2>
          <ul className="issue-list">
            {data.scopeConflicts.map((c, i) => (
              <li key={i} className="issue-row issue-row-block">
                <div className="issue-reason">{c.reason}</div>
                <div className="issue-items">
                  {c.items.map((it) => (
                    <button
                      key={it}
                      className="issue-source"
                      onClick={() => navigate(`/project/note?path=${encodeURIComponent(it)}`)}
                    >
                      {it}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.conceptConflicts.length > 0 && (
        <section className="section">
          <h2 className="section-title serif">概念冲突</h2>
          <ul className="issue-list">
            {data.conceptConflicts.map((c, i) => (
              <li key={i} className="issue-row issue-row-block">
                <div className="issue-reason">{c.reason}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.untyped.length > 0 && (
        <section className="section">
          <h2 className="section-title serif">
            未归类<span className="section-count">{data.untyped.length}</span>
          </h2>
          <p className="section-desc">没定类型的笔记。归不归类都不影响创作 —— 但归类后能进设定栏。</p>
          <ul className="orphan-list">
            {data.untyped.map((u) => (
              <li key={u.path}>
                <button
                  className="orphan-item"
                  onClick={() => navigate(`/project/note?path=${encodeURIComponent(u.path)}`)}
                >
                  <span className="ellipsis">{u.title}</span>
                  <span className="orphan-type mono">{u.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 类型管理器（增删改 + 恢复默认，docs/01 第 4.8 节）
// ─────────────────────────────────────────────────────────────

interface TypeRow {
  name: string;
  label: string;
  color: string;
  defaultView: string | null;
  fields: Array<{ key: string; label: string; type: string }>;
}

function TypesTool({ activeProjectId }: { activeProjectId: string | null }): React.ReactElement {
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [view, setView] = useState('list');
  const [busy, setBusy] = useState(false);

  /** 行内编辑状态 */
  const [editName, setEditName] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftView, setDraftView] = useState('list');

  /** 删除确认 */
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [delInfo, setDelInfo] = useState<{ affected: number } | null>(null);

  /** 恢复默认确认 */
  const [confirmReset, setConfirmReset] = useState(false);
  const [packs, setPacks] = useState<string[]>([]);

  const reload = React.useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const d = await api.get<{ types: TypeRow[] }>(`/project/${activeProjectId}/types`);
      setTypes(d.types);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    }
  }, [activeProjectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void api
      .get<{ packs: Array<{ id: string }> }>('/library/packs')
      .then((d) => setPacks(d.packs.map((p) => p.id)))
      .catch(() => setPacks([]));
  }, []);

  if (!activeProjectId) return <Empty title="先选一本小说" hint="类型属于具体的书。" />;

  const create = async () => {
    if (name.trim() === '') return;
    setBusy(true);
    try {
      await api.post(`/project/${activeProjectId}/types`, { name: name.trim(), defaultView: view });
      setName('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (t: TypeRow) => {
    setEditName(t.name);
    setDraftLabel(t.label);
    setDraftView(t.defaultView ?? 'list');
  };

  const saveEdit = async () => {
    if (!editName) return;
    setBusy(true);
    try {
      await api.patch(`/project/${activeProjectId}/types/${encodeURIComponent(editName)}`, {
        label: draftLabel,
        defaultView: draftView,
      });
      setEditName(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (typeName: string) => {
    setBusy(true);
    try {
      const r = await api.del<{ affected: number }>(
        `/project/${activeProjectId}/types/${encodeURIComponent(typeName)}`,
      );
      setDelInfo({ affected: r.affected });
      setConfirmDel(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      // 用当前书已装的素材包重置；若没有则用 xianxia 兜底
      const lib = await api.get<LibraryResponse>('/library');
      const me = lib.projects.find((p) => p.id === activeProjectId);
      const usePacks = me && me.packs.length > 0 ? me.packs : ['xianxia'];
      await api.post(`/project/${activeProjectId}/types/reset`, { packs: usePacks });
      setConfirmReset(false);
      await reload();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <ErrorBar message={error} />}
      {delInfo && (
        <div className="notice-bar">
          类型已删除。{delInfo.affected > 0 ? `${delInfo.affected} 个条目已变为未归类，数据未丢失。` : '没有条目受影响。'}
          <button className="notice-close" onClick={() => setDelInfo(null)}>知道了</button>
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title serif">
            全部类型<span className="section-count">{types.length}</span>
          </h2>
        </div>

        {types.length === 0 ? (
          <Empty title="还没有类型" hint="下面新建一个。定义类型只是写一篇笔记，不改代码。" />
        ) : (
          <div className="type-manage">
            {types.map((t) => {
              const isEditing = editName === t.name;
              const isConfirming = confirmDel === t.name;
              return (
                <div key={t.name} className={`type-row ${isEditing ? 'is-editing' : ''}`}>
                  <span className="type-row-bar" style={{ background: t.color }} aria-hidden="true" />

                  {isEditing ? (
                    <>
                      <input
                        className="input"
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveEdit();
                          if (e.key === 'Escape') setEditName(null);
                        }}
                      />
                      <select
                        className="select"
                        value={draftView}
                        onChange={(e) => setDraftView(e.target.value)}
                      >
                        <option value="list">列表</option>
                        <option value="ladder">阶梯</option>
                        <option value="tree">树</option>
                        <option value="graph">图</option>
                        <option value="timeline">时间轴</option>
                        <option value="swimlane">泳道</option>
                        <option value="table">表格</option>
                      </select>
                      <div className="type-row-actions">
                        <button className="icon-btn is-ok" onClick={() => void saveEdit()} disabled={busy} title="保存">
                          <CheckIcon />
                        </button>
                        <button className="icon-btn" onClick={() => setEditName(null)} title="取消">
                          <XIcon />
                        </button>
                      </div>
                    </>
                  ) : isConfirming ? (
                    <>
                      <span className="type-row-confirm">
                        删除「{t.label}」？条目不会删，会变为未归类。
                      </span>
                      <div className="type-row-actions">
                        <Btn size="sm" variant="danger" onClick={() => void doDelete(t.name)} disabled={busy}>
                          确认删除
                        </Btn>
                        <Btn size="sm" variant="quiet" onClick={() => setConfirmDel(null)}>取消</Btn>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="type-row-name">{t.label}</span>
                      <code className="type-row-key">{t.name}</code>
                      {t.defaultView && <Tag>{t.defaultView}</Tag>}
                      <span className="type-row-count">
                        {t.fields.length > 0 ? `${t.fields.length} 个字段` : '无字段'}
                      </span>
                      <div className="type-row-actions">
                        <button className="icon-btn" onClick={() => startEdit(t)} title="编辑" aria-label="编辑">
                          <PencilIcon />
                        </button>
                        <button
                          className="icon-btn is-danger"
                          onClick={() => setConfirmDel(t.name)}
                          title="删除"
                          aria-label="删除"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title serif">新建类型</h2>
        <p className="section-desc">
          类型定义写在 <code>07-类型/</code> 下的 <code>_type</code> 笔记里。建完会自动出现在项目库「设定」的分组墙里。
        </p>
        <div className="trace-form">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="类型名，如：符箓"
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
          />
          <select className="select" value={view} onChange={(e) => setView(e.target.value)}>
            <option value="list">列表</option>
            <option value="ladder">阶梯</option>
            <option value="tree">树</option>
            <option value="graph">图</option>
            <option value="timeline">时间轴</option>
            <option value="swimlane">泳道</option>
            <option value="table">表格</option>
          </select>
          <Btn variant="create" icon={<PlusMark />} onClick={() => void create()} disabled={busy || name.trim() === ''}>
            {busy ? '创建中…' : '新建类型'}
          </Btn>
        </div>
      </section>

      {/* ── 底部：恢复初始类型（环形双箭头图标 + 确认）── */}
      <section className="section type-restore-section">
        {confirmReset ? (
          <div className="type-restore-confirm">
            <span className="type-restore-text">
              会把所有类型恢复成初始素材包定义，自定义类型会被清除；<strong>各条目的内容不受影响</strong>（会变为未归类）。确定恢复？
            </span>
            <div className="type-restore-actions">
              <button className="btn btn-primary btn-sm" onClick={() => void doReset()} disabled={busy}>
                {busy ? '处理中…' : '确定'}
              </button>
              <button className="btn btn-cancel-danger btn-sm" onClick={() => setConfirmReset(false)} disabled={busy}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <button className="type-restore-btn" onClick={() => setConfirmReset(true)} title="恢复到初始类型">
            <RestoreIcon />
            <span>恢复初始类型</span>
          </button>
        )}
      </section>
    </>
  );
}

/** 环形双箭头（一个朝内一个朝外成环）—— 恢复/刷新图标 */
function RestoreIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M10 3.2a6.8 6.8 0 106.6 8.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M15.4 3.2v3.4h-3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M10 16.8A6.8 6.8 0 013.4 8.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity=".55"
      />
      <path d="M4.6 16.8v-3.4h3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
    </svg>
  );
}

// 类型管理器用的图标
function PencilIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M11.2 2.6l2.2 2.2-8.2 8.2-3 .8.8-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
function TrashIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M2.6 4.2h10.8M5.6 4.2V2.8h4.8v1.4M4.2 4.2l.7 9h6.2l.7-9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M3 8.4l3.2 3.2L13 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function XIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 占位（本轮不做）
// ─────────────────────────────────────────────────────────────

function Placeholder({ tool }: { tool: string }): React.ReactElement {
  const names: Record<string, string> = {
    skills: 'Skills',
    plugins: '插件接口',
    templates: '模板管理',
  };
  return (
    <Empty
      title={`${names[tool] ?? tool} 本轮不做`}
      hint="属于后续里程碑。本轮只做工作台与知识底座 —— AI 自动生成章节、多人协作、云同步、导出都不在范围内。"
    />
  );
}
