/**
 * 背景场景渲染器
 *
 * ── 2026-11-16 第三轮：每套主题一个场景 ──────────────────────────
 * 用户原话：「更改的那些画面还是没换，都是山竹子还有太阳，主题都做好」
 *          「现在的背景主题就是简单的换颜色，但是图片场景没变，这不是主题，
 *            主题是换一系列的事，手机主题你该知道吧？一个主题包含的内容是很多的。」
 *
 * 第一版：同一幅山川溪竹，六套主题只换颜色 → 那是一套主题的六个色号，不是六套主题。
 * 第二版（本版）：按 theme 分发到不同场景组件，元素组合完全不同。
 *
 *   云岫墨韵 → MountainsScene   山川 · 溪流 · 修竹 · 飞鸟
 *   青绿山水 → RiversScene      层峦 · 江面 · 帆影 · 云带
 *   烟雨江南 → RainTownScene    雨丝 · 石拱桥 · 白墙黑瓦 · 垂柳
 *   朱砂笺   → SealPaperScene   笺纸竖纹 · 朱印 · 梅枝 · 落雪
 *   月白霜天 → SnowMoonScene    雪山 · 满月 · 松枝 · 寒星
 *   竹影清风 → BambooGroveScene 密竹林 · 太湖石 · 竹影投墙
 *
 * 所有场景共用 SceneDefs 里的滤镜与渐变，颜色只取 --scene-* 变量，
 * 所以换主题既换"画什么"，也换"什么色"。
 */

import React from 'react';
import { SceneDefs, type SceneId } from './scenes/SceneDefs';
import { MountainsScene } from './scenes/MountainsScene';
import { RiversScene } from './scenes/RiversScene';
import { RainTownScene } from './scenes/RainTownScene';
import { SealPaperScene } from './scenes/SealPaperScene';
import { SnowMoonScene } from './scenes/SnowMoonScene';
import { BambooGroveScene } from './scenes/BambooGroveScene';

/** 主题 id → 场景 id */
export const THEME_SCENE: Record<string, SceneId> = {
  moyun: 'mountains',
  qinglv: 'rivers',
  yanyu: 'rainTown',
  zhusha: 'sealPaper',
  yuebai: 'snowMoon',
  zhuying: 'bambooGrove',
};

function renderScene(id: SceneId): React.ReactElement {
  switch (id) {
    case 'rivers':
      return <RiversScene />;
    case 'rainTown':
      return <RainTownScene />;
    case 'sealPaper':
      return <SealPaperScene />;
    case 'snowMoon':
      return <SnowMoonScene />;
    case 'bambooGrove':
      return <BambooGroveScene />;
    case 'mountains':
    default:
      return <MountainsScene />;
  }
}

export function Backdrop(): React.ReactElement {
  // 读当前主题；theme.ts 的 applyTheme 已把 id 写到 html[data-theme]
  // 用 state 保证换主题时重渲染（监听 data-theme 变化）
  const [themeId, setThemeId] = React.useState<string>(() => {
    if (typeof document === 'undefined') return 'moyun';
    return document.documentElement.dataset.theme ?? 'moyun';
  });

  React.useEffect(() => {
    const el = document.documentElement;
    const sync = (): void => setThemeId(el.dataset.theme ?? 'moyun');
    sync();
    const ob = new MutationObserver(sync);
    ob.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => ob.disconnect();
  }, []);

  const scene = THEME_SCENE[themeId] ?? 'mountains';

  return (
    <div className="app-scene" aria-hidden="true" data-scene={scene}>
      <svg
        className="app-scene-svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <SceneDefs />
        </defs>
        {/* key 变化时强制重建，避免不同场景的 mask/filter id 冲突残留 */}
        <g key={scene}>{renderScene(scene)}</g>
      </svg>
    </div>
  );
}
