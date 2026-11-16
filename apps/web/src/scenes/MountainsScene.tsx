/**
 * 场景一：云岫墨韵 —— 山川 · 溪流 · 修竹 · 飞鸟
 * 水墨山水，四层远近山 + 岩石肌理 + 谷雾 + 水面倒影
 */

import React from 'react';
import { makeRidge } from './SceneDefs';

const RIDGE_FAR = makeRidge({ seed: 20261116, width: 1440, baseY: 600, majors: 9, height: 190 });
const RIDGE_MID = makeRidge({ seed: 77123, width: 1440, baseY: 690, majors: 7, height: 175 });
const RIDGE_NEAR = makeRidge({ seed: 4412, width: 1440, baseY: 800, majors: 5, height: 82 });

/** 中山峰顶受光面 */
const LIGHT_MID = [
  { x: 330, y: 520, r: 26 },
  { x: 516, y: 510, r: 24 },
  { x: 702, y: 498, r: 27 },
  { x: 888, y: 486, r: 25 },
  { x: 1074, y: 474, r: 26 },
  { x: 1260, y: 462, r: 24 },
].map((p, i) => (
  <ellipse
    key={i}
    cx={p.x - p.r * 0.25}
    cy={p.y + p.r * 0.5}
    rx={p.r * 0.9}
    ry={p.r * 0.62}
    style={{ fill: 'var(--scene-mist)' }}
    opacity={0.5 - i * 0.03}
    filter="url(#softBlurSm)"
  />
));

