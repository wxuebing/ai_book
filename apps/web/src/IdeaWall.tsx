/**
 * 便签墙（原名「灵感墙」）—— 共享组件
 *
 * 用户原话与需求：
 *   「这个灵感墙……可编辑任何的东西它都应该是可编辑的……你连一个编辑按钮都没有、
 *    删除按钮也没有……点进去应该是一个弹窗显示一个详细的这种界面」
 *   「便签墙就是记事的地方，记录一些这个小说后面的杂事，每天迸发出想法记下来」
 *   「便签墙不只文字，还可以放图片元素等」
 *
 * 能力：
 *   - 每张便签 hover 显示「编辑 / 删除」按钮
 *   - 点便签主体 → 弹窗显示详情，弹窗内可直接编辑标题/内容并保存、可删除
 *   - 「+ 新建便签」：可选文字便签或图片便签
 *   - 图片便签：上传图片存到项目 08-共享/attachments，卡片显示缩略图
 *
 * 用在两处：
 *   1. 小说详情页（LibraryDetail）底部
 *   2. 导航栏「便签墙」独立页 NoteWall（带小说下拉选择）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiFailure, type NoteDetail } from './api';

/** 便签配色：按序号轮换（用户要求"按序号轮序"） */
export const STICKY_COLORS = [
  '#F5E6A8', // 暖黄
  '#CFE3C0', // 浅绿
  '#F0CFCF', // 淡粉
  '#C8DDE8', // 天蓝
  '#F2EDE0', // 米白
  '#F2D5B8', // 浅橙
];

interface IdeaItem {
  path: string;
  title: string;
  excerpt: string;
  /** 图片便签的附件相对路径（frontmatter.image） */
  image?: string | null;
}

interface Props {
  /** 指定项目；省略则用当前激活的书 */
  projectId?: string;
  /** 最多显示几张（省略=不限） */
  limit?: number;
  /** 标题区是否显示（嵌在别的 section 里时可关掉） */
  showHead?: boolean;
  /** 网格最小宽度 */
  minWidth?: number;
  /** 变更后通知外部刷新（如统计数字） */
  onChange?: () => void;
}

