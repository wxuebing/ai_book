/**
 * 单篇笔记：阅读 + 编辑 + 属性 + 关系
 */

import React, { useEffect, useState } from 'react';
import { api, ApiFailure, type NoteDetail, type LibraryResponse, type Block, type InlineToken } from '../api';
import { navigate } from '../router';
import { Btn, Crumbs, Empty, ErrorBar, Loading, Tag } from '../ui';
import { Markdown } from '../Markdown';
import { loadPrefs } from '../prefs';

function inlineText(tokens: InlineToken[] | undefined): string {
  return (tokens ?? []).map((t) => t.text ?? t.alt ?? t.target ?? '').join('');
}

/** 正文开头的 H1 往往就是标题本身；页头已经显示了，阅读时不再重复 */
function withoutLeadingTitle(blocks: Block[], title: string): Block[] {
  const first = blocks[0];
  if (
    first?.type === 'heading' &&
    first.level === 1 &&
    inlineText(first.inline).trim() === title.trim()
  ) {
    return blocks.slice(1);
  }
  return blocks;
}

interface Props {
  library: LibraryResponse | null;
  activeProjectId: string | null;
  onReload: () => Promise<void>;
}

export function NoteView({ activeProjectId, onReload }: Props): React.ReactElement {
  const params = new URLSearchParams(window.location.search);
  const notePath = params.get('path') ?? '';

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const prefs = React.useMemo(() => loadPrefs(), []);

  const load = React.useCallback(async () => {
    if (!activeProjectId || !notePath) return;
    try {
      const n = await api.get<NoteDetail>(
        `/project/${activeProjectId}/note/${encodeURI(notePath)}`,
      );
      setNote(n);
      setDraft(n.body);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    }
  }, [activeProjectId, notePath]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!notePath) {
    return (
      <div className="page">
        <Empty title="没有指定笔记" hint="从左侧导航或关系图里点一篇进来。" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorBar message={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (!note) return <div className="page"><Loading rows={8} /></div>;

  const save = async () => {
    if (!activeProjectId) return;
    setBusy(true);
    try {
      await api.patch(`/project/${activeProjectId}/note/${encodeURI(note.path)}`, { body: draft });
      await load();
      await onReload();
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page note-page">
      <Crumbs
        items={[
          { label: '项目库', to: `/project/${activeProjectId}` },
          { label: note.folder || '根目录' },
          { label: note.title },
        ]}
      />

      <header className="note-head">
        <div className="note-head-main">
          <h1 className="note-title serif">{note.title}</h1>
          <div className="note-meta">
            {note.type && <Tag color="#4E7F8C">{note.type}</Tag>}
            <span className="mono text-mute">{note.path}</span>
            <span className="text-mute">{note.words} 字</span>
            {!note.scope.any && (
              <span className="note-scope">
                作用域
                {note.scope.space.length > 0 && ` · ${note.scope.space.join('/')}`}
                {note.scope.time.length > 0 && ` · ${note.scope.time.join('/')}`}
              </span>
            )}
          </div>
        </div>
        <div className="note-actions">
          {editing ? (
            <>
              <Btn onClick={() => { setEditing(false); setDraft(note.body); }} disabled={busy}>
                取消
              </Btn>
              <Btn variant="primary" onClick={() => void save()} disabled={busy}>
                {busy ? '保存中…' : '保存'}
              </Btn>
            </>
          ) : (
            <Btn variant="primary" onClick={() => setEditing(true)}>编辑</Btn>
          )}
        </div>
      </header>

      <div className="note-layout">
        <article className="note-body" style={{ maxWidth: prefs.editorWidth, width: '100%' }}>
          {editing ? (
            <textarea
              className="note-editor"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <Markdown
              blocks={withoutLeadingTitle(note.blocks, note.title)}
              currentPath={note.path}
              projectId={note.projectId ?? activeProjectId ?? undefined}
            />
          )}
        </article>

        <aside className="note-side">
          {note.headings.filter((h) => h.level >= 2 && h.level <= 3).length > 0 && (
            <section className="side-block">
              <h3 className="side-title">本页目录</h3>
              <ul className="side-toc">
                {note.headings
                  .filter((h) => h.level >= 2 && h.level <= 3)
                  .slice(0, 14)
                  .map((h) => (
                    <li key={`${h.slug}-${h.text}`} style={{ paddingLeft: (h.level - 2) * 10 }}>
                      <button
                        className="side-toc-link"
                        onClick={() =>
                          document.getElementById(h.slug)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      >
                        {h.text}
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          )}
          {note.paths.length > 0 && (
            <section className="side-block">
              <h3 className="side-title">多体系等级</h3>
              {note.paths.map((p) => (
                <div key={`${p.system}-${p.tier}`} className="path-row">
                  <span className="path-system">{p.system}</span>
                  <span className="path-tier">{p.tier}</span>
                </div>
              ))}
            </section>
          )}

          {Object.keys(note.frontmatter).length > 0 && (
            <section className="side-block">
              <h3 className="side-title">属性</h3>
              <dl className="side-kv">
                {Object.entries(note.frontmatter)
                  .filter(([k]) => !['title', 'type', 'relations', 'scope', 'paths'].includes(k))
                  .map(([k, v]) => (
                    <div key={k} className="side-kv-row">
                      <dt>{k}</dt>
                      <dd>{fmt(v)}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          )}

          {note.tags.length > 0 && (
            <section className="side-block">
              <h3 className="side-title">标签</h3>
              <div className="side-tags">
                {note.tags.map((t) => (
                  <Tag key={t}>#{t}</Tag>
                ))}
              </div>
            </section>
          )}

          <section className="side-block">
            <h3 className="side-title">
              出链
              <span className="side-count">{note.outgoing.length}</span>
            </h3>
            {note.outgoing.length === 0 ? (
              <p className="side-empty">没有出链</p>
            ) : (
              <ul className="side-links">
                {note.outgoing.map((o) => (
                  <li key={o.target}>
                    {o.resolved && o.path ? (
                      <button
                        className="side-link"
                        onClick={() => navigate(`/project/note?path=${encodeURIComponent(o.path!)}`)}
                      >
                        <span className="ellipsis">{o.label}</span>
                        <span className="side-link-kind">{o.kind}</span>
                      </button>
                    ) : (
                      <span className="side-link is-broken" title="断链">
                        <span className="ellipsis">{o.target}</span>
                        <span className="side-link-kind">断链</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="side-block">
            <h3 className="side-title">
              反向链接
              <span className="side-count">{note.backlinks.length}</span>
            </h3>
            {note.backlinks.length === 0 ? (
              <p className="side-empty">还没有谁引用它</p>
            ) : (
              <ul className="side-links">
                {note.backlinks.map((b) => (
                  <li key={b.path}>
                    <button
                      className="side-link"
                      onClick={() => navigate(`/project/note?path=${encodeURIComponent(b.path)}`)}
                    >
                      <span className="ellipsis">{b.title}</span>
                      <span className="side-link-kind">{b.kind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.map((x) => fmt(x)).join('、');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
