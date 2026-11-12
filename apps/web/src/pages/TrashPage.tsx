/**
 * 设置 → 回收站（docs/01 2.2 第 6 项）
 *
 * 从底部工具条移入设置。列出已归档的小说，可恢复。
 */

import React, { useEffect, useState } from 'react';
import { api, ApiFailure } from '../api';
import { Btn, Empty, ErrorBar, Loading } from '../ui';

interface ArchivedItem {
  id: string;
  name: string;
  dirName: string;
  description: string;
  archivedAt: string;
}

export function TrashPage({ onReload }: { onReload: () => Promise<void> }): React.ReactElement {
  const [items, setItems] = useState<ArchivedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const d = await api.get<{ archived: ArchivedItem[] }>('/library/archived');
      setItems(d.archived);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : String(e));
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (id: string) => {
    setBusy(id);
    try {
      await api.post(`/library/archived/${id}/restore`);
      await load();
      await onReload();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const purge = async (id: string, name: string) => {
    if (!window.confirm(`彻底删除《${name}》？此操作不可恢复。`)) return;
    setBusy(id);
    try {
      await api.del(`/library/archived/${id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const purgeAll = async () => {
    if (!items || items.length === 0) return;
    if (!window.confirm(`清空回收站：彻底删除全部 ${items.length} 本归档小说？此操作不可恢复。`)) return;
    setBusy('__all__');
    try {
      await api.post('/library/archived/purge-all');
      await load();
      await onReload();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title serif">回收站</h1>
          <p className="page-sub">归档的小说在这里，可以恢复或彻底清除。恢复后回到工作区。</p>
        </div>
        {items && items.length > 0 && (
          <div className="page-actions">
            <Btn
              variant="danger"
              onClick={() => void purgeAll()}
              disabled={busy === '__all__'}
            >
              {busy === '__all__' ? '清除中…' : '全部清除'}
            </Btn>
          </div>
        )}
      </header>

      {error && <ErrorBar message={error} />}

      {items === null ? (
        <Loading rows={4} />
      ) : items.length === 0 ? (
        <Empty title="回收站是空的" hint="在工作区右键一本小说 → 归档项目，就会出现在这里。" />
      ) : (
        <div className="tool-list">
          {items.map((it) => (
            <div key={it.id} className="tool-item">
              <div className="tool-item-head">
                <span className="tool-title">《{it.name}》</span>
                <span className="text-mute">{formatWhen(it.archivedAt)}</span>
              </div>
              <p className="tool-desc">{it.description || '没有简介'}</p>
              <div className="page-actions">
                <Btn
                  size="sm"
                  variant="primary"
                  onClick={() => void restore(it.id)}
                  disabled={busy === it.id}
                >
                  {busy === it.id ? '恢复中…' : '恢复'}
                </Btn>
                <Btn
                  size="sm"
                  variant="danger"
                  onClick={() => void purge(it.id, it.name)}
                  disabled={busy === it.id}
                >
                  彻底删除
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚归档';
    if (min < 60) return `${min} 分钟前归档`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} 小时前归档`;
    return `${Math.floor(h / 24)} 天前归档`;
  } catch {
    return '已归档';
  }
}
