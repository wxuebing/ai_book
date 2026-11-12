/**
 * 设置 → 普通编辑（docs/01 2.2 第 1 项）
 *
 * 基础编辑设置：新建笔记的默认行为、自动保存、编辑器宽度等。
 * 这一项是"设置里应该存在的普通编辑"，插在列表第一位。
 */

import React, { useEffect, useState } from 'react';
import { type LibraryResponse } from '../api';
import { Btn } from '../ui';
import { loadPrefs, savePrefs, type Prefs } from '../prefs';

export function PlainSettings({
  library,
  onReload,
}: {
  library: LibraryResponse | null;
  onReload: () => Promise<void>;
}): React.ReactElement {
  const [p, setP] = useState<Prefs>(loadPrefs);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    savePrefs(p);
  }, [p]);

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setP((prev) => ({ ...prev, [k]: v }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title serif">普通编辑</h1>
          <p className="page-sub">基础编辑行为。改动即时生效并保存在本机。</p>
        </div>
        {saved && <span className="settings-saved">已保存</span>}
      </header>

      <section className="section">
        <div className="setting-list">
          <Toggle
            label="新建笔记后自动打开"
            hint="新建条目后直接跳到该笔记"
            checked={p.autoOpen}
            onChange={(v) => set('autoOpen', v)}
          />
          <Toggle
            label="编辑时自动保存"
            hint="停止输入约 1.2 秒后自动提交；手动 Ctrl/Cmd+S 始终可用"
            checked={p.autoSave}
            onChange={(v) => set('autoSave', v)}
          />
          <div className="setting-row">
            <div className="setting-text">
              <span className="setting-label">正文最大宽度</span>
              <span className="setting-hint">阅读与写作区宽度，{p.editorWidth}px（560–1100）</span>
            </div>
            <input
              className="setting-range"
              type="range"
              min={560}
              max={1100}
              step={20}
              value={p.editorWidth}
              onChange={(e) => set('editorWidth', Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title serif">数据位置</h2>
        </div>
        <p className="section-desc">
          当前工作区：<code>{library?.root ?? '未设置'}</code>
        </p>
        <div className="page-actions">
          <Btn onClick={() => void onReload()}>重新扫描</Btn>
        </div>
      </section>
    </>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <span className="setting-label">{label}</span>
        <span className="setting-hint">{hint}</span>
      </div>
      <button
        className={`switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}
