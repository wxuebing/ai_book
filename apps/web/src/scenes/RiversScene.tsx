/**
 * 场景二：青绿山水 —— 千里江山
 *
 * 与「云岫墨韵」的区别（不只是颜色）：
 *   · 山是**层峦叠嶂**：多层同向堆叠、山体饱满圆润，不是尖峰
 *   · 有**江面**与**帆影**（两三叶扁舟），没有竹林
 *   · 有**横向云带**缠绕山腰（千里江山图的典型特征）
 *   · 太阳不出现，改为山间留白
 */

import React from 'react';
import { makeRidge } from './SceneDefs';

/** 层峦：圆润饱满，不是尖峰 */
function makeLayers(opts: {
  seed: number;
  width: number;
  baseY: number;
  majors: number;
  height: number;
}): string {
  const { seed, width, baseY, majors, height } = opts;
  let s = seed >>> 0;
  const r = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const step = width / majors;
  let d = `M0 ${baseY}`;
  for (let i = 0; i < majors; i++) {
    const x1 = i * step;
    const x2 = (i + 1) * step;
    const peakX = x1 + step * (0.36 + r() * 0.28);
    // 层峦起伏小、山体宽 —— 这是"千里江山"和"尖峰"的区别
    const peakY = baseY - height * (0.58 + r() * 0.42);
    const shoulderL = x1 + step * 0.1;
    const shoulderR = x2 - step * 0.1;
    d += ` C ${shoulderL.toFixed(1)} ${(baseY - height * 0.14).toFixed(1)} ${(peakX - step * 0.2).toFixed(1)} ${peakY.toFixed(1)} ${peakX.toFixed(1)} ${peakY.toFixed(1)}`;
    d += ` C ${(peakX + step * 0.22).toFixed(1)} ${peakY.toFixed(1)} ${shoulderR.toFixed(1)} ${(baseY - height * 0.12).toFixed(1)} ${x2.toFixed(1)} ${baseY}`;
  }
  d += ` L ${width} 900 L 0 900 Z`;
  return d;
}

const L1 = makeLayers({ seed: 3311, width: 1440, baseY: 520, majors: 6, height: 230 });
const L2 = makeLayers({ seed: 8822, width: 1440, baseY: 640, majors: 5, height: 210 });
const L3 = makeLayers({ seed: 5501, width: 1440, baseY: 760, majors: 4, height: 150 });

export function RiversScene(): React.ReactElement {
  return (
    <>
      <rect x="0" y="0" width="1440" height="900" fill="url(#sky)" />

      {/* 山间留白：一道横向光带代替太阳 */}
      <ellipse cx="980" cy="300" rx="360" ry="120" style={{ fill: 'var(--scene-mist)' }} opacity="0.3" filter="url(#softBlur)" />

      {/* 远层峦 */}
      <path d={L1} fill="url(#farLight)" />
      {/* 山腰横向云带（千里江山图的标志性元素） */}
      <g opacity="0.55" filter="url(#mistBlur)">
        <rect x="0" y="404" width="1440" height="52" />
      </g>
      <g opacity="0.36" filter="url(#mistBlur)">
        <rect x="320" y="356" width="780" height="40" />
      </g>

      {/* 中层峦 + 肌理 */}
      <path d={L2} fill="url(#midLight)" />
      <mask id="midMaskR" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
        <path d={L2} fill="#fff" />
      </mask>
      <g mask="url(#midMaskR)" style={{ mixBlendMode: 'multiply' }} opacity="0.5">
        <rect x="0" y="440" width="1440" height="380" filter="url(#rockTex)" />
      </g>

      {/* 第二道云带 */}
      <g opacity="0.5" filter="url(#mistBlur)">
        <rect x="0" y="596" width="1440" height="56" />
      </g>

      {/* 近层峦 */}
      <path d={L3} fill="url(#nearLight)" />

      {/* 江面 */}
      <rect x="0" y="788" width="1440" height="112" fill="url(#water)" />

      {/* 帆影：三叶扁舟，远小近大 */}
      <g style={{ fill: 'var(--scene-near)' }} opacity="0.32">
        {/* 远帆 */}
        <g transform="translate(420 800) scale(0.55)">
          <path d="M0 0 q10 -26 20 0 z" />
          <rect x="-8" y="0" width="38" height="2.4" rx="1.2" />
        </g>
        <g transform="translate(520 806) scale(0.45)">
          <path d="M0 0 q10 -24 20 0 z" />
          <rect x="-8" y="0" width="38" height="2.4" rx="1.2" />
        </g>
        {/* 近帆：双帆 */}
        <g transform="translate(830 828) scale(1)">
          <path d="M0 0 q14 -40 28 0 z" />
          <path d="M34 4 q10 -28 20 0 z" opacity="0.8" />
          <rect x="-10" y="0" width="74" height="3.4" rx="1.7" />
        </g>
      </g>

      {/* 江面波纹 */}
      <g style={{ stroke: 'var(--scene-water)' }} fill="none" strokeLinecap="round" opacity="0.26">
        <g strokeWidth="1.2">
          <path d="M120 818 q30 -6 60 0 t60 0" />
          <path d="M640 812 q32 -6 64 0 t64 0" />
          <path d="M1040 820 q30 -6 60 0 t60 0" />
        </g>
        <g strokeWidth="1.7">
          <path d="M60 856 q44 -9 88 0 t88 0" />
          <path d="M700 862 q44 -9 88 0 t88 0" />
          <path d="M1180 854 q40 -8 80 0" />
        </g>
      </g>

      {/* 岸边苔点：表现草木 */}
      <g style={{ fill: 'var(--scene-bamboo)' }} opacity="0.22">
        {Array.from({ length: 46 }).map((_, i) => {
          const x = 40 + i * 30 + ((i * 37) % 17);
          const y = 786 + ((i * 53) % 26);
          return <ellipse key={i} cx={x} cy={y} rx={2.6} ry={1.5} />;
        })}
      </g>

      {/* 前景雾 */}
      <g opacity="0.26" filter="url(#mistBlur)">
        <rect x="0" y="740" width="1440" height="100" />
      </g>
    </>
  );
}
