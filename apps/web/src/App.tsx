/**
 * 应用外壳：背景 + 导航 + 主画面
 *
 * 布局（docs/01 第 8 章）：
 *   左侧导航栏 —— 只放骨架：三大库 + 二级 + 三级
 *   右侧主画面 —— 全部细节
 */

import React, { useEffect, useState, useCallback } from 'react';
import { api, ApiFailure, type LibraryResponse, type ToolItem } from './api';
import { useRoute } from './router';
import { Nav, type NavSelection } from './Nav';
import { Page } from './Page';
import { CreateProjectDialog } from './pages/CreateProjectDialog';

const SELECTION_KEY = 'loom:nav:selection';

export function App(): React.ReactElement {
  const route = useRoute();
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selection, setSelection] = useState<NavSelection>(() => {
    try {
      const raw = localStorage.getItem(SELECTION_KEY);
      return raw ? (JSON.parse(raw) as NavSelection) : { root: 'library' };
    } catch {
      return { root: 'library' };
    }
  });

  const reload = useCallback(async () => {
    try {
      const [lib, toolData] = await Promise.all([
        api.get<LibraryResponse>('/library'),
        api.get<{ items: ToolItem[] }>('/tools'),
      ]);
      setLibrary(lib);
      setTools(toolData.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
    } catch {
      /* 忽略 */
    }
  }, [selection]);

  /** 根据路由反推导航选中态 */
  useEffect(() => {
    const s = route.segments;
    if (s[0] === 'library') {
      setSelection({ root: 'library', secondary: s[1], tertiary: s[2] });
    } else if (s[0] === 'ideas') {
      setSelection({ root: 'ideas' });
    } else if (s[0] === 'project') {
      setSelection({ root: 'project', secondary: s[1], tertiary: s[2] });
    } else if (s[0] === 'tools') {
      setSelection({ root: 'tools', secondary: s[1] });
    } else if (s[0] === 'bottom') {
      setSelection({ root: 'bottom', secondary: s[1] });
    }
  }, [route.path]);

  /** SSE：笔记变更后 300ms 防抖刷新（docs/03 6.3） */
  useEffect(() => {
    let timer: number | null = null;
    const es = new EventSource('/api/events');
    const debounced = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void reload();
      }, 300);
    };
    es.addEventListener('change', debounced);
    es.addEventListener('reindex', debounced);
    es.addEventListener('project-created', debounced);
    es.onerror = () => {
      /* 断线由浏览器自动重连 */
    };
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      es.close();
    };
  }, [reload]);

  const activeProjectId = library?.active ?? null;

  if (error) {
    return (
      <div className="app">
        <div className="app-bg" aria-hidden="true" />
        <div className="app-texture" aria-hidden="true" />
        <div className="app-error">
          <h1 className="serif">连不上工作台</h1>
          <p className="text-soft">{error}</p>
          <p className="text-mute">确认服务已启动：<code>node apps/server/src/main.ts</code></p>
          <button className="btn btn-primary" onClick={() => void reload()}>重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-bg" aria-hidden="true" />
      <div className="app-texture" aria-hidden="true" />

      <div className="app-shell">
        <Nav
          library={library}
          tools={tools}
          selection={selection}
          onSelect={setSelection}
          activeProjectId={activeProjectId}
          onNewProject={() => setCreating(true)}
          onReload={reload}
        />

        <main className="main" id="main">
          <Page
            route={route}
            library={library}
            tools={tools}
            onReload={reload}
            activeProjectId={activeProjectId}
            onNewProject={() => setCreating(true)}
          />
        </main>
      </div>

      {creating && (
        <CreateProjectDialog
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            await reload();
            window.history.pushState({}, '', `/project/${id}`);
            window.dispatchEvent(new Event('loom:navigate'));
          }}
        />
      )}
    </div>
  );
}
