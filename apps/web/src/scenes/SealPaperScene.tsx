/**
 * 场景四：朱砂笺 —— 笺纸 · 朱印 · 梅枝 · 落雪
 *
 * 完全不同于山水的元素组：
 *   · 没有山、没有日、没有水
 *   · **笺纸竖纹**（细密竖线，模拟信笺）
 *   · **朱印**（右下角方印 + 篆书感线条）
 *   · **梅枝**（折枝构图，从左下斜出，枝上点梅）
 *   · **落雪**（稀疏白点，不是雨丝）
 *   · 大量留白（笺纸的呼吸感）
 */

import React from 'react';

export function SealPaperScene(): React.ReactElement {
  return (
    <>
      {/* 笺纸底：暖白，比别的场景更亮 */}
      <rect x="0" y="0" width="1440" height="900" fill="url(#sky)" />

      {/* 笺纸竖纹：等距细竖线，模拟信笺栏 */}
      <g style={{ stroke: 'var(--scene-far)' }} opacity="0.16" strokeWidth="0.8">
        {Array.from({ length: 30 }).map((_, i) => (
          <path key={i} d={`M${48 + i * 46} 0 V 900`} />
        ))}
      </g>

      {/* 上下淡边：笺纸的版心感 */}
      <rect x="0" y="0" width="1440" height="70" style={{ fill: 'var(--scene-far)' }} opacity="0.1" />
      <rect x="0" y="830" width="1440" height="70" style={{ fill: 'var(--scene-far)' }} opacity="0.1" />

      {/* 梅枝：从左侧斜出，折枝构图。
          限制在 x<300 的可见窄缝内（右侧被卡片盖住），所以枝干整体左移。 */}
      <g style={{ stroke: 'var(--scene-near)', fill: 'none' }} opacity="0.34" strokeLinecap="round">
        {/* 主枝：从左下往右上，压缩在左侧 */}
        <path d="M-40 840 C 40 790, 110 740, 176 686 C 222 648, 258 606, 286 560" strokeWidth="7" />
        {/* 侧枝 1 */}
        <path d="M176 686 C 214 672, 252 654, 292 630" strokeWidth="4.4" />
        {/* 侧枝 2：向下垂 */}
        <path d="M110 740 C 138 768, 170 790, 208 802" strokeWidth="3.8" />
        {/* 侧枝 3：细梢 */}
        <path d="M286 560 C 296 534, 304 512, 312 494" strokeWidth="3" />
        {/* 侧枝 4 */}
        <path d="M292 630 C 320 618, 348 612, 376 612" strokeWidth="2.6" />
      </g>

      {/* 梅花：点在枝上，五瓣简形 */}
      <g style={{ fill: 'var(--scene-sun)' }} opacity="0.42">
        {[
          { x: 96, y: 752, s: 1 },
          { x: 140, y: 716, s: 0.85 },
          { x: 190, y: 674, s: 1.1 },
          { x: 236, y: 640, s: 0.9 },
          { x: 268, y: 600, s: 0.8 },
          { x: 296, y: 634, s: 1 },
          { x: 338, y: 616, s: 0.75 },
          { x: 176, y: 792, s: 0.85 },
          { x: 308, y: 500, s: 0.7 },
          { x: 40, y: 800, s: 0.8 },
        ].map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y}) scale(${p.s})`}>
            <ellipse cx="0" cy="-5" rx="3.6" ry="4.4" />
            <ellipse cx="4.8" cy="-1.6" rx="3.6" ry="4.4" />
            <ellipse cx="3" cy="4.2" rx="3.6" ry="4.4" />
            <ellipse cx="-3" cy="4.2" rx="3.6" ry="4.4" />
            <ellipse cx="-4.8" cy="-1.6" rx="3.6" ry="4.4" />
          </g>
        ))}
      </g>

      {/* 朱印：放在左侧可见区（x<300 这条窄缝里），右下角会被卡片完全盖住 */}
      <g transform="translate(120 640)" opacity="0.5">
        {/* 印面 */}
        <rect x="0" y="0" width="112" height="112" rx="4" fill="url(#sealInk)" />
        {/* 印内白文：篆书感的横竖笔画组合 */}
        <g style={{ stroke: '#fff' }} strokeWidth="5.5" strokeLinecap="square" fill="none" opacity="0.9">
          <path d="M22 28 H 90" />
          <path d="M56 28 V 56" />
          <path d="M22 56 H 90" />
          <path d="M34 56 V 84" />
          <path d="M78 56 V 84" />
          <path d="M22 84 H 90" />
        </g>
        {/* 印边磨损：四角小缺口，避免过于工整 */}
        <rect x="0" y="0" width="9" height="9" style={{ fill: 'var(--scene-far)' }} opacity="0.35" />
        <rect x="103" y="103" width="9" height="9" style={{ fill: 'var(--scene-far)' }} opacity="0.3" />
      </g>

      {/* 小印：右上角闲章也移到左上，避免被挡 */}
      <g transform="translate(150 200) rotate(-4)" opacity="0.3">
        <rect x="0" y="0" width="58" height="58" rx="3" fill="url(#sealInk)" />
        <g style={{ stroke: '#fff' }} strokeWidth="4" fill="none" opacity="0.85">
          <path d="M14 18 H 44" />
          <path d="M29 18 V 42" />
          <path d="M14 42 H 44" />
        </g>
      </g>

      {/* 落雪：稀疏白点，大小不一 */}
      <g style={{ fill: '#fff' }}>
        {Array.from({ length: 58 }).map((_, i) => {
          const x = (i * 173) % 1440;
          const y = (i * 119) % 900;
          const r = 1 + ((i * 13) % 3) * 0.7;
          return <circle key={i} cx={x} cy={y} r={r} opacity={0.24 + ((i * 7) % 5) * 0.05} />;
        })}
      </g>

      {/* 极淡的雾：让留白不空 */}
      <g opacity="0.14" filter="url(#mistBlur)">
        <rect x="0" y="300" width="1440" height="240" />
      </g>
    </>
  );
}
