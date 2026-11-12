/**
 * 正文内容工作台（项目二级导航「正文」）
 *
 * 用户需求（原话）：
 *   「工作台的小说……二级导航栏添加最后一个正文内容，正文有草稿，可保存、各个章节等……
 *    这是写文章、添加章节详细内容、小说编写、添加候选发布、导出文章正文
 *    （发布到其他平台，一键复制正文内容的按钮要有），以及其他很多的编辑，还别忘了增删改」
 *
 * 能力：
 *   - 章节列表（type=章节），可新建 / 重命名 / 删除（增删改）
 *   - 写作编辑器：标题 + 正文，字数统计，保存（草稿）
 *   - 草稿状态标记（frontmatter.status），未保存提示
 *   - 一键复制全文（拼接所有章节）
 *   - 导出正文（下载 .txt）
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiFailure,
  type EntrySummary,
  type GroupResponse,
  type NoteDetail,
} from '../api';
import { Btn, ErrorBar, Empty, Loading, PlusMark } from '../ui';
import { loadPrefs } from '../prefs';

interface Props {
  projectId: string;
  onReload: () => Promise<void>;
}

interface Chapter {
  path: string;
  title: string;
  words: number;
  body: string;
  status: string | null; // 草稿 / 完成
  order: number | null;
  fm: Record<string, unknown>;
}

function stripHeading(body: string): string {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  if (i < lines.length && /^#\s+/.test(lines[i]!)) {
    i++;
    while (i < lines.length && lines[i]!.trim() === '') i++;
    return lines.slice(i).join('\n');
  }
  return body.trim();
}

function wordsOf(text: string): number {
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjk ? cjk.length : 0;
  const rest = text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ');
  const latin = rest.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return cjkCount + latin;
}

export function WritingPage({ projectId, onReload }: Props): React.ReactElement {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [status, setStatus] = useState<string>('草稿');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const prefs = useMemo(() => loadPrefs(), []);
  /** 每次编辑 +1：保存请求返回时据此判断期间是否又有新输入 */
  const editSeq = useRef(0);
  const activePathRef = useRef<string | null>(null);
  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);
  /** 当前章节原始 frontmatter（保存时合并，避免覆盖 order/type 等） */
  const [rawFm, setRawFm] = useState<Record<string, unknown>>({});

  // 加载章节列表
  const loadChapters = useCallback(async (): Promise<Chapter[]> => {
    const g = await api.get<GroupResponse>(`/project/${projectId}/group/${encodeURIComponent('章节')}`);
    // 拉每章正文
    const chapters = await Promise.all(
      g.notes.map(async (n: EntrySummary) => {
        const enc = n.path.split('/').map(encodeURIComponent).join('/');
        const detail = await api.get<NoteDetail>(`/project/${projectId}/note/${enc}`).catch(() => null);
        return {
          path: n.path,
          title: n.title,
          words: n.words,
          body: detail ? stripHeading(detail.body) : '',
          status: typeof n.frontmatter?.status === 'string' ? (n.frontmatter.status as string) : null,
          order: typeof n.frontmatter?.order === 'number' ? (n.frontmatter.order as number) : null,
          fm: (detail?.frontmatter as Record<string, unknown>) ?? (n.frontmatter as Record<string, unknown>) ?? {},
        } satisfies Chapter;
      }),
    );
    chapters.sort((a, b) => {
      const oa = a.order ?? 9999;
      const ob = b.order ?? 9999;
      if (oa !== ob) return oa - ob;
      return a.title.localeCompare(b.title, 'zh');
    });
    return chapters;
  }, [projectId]);

  const reload = useCallback(async () => {
    try {
      const list = await loadChapters();
      setChapters(list);
      setError(null);
      return list;
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : String(e));
      setChapters([]);
      return [] as Chapter[];
    }
  }, [loadChapters]);

  useEffect(() => {
    void (async () => {
      const list = await reload();
      if (list.length > 0 && !activePath) openChapter(list[0]!);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const openChapter = (c: Chapter) => {
    if (dirty && !window.confirm('当前章节有未保存的修改，确定切换？')) return;
    setActivePath(c.path);
    setTitle(c.title);
    setBodyText(c.body);
    setStatus(c.status ?? '草稿');
    setRawFm(c.fm ?? {});
    setDirty(false);
    setSavedAt(null);
    setConfirmDel(false);
  };

  /** 编辑动作统一走这里，保证「保存期间又输入」不会被误判为已保存 */
  const markDirty = () => {
    editSeq.current += 1;
    setDirty(true);
  };

  const save = useCallback(
    async (silent = false): Promise<boolean> => {
      if (!activePath) return false;
      const seq = editSeq.current;
      if (!silent) setBusy(true);
      try {
        const enc = activePath.split('/').map(encodeURIComponent).join('/');
        const finalTitle = title.trim() || '未命名章节';
        const content = `# ${finalTitle}\n\n${bodyText.trim()}\n`;
        const fm = { ...rawFm, title: finalTitle, status };
        await api.patch(`/project/${projectId}/note/${enc}`, {
          body: content,
          frontmatter: fm,
        });
        setChapters((prev) =>
          prev
            ? prev.map((c) =>
                c.path === activePath
                  ? { ...c, title: finalTitle, words: wordsOf(bodyText), status, body: bodyText }
                  : c,
              )
            : prev,
        );
        // 保存期间如果已切到别的章节，只更新列表，不覆盖当前编辑态
        if (activePathRef.current === activePath) {
          setRawFm(fm);
          setSavedAt(Date.now());
          if (editSeq.current === seq) setDirty(false);
        }
        if (!silent) {
          await reload();
          await onReload();
        }
        return true;
      } catch (e) {
        setError(e instanceof ApiFailure ? e.message : String(e));
        return false;
      } finally {
        if (!silent) setBusy(false);
      }
    },
    [activePath, bodyText, onReload, projectId, rawFm, reload, status, title],
  );

  // 自动保存：停止输入 1.2s 后提交；保存期间的新输入会触发下一轮
  useEffect(() => {
    if (!prefs.autoSave || !dirty || !activePath || busy) return;
    const timer = window.setTimeout(() => {
      void save(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [prefs.autoSave, dirty, activePath, busy, save]);

  // Ctrl/Cmd+S 手动保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (dirty && activePath && !busy) void save(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, activePath, busy, save]);

  const newChapter = async () => {
    if (dirty && !window.confirm('当前章节有未保存的修改，确定新建？')) return;
    setBusy(true);
    try {
      const nextOrder = (chapters?.length ?? 0) + 1;
      const r = await api.post<{ path: string }>(`/project/${projectId}/entry`, {
        title: `第${nextOrder}章`,
        type: '章节',
        body: `# 第${nextOrder}章\n\n`,
        frontmatter: { status: '草稿', order: nextOrder },
      });
      const list = await reload();
      await onReload();
      const found = list.find((c) => c.path === r.path);
      if (found) openChapter(found);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const delChapter = async () => {
    if (!activePath) return;
    setBusy(true);
    try {
      const enc = activePath.split('/').map(encodeURIComponent).join('/');
      await api.del(`/project/${projectId}/note/${enc}`);
      setConfirmDel(false);
      setActivePath(null);
      const list = await reload();
      await onReload();
      if (list.length > 0) openChapter(list[0]!);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** 拼接全书正文（去标题行），用于复制/导出 */
  const fullText = useMemo(() => {
    if (!chapters) return '';
    return chapters
      .map((c) => `## ${c.title}\n\n${c.body.trim()}`)
      .join('\n\n')
      .trim();
  }, [chapters]);

  const copyAll = async () => {
    if (!fullText) return;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // 兜底：选中 textarea 方式
      const ta = document.createElement('textarea');
      ta.value = fullText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const exportAll = () => {
    if (!fullText) return;
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '正文.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (chapters === null) return <div className="page"><Loading rows={6} /></div>;

  const totalWords = chapters.reduce((a, c) => a + c.words, 0);

  return (
    <div className="page writing-page">
      <header className="page-head">
        <div>
          <h1 className="page-title serif">正文</h1>
          <p className="page-sub">
            {chapters.length} 章 · {totalWords.toLocaleString('zh-CN')} 字 · 写正文、存草稿、一键复制或导出全文
          </p>
        </div>
        <div className="page-actions">
          <Btn variant="ghost" onClick={() => void copyAll()} disabled={chapters.length === 0}>
            {copied ? '已复制 ✓' : '一键复制全文'}
          </Btn>
          <Btn variant="ghost" onClick={exportAll} disabled={chapters.length === 0}>
            导出正文
          </Btn>
          <Btn variant="create" icon={<PlusMark />} onClick={() => void newChapter()} disabled={busy}>
            新建章节
          </Btn>
        </div>
      </header>

      {error && <ErrorBar message={error} />}

      {chapters.length === 0 ? (
        <Empty
          title="还没有正文"
          hint="点「新建章节」开始写第一章。"
          action={<Btn variant="create" icon={<PlusMark />} onClick={() => void newChapter()}>新建第一章</Btn>}
        />
      ) : (
        <div className="writing-shell">
          {/* 左：章节列表 */}
          <aside className="writing-list">
            {chapters.map((c, i) => (
              <button
                key={c.path}
                className={`writing-chapter ${activePath === c.path ? 'is-active' : ''}`}
                onClick={() => openChapter(c)}
                title={c.title}
              >
                <span className="writing-chapter-no">{String(i + 1).padStart(2, '0')}</span>
                <span className="writing-chapter-main">
                  <span className="writing-chapter-title ellipsis">{c.title}</span>
                  <span className="writing-chapter-meta">
                    {c.words} 字{c.status ? ` · ${c.status}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </aside>

          {/* 右：编辑器（宽度跟随设置里的「正文最大宽度」） */}
          <section
            className="writing-editor"
            style={{ maxWidth: prefs.editorWidth, width: '100%', justifySelf: 'center' }}
          >
            <div className="writing-editor-head">
              <input
                className="input writing-title-input"
                value={title}
                onChange={(e) => { setTitle(e.target.value); markDirty(); }}
                placeholder="章节标题"
              />
              <div className="writing-editor-actions">
                <select
                  className="select writing-status-select"
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); markDirty(); }}
                  title="状态"
                >
                  <option value="草稿">草稿</option>
                  <option value="完成">完成</option>
                </select>
              </div>
            </div>

            <textarea
              className="writing-body"
              value={bodyText}
              onChange={(e) => { setBodyText(e.target.value); markDirty(); }}
              placeholder="在这里写正文……"
              spellCheck={false}
            />

            <div className="writing-editor-foot">
              <div className="writing-foot-left">
                <span className="writing-wordcount">{wordsOf(bodyText).toLocaleString('zh-CN')} 字</span>
                {dirty ? (
                  <span className="writing-dirty">未保存</span>
                ) : savedAt ? (
                  <span className="writing-saved">
                    已保存 {new Date(savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : (
                  <span className="writing-saved-hint">
                    {prefs.autoSave ? '自动保存已开启' : '手动保存'}
                  </span>
                )}
                {confirmDel ? (
                  <span className="writing-del-confirm">
                    <span className="writing-del-text">确定删除这一章？</span>
                    <Btn size="sm" variant="danger" onClick={() => void delChapter()} disabled={busy}>
                      确定
                    </Btn>
                    <button className="btn btn-cancel-danger btn-sm" onClick={() => setConfirmDel(false)} disabled={busy}>
                      取消
                    </button>
                  </span>
                ) : (
                  <button className="btn btn-danger-quiet btn-sm" onClick={() => setConfirmDel(true)} disabled={busy}>
                    删除这一章
                  </button>
                )}
              </div>
              <div className="writing-foot-right">
                <Btn variant="primary" onClick={() => void save()} disabled={busy || !dirty}>
                  {busy ? '保存中…' : '保存'}
                </Btn>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
