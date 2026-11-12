/**
 * 新建小说弹窗（书名 + 简介 + 素材包多选）
 *
 * 从 LibraryList 抽出为独立组件：导航栏的加号也要能唤起它。
 */

import React, { useEffect, useState } from 'react';
import { api, ApiFailure, type PackInfo } from '../api';
import { Btn, ErrorBar, PlusMark } from '../ui';

interface Props {
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}

export function CreateProjectDialog({ onClose, onCreated }: Props): React.ReactElement {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [packs, setPacks] = useState<string[]>([]);
  const [available, setAvailable] = useState<PackInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ packs: PackInfo[] }>('/library/packs')
      .then((d) => setAvailable(d.packs))
      .catch(() => setAvailable([]));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (name.trim() === '') {
      setError('书名不能为空');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ id: string }>('/library', {
        name: name.trim(),
        description: description.trim(),
        packs,
      });
      await onCreated(r.id);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
      setBusy(false);
    }
  };

  const togglePack = (id: string) => {
    setPacks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
      >
        <h2 id="create-title" className="dialog-title serif">新建小说</h2>
        <p className="dialog-sub">
          会创建一个标准的 Obsidian 库：八个标准目录 + 项目元信息。之后可用 Obsidian 直接打开。
        </p>

        <label className="field">
          <span className="field-label">书名</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：归墟纪"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </label>

        <label className="field">
          <span className="field-label">简介（可空）</span>
          <textarea
            className="input textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="一句话说清这本书讲什么"
            rows={2}
          />
        </label>

        <div className="field">
          <span className="field-label">
            素材包（可多选，可一个都不选）
            <span className="field-hint">只是初始笔记，随时可改可删，不限制创新</span>
          </span>
          <div className="pack-grid">
            {available.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pack ${packs.includes(p.id) ? 'is-on' : ''}`}
                onClick={() => togglePack(p.id)}
                title={p.types.length ? p.types.join('、') : '不装任何类型'}
              >
                <span className="pack-label">{p.label}</span>
                <span className="pack-desc">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorBar message={error} />}

        <div className="dialog-foot">
          <Btn variant="quiet" onClick={onClose} disabled={busy}>取消</Btn>
          <Btn variant="create" icon={<PlusMark />} onClick={() => void submit()} disabled={busy}>
            {busy ? '创建中…' : '创建小说'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
