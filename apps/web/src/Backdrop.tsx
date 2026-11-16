/**
 * 古风背景：山川 · 溪流 · 修竹 · 月/日 · 飞鸟
 *
 * 用内联 SVG 绘制（零图片资源、任意缩放清晰），颜色全部取自主题的 --scene-* 变量，
 * 因此换主题时背景会跟着换色调。整体极淡，只在余光里透出山水，不抢正文。
 *
 * 层级：.app-bg（底色）→ Backdrop（这幅山水）→ .app-texture（纸纹/织线，multiply 压上来）
 */

import React from 'react';

export function Backdrop(): React.ReactElement {
  return (
    <div className="app-scene" aria-hidden="true">
      <svg
        className="app-scene-svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sceneWater" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--scene-water)', stopOpacity: 0.02 }} />
            <stop offset="100%" style={{ stopColor: 'var(--scene-water)', stopOpacity: 0.16 }} />
          </linearGradient>
        </defs>

        {/* 日/月：朱砂或月白，随主题 */}
        <circle cx="1186" cy="172" r="88" style={{ fill: 'var(--scene-sun)' }} opacity="0.1" />

        {/* 飞鸟：三两笔 */}
        <g
          style={{ stroke: 'var(--scene-near)' }}
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.32"
        >
          <path d="M300 232 q10 -9 20 0 q10 -9 20 0" />
          <path d="M372 200 q8 -7 16 0 q8 -7 16 0" />
          <path d="M452 250 q7 -6 14 0 q7 -6 14 0" />
        </g>

        {/* 远山 */}
        <path
          d="M0 560 L90 470 L180 505 L270 430 L360 500 L470 410 L560 480 L670 400 L780 475 L880 415 L980 490 L1090 430 L1190 500 L1300 445 L1400 505 L1440 480 L1440 900 L0 900 Z"
          style={{ fill: 'var(--scene-far)' }}
          opacity="0.26"
        />

        {/* 中山 */}
        <path
          d="M0 642 L120 562 L230 612 L340 546 L450 606 L560 540 L690 610 L800 555 L910 616 L1030 560 L1140 620 L1260 566 L1380 626 L1440 600 L1440 900 L0 900 Z"
          style={{ fill: 'var(--scene-mid)' }}
          opacity="0.2"
        />

        {/* 近坡：缓起伏 */}
        <path
          d="M0 762 C180 700 320 742 480 720 C660 696 820 744 1000 722 C1160 704 1300 742 1440 720 L1440 900 L0 900 Z"
          style={{ fill: 'var(--scene-near)' }}
          opacity="0.16"
        />

        {/* 溪流：一条水带 + 几道波光 */}
        <rect x="0" y="804" width="1440" height="96" fill="url(#sceneWater)" />
        <g
          style={{ stroke: 'var(--scene-water)' }}
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.22"
        >
          <path d="M120 828 q40 -8 80 0 t80 0" />
          <path d="M360 852 q46 -9 92 0 t92 0" />
          <path d="M700 826 q40 -8 80 0 t80 0" />
          <path d="M980 856 q46 -9 92 0 t92 0" />
          <path d="M1240 832 q36 -8 72 0" />
        </g>

        {/* 修竹：右侧一丛，疏影扶风 */}
        <g
          style={{ stroke: 'var(--scene-bamboo)', fill: 'var(--scene-bamboo)' }}
          opacity="0.16"
        >
          {/* 竹竿 */}
          <path d="M1298 900 C1316 720 1288 566 1304 372" fill="none" strokeWidth="5" strokeLinecap="round" />
          <path d="M1352 900 C1366 740 1342 610 1356 452" fill="none" strokeWidth="4" strokeLinecap="round" />
          <path d="M1402 900 C1412 760 1396 650 1406 520" fill="none" strokeWidth="3" strokeLinecap="round" />
          {/* 竹节 */}
          <g fill="none" strokeWidth="4" strokeLinecap="round">
            <path d="M1294 560 h20" />
            <path d="M1292 700 h22" />
            <path d="M1350 640 h16" />
            <path d="M1354 760 h16" />
          </g>
          {/* 竹叶 */}
          <g strokeWidth="2.4" strokeLinecap="round" fill="none">
            <path d="M1304 420 q-42 -14 -70 -48" />
            <path d="M1304 424 q-48 2 -80 -18" />
            <path d="M1304 428 q-34 22 -66 34" />
            <path d="M1356 500 q40 -18 66 -46" />
            <path d="M1356 504 q44 0 76 -16" />
            <path d="M1356 508 q30 24 60 36" />
            <path d="M1406 560 q-30 -18 -52 -44" />
            <path d="M1406 564 q-34 4 -60 -12" />
          </g>
        </g>
      </svg>
    </div>
  );
}
