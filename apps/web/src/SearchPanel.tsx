/**
 * 全局搜索面板（品牌区放大镜唤出）
 *
 * docs/01 第 6.5 节：全局搜索不占导航位，放在流云织右边做图标。
 * 支持 Cmd/Ctrl+K 唤出，Esc 关闭。
 */

import React, { useEffect, useRef, useState } from 'react';
import { api, ApiFailure, type LibraryResponse, type SearchHit } from './api';
import { navigate } from './router';

interface Props {
  onClose: () => void;
}

export function SearchPanel({ onClose }: Props): React.ReactElement {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    void api
      .get<LibraryResponse>('/library')
      .then((d) => setActiveProjectId(d.active))
      .catch(() => setActiveProjectId(null));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 输入防抖搜索
  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const term = q.trim();
    if (term === '' || !activeProjectId) {
      setHits([]);
      setError(null);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setBusy(true);
      void api
        .get<{ hits: SearchHit[] }>(
          `/project/${activeProjectId}/search?q=${encodeURIComponent(term)}&limit=40`,
        )
        .then((r) => {
          setHits(r.hits);
          setError(null);
        })
        .catch((err) => setError(err instanceof ApiFailure ? err.message : String(err)))
        .finally(() => setBusy(false));
    }, 220);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [q, activeProjectId]);

  const open = (path: string) => {
    onClose();
    navigate(`/project/note?path=${encodeURIComponent(path)}`);
  };

  return (
    <div className="overlay overlay-top" onClick={onClose} role="presentation">
      <div
        className="search-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
      >
        <div className="search-panel-head">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.3" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.2 10.2L13.6 13.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="search-panel-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜设定、人物、伏笔…（Esc 关闭）"
            spellCheck={false}
          />
          {busy && <span className="search-panel-busy">搜索中…</span>}
        </div>

        {error && <div className="search-panel-error">{error}</div>}

        {!activeProjectId ? (
          <div className="search-panel-hint">先选一本小说，再搜索。</div>
        ) : q.trim() === '' ? (
          <div className="search-panel-hint">
            输入关键词。命中标题优先，支持中文。写新章节前用它查「这个设定之前怎么写的」。
          </div>
        ) : hits.length === 0 && !busy ? (
          <div className="search-panel-hint">没有笔记包含「{q.trim()}」。</div>
        ) : (
          <ul className="search-panel-list">
            {hits.map((h) => (
              <li key={h.path}>
                <button className="search-panel-item" onClick={() => open(h.path)}>
                  <span className="search-panel-item-head">
                    <span className="search-panel-item-title serif">{h.title}</span>
                    {h.type && <span className="tag">{h.type}</span>}
                  </span>
                  <span className="search-panel-item-excerpt clamp-2">{h.excerpt}</span>
                  <span className="search-panel-item-path mono">{h.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
