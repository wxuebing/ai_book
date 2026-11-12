/**
 * 数据看板（docs/01 第 5.5 节第 8 条）
 *
 * 用户原话：「工具库的统计，这一个应当为多个或者一个小说来统计，这是数据看板，可以选择多个东西知道吗？」
 *
 * 核心：多选小说 → 对所选并集做统计 + 每本书一行横向对比。
 * 数据来源：逐本调 /api/project/:id 后在前端合并（书数量有限，不新增后端接口）。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiFailure, type LibraryResponse, type ProjectOverview } from '../api';
import { navigate } from '../router';
import { Btn, Empty, ErrorBar, Loading } from '../ui';

interface BookStat {
  id: string;
  name: string;
  words: number;
  chapters: number;
  notes: number;
  typed: number;
  untyped: number;
  types: number;
  relations: number;
  concepts: number;
  groups: ProjectOverview['groups'];
  spaces: string[];
  times: string[];
}

type SortKey = 'name' | 'words' | 'chapters' | 'notes' | 'types' | 'relations';

export function StatsBoard({ activeProjectId }: { activeProjectId: string | null }): React.ReactElement {
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [books, setBooks] = useState<BookStat[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('words');
  const [asc, setAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. 取书目
  useEffect(() => {
    void api
      .get<LibraryResponse>('/library')
      .then((lib) => {
        setLibrary(lib);
        // 默认选中当前激活的书；没有则全选
        const initial = lib.active ? new Set([lib.active]) : new Set(lib.projects.map((p) => p.id));
        setSelected(initial);
      })
      .catch((err) => {
        setError(err instanceof ApiFailure ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  // 2. 逐本取统计
  useEffect(() => {
    if (!library) return;
    if (library.projects.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all(
      library.projects.map(async (p) => {
        const o = await api.get<ProjectOverview>(`/project/${p.id}`);
        return {
          id: p.id,
          name: p.name,
          words: o.words,
          chapters: 0,
          notes: o.notes,
          typed: o.typed,
          untyped: o.untyped,
          types: o.types,
          relations: o.relations,
          concepts: o.concepts,
          groups: o.groups,
          spaces: o.scopes.spaces,
          times: o.scopes.times,
        } satisfies BookStat;
      }),
    )
      .then((list) => {
        if (cancelled) return;
        // 章节数从书目摘要里补（overview 没直接给）
        const withChapters = list.map((b) => ({
          ...b,
          chapters: library.projects.find((p) => p.id === b.id)?.chapters ?? 0,
        }));
        setBooks(withChapters);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiFailure ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [library]);

  const chosen = useMemo(() => books.filter((b) => selected.has(b.id)), [books, selected]);

  /** 所选范围的合计 */
  const totals = useMemo(() => {
    const t = {
      words: 0, chapters: 0, notes: 0, typed: 0, untyped: 0,
      types: 0, relations: 0, concepts: 0,
    };
    for (const b of chosen) {
      t.words += b.words;
      t.chapters += b.chapters;
      t.notes += b.notes;
      t.typed += b.typed;
      t.untyped += b.untyped;
      t.types += b.types;
      t.relations += b.relations;
      t.concepts += b.concepts;
    }
    return t;
  }, [chosen]);

  /** 类型分布：所选范围合并 */
  const mergedTypes = useMemo(() => {
    const map = new Map<string, { label: string; color: string; count: number }>();
    for (const b of chosen) {
      for (const g of b.groups) {
        const cur = map.get(g.type);
        if (cur) cur.count += g.count;
        else map.set(g.type, { label: g.label, color: g.color, count: g.count });
      }
    }
    return [...map.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [chosen]);

  /** 作用域坐标：所选范围并集 */
  const mergedScopes = useMemo(() => {
    const spaces = new Set<string>();
    const times = new Set<string>();
    for (const b of chosen) {
      for (const s of b.spaces) spaces.add(s);
      for (const t of b.times) times.add(t);
    }
    return { spaces: [...spaces].sort(), times: [...times].sort() };
  }, [chosen]);

  /** 对比表排序 */
  const sortedBooks = useMemo(() => {
    const list = [...chosen];
    list.sort((a, b) => {
      let r: number;
      if (sort === 'name') r = a.name.localeCompare(b.name, 'zh');
      else r = (a[sort] as number) - (b[sort] as number);
      return asc ? r : -r;
    });
    return list;
  }, [chosen, sort, asc]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(books.map((b) => b.id)));
  const clearAll = () => setSelected(new Set());
  const selectActive = () => {
    if (activeProjectId) setSelected(new Set([activeProjectId]));
  };

  if (error) return <ErrorBar message={error} />;
  if (!library) return <Loading rows={4} />;
  if (library.projects.length === 0) {
    return (
      <Empty
        title="还没有可统计的小说"
        hint="看板统计的是工作区里的书。先新建一本。"
      />
    );
  }
  if (loading) return <Loading rows={5} />;

  const clickSort = (key: SortKey) => {
    if (sort === key) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(key === 'name');
    }
  };

  return (
    <>
      {/* ① 选择区 */}
      <section className="section">
        <div className="section-head">
          <h2 className="section-title serif">
            选择小说
            <span className="section-count">已选 {selected.size} / {books.length}</span>
          </h2>
          <div className="board-actions">
            <Btn size="sm" onClick={selectAll}>全选</Btn>
            <Btn size="sm" onClick={clearAll} disabled={selected.size === 0}>清空</Btn>
            {activeProjectId && (
              <Btn size="sm" onClick={selectActive}>只看当前书</Btn>
            )}
          </div>
        </div>

        <div className="board-picker">
          {books.map((b) => {
            const on = selected.has(b.id);
            return (
              <button
                key={b.id}
                className={`board-book ${on ? 'is-on' : ''}`}
                onClick={() => toggle(b.id)}
                aria-pressed={on}
              >
                <span className="board-book-check" aria-hidden="true">
                  {on ? (
                    <svg viewBox="0 0 12 12" width="9" height="9" fill="none">
                      <path d="M2 6.2l2.6 2.6L10 3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span className="board-book-name ellipsis">{b.name}</span>
                <span className="board-book-words">{b.words.toLocaleString('zh-CN')}</span>
              </button>
            );
          })}
        </div>
      </section>

      {chosen.length === 0 ? (
        <Empty
          title="还没有选择小说"
          hint="勾选上方任意一本或多本，看板会按所选范围聚合。"
          action={<Btn variant="primary" onClick={selectAll}>全选所有书</Btn>}
        />
      ) : (
        <>
          {/* 合计 */}
          <div className="stat-row">
            <div className="stat">
              <div className="stat-value serif">{totals.words.toLocaleString('zh-CN')}</div>
              <div className="stat-label">总字数</div>
            </div>
            <div className="stat">
              <div className="stat-value serif">{totals.chapters}</div>
              <div className="stat-label">章节</div>
            </div>
            <div className="stat">
              <div className="stat-value serif">{totals.notes}</div>
              <div className="stat-label">笔记</div>
            </div>
            <div className="stat">
              <div className="stat-value serif">{totals.types}</div>
              <div className="stat-label">类型</div>
            </div>
            <div className="stat">
              <div className="stat-value serif">{totals.relations}</div>
              <div className="stat-label">关系</div>
            </div>
            <div className="stat">
              <div className="stat-value serif">{totals.untyped}</div>
              <div className="stat-label">未归类</div>
            </div>
          </div>

          {/* ② 横向对比表 */}
          <section className="section">
            <div className="section-head">
              <h2 className="section-title serif">横向对比</h2>
              <span className="section-note">点列头排序</span>
            </div>
            <div className="table-wrap">
              <table className="data-table board-table">
                <thead>
                  <tr>
                    <th onClick={() => clickSort('name')} className="board-th">
                      书名{sort === 'name' ? (asc ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th onClick={() => clickSort('words')} className="board-th is-num">
                      字数{sort === 'words' ? (asc ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th onClick={() => clickSort('chapters')} className="board-th is-num">
                      章节{sort === 'chapters' ? (asc ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th onClick={() => clickSort('notes')} className="board-th is-num">
                      笔记{sort === 'notes' ? (asc ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th onClick={() => clickSort('types')} className="board-th is-num">
                      类型{sort === 'types' ? (asc ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th onClick={() => clickSort('relations')} className="board-th is-num">
                      关系{sort === 'relations' ? (asc ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className="board-th is-num">未归类</th>
                    <th className="board-th is-num">占比</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBooks.map((b) => {
                    const share = totals.words > 0 ? (b.words / totals.words) * 100 : 0;
                    return (
                      <tr key={b.id}>
                        <td className="data-table-name">{b.name}</td>
                        <td className="mono is-num">{b.words.toLocaleString('zh-CN')}</td>
                        <td className="mono is-num">{b.chapters}</td>
                        <td className="mono is-num">{b.notes}</td>
                        <td className="mono is-num">{b.types}</td>
                        <td className="mono is-num">{b.relations}</td>
                        <td className="mono is-num">{b.untyped}</td>
                        <td className="is-num">
                          <span className="board-share">
                            <span className="board-share-bar" style={{ width: `${share}%` }} />
                            <span className="board-share-text">{share.toFixed(0)}%</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="board-total-row">
                    <td className="data-table-name">合计（{chosen.length} 本）</td>
                    <td className="mono is-num">{totals.words.toLocaleString('zh-CN')}</td>
                    <td className="mono is-num">{totals.chapters}</td>
                    <td className="mono is-num">{totals.notes}</td>
                    <td className="mono is-num">{totals.types}</td>
                    <td className="mono is-num">{totals.relations}</td>
                    <td className="mono is-num">{totals.untyped}</td>
                    <td className="is-num">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ③ 类型分布（左半）+ ④ 作用域（右半）—— docs/01 4.6 */}
          <div className="board-split">
            <section className="section board-half">
              <div className="section-head">
                <h2 className="section-title serif">类型分布</h2>
                <span className="section-note">所选范围合并统计</span>
              </div>
              {mergedTypes.length === 0 ? (
                <Empty title="所选范围还没有类型" hint="去类型管理器建一个。" />
              ) : (
                <div className="dist">
                  {mergedTypes.map((g) => {
                    const max = Math.max(...mergedTypes.map((x) => x.count), 1);
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
              )}
            </section>

            <section className="section board-half">
              <div className="section-head">
                <h2 className="section-title serif">作用域坐标</h2>
                <span className="section-note">所选范围出现过的全部坐标</span>
              </div>
              {mergedScopes.spaces.length === 0 && mergedScopes.times.length === 0 ? (
                <Empty title="还没有作用域坐标" hint="在条目的 frontmatter 里声明 scope。" />
              ) : (
                <div className="scope-box">
                  {mergedScopes.spaces.length > 0 && (
                    <div className="scope-line">
                      <span className="scope-key">空间</span>
                      {mergedScopes.spaces.map((s) => (
                        <span key={s} className="tag">{s}</span>
                      ))}
                    </div>
                  )}
                  {mergedScopes.times.length > 0 && (
                    <div className="scope-line">
                      <span className="scope-key">时间</span>
                      {mergedScopes.times.map((t) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* 便签墙只在小说库单本页，这里不放（docs/01 5.2） */}
        </>
      )}
    </>
  );
}
