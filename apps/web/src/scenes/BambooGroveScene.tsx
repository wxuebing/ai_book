/**
 * 场景六：竹影清风 —— 密竹林 · 石 · 竹影投墙
 *
 * 与山水场景的区别：
 *   · 没有山、没有水、没有日
 *   · **密竹林**：前景/中景/远景三层竹，疏密不同，形成纵深
 *   · **太湖石**：瘦皱漏透的石头（左下）
 *   · **竹影投墙**：一道斜向的淡影铺在后景（模拟阳光把竹影打在墙上）
 *   · 地面落叶
 */

import React from 'react';

/** 一株竹：杆 + 节 + 叶（可参数化高度/粗细/倾斜） */
function Bamboo(opts: {
  x: number;
  top: number;
  bottom: number;
  w: number;
  lean: number;
  leafCount: number;
  seed: number;
}): React.ReactElement {
  const { x, top, bottom, w, lean, leafCount, seed } = opts;
  let s = seed >>> 0;
  const r = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const cx = (t: number): number => x + lean * (1 - t) * (1 - t) * 60;
  const yAt = (t: number): number => top + (bottom - top) * t;

  // 竹杆：分节画，节处留细缝
  const segs = 7;
  const nodes: React.ReactElement[] = [];
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const p0x = cx(t0);
    const p0y = yAt(t0);
    const p1x = cx(t1);
    const p1y = yAt(t1);
    nodes.push(
      <path
        key={`s${i}`}
        d={`M${p0x.toFixed(1)} ${p0y.toFixed(1)} Q ${((p0x + p1x) / 2 + lean * 2).toFixed(1)} ${((p0y + p1y) / 2).toFixed(1)} ${p1x.toFixed(1)} ${p1y.toFixed(1)}`}
        strokeWidth={w * (1 - t0 * 0.24)}
        fill="none"
        strokeLinecap="round"
      />,
    );
    // 竹节横纹
    if (i < segs - 1) {
      nodes.push(
        <path
          key={`n${i}`}
          d={`M${(p1x - w * 0.62).toFixed(1)} ${p1y.toFixed(1)} h${(w * 1.24).toFixed(1)}`}
          strokeWidth={1.4}
          opacity="0.7"
          fill="none"
        />,
      );
    }
  }

  // 竹叶：分 3~4 簇，每簇 2~3 片，朝向不同
  const leaves: React.ReactElement[] = [];
  for (let c = 0; c < leafCount; c++) {
    const t = 0.08 + (c / leafCount) * 0.68;
    const bx0 = cx(t);
    const by0 = yAt(t);
    const dir = c % 2 === 0 ? -1 : 1;
    const n = 2 + (c % 2);
    for (let i = 0; i < n; i++) {
      const spread = (r() - 0.5) * 30;
      const len = 26 + r() * 26;
      const ang = (dir < 0 ? 200 : 340) + spread + (i - n / 2) * 16;
      const rad = (ang * Math.PI) / 180;
      const ex = bx0 + Math.cos(rad) * len;
      const ey = by0 + Math.sin(rad) * len;
      const mx = (bx0 + ex) / 2 + (r() - 0.5) * 6;
      const my = (by0 + ey) / 2 - 8 - r() * 6;
      leaves.push(
        <path
          key={`l${c}-${i}`}
          d={`M${bx0.toFixed(1)} ${by0.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
          strokeWidth={1.7 + r() * 1.1}
          fill="none"
          strokeLinecap="round"
        />,
      );
    }
  }

  return (
    <g>
      {nodes}
      {leaves}
    </g>
  );
}

export function BambooGroveScene(): React.ReactElement {
  return (
    <>
      <rect x="0" y="0" width="1440" height="900" fill="url(#sky)" />

      {/* 竹影投墙：斜向的淡影，模拟阳光把竹影打在粉墙上 */}
      <g opacity="0.14" style={{ stroke: 'var(--scene-bamboo)' }} strokeWidth="13" strokeLinecap="round" fill="none">
        <path d="M180 -40 C 250 120, 300 280, 330 440" />
        <path d="M420 -40 C 470 130, 500 290, 516 450" />
        <path d="M250 180 C 320 200, 390 210, 460 208" />
        <path d="M290 300 C 356 318, 420 326, 486 322" />
      </g>
      <g opacity="0.1" style={{ stroke: 'var(--scene-bamboo)' }} strokeWidth="7" fill="none" strokeLinecap="round">
        <path d="M700 -40 C 740 120, 760 280, 770 440" />
        <path d="M860 -40 C 890 130, 900 290, 906 450" />
      </g>

      {/* 远景竹：细、淡、密 */}
      <g style={{ stroke: 'var(--scene-far)', fill: 'none' }} opacity="0.28">
        {Array.from({ length: 16 }).map((_, i) => {
          const x = 40 + i * 92 + ((i * 47) % 30);
          return (
            <Bamboo
              key={i}
              x={x}
              top={-40}
              bottom={780}
              w={2.2}
              lean={(i % 2 === 0 ? 1 : -1) * (0.1 + ((i * 13) % 7) * 0.02)}
              leafCount={2}
              seed={1000 + i * 37}
            />
          );
        })}
      </g>

      {/* 中景竹：中等粗细 */}
      <g style={{ stroke: 'var(--scene-bamboo)', fill: 'none' }} opacity="0.34">
        {Array.from({ length: 9 }).map((_, i) => {
          const x = 90 + i * 168 + ((i * 61) % 44);
          return (
            <Bamboo
              key={i}
              x={x}
              top={-60}
              bottom={840}
              w={4.6}
              lean={(i % 2 === 0 ? 1 : -1) * (0.14 + ((i * 19) % 9) * 0.02)}
              leafCount={3}
              seed={5000 + i * 71}
            />
          );
        })}
      </g>

      {/* 地面：竹叶铺地 + 土色 */}
      <path
        d="M0 812 C 200 792, 420 806, 640 818 C 860 830, 1080 802, 1300 814 C 1370 818, 1414 814, 1440 810 L 1440 900 L 0 900 Z"
        style={{ fill: 'var(--scene-near)' }}
        opacity="0.12"
      />

      {/* 太湖石：左下，瘦皱漏透 */}
      <g style={{ fill: 'var(--scene-near)' }} opacity="0.24">
        <path
          d="M96 812
             C 84 774, 96 742, 118 726
             C 130 716, 136 700, 148 692
             C 168 680, 190 690, 196 710
             C 200 724, 192 736, 198 748
             C 206 762, 224 764, 230 782
             C 236 800, 226 812, 210 814
             Z"
        />
        {/* 漏透：挖两个洞，用背景色覆盖 */}
        <ellipse cx="140" cy="744" rx="9" ry="12" style={{ fill: 'var(--scene-far)' }} opacity="0.5" />
        <ellipse cx="176" cy="784" rx="7" ry="9" style={{ fill: 'var(--scene-far)' }} opacity="0.5" />
        {/* 皱：石面纹理 */}
        <g style={{ stroke: 'var(--scene-near)' }} strokeWidth="1.6" fill="none" opacity="0.5">
          <path d="M118 736 C 132 744, 140 756, 142 772" />
          <path d="M160 704 C 168 720, 170 738, 168 754" />
        </g>
      </g>

      {/* 落叶：地面散点 */}
      <g style={{ fill: 'var(--scene-bamboo)' }} opacity="0.2">
        {Array.from({ length: 34 }).map((_, i) => {
          const x = (i * 137) % 1440;
          const y = 820 + ((i * 73) % 60);
          const rot = (i * 41) % 360;
          return (
            <ellipse key={i} cx={x} cy={y} rx={6.5} ry={1.8} transform={`rotate(${rot} ${x} ${y})`} />
          );
        })}
      </g>

      {/* 前景竹：最粗最实，压边 */}
      <g style={{ stroke: 'var(--scene-near)', fill: 'none' }} opacity="0.4">
        <Bamboo x={1330} top={-80} bottom={900} w={8.5} lean={-0.2} leafCount={4} seed={9001} />
        <Bamboo x={1408} top={-80} bottom={900} w={6.5} lean={-0.1} leafCount={3} seed={9111} />
      </g>

      {/* 林间光雾 */}
      <g opacity="0.3" filter="url(#mistBlur)">
        <rect x="0" y="240" width="1440" height="180" />
      </g>
      <g opacity="0.22" filter="url(#mistBlur)">
        <rect x="0" y="660" width="1440" height="130" />
      </g>
    </>
  );
}
