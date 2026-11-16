/**
 * 场景三：烟雨江南 —— 雨巷石桥
 *
 * 与山水场景完全不同的元素组：
 *   · 没有山，是**平缓水乡**
 *   · **石拱桥**（半圆拱 + 石阶）
 *   · **白墙黑瓦民居**（三组高低错落）
 *   · **垂柳**（柳条下垂，不是竹的直立）
 *   · **雨丝**（细密斜线，全屏覆盖）
 *   · 水面有桥洞倒影
 */

import React from 'react';

export function RainTownScene(): React.ReactElement {
  return (
    <>
      <rect x="0" y="0" width="1440" height="900" fill="url(#sky)" />

      {/* 淡月：被雨云遮住，只有一团柔光 */}
      <ellipse cx="1120" cy="180" rx="150" ry="110" style={{ fill: 'var(--scene-sun)' }} opacity="0.07" filter="url(#softBlur)" />

      {/* 远景：低矮连绵的屋脊线（不是山） */}
      <path
        d="M0 560 L 120 552 L 120 528 L 210 528 L 210 550 L 340 546 L 340 520 L 430 520 L 430 548
           L 560 544 L 560 516 L 660 516 L 660 546 L 800 542 L 800 514 L 900 514 L 900 544
           L 1040 540 L 1040 512 L 1140 512 L 1140 542 L 1280 538 L 1280 510 L 1380 510 L 1380 540
           L 1440 538 L 1440 900 L 0 900 Z"
        style={{ fill: 'var(--scene-far)' }}
        opacity="0.14"
      />

      {/* 中景：白墙黑瓦民居（三组，高低错落） */}
      <g>
        {/* 民居 1：左，两层。屋顶用「双坡 + 瓦垄 + 檐口出挑」画，不是三角块 */}
        <g opacity="0.3">
          {/* 白墙 */}
          <rect x="150" y="470" width="150" height="150" style={{ fill: 'var(--scene-mist)' }} />
          {/* 双坡屋顶：左坡缓、右坡陡，中间有正脊 */}
          <path
            d="M132 472 L 225 420 L 318 472 L 312 476 L 225 428 L 138 476 Z"
            style={{ fill: 'var(--scene-near)' }}
            opacity="0.78"
          />
          {/* 瓦垄：沿坡向的正脊到檐口的细线，等距 */}
          <g style={{ stroke: 'var(--scene-near)' }} strokeWidth="1.2" opacity="0.42" fill="none">
            <path d="M225 424 V 474" />
            <path d="M207 430 V 474" />
            <path d="M189 437 V 474" />
            <path d="M171 444 V 474" />
            <path d="M243 430 V 474" />
            <path d="M261 437 V 474" />
            <path d="M279 444 V 474" />
            <path d="M297 451 V 474" />
          </g>
          {/* 檐口：一条略深的横带，表示瓦当出挑 */}
          <rect x="132" y="470" width="186" height="5" style={{ fill: 'var(--scene-near)' }} opacity="0.55" />
          {/* 窗（带窗棂） */}
          <rect x="178" y="500" width="26" height="30" style={{ fill: 'var(--scene-near)' }} opacity="0.3" />
          <g style={{ stroke: 'var(--scene-near)' }} strokeWidth="1" opacity="0.5">
            <path d="M191 500 V 530" />
            <path d="M178 515 H 204" />
          </g>
          <rect x="244" y="500" width="26" height="30" style={{ fill: 'var(--scene-near)' }} opacity="0.3" />
          <g style={{ stroke: 'var(--scene-near)' }} strokeWidth="1" opacity="0.5">
            <path d="M257 500 V 530" />
            <path d="M244 515 H 270" />
          </g>
          {/* 门（双扇） */}
          <rect x="208" y="560" width="34" height="60" style={{ fill: 'var(--scene-near)' }} opacity="0.4" />
          <path d="M225 560 V 620" style={{ stroke: 'var(--scene-far)' }} strokeWidth="1.2" opacity="0.5" />
        </g>

        {/* 民居 2：中，最矮，屋檐探出更多 */}
        <g opacity="0.24">
          <rect x="360" y="510" width="120" height="110" style={{ fill: 'var(--scene-mist)' }} />
          <path
            d="M344 512 L 420 466 L 496 512 L 490 516 L 420 474 L 350 516 Z"
            style={{ fill: 'var(--scene-near)' }}
            opacity="0.7"
          />
          <g style={{ stroke: 'var(--scene-near)' }} strokeWidth="1" opacity="0.38" fill="none">
            <path d="M420 470 V 514" />
            <path d="M402 476 V 514" />
            <path d="M384 483 V 514" />
            <path d="M438 476 V 514" />
            <path d="M456 483 V 514" />
            <path d="M474 490 V 514" />
          </g>
          <rect x="344" y="510" width="152" height="4" style={{ fill: 'var(--scene-near)' }} opacity="0.5" />
          <rect x="386" y="536" width="22" height="26" style={{ fill: 'var(--scene-near)' }} opacity="0.28" />
          <rect x="432" y="536" width="22" height="26" style={{ fill: 'var(--scene-near)' }} opacity="0.28" />
        </g>

        {/* 民居 3：右，最高，马头墙 + 双坡瓦顶 */}
        <g opacity="0.28">
          <rect x="900" y="430" width="170" height="190" style={{ fill: 'var(--scene-mist)' }} />
          {/* 马头墙：阶梯状山墙（徽派特征） */}
          <path
            d="M888 432 L 888 398 L 940 398 L 940 412 L 985 412 L 985 426 L 1030 426 L 1030 412 L 1075 412 L 1075 398 L 1112 398 L 1112 432 Z"
            style={{ fill: 'var(--scene-near)' }}
            opacity="0.74"
          />
          {/* 瓦垄 */}
          <g style={{ stroke: 'var(--scene-near)' }} strokeWidth="1.2" opacity="0.4" fill="none">
            <path d="M914 400 V 430" />
            <path d="M940 400 V 430" />
            <path d="M962 414 V 430" />
            <path d="M985 414 V 430" />
            <path d="M1008 428 V 430" />
            <path d="M1030 428 V 430" />
            <path d="M1052 414 V 430" />
            <path d="M1075 414 V 430" />
            <path d="M1094 400 V 430" />
          </g>
          <rect x="888" y="430" width="224" height="4" style={{ fill: 'var(--scene-near)' }} opacity="0.52" />
          <rect x="930" y="470" width="26" height="32" style={{ fill: 'var(--scene-near)' }} opacity="0.3" />
          <rect x="1010" y="470" width="26" height="32" style={{ fill: 'var(--scene-near)' }} opacity="0.3" />
          <rect x="964" y="550" width="40" height="70" style={{ fill: 'var(--scene-near)' }} opacity="0.38" />
        </g>
      </g>

      {/* 石拱桥：右侧，横跨水面 */}
      <g opacity="0.42">
        {/* 桥体 */}
        <path
          d="M620 700 Q 720 620 820 700 L 820 716 Q 720 640 620 716 Z"
          style={{ fill: 'var(--scene-near)' }}
        />
        {/* 桥面栏杆 */}
        <path d="M620 700 Q 720 620 820 700" fill="none" style={{ stroke: 'var(--scene-near)' }} strokeWidth="2.6" />
        {/* 拱洞（挖空效果：用背景色覆盖） */}
        <path
          d="M660 700 Q 720 648 780 700 Z"
          style={{ fill: 'var(--scene-water)' }}
          opacity="0.55"
        />
        {/* 石阶：桥两侧的台阶线 */}
        <g style={{ stroke: 'var(--scene-near)' }} strokeWidth="1.3" fill="none" opacity="0.6">
          <path d="M628 706 h16" />
          <path d="M644 700 h16" />
          <path d="M780 700 h16" />
          <path d="M796 706 h16" />
        </g>
      </g>

      {/* 水面 */}
      <rect x="0" y="716" width="1440" height="184" fill="url(#water)" />

      {/* 桥洞倒影 */}
      <ellipse cx="720" cy="742" rx="56" ry="22" style={{ fill: 'var(--scene-near)' }} opacity="0.12" filter="url(#softBlurSm)" />

      {/* 垂柳：左岸，柳条下垂（与竹的直立形成对比） */}
      <g style={{ stroke: 'var(--scene-bamboo)', fill: 'none' }} opacity="0.26" strokeLinecap="round">
        {/* 树干 */}
        <path d="M96 700 C 92 640, 96 590, 108 548" strokeWidth="5" />
        {/* 分枝 */}
        <path d="M108 548 C 140 520, 180 512, 214 520" strokeWidth="3.2" />
        <path d="M106 556 C 74 532, 44 528, 18 536" strokeWidth="3" />
        {/* 垂柳条：从枝上垂下，长而柔 */}
        <g strokeWidth="1.5">
          <path d="M214 520 C 220 560, 216 610, 206 660" />
          <path d="M196 518 C 204 556, 202 604, 194 652" />
          <path d="M176 516 C 184 552, 184 598, 178 644" />
          <path d="M156 517 C 162 552, 164 596, 160 638" />
          <path d="M136 521 C 142 554, 144 594, 142 634" />
          <path d="M18 536 C 14 576, 18 622, 28 668" />
          <path d="M40 530 C 36 570, 40 614, 50 660" />
          <path d="M62 527 C 58 566, 62 608, 72 652" />
        </g>
      </g>

      {/* 水面波纹 */}
      <g style={{ stroke: 'var(--scene-water)' }} fill="none" strokeLinecap="round" opacity="0.28">
        <g strokeWidth="1.2">
          <path d="M160 744 q30 -6 60 0 t60 0" />
          <path d="M900 738 q32 -6 64 0 t64 0" />
          <path d="M1180 746 q28 -5 56 0" />
        </g>
        <g strokeWidth="1.7">
          <path d="M80 800 q44 -9 88 0 t88 0" />
          <path d="M520 812 q44 -9 88 0 t88 0" />
          <path d="M1080 806 q44 -9 88 0 t88 0" />
        </g>
      </g>

      {/* 雨丝：全屏细密斜线（这是「烟雨」的关键，山水场景没有） */}
      <g style={{ stroke: 'var(--scene-water)' }} opacity="0.2" strokeLinecap="round">
        {Array.from({ length: 150 }).map((_, i) => {
          const x = (i * 97) % 1440;
          const y = (i * 61) % 900;
          const len = 12 + ((i * 7) % 16);
          return <path key={i} d={`M${x} ${y} l-3 ${len}`} strokeWidth={i % 3 === 0 ? 1.1 : 0.7} />;
        })}
      </g>

      {/* 雨雾：整体压一层，让远景朦胧 */}
      <rect x="0" y="0" width="1440" height="900" style={{ fill: 'var(--scene-mist)' }} opacity="0.16" />
      <g opacity="0.4" filter="url(#mistBlur)">
        <rect x="0" y="600" width="1440" height="120" />
      </g>
    </>
  );
}
