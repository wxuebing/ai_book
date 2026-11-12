/**
 * 项目二级导航栏（选中某本小说后，在主导航右侧展开）
 *
 * 用户原话：「每个小说选择了之后……把三级目录给放到二级导航栏当中……
 *   就参考这个设置里面的这种二级导航来设置，导航栏当中再展出一个导航来
 *   就跟设置里面是什么样的然后它就是什么样，从第一排往下顺延」
 *
 * 结构：只在 /project/:id/* 下渲染，作为内容区左侧的竖排二级导航，
 *       7 项 = 大纲 / 灵感 / 章纲 / 线索 / 人物 / 设定 / 关系网。
 */

import React from 'react';
import { navigate } from './router';
import { PROJECT_ENTRIES, routeOfEntry } from './Nav';

interface Props {
  projectId: string;
  projectName?: string;
  /** 当前所在分区 id（outline / ideas / chapterOutline / threads / characters / settings / graph / ''=首页） */
  active: string;
}

export function ProjectSubNav({ projectId, projectName, active }: Props): React.ReactElement {
  return (
    <nav className="settings-subnav project-subnav" aria-label="小说二级导航">
      <div className="settings-subnav-title">{projectName ? `《${projectName}》` : '小说'}</div>
      {/* 首页（总览）入口 */}
      <button
        className={`settings-subnav-item ${active === '' ? 'is-active' : ''}`}
        onClick={() => navigate(`/project/${projectId}`)}
      >
        总览
      </button>
      {PROJECT_ENTRIES.map((e) => (
        <button
          key={e.id}
          className={`settings-subnav-item ${active === e.id ? 'is-active' : ''}`}
          onClick={() => navigate(`/project/${projectId}/${routeOfEntry(e.id)}`)}
          title={e.hint}
        >
          {e.label}
        </button>
      ))}
    </nav>
  );
}
