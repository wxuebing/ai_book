/**
 * 右下角常驻页：设置 / 导入导出
 *
 * docs/01 第 6.6 节：设置、导入导出放在右下角，不占工具库列表。
 */

import React, { useEffect, useState } from 'react';
import { Crumbs, Tag } from '../ui';
import type { LibraryResponse } from '../api';

interface Props {
  tab: string;
  library: LibraryResponse | null;
  activeProjectId: string | null;
}

export function BottomPage({ tab, library, activeProjectId }: Props): React.ReactElement {
  if (tab === 'io') return <IoPage library={library} activeProjectId={activeProjectId} />;
  return <SettingsPage />;
}

// ─────────────────────────────────────────────────────────────
// 设置
// ─────────────────────────────────────────────────────────────

function SettingsPage(): React.ReactElement {
  const [collapsedPref, setCollapsedPref] = useState(() => {
    try {
      return localStorage.getItem('loom:nav:collapsed') === '1';
    } catch {
      return false;
    }
  });

  const togglePref = () => {
    const next = !collapsedPref;
    setCollapsedPref(next);
    try {
      localStorage.setItem('loom:nav:collapsed', next ? '1' : '0');
      // 让导航立刻响应
      window.dispatchEvent(new Event('loom:navigate'));
    } catch {
      /* 忽略 */
    }
  };

  return (
    <div className="page">
      <Crumbs items={[{ label: '设置' }]} />
      <header className="page-head">
        <div>
          <h1 className="page-title serif">设置</h1>
          <p className="page-sub">偏好保存在本机浏览器与工作区，不依赖云端。</p>
        </div>
      </header>

      <section className="section">
        <h2 className="section-title serif">外观</h2>
        <dl className="kv">
          <div className="kv-row">
            <dt className="kv-key">导航默认收缩</dt>
            <dd className="kv-val">
              <button className={`switch ${collapsedPref ? 'is-on' : ''}`} onClick={togglePref}>
                <span className="switch-knob" />
              </button>
            </dd>
          </div>
          <div className="kv-row">
            <dt className="kv-key">配色</dt>
            <dd className="kv-val">
              <Tag>流云白 · 清潭蓝</Tag>
              <span className="text-mute" style={{ marginLeft: 8 }}>
                中国传统色体系，暂无切换项
              </span>
            </dd>
          </div>
          <div className="kv-row">
            <dt className="kv-key">细纹</dt>
            <dd className="kv-val">
              <span className="text-soft">云头纹 · 织线 · 水波纹 · 纸纤维 · 菱形回纹</span>
              <span className="text-mute" style={{ marginLeft: 8 }}>纯 CSS/SVG，零图片</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <h2 className="section-title serif">编辑器</h2>
        <dl className="kv">
          <div className="kv-row">
            <dt className="kv-key">编辑模式</dt>
            <dd className="kv-val">
              纯文本 textarea + 块渲染双模式
              <span className="text-mute" style={{ marginLeft: 8 }}>所见即所得编辑器在后续里程碑</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <h2 className="section-title serif">快捷键</h2>
        <dl className="kv">
          <div className="kv-row">
            <dt className="kv-key">搜索</dt>
            <dd className="kv-val mono">点品牌区放大镜</dd>
          </div>
          <div className="kv-row">
            <dt className="kv-key">关闭弹层</dt>
            <dd className="kv-val mono">Esc</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 导入导出
// ─────────────────────────────────────────────────────────────

function IoPage({
  library,
  activeProjectId,
}: {
  library: LibraryResponse | null;
  activeProjectId: string | null;
}): React.ReactElement {
  const projects = library?.projects ?? [];
  const [pid, setPid] = useState(activeProjectId ?? projects[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pid && projects.length > 0) setPid(activeProjectId ?? projects[0]!.id);
  }, [pid, projects, activeProjectId]);

  const selected = projects.find((p) => p.id === pid) ?? null;

  const download = async () => {
    if (!pid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/project/${encodeURIComponent(pid)}/export`);
      if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`);
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') ?? '';
      const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const name = m ? decodeURIComponent(m[1]!) : 'book.md';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-read">
      <Crumbs items={[{ label: '导入导出' }]} />
      <header className="page-head">
        <div>
          <h1 className="page-title serif">导入 / 导出</h1>
          <p className="page-sub">
            数据本来就在磁盘上 —— 每本书就是一个标准 Obsidian 库，直接拷贝文件夹即可备份。
          </p>
        </div>
      </header>

      {error && <p className="setting-hint" style={{ color: 'var(--danger, #b4483c)' }}>{error}</p>}

      <section className="section">
        <h2 className="section-title serif">导出</h2>
        <p className="section-desc">
          每本书都是纯 <code>.md</code> 文件，没有私有格式。导出为单文件适合投稿、备份或发给别人阅读；
          保留目录结构请直接复制文件夹。
        </p>
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">选择小说</span>
            <span className="setting-hint">
              {selected ? `${selected.notes} 篇笔记 · ${selected.words.toLocaleString('zh-CN')} 字` : '还没有小说'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="select"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              disabled={projects.length === 0}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>《{p.name}》</option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => void download()} disabled={!pid || busy}>
              {busy ? '导出中…' : '下载整本 Markdown'}
            </button>
          </div>
        </div>
        <dl className="kv">
          <div className="kv-row">
            <dt className="kv-key">目录位置</dt>
            <dd className="kv-val mono">&lt;工作区&gt;/小说/&lt;书名&gt;/</dd>
          </div>
          <div className="kv-row">
            <dt className="kv-key">可忽略</dt>
            <dd className="kv-val mono">.loom/（索引，可重建）</dd>
          </div>
          <div className="kv-row">
            <dt className="kv-key">Obsidian</dt>
            <dd className="kv-val">直接用 Obsidian 打开该书目录即可看到完整内容与原生关系图</dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <h2 className="section-title serif">导入</h2>
        <p className="section-desc">
          把已有的 Obsidian 库（或任意 Markdown 目录）放进 <code>小说/</code> 下，
          系统会为它补一个 <code>.project.json</code> 并自动索引。
        </p>
        <dl className="kv">
          <div className="kv-row">
            <dt className="kv-key">支持</dt>
            <dd className="kv-val">任意 <code>.md</code> 目录、Obsidian vault、带 frontmatter 的笔记</dd>
          </div>
          <div className="kv-row">
            <dt className="kv-key">忽略</dt>
            <dd className="kv-val mono">.obsidian / .git / .trash / node_modules</dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <h2 className="section-title serif">备份</h2>
        <p className="section-desc">
          工作区就是普通文件夹。用 Git 管理最稳妥 —— 每次改动都能回滚，比任何内置版本历史都可靠。
        </p>
        <pre className="code-block">{`cd <工作区>
git init
git add .
git commit -m "写作进度"`}</pre>
      </section>
    </div>
  );
}