export function MountainsScene(): React.ReactElement {
  return (
    <>
      {/* 天空 */}
      <rect x="0" y="0" width="1440" height="900" fill="url(#sky)" />

      {/* 日/月 */}
      <circle cx="1176" cy="168" r="196" fill="url(#sunGlow)" />
      <circle cx="1176" cy="168" r="62" style={{ fill: 'var(--scene-sun)' }} opacity="0.16" filter="url(#softBlurSm)" />
      <circle cx="1176" cy="168" r="54" style={{ fill: 'var(--scene-sun)' }} opacity="0.1" />
      <g filter="url(#softBlur)" opacity="0.5">
        <ellipse cx="1170" cy="186" rx="118" ry="13" style={{ fill: 'var(--scene-mist)' }} />
        <ellipse cx="1196" cy="152" rx="86" ry="8" style={{ fill: 'var(--scene-mist)' }} opacity="0.7" />
      </g>

      {/* 飞鸟 */}
      <g style={{ stroke: 'var(--scene-near)' }} fill="none" strokeLinecap="round" opacity="0.3">
        <g strokeWidth="2.4">
          <path d="M292 226 q11 -10 22 0 q11 -10 22 0" />
          <path d="M368 196 q9 -8 18 0 q9 -8 18 0" />
          <path d="M446 246 q8 -7 16 0 q8 -7 16 0" />
        </g>
        <g strokeWidth="1.6" opacity="0.62">
          <path d="M512 208 q6 -5 12 0 q6 -5 12 0" />
          <path d="M556 232 q5 -4 10 0 q5 -4 10 0" />
        </g>
      </g>

      {/* 远山 */}
      <path d={RIDGE_FAR} fill="url(#farLight)" />
      <rect x="0" y="500" width="1440" height="130" fill="url(#footFade)" opacity="0.55" />

      {/* 中山 + 岩石肌理 + 沟壑 + 受光面 */}
      <path d={RIDGE_MID} fill="url(#midLight)" />
      <mask id="midMaskM" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
        <path d={RIDGE_MID} fill="#fff" />
      </mask>
      <g mask="url(#midMaskM)" style={{ mixBlendMode: 'multiply' }} opacity="0.62">
        <rect x="0" y="400" width="1440" height="400" filter="url(#rockTex)" />
      </g>
      <g style={{ stroke: 'var(--scene-mid)' }} opacity="0.2" fill="none" strokeLinecap="round">
        <path d="M330 520 L 336 572 L 332 612" strokeWidth="2.2" />
        <path d="M516 510 L 522 562 L 518 606" strokeWidth="2" />
        <path d="M702 498 L 708 550 L 704 594" strokeWidth="2.2" />
        <path d="M888 486 L 894 538 L 890 582" strokeWidth="2" />
        <path d="M1074 474 L 1080 526 L 1076 570" strokeWidth="2.2" />
        <path d="M1260 462 L 1266 514 L 1262 558" strokeWidth="2" />
      </g>
      {LIGHT_MID}

      {/* 谷雾 */}
      <g opacity="0.62" filter="url(#mistBlur)">
        <rect x="0" y="596" width="1440" height="92" />
      </g>
      <g opacity="0.4" filter="url(#mistBlur)">
        <rect x="180" y="548" width="620" height="58" />
      </g>

      {/* 近坡 */}
      <path d={RIDGE_NEAR} fill="url(#nearLight)" />

      {/* 溪流 */}
      <rect x="0" y="800" width="1440" height="100" fill="url(#water)" />
      <g opacity="0.14" filter="url(#softBlur)">
        <path
          d="M0 812 C 96 834, 186 820, 276 808 C 372 794, 462 824, 556 836
             C 648 848, 736 818, 828 806 C 920 794, 1010 822, 1102 832
             C 1194 842, 1284 814, 1372 804 L 1440 806 L 1440 880 L 0 880 Z"
          style={{ fill: 'var(--scene-near)' }}
        />
      </g>
      <g style={{ stroke: 'var(--scene-water)' }} fill="none" strokeLinecap="round" opacity="0.3">
        <g strokeWidth="1.1" opacity="0.7">
          <path d="M96 812 q26 -5 52 0 t52 0" />
          <path d="M330 816 q24 -4 48 0 t48 0" />
          <path d="M590 810 q26 -5 52 0 t52 0" />
          <path d="M846 818 q24 -4 48 0 t48 0" />
          <path d="M1104 812 q26 -5 52 0 t52 0" />
        </g>
        <g strokeWidth="1.5">
          <path d="M60 840 q38 -8 76 0 t76 0" />
          <path d="M300 848 q36 -7 72 0 t72 0" />
          <path d="M560 838 q38 -8 76 0 t76 0" />
          <path d="M820 852 q36 -7 72 0 t72 0" />
          <path d="M1080 842 q38 -8 76 0 t76 0" />
        </g>
        <g strokeWidth="1.9" opacity="0.85">
          <path d="M30 874 q48 -11 96 0 t96 0" />
          <path d="M290 884 q46 -10 92 0 t92 0" />
          <path d="M600 872 q48 -11 96 0 t96 0" />
          <path d="M910 886 q46 -10 92 0 t92 0" />
        </g>
      </g>

      {/* 修竹 */}
      <g style={{ stroke: 'var(--scene-bamboo)', fill: 'var(--scene-bamboo)' }} opacity="0.2">
        <g opacity="0.5" strokeWidth="3.4" fill="none" strokeLinecap="round">
          <path d="M1398 300 C 1394 420, 1392 540, 1396 660" />
          <path d="M1428 356 C 1424 468, 1424 576, 1428 690" />
        </g>
        <g strokeWidth="6" fill="none" strokeLinecap="round">
          <path d="M1318 236 C 1312 340, 1310 448, 1316 556" />
          <path d="M1314.6 288 h5.4" strokeWidth="1.6" opacity="0.75" />
          <path d="M1313.8 348 h5.6" strokeWidth="1.6" opacity="0.75" />
          <path d="M1313.2 412 h5.8" strokeWidth="1.6" opacity="0.75" />
          <path d="M1313.8 478 h5.6" strokeWidth="1.6" opacity="0.75" />
        </g>
        <g strokeWidth="5" fill="none" strokeLinecap="round">
          <path d="M1362 292 C 1358 396, 1356 500, 1360 600" />
          <path d="M1359.6 340 h4.6" strokeWidth="1.4" opacity="0.7" />
          <path d="M1359 400 h4.8" strokeWidth="1.4" opacity="0.7" />
          <path d="M1358.6 460 h4.8" strokeWidth="1.4" opacity="0.7" />
        </g>
        <g strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M1316 250 q-46 -18 -76 -52" />
          <path d="M1316 254 q-52 0 -86 -22" />
          <path d="M1316 258 q-40 22 -70 30" />
          <path d="M1318 300 q48 -16 80 -44" />
          <path d="M1318 304 q54 2 88 -14" />
          <path d="M1314 420 q-44 -14 -72 -40" />
          <path d="M1314 424 q-48 2 -78 -18" />
          <path d="M1314 428 q-36 20 -64 28" />
          <path d="M1360 360 q46 -14 76 -40" />
          <path d="M1360 364 q50 2 82 -12" />
          <path d="M1398 320 q-34 -14 -56 -36" />
          <path d="M1428 380 q36 -12 58 -32" />
        </g>
        <g opacity="0.3" filter="url(#softBlurSm)" fill="none" strokeWidth="8">
          <path d="M1316 556 C 1320 660, 1324 720, 1328 764" />
          <path d="M1360 600 C 1364 690, 1368 740, 1372 772" />
        </g>
      </g>

      {/* 前景飘雾 */}
      <g opacity="0.3" filter="url(#mistBlur)">
        <rect x="0" y="700" width="1440" height="130" />
      </g>
    </>
  );
}
