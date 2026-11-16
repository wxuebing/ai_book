/**
 * 参照：一本小说的信息来源、典籍与现实依据。
 *
 * 放在便签墙下方，不单开导航；每本书各自一套。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure, type ReferenceItem } from './api';
import { Btn, Empty, ErrorBar, Loading, PlusMark } from './ui';
import { EntryDialog } from './pages/EntryDialog';

interface Props {
  projectId: string;
  onReload?: () => Promise<void>;
}

function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join('、');
  return '';
}

/** 关联字段存的是 [[双链]]；卡片上只显示可读名称 */
function relatedNames(v: unknown): string {
  return text(v)
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/[，,]/g, '、')
    .replace(/、{2,}/g, '、')
    .trim();
}

export function ReferenceSection({ projectId, onReload }: Props): React.ReactElement {
  const [items, setItems] = useState<ReferenceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<{ path: string; mode: 'detail' | 'edit' } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ references: ReferenceItem[] }>(`/project/${projectId}/references`);
      setItems(r.references);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : String(e));
      setItems([]);
    }
  }, [projectId]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ path: string }>(`/project/${projectId}/entry`, {
        title: '新参照',
        type: '_reference',
        folder: '10-参照',
        body: '# 新参照\n\n',
        frontmatter: {
          出处: '',
          作者: '',
          年代: '',
          原文: '',
          依据: '',
          关联: '',
        },
      });
      setDlg({ path: r.path, mode: 'edit' });
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const afterSave = async () => {
    setDlg(null);
    await load();
    await onReload?.();
  };

  return (
    <section className="reference-section">
      <div className="reference-head">
        <div>
          <h2 className="section-title serif">
            参照
            {items && <span className="section-count">{items.length}</span>}
          </h2>
          <p className="reference-sub">信息来源 · 典籍 · 现实依据</p>
        </div>
        <Btn variant="create" size="sm" icon={<PlusMark />} onClick={() => void create()} disabled={busy}>
          新增参照
        </Btn>
      </div>

      {error && <ErrorBar message={error} />}

      {items === null ? (
        <Loading rows={2} />
      ) : items.length === 0 ? (
        <Empty
          title="还没有参照"
          hint="写小说也需要参照物：书名、典籍原文、现实依据，都可以记在这里。"
          action={
            <Btn variant="create" icon={<PlusMark />} onClick={() => void create()} disabled={busy}>
              新增第一条参照
            </Btn>
          }
        />
      ) : (
        <div className="reference-grid">
          {items.map((it) => {
            const fm = it.frontmatter;
            const source = text(fm['出处']);
            const author = text(fm['作者']);
            const era = text(fm['年代']);
            const quote = text(fm['原文']);
            const basis = text(fm['依据']);
            const related = relatedNames(fm['关联']);
            const meta = [...new Set([source, author, era].filter(Boolean))].join(' · ');
            return (
              <article
                key={it.path}
                className="reference-card"
                role="button"
                tabIndex={0}
                onClick={() => setDlg({ path: it.path, mode: 'detail' })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setDlg({ path: it.path, mode: 'detail' });
                }}
              >
                <div className="reference-card-head">
                  <span className="reference-card-title serif ellipsis">{it.title}</span>
                  <button
                    className="reference-pen"
                    title="编辑参照"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDlg({ path: it.path, mode: 'edit' });
                    }}
                  >
                    编辑
                  </button>
                </div>
                <div className="reference-meta">
                  {meta || '未填出处'}
                </div>
                {quote && <blockquote className="reference-quote clamp-2">{quote}</blockquote>}
                {basis && <p className="reference-basis clamp-2">{basis}</p>}
                {related && <p className="reference-related">关联：{related}</p>}
              </article>
            );
          })}
        </div>
      )}

      {dlg && (
        <EntryDialog
          projectId={projectId}
          path={dlg.path}
          mode={dlg.mode}
          onClose={() => setDlg(null)}
          onSaved={() => void afterSave()}
        />
      )}
    </section>
  );
}
