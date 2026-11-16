/**
 * 场景五：月白霜天 —— 雪山 · 满月 · 松枝 · 寒星
 *
 * 与山水场景的区别：
 *   · 山是**雪山**：棱线硬朗、峰顶覆白（不是水墨渲染）
 *   · **满月高悬**（不是斜阳），带月晕
 *   · **松枝**从右上垂下（针叶成簇，不是竹叶）
 *   · **寒星**点缀（山水场景没有）
 *   · 冷调，无飞鸟
 */

import React from 'react';
import { makeRidge } from './SceneDefs';

const SNOW_FAR = makeRidge({ seed: 61808, width: 1440, baseY: 560, majors: 8, height: 240, round: 8 });
const SNOW_MID = makeRidge({ seed: 29017, width: 1440, baseY: 680, majors: 6, height: 210, round: 9 });

export function SnowMoonScene(): React.ReactElement {
  return (
    <>
      <rect x="0" y="0" width="1440" height="900" fill="url(#sky)" />

      {/* 寒星：集中撒在左半（右侧会被卡片盖住，撒了也看不见） */}
      <g style={{ fill: '#fff' }}>
        {Array.from({ length: 46 }).map((_, i) => {
          const x = (i * 137) % 720;
          const y = (i * 83) % 520;
          const r = 0.6 + ((i * 11) % 4) * 0.42;
          const op = 0.14 + (1 - y / 520) * 0.4;
          return <circle key={i} cx={x} cy={y} r={r} opacity={op} />;
        })}
      </g>

      {/* 满月。
          三个约束叠在一起，位置必须同时满足：
          ① 不能被导航栏盖：导航栏占屏幕 0~280px，且有底色（不透明）。
          ② 不能被内容区卡片盖：内容区从屏幕 x=480 起。
          ③ SVG 用 xMidYMax slice 缩放：1600x1000 视口下 scale≈1.111、横向偏移≈-80，
             所以 svg 坐标 = (屏幕坐标 + 80) / 1.111。
             可见屏幕区 280~480 → svg 坐标 324~504，取中值 ≈ 410。
          ④ 对比度：月白霜天的 --scene-sun 是 #e9e1cc（月白），
             与浅蓝白背景几乎同色，月轮必须用白色为主才立得住。 */}
      <g>
        {/* 外圈光晕 */}
        <circle cx="410" cy="238" r="132" fill="url(#sunGlow)" opacity="0.95" />
        {/* 月晕环 */}
        <circle cx="410" cy="238" r="78" fill="none" style={{ stroke: 'var(--scene-sun)' }} strokeWidth="1.4" opacity="0.34" />
        <circle cx="410" cy="238" r="98" fill="none" style={{ stroke: 'var(--scene-sun)' }} strokeWidth="1" opacity="0.2" />
        {/* 月轮本体：用 --scene-sun（本主题已改为深冷色，有对比度） */}
        <circle cx="410" cy="238" r="52" style={{ fill: 'var(--scene-sun)' }} opacity="0.22" filter="url(#softBlurSm)" />
        <circle cx="410" cy="238" r="45" style={{ fill: 'var(--scene-sun)' }} opacity="0.26" />
        {/* 月面淡斑：更深一档 */}
        <g style={{ fill: 'var(--scene-near)' }} opacity="0.2">
          <circle cx="394" cy="224" r="8" />
          <circle cx="424" cy="246" r="5.4" />
          <circle cx="402" cy="256" r="3.8" />
          <circle cx="428" cy="222" r="3" />
        </g>
      </g>

      {/* 雪山远层 */}
      <path d={SNOW_FAR} fill="url(#farLight)" />
      {/* 雪线：远山顶部一条亮边，表现积雪 */}
      <path d={SNOW_FAR} fill="url(#frostTex)" opacity="0.3" style={{ mixBlendMode: 'screen' }} />

      {/* 山腰寒雾 */}
      <g opacity="0.5" filter="url(#mistBlur)">
        <rect x="0" y="470" width="1440" height="80" />
      </g>

      {/* 雪山中层 */}
      <path d={SNOW_MID} fill="url(#midLight)" />
      <path d={SNOW_MID} fill="url(#frostTex)" opacity="0.26" style={{ mixBlendMode: 'screen' }} />

      {/* 中层岩石肌理（雪下露出的岩体） */}
      <mask id="snowMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
        <path d={SNOW_MID} fill="#fff" />
      </mask>
      <g mask="url(#snowMask)" style={{ mixBlendMode: 'multiply' }} opacity="0.34">
        <rect x="0" y="460" width="1440" height="360" filter="url(#rockTex)" />
      </g>

      {/* 雪坡：近景，缓而亮 */}
      <path
        d="M0 742 C 140 706, 280 728, 420 752 C 560 776, 700 736, 840 720
           C 980 704, 1120 742, 1260 760 C 1350 772, 1410 764, 1440 758
           L 1440 900 L 0 900 Z"
        fill="url(#nearLight)"
      />
      <path
        d="M0 742 C 140 706, 280 728, 420 752 C 560 776, 700 736, 840 720
           C 980 704, 1120 742, 1260 760 C 1350 772, 1410 764, 1440 758
           L 1440 900 L 0 900 Z"
        fill="url(#frostTex)"
        opacity="0.34"
        style={{ mixBlendMode: 'screen' }}
      />

      {/* 松枝：从左上垂下（右上会被内容区遮住），针叶成簇 */}
      <g style={{ stroke: 'var(--scene-bamboo)', fill: 'var(--scene-bamboo)' }} opacity="0.3">
        {/* 主枝：从左上角斜下 */}
        <path
          d="M0 40 C 100 76, 190 120, 270 176"
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
        />
        {/* 侧枝 */}
        <g fill="none" strokeWidth="3.4" strokeLinecap="round">
          <path d="M150 98 C 182 132, 208 170, 226 212" />
          <path d="M210 142 C 242 156, 274 164, 306 166" />
          <path d="M90 72 C 118 108, 140 148, 154 190" />
        </g>
        {/* 针叶：成簇的短放射线，这是松与竹/柳的根本区别 */}
        <g strokeWidth="1.9" strokeLinecap="round" fill="none">
          {[
            { x: 226, y: 212 },
            { x: 306, y: 166 },
            { x: 154, y: 190 },
            { x: 270, y: 176 },
            { x: 182, y: 130 },
          ].map((pt, ci) =>
            Array.from({ length: 9 }).map((_, i) => {
              const a = (i / 9) * Math.PI * 2 + ci * 0.4;
              const len = 13 + ((i * 7) % 6);
              return (
                <path
                  key={`${ci}-${i}`}
                  d={`M${pt.x} ${pt.y} l${(Math.cos(a) * len).toFixed(1)} ${(Math.sin(a) * len).toFixed(1)}`}
                />
              );
            }),
          )}
        </g>
        {/* 枝上积雪：沿枝的短亮线 */}
        <g style={{ stroke: '#fff' }} strokeWidth="2.4" opacity="0.4" strokeLinecap="round" fill="none">
          <path d="M20 48 C 88 74, 150 108, 210 148" />
          <path d="M140 92 C 168 124, 190 158, 204 192" />
        </g>
      </g>

      {/* 前景寒雾 */}
      <g opacity="0.34" filter="url(#mistBlur)">
        <rect x="0" y="700" width="1440" height="140" />
      </g>
    </>
  );
}