/** 把附件相对路径转成可访问 URL */
function attachUrl(projectId: string, rel: string): string {
  return `/api/project/${projectId}/attach/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

export function IdeaWall({
  projectId,
  limit,
  showHead = true,
  minWidth = 148,
  onChange,
}: Props): React.ReactElement {
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pid, setPid] = useState<string | undefined>(projectId);
  /** 弹窗：编辑/查看哪张便签；'new' 表示新建 */
  const [active, setActive] = useState<IdeaItem | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let id = projectId;
      if (!id) {
        const lib = await api.get<{ active: string | null }>('/library');
        id = lib.active ?? undefined;
      }
      setPid(id);
      if (!id) {
        setIdeas([]);
        setLoading(false);
        return;
      }
      const g = await api.get<{
        notes: Array<{ path: string; title: string; excerpt: string; frontmatter?: Record<string, unknown> }>;
      }>(`/project/${id}/group/${encodeURIComponent('灵感')}`);
      const mapped: IdeaItem[] = g.notes.map((n) => ({
        path: n.path,
        title: n.title,
        excerpt: n.excerpt,
        image: typeof n.frontmatter?.image === 'string' ? (n.frontmatter.image as string) : null,
      }));
      setIdeas(limit ? mapped.slice(0, limit) : mapped);
    } catch {
      setIdeas([]);
    }
    setLoading(false);
  }, [projectId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterChange = () => {
    void load();
    onChange?.();
  };

  const body = (
    <div className="idea-wall">
      <div className="idea-wall-bar">
        <span className="idea-wall-count">
          {loading ? '加载中…' : `${ideas.length} 张便签`}
        </span>
        {pid && (
          <button className="idea-wall-new" onClick={() => setActive('new')}>
            ＋ 新建便签
          </button>
        )}
      </div>
      {loading ? (
        <div className="idea-wall-empty">加载中…</div>
      ) : ideas.length === 0 ? (
        <div className="idea-wall-empty">
          还没有便签。点「新建便签」记下第一条零碎想法。
        </div>
      ) : (
        <div
          className="idea-grid"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}
        >
          {ideas.map((it, i) => (
            <div
              key={it.path}
              className={`sticky ${it.image ? 'sticky-has-image' : ''}`}
              style={{
                background: STICKY_COLORS[i % STICKY_COLORS.length],
                transform: `rotate(${((i % 5) - 2) * 0.8}deg)`,
              }}
            >
              <button
                className="sticky-main"
                onClick={() => setActive(it)}
                title={it.title}
              >
                <span className="sticky-no">{String(i + 1).padStart(2, '0')}</span>
                {it.image && pid ? (
                  <span className="sticky-thumb">
                    <img src={attachUrl(pid, it.image)} alt={it.title} loading="lazy" />
                  </span>
                ) : null}
                <span className="sticky-title serif ellipsis">{it.title}</span>
                {!it.image && <span className="sticky-excerpt clamp-3">{it.excerpt || '（空）'}</span>}
              </button>
              <div className="sticky-ops">
                <button
                  className="sticky-op"
                  title="编辑"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActive(it);
                  }}
                >
                  <IconEdit />
                </button>
                <button
                  className="sticky-op sticky-op-del"
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!pid) return;
                    if (!window.confirm(`确定删除便签「${it.title}」？`)) return;
                    void api
                      .del(`/project/${pid}/note/${it.path.split('/').map(encodeURIComponent).join('/')}`)
                      .then(afterChange)
                      .catch((err) => window.alert(err instanceof ApiFailure ? err.message : String(err)));
                  }}
                >
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {active && pid && (
        <IdeaDialog
          projectId={pid}
          idea={active === 'new' ? null : active}
          onClose={() => setActive(null)}
          onSaved={() => {
            setActive(null);
            afterChange();
          }}
        />
      )}
    </div>
  );

  if (!showHead) return body;

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title serif">便签墙</h2>
        <span className="section-note">记录这本小说的零碎想法与杂事 · 点便签可查看/编辑</span>
      </div>
      {body}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// 便签详情弹窗（查看 + 编辑 + 新建；支持文字/图片）
// ─────────────────────────────────────────────────────────────

function IdeaDialog({
  projectId,
  idea,
  onClose,
  onSaved,
}: {
  projectId: string;
  /** null = 新建 */
  idea: IdeaItem | null;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const [title, setTitle] = useState(idea?.title ?? '');
  const [bodyText, setBodyText] = useState('');
  const [image, setImage] = useState<string | null>(idea?.image ?? null);
  const [loading, setLoading] = useState(Boolean(idea));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 打开已有便签时加载全文
  useEffect(() => {
    if (!idea) return;
    let cancelled = false;
    void api
      .get<NoteDetail>(`/project/${projectId}/note/${idea.path.split('/').map(encodeURIComponent).join('/')}`)
      .then((n) => {
        if (cancelled) return;
        setTitle(n.title);
        // 正文去掉首个一级标题，只留内容
        setBodyText(stripTitleHeading(n.body));
        const img = n.frontmatter?.image;
        setImage(typeof img === 'string' ? img : null);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof ApiFailure ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, idea]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const uploadImage = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(bin);
      const r = await api.post<{ path: string }>(`/project/${projectId}/attach`, {
        data: b64,
        mime: file.type || 'image/png',
        name: title || 'img',
      });
      setImage(r.path);
    } catch (e) {
      setErr(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const t = title.trim();
    if (!t) {
      setErr('标题不能为空');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const content = buildBody(t, bodyText);
      if (idea) {
        // 更新已有
        await api.patch(`/project/${projectId}/note/${idea.path.split('/').map(encodeURIComponent).join('/')}`, {
          body: content,
          frontmatter: { image: image ?? null },
        });
      } else {
        // 新建
        await api.post(`/project/${projectId}/entry`, {
          title: t,
          type: '灵感',
          body: content,
          frontmatter: image ? { image } : undefined,
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiFailure ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="dialog idea-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="dialog-title serif">{idea ? '便签详情' : '新建便签'}</h2>

        {loading ? (
          <div className="idea-dialog-loading">加载中…</div>
        ) : (
          <>
            <label className="field">
              <span className="field-label">标题</span>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="一句话概括（如：主角身世的反转点子）"
                autoFocus
              />
            </label>

            <label className="field">
              <span className="field-label">内容</span>
              <textarea
                className="input textarea idea-dialog-textarea"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={8}
                placeholder="记下这条想法……"
              />
            </label>

            <div className="field">
              <span className="field-label">配图（可选）</span>
              {image ? (
                <div className="idea-dialog-img">
                  <img src={attachUrl(projectId, image)} alt="配图" />
                  <button className="text-btn" onClick={() => setImage(null)} disabled={busy}>
                    移除图片
                  </button>
                </div>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                  ＋ 上传图片
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(f);
                }}
              />
            </div>

            {err && <div className="idea-dialog-err">{err}</div>}

            <div className="dialog-foot">
              <button className="btn btn-quiet btn-md" onClick={onClose} disabled={busy}>
                取消
              </button>
              <button className="btn btn-primary btn-md" onClick={() => void save()} disabled={busy}>
                {busy ? '保存中…' : idea ? '保存' : '创建便签'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 去掉正文开头的「# 标题」行，返回纯内容（跳过前置空行，不依赖 title 精确匹配） */
function stripTitleHeading(body: string): string {
  const lines = body.split('\n');
  // 跳过开头空行
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  if (i < lines.length && /^#\s+/.test(lines[i]!)) {
    i++;
    // 再跳过标题后的空行
    while (i < lines.length && lines[i]!.trim() === '') i++;
    return lines.slice(i).join('\n');
  }
  return body.trim();
}

/** 拼回笔记正文：一级标题 + 空行 + 内容 */
function buildBody(title: string, content: string): string {
  return `# ${title}\n\n${content.trim()}\n`;
}

function IconEdit(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M11.2 2.6l2.2 2.2-8.2 8.2-3 .8.8-3z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M2.8 4.4h10.4M6 4.4V2.9h4v1.5M4.3 4.4l.7 8.9h6l.7-8.9"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
