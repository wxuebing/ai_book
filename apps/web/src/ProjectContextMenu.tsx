/**
 * 项目右键菜单（docs/01 第 3.5 节）
 *
 * 用户原话：「项目库的每一个项目都可以右击以改变详情，详情就是名称一类的，
 *   还可以归档项目（本代码项目可以归档一级直接删除，但删除在回收站中，可以恢复归档）」
 *
 * 右键书 → 弹出菜单：改详情 / 归档 / 删除。
 * 归档 = 软删除（可恢复）；删除 = 移回收站（终态）。
 */

import React, { useEffect, useRef, useState } from 'react';
import { api, ApiFailure, type ProjectSummary } from './api';
import { Btn, ErrorBar } from './ui';

interface Props {
  project: ProjectSummary;
  x: number;
  y: number;
  onClose: () => void;
  onReload: () => Promise<void>;
}

export function ProjectContextMenu({
  project,
  x,
  y,
  onClose,
  onReload,
}: Props): React.ReactElement {
  const [mode, setMode] = useState<'menu' | 'edit' | 'archive' | 'delete'>('menu');
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // 点外部 / Esc 关闭
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // 延迟挂载，避免触发菜单的那次右键立刻关掉它
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const saveEdit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/library/${project.id}`, { name: name.trim(), description });
      await onReload();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doArchive = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/library/${project.id}/archive`);
      await onReload();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.del(`/library/${project.id}`);
      await onReload();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiFailure ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // 防止菜单超出视口
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 300),
    top: Math.min(y, window.innerHeight - 280),
    zIndex: 90,
  };

  return (
    <div className="ctx-menu" style={style} ref={ref} role="menu">
      {mode === 'menu' && (
        <>
          <div className="ctx-title ellipsis" title={project.name}>
            《{project.name}》
          </div>
          <button className="ctx-item" onClick={() => setMode('edit')} role="menuitem">
            修改详情
          </button>
          <button className="ctx-item" onClick={() => setMode('archive')} role="menuitem">
            归档项目
          </button>
          <div className="ctx-sep" />
          <button
            className="ctx-item is-danger"
            onClick={() => setMode('delete')}
            role="menuitem"
          >
            删除项目
          </button>
        </>
      )}

      {mode === 'edit' && (
        <div className="ctx-form">
          <div className="ctx-title">修改详情</div>
          <label className="ctx-field">
            <span>书名</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveEdit();
              }}
            />
          </label>
          <label className="ctx-field">
            <span>简介</span>
            <textarea
              className="input textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </label>
          {err && <ErrorBar message={err} />}
          <div className="ctx-actions">
            <Btn size="sm" variant="quiet" onClick={() => setMode('menu')} disabled={busy}>
              返回
            </Btn>
            <Btn size="sm" variant="primary" onClick={() => void saveEdit()} disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </Btn>
          </div>
        </div>
      )}

      {mode === 'archive' && (
        <div className="ctx-form">
          <div className="ctx-title">归档《{project.name}》？</div>
          <p className="ctx-desc">
            归档后会从小说库列表消失，移到 <code>.trash/</code> 并记录归档信息。
            <strong>可以随时恢复</strong>，数据不会丢。
          </p>
          {err && <ErrorBar message={err} />}
          <div className="ctx-actions">
            <Btn size="sm" variant="quiet" onClick={() => setMode('menu')} disabled={busy}>
              返回
            </Btn>
            <Btn size="sm" variant="primary" onClick={() => void doArchive()} disabled={busy}>
              {busy ? '归档中…' : '确认归档'}
            </Btn>
          </div>
        </div>
      )}

      {mode === 'delete' && (
        <div className="ctx-form">
          <div className="ctx-title is-danger">删除《{project.name}》？</div>
          <p className="ctx-desc">
            删除会把整本书移到 <code>.trash/</code>，<strong>不会真删</strong>，可手工找回。
            但它不会出现在「已归档」列表里 —— 想保留恢复入口请用「归档」。
          </p>
          {err && <ErrorBar message={err} />}
          <div className="ctx-actions">
            <Btn size="sm" variant="quiet" onClick={() => setMode('menu')} disabled={busy}>
              返回
            </Btn>
            <Btn size="sm" variant="danger" onClick={() => void doDelete()} disabled={busy}>
              {busy ? '删除中…' : '确认删除'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
