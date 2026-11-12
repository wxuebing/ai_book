/**
 * 条目（设定）详情 / 编辑弹窗
 *
 * 用户原话（多轮强调）：
 *   「点笔图标是操对这东西进行编辑的」
 *   「不要把 order / parent / scope 这些英文技术字段给普通用户看，看不懂也别让人改」
 *   「设定可以加字段，但不能展示英文/代码内容」
 *   「增删改 —— 每个设定要能改也能删，怎么老是不加删除按钮」
 *
 * 所以：
 *   - 技术性 frontmatter 字段（纯英文名的，如 order/parent/scope/paths/relations/type…）
 *     一律【隐藏不展示】，保存时【原样保留】，避免破坏引擎数据
 *   - 只展示用户自己写的中文字段 + 正文内容
 *   - 详情 / 编辑两种模式；编辑可增删自定义字段、改名称与正文
 *   - 两种模式都有【删除】按钮（带确认）
 */

import React, { useEffect, useState } from 'react';
import { api, ApiFailure, type NoteDetail } from '../api';

/** 纯英文/下划线命名的键视为技术字段：隐藏且保存时保留 */
function isTechnicalKey(k: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(k);
}

interface FieldRow {
  key: string;
  value: string;
}

interface Props {
  projectId: string;
  path: string;
  mode: 'detail' | 'edit';
  onClose: () => void;
  /** 保存/删除成功后回调；deleted 表示是删除 */
  onSaved: (deleted?: boolean) => void;
}

/** 把值格式化成可读文本（只用于非技术字段，通常是短字符串） */
function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? '' : String(x))).filter(Boolean).join('；');
  return '';
}

/** 去掉正文开头的「# 标题」行 */
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

export function EntryDialog({ projectId, path, mode, onClose, onSaved }: Props): React.ReactElement {
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [typeLabel, setTypeLabel] = useState<string | null>(null);
  const [editing, setEditing] = useState(mode === 'edit');
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api
      .get<NoteDetail>(`/project/${projectId}/note/${path.split('/').map(encodeURIComponent).join('/')}`)
      .then((n) => {
        if (cancelled) return;
        setRaw(n.frontmatter as Record<string, unknown>);
        setTypeLabel(typeof n.frontmatter?.type === 'string' ? (n.frontmatter.type as string) : n.type);
        setTitle(n.title);
        setBodyText(stripHeading(n.body));
        const rows: FieldRow[] = Object.entries(n.frontmatter)
          .filter(([k]) => !isTechnicalKey(k))
          .map(([k, v]) => ({ key: k, value: fmtValue(v) }));
        setFields(rows);
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
  }, [projectId, path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    const t = title.trim();
    if (!t) {
      setErr('名称不能为空');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // 保留全部技术字段，覆盖标题与用户自定义字段
      const fm: Record<string, unknown> = { ...raw, title: t };
      // 先删除旧的非技术字段（用户可能删掉了某些），再写入当前的
      for (const k of Object.keys(raw)) {
        if (!isTechnicalKey(k)) delete fm[k];
      }
      for (const row of fields) {
        const k = row.key.trim();
        if (!k) continue;
        fm[k] = row.value;
      }
      const body = `# ${t}\n\n${bodyText.trim()}\n`;
      await api.patch(`/project/${projectId}/note/${path.split('/').map(encodeURIComponent).join('/')}`, {
        body,
        frontmatter: fm,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiFailure ? e.message : String(e));
      setBusy(false);
    }
  };

  const del = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.del(`/project/${projectId}/note/${path.split('/').map(encodeURIComponent).join('/')}`);
      onSaved(true);
    } catch (e) {
      setErr(e instanceof ApiFailure ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="dialog entry-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {loading ? (
          <div className="entry-dialog-loading">加载中…</div>
        ) : err && !title ? (
          <div className="entry-dialog-err">{err}</div>
        ) : editing ? (
          <>
            <h2 className="dialog-title serif">编辑设定</h2>
            <label className="field">
              <span className="field-label">名称</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>

            <div className="field">
              <span className="field-label">补充信息</span>
              <div className="entry-fields-edit">
                {fields.map((row, i) => (
                  <div className="entry-field-row" key={i}>
                    <input
                      className="input entry-field-key"
                      placeholder="项目（如 性格 / 背景 / 年龄）"
                      value={row.key}
                      onChange={(e) => {
                        const next = [...fields];
                        next[i] = { ...next[i]!, key: e.target.value };
                        setFields(next);
                      }}
                    />
                    <input
                      className="input entry-field-val"
                      placeholder="内容"
                      value={row.value}
                      onChange={(e) => {
                        const next = [...fields];
                        next[i] = { ...next[i]!, value: e.target.value };
                        setFields(next);
                      }}
                    />
                    <button className="entry-field-del" title="删除这项" onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={() => setFields([...fields, { key: '', value: '' }])}>
                  ＋ 添加
                </button>
              </div>
            </div>

            <label className="field">
              <span className="field-label">正文内容</span>
              <textarea
                className="input textarea entry-dialog-textarea"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={8}
              />
            </label>

            {err && <div className="entry-dialog-err">{err}</div>}

            <div className="dialog-foot entry-dialog-foot">
              <div className="entry-dialog-foot-left">
                {confirmDel ? (
                  <span className="entry-del-confirm">
                    <span className="entry-del-text">确定删除这个设定？</span>
                    <button className="btn btn-danger btn-sm" onClick={() => void del()} disabled={busy}>
                      {busy ? '删除中…' : '确定'}
                    </button>
                    <button className="btn btn-cancel-danger btn-sm" onClick={() => setConfirmDel(false)} disabled={busy}>
                      取消
                    </button>
                  </span>
                ) : (
                  <button className="btn btn-danger-quiet btn-sm" onClick={() => setConfirmDel(true)} disabled={busy}>
                    删除这个设定
                  </button>
                )}
              </div>
              <div className="entry-dialog-foot-right">
                <button className="btn btn-quiet btn-md" onClick={onClose} disabled={busy}>
                  取消
                </button>
                <button className="btn btn-primary btn-md" onClick={() => void save()} disabled={busy}>
                  {busy ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="entry-detail-head">
              <h2 className="dialog-title serif">{title}</h2>
              <button className="entry-edit-pen" title="编辑这个设定" onClick={() => setEditing(true)}>
                <PenIcon />
              </button>
            </div>
            {typeLabel && <span className="entry-detail-type">{typeLabel}</span>}

            {fields.length > 0 && (
              <dl className="entry-detail-fields">
                {fields.map((row, i) => (
                  <div className="entry-detail-field" key={i}>
                    <dt>{row.key}</dt>
                    <dd>{row.value || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="entry-detail-body">{bodyText || '（暂无正文）'}</div>

            <div className="dialog-foot">
              <button className="btn btn-quiet btn-md" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PenIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M11.2 2.6l2.2 2.2-8.2 8.2-3 .8.8-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
