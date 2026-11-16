/**
 * 小说切换器：便签墙 / 剧情 / 关系网 共用的右上角下拉。
 */

import React, { useEffect, useState } from 'react';
import type { ProjectSummary } from './api';

interface Props {
  projects: ProjectSummary[];
  value: string | null;
  onChange: (id: string) => void;
}

export function BookSwitch({ projects, value, onChange }: Props): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const current = projects.find((p) => p.id === value) ?? projects[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (projects.length === 0) return null;

  return (
    <div className="book-switch" ref={ref}>
      <button
        className="book-switch-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="选择小说"
      >
        <span className="ellipsis">《{current?.name ?? '选择小说'}》</span>
        <span className="book-switch-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div className="book-switch-backdrop" onClick={() => setOpen(false)} />
          <ul className="book-switch-menu" role="listbox">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  className={`book-switch-item ${p.id === value ? 'is-active' : ''}`}
                  role="option"
                  aria-selected={p.id === value}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <span className="ellipsis">《{p.name}》</span>
                  <span className="book-switch-meta">{p.notes} 篇</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
