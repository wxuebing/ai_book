/**
 * 主题场景库
 *
 * ── 为什么要有这个文件（2026-11-16）────────────────────────────
 * 用户原话：「更改的那些画面还是没换，都是山竹子还有太阳，主题都做好」
 *          「现在的背景主题就是简单的换颜色，但是图片场景没变，这不是主题，
 *            主题是换一系列的事，手机主题你该知道吧？一个主题包含的内容是很多的。」
 *
 * 原问题：Backdrop 是**同一幅**山川溪竹日月，六套主题只是给它换了颜色。
 * 那不是六套主题，那是一套主题的六个色号。
 *
 * 现在：每套主题有自己的**场景**，元素组合完全不同 ——
 *   云岫墨韵 → 山川溪竹 + 飞鸟（水墨山水）
 *   青绿山水 → 层峦 + 江面帆影 + 云带（千里江山图）
 *   烟雨江南 → 雨丝 + 石拱桥 + 白墙黑瓦 + 垂柳
 *   朱砂笺   → 笺纸竖纹 + 朱印 + 梅枝 + 落雪
 *   月白霜天 → 雪山棱线 + 满月 + 松枝 + 寒星
 *   竹影清风 → 密竹林 + 石 + 竹影投墙
 *
 * 共同约束：颜色只取 --scene-* 变量，零图片资源，纯内联 SVG。
 */

import React from 'react';

/** 场景标识 */
export type SceneId =
  | 'mountains' // 云岫墨韵：山川溪竹
  | 'rivers' // 青绿山水：层峦江帆
  | 'rainTown' // 烟雨江南：雨桥白墙
  | 'sealPaper' // 朱砂笺：笺纹朱印梅
  | 'snowMoon' // 月白霜天：雪山满月松
  | 'bambooGrove'; // 竹影清风：密竹林

/* ═══════════════════════════════════════════════════════════
   共用工具
   ═══════════════════════════════════════════════════════════ */

/** 确定性伪随机 */
function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 山脊线生成器
 * 主峰高、次峰低、峰顶倒圆、间距不等 —— 手写折线会变锯齿，手写曲线会变均匀波浪
 */
export function makeRidge(opts: {
  seed: number;
  width: number;
  baseY: number;
  majors: number;
  height: number;
  /** 峰顶倒圆半径基数 */
  round?: number;
}): string {
  const { seed, width, baseY, majors, height, round = 13 } = opts;
  const r = rnd(seed);
  const peaks: Array<{ x: number; y: number; rr: number }> = [];
  const step = width / (majors * 2 - 1);

  for (let i = 0; i < majors * 2 - 1; i++) {
    const isMajor = i % 2 === 0;
    const jitter = (r() - 0.5) * step * 0.44;
    const x = i * step + jitter + step * 0.5;
    const hFactor = isMajor ? 0.72 + r() * 0.28 : 0.34 + r() * 0.22;
    peaks.push({ x, y: baseY - height * hFactor, rr: round * (0.7 + r() * 0.7) });
  }

  let d = `M0 ${baseY}`;
  let prevX = 0;
  let prevY = baseY - height * 0.18;

  for (const pk of peaks) {
    const midX = (prevX + pk.x) / 2;
    const bulge = (r() - 0.5) * 22;
    const ctrlY = (prevY + pk.y) / 2 + bulge;
    d += ` Q ${midX.toFixed(1)} ${ctrlY.toFixed(1)} ${(pk.x - pk.rr).toFixed(1)} ${pk.y.toFixed(1)}`;
    d += ` Q ${pk.x.toFixed(1)} ${(pk.y - pk.rr * 0.42).toFixed(1)} ${(pk.x + pk.rr).toFixed(1)} ${pk.y.toFixed(1)}`;
    prevX = pk.x + pk.rr;
    prevY = pk.y;
  }
  d += ` Q ${(prevX + width) / 2} ${(prevY + baseY) / 2 + 14} ${width} ${baseY - height * 0.12}`;
  d += ` L ${width} 900 L 0 900 Z`;
  return d;
}

