/**
 * 路由分发（docs/01 第 7 章路由表）
 */

import React from 'react';
import type { RouteState } from './router';
import type { LibraryResponse, ToolItem } from './api';
import { LibraryList } from './pages/LibraryList';
import { LibraryDetail } from './pages/LibraryDetail';
import { ProjectHome } from './pages/ProjectHome';
import { ProjectSection } from './pages/ProjectSection';
import { NoteView } from './pages/NoteView';
import { ToolPage } from './pages/ToolPage';
import { SettingsPage } from './SettingsPage';
import { BottomPage } from './pages/BottomPage';
import { NoteWall } from './pages/NoteWall';
import { WritingPage } from './pages/WritingPage';
import { ProjectSubNav } from './ProjectSubNav';
import { NotFound } from './pages/NotFound';

interface Props {
  route: RouteState;
  library: LibraryResponse | null;
  tools: ToolItem[];
  onReload: () => Promise<void>;
  activeProjectId: string | null;
  onNewProject: () => void;
}

/** 项目库三级 id → 分区键 */
function sectionOf(id: string): string {
  switch (id) {
    case 'outline': return 'outline';
    case 'chapterOutline': return 'chapter-outline';
    case 'threads': return 'threads';
    case 'characters': return 'characters';
    case 'settings': return 'settings';
    case 'graph': return 'graph';
    default: return id;
  }
}

export function Page(props: Props): React.ReactElement {
  const { route } = props;
  const s = route.segments;

  // 单篇笔记：/project/note?path=...
  if (s[0] === 'project' && s[1] === 'note') {
    return <NoteView {...props} />;
  }

  switch (s[0]) {
    case undefined:
      return <LibraryList {...props} welcome />;

    case 'library':
      if (s.length === 1) return <LibraryList {...props} />;
      return <LibraryDetail {...props} projectId={s[1]!} tab={s[2] ?? 'info'} />;

    // 便签墙（导航栏一级）：跨书大面板，带小说下拉选择
    case 'ideas':
      return (
        <NoteWall
          library={props.library}
          defaultProjectId={props.activeProjectId}
          onReload={props.onReload}
        />
      );

    case 'project': {
      const projectId = (s.length === 1 ? props.activeProjectId : s[1]!) ?? '';
      // 选中的小说名（用于二级导航标题）
      const bookName = props.library?.projects.find((p) => p.id === projectId)?.name;
      // 当前分区（反推成 PROJECT_ENTRIES 的 id，用于高亮）；首页 = ''
      const rawSection = s.length >= 3 ? s[2]! : '';
      const activeEntry =
        rawSection === '' ? ''
        : rawSection === 'chapter-outline' ? 'chapterOutline'
        : rawSection;
      return (
        <div className="project-shell">
          {projectId && (
            <ProjectSubNav projectId={projectId} projectName={bookName} active={activeEntry} />
          )}
          <div className="project-content">
            {s.length === 1 ? (
              <ProjectHome {...props} projectId={props.activeProjectId} />
            ) : s.length >= 3 && sectionOf(rawSection) === 'manuscript' ? (
              <WritingPage projectId={projectId} onReload={props.onReload} />
            ) : s.length >= 3 ? (
              <ProjectSection
                projectId={projectId}
                section={sectionOf(rawSection)}
                type={s[3]}
                onReload={props.onReload}
              />
            ) : (
              <ProjectHome {...props} projectId={projectId} />
            )}
          </div>
        </div>
      );
    }

    // 设置（docs/01 第 2.2 节）—— 三栏：一级导航 | 二级导航栏 | 内容
    case 'settings':
    case 'tools': // 兼容旧链接
      return (
        <SettingsPage
          tab={s[1] ?? 'plain'}
          library={props.library}
          tools={props.tools}
          activeProjectId={props.activeProjectId}
          onReload={props.onReload}
        />
      );

    // 底部常驻：导入导出
    case 'bottom':
      return (
        <BottomPage
          tab={s[1] ?? 'io'}
          library={props.library}
          activeProjectId={props.activeProjectId}
        />
      );

    default:
      return <NotFound />;
  }
}