/* ═══════════════════════════════════════════════════════════
   共用 defs：噪声 / 渐变 / 模糊
   所有场景共享，避免每个场景重复定义
   ═══════════════════════════════════════════════════════════ */
export function SceneDefs(): React.ReactElement {
  return (
    <>
      {/* 山石肌理：分形噪声（注意：filter 不能放进 pattern，会静默不渲染） */}
      <filter id="rockTex" filterUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
        <feTurbulence type="fractalNoise" baseFrequency="0.024 0.055" numOctaves="4" seed="19" result="t" />
        <feColorMatrix
          in="t"
          type="matrix"
          values="0 0 0 0 0.34  0 0 0 0 0.44  0 0 0 0 0.48  0.55 0.35 0.1 0 0"
        />
        <feGaussianBlur stdDeviation="0.4" />
      </filter>

      {/* 絮状雾 */}
      <filter id="mistBlur" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.011 0.026" numOctaves="3" seed="7" result="n" />
        <feColorMatrix
          in="n"
          type="matrix"
          values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0"
          result="w"
        />
        <feGaussianBlur in="w" stdDeviation="7" />
      </filter>

      {/* 柔化 */}
      <filter id="softBlur" x="-15%" y="-15%" width="130%" height="130%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
      <filter id="softBlurSm" x="-15%" y="-15%" width="130%" height="130%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
      {/* 霜/雪：更细的噪声 */}
      <filter id="frostTex" x="0" y="0" width="1440" height="900">
        <feTurbulence type="fractalNoise" baseFrequency="0.6 0.9" numOctaves="2" seed="31" result="t" />
        <feColorMatrix
          in="t"
          type="matrix"
          values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.9 0 0 0 -0.32"
        />
      </filter>

      {/* 天空渐变 */}
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style={{ stopColor: 'var(--scene-far)', stopOpacity: 0.05 }} />
        <stop offset="62%" style={{ stopColor: 'var(--scene-mist)', stopOpacity: 0.16 }} />
        <stop offset="100%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0.05 }} />
      </linearGradient>

      {/* 日月径向光晕 */}
      <radialGradient id="sunGlow">
        <stop offset="0%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0.26 }} />
        <stop offset="42%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0.13 }} />
        <stop offset="72%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0.05 }} />
        <stop offset="100%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0 }} />
      </radialGradient>

      {/* 水面 */}
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style={{ stopColor: 'var(--scene-water)', stopOpacity: 0.1 }} />
        <stop offset="55%" style={{ stopColor: 'var(--scene-water)', stopOpacity: 0.17 }} />
        <stop offset="100%" style={{ stopColor: 'var(--scene-water)', stopOpacity: 0.3 }} />
      </linearGradient>

      {/* 三层受光渐变 */}
      <linearGradient id="farLight" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" style={{ stopColor: 'var(--scene-far)', stopOpacity: 0.34 }} />
        <stop offset="100%" style={{ stopColor: 'var(--scene-far)', stopOpacity: 0.16 }} />
      </linearGradient>
      <linearGradient id="midLight" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" style={{ stopColor: 'var(--scene-mid)', stopOpacity: 0.3 }} />
        <stop offset="100%" style={{ stopColor: 'var(--scene-mid)', stopOpacity: 0.13 }} />
      </linearGradient>
      <linearGradient id="nearLight" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0%" style={{ stopColor: 'var(--scene-near)', stopOpacity: 0.26 }} />
        <stop offset="100%" style={{ stopColor: 'var(--scene-near)', stopOpacity: 0.1 }} />
      </linearGradient>

      {/* 山脚渐隐 */}
      <linearGradient id="footFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style={{ stopColor: 'var(--scene-far)', stopOpacity: 0 }} />
        <stop offset="100%" style={{ stopColor: 'var(--scene-far)', stopOpacity: 0.3 }} />
      </linearGradient>

      {/* 朱印渐变（朱砂笺场景用） */}
      <linearGradient id="sealInk" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0.62 }} />
        <stop offset="100%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0.34 }} />
      </linearGradient>
    </>
  );
}
