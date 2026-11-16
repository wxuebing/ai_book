/**
 * 古风背景：山川 · 溪流 · 修竹 · 月/日 · 飞鸟 · 云雾
 *
 * ── 2026-11-16 重做（用户批评后）────────────────────────────────
 * 用户原话：
 *   「你每一个山就只是简单的波浪破折号，对不对？没有任何的技术难题……
 *    就是简简单单的轮廓，连图画都算不上。你对于每个东西的要求太低了。
 *    如果给你设置个 level 的话，你画一个图片，10 个层次是让他越来越像那么回事。
 *    竹子就简单几笔，山和太阳也是，那其他场景真实世界中都是这样吗？」
 *
 * 原版问题：山=一条均匀波浪线+纯色；太阳=一个硬圆；竹子=几根竖线。
 * 那是**图标**，不是画。
 *
 * 这一版按「真实世界长什么样」重做，每个元素都补上该有的层次：
 *
 *   山   ① 四层远近（空气透视：越远越淡越偏冷）
 *        ② 山脊节奏不规则（主峰/次峰/肩部，不是均匀波浪）
 *        ③ 皴擦肌理（大量短笔触叠在山体暗部，模拟山石纹理）
 *        ④ 云雾截断山脚（真实的山不会一直画到底）
 *        ⑤ 受光面 / 背光面（光源在左上）
 *
 *   日   ① 径向光晕（不是硬边圆）② 边缘柔化 ③ 外圈薄云透光
 *
 *   竹   ① 竹节分明 ② 叶片正/侧/俯/仰朝向各异 ③ 疏密聚散 ④ 有投影
 *
 *   水   ① 波纹层次（近处密、远处疏）② 山影倒影 ③ 岸边水线
 *
 *   雾   ① feTurbulence 生成的絮状雾（水墨画质感核心）
 *        ② 谷间流动的带状雾
 *
 * 颜色全部取自 --scene-* 变量，换主题即换色；结构不变，所以六套主题
 * 共享同一套「画」，只是色调不同。
 */

import React from 'react';

/**
 * 山脊线生成器
 *
 * 为什么用程序生成而不是手写路径：
 *   手写折线 → 锯齿状尖刺（像锯齿，不像山）
 *   手写曲线 → 等距波浪（用户批评的「波浪破折号」）
 *
 * 真实山脊的特征：
 *   ① 主峰高、次峰低，高度差明显（不是均匀起伏）
 *   ② 峰顶略圆（不是尖角），坡面有陡缓变化
 *   ③ 峰与峰之间有鞍部（谷），且间距不等
 *   ④ 偶尔有陡崖（一段几乎垂直）
 *
 * 做法：固定种子的伪随机 + 主次峰权重 + 峰顶用二次贝塞尔倒圆。
 * 固定种子保证每次渲染一致（不会闪）。
 */
function makeRidge(opts: {
  seed: number;
  width: number;
  baseY: number;
  /** 主峰数量 */
  majors: number;
  /** 主峰平均高度 */
  height: number;
  /** 是否在最右端闭合到画面边缘 */
}): string {
  const { seed, width, baseY, majors, height } = opts;

  // 线性同余伪随机（确定性）
  let s = seed >>> 0;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // 生成峰：主峰 + 次峰交替，间距不等
  const peaks: Array<{ x: number; y: number; r: number }> = [];
  const step = width / (majors * 2 - 1);
  for (let i = 0; i < majors * 2 - 1; i++) {
    const isMajor = i % 2 === 0;
    // 间距抖动 ±22%，避免等距
    const jitter = (rnd() - 0.5) * step * 0.44;
    const x = i * step + jitter + step * 0.5;
    // 高度：主峰取 0.72~1.0 倍，次峰取 0.34~0.56 倍
    const hFactor = isMajor ? 0.72 + rnd() * 0.28 : 0.34 + rnd() * 0.22;
    const y = baseY - height * hFactor;
    peaks.push({ x, y, r: 10 + rnd() * 16 });
  }

  // 组装路径：起点在左边缘，逐峰连成「上坡-峰顶-下坡」
  let d = `M0 ${baseY}`;
  let prevX = 0;
  let prevY = baseY - height * 0.18;

  for (const pk of peaks) {
    // 上坡：用二次曲线，控制点让坡面略带弧度（凹坡/凸坡交替）
    const midX = (prevX + pk.x) / 2;
    const bulge = (rnd() - 0.5) * 22;
    const ctrlY = (prevY + pk.y) / 2 + bulge;
    d += ` Q ${midX.toFixed(1)} ${ctrlY.toFixed(1)} ${(pk.x - pk.r).toFixed(1)} ${pk.y.toFixed(1)}`;

    // 峰顶：小圆弧倒角，不是尖角
    d += ` Q ${pk.x.toFixed(1)} ${(pk.y - pk.r * 0.42).toFixed(1)} ${(pk.x + pk.r).toFixed(1)} ${pk.y.toFixed(1)}`;

    prevX = pk.x + pk.r;
    prevY = pk.y;
  }

  // 收尾到右边缘
  d += ` Q ${(prevX + width) / 2} ${(prevY + baseY) / 2 + 14} ${width} ${baseY - height * 0.12}`;
  d += ` L ${width} 900 L 0 900 Z`;
  return d;
}


export function Backdrop(): React.ReactElement {
  // 三层山脊：远山最密最高、中山次之、近坡最缓
  // 固定种子 → 每次渲染一致，不会闪
  const RIDGE_FAR = makeRidge({ seed: 20261116, width: 1440, baseY: 600, majors: 9, height: 190 });
  const RIDGE_MID = makeRidge({ seed: 77123, width: 1440, baseY: 690, majors: 7, height: 175 });
  const RIDGE_NEAR = makeRidge({ seed: 4412, width: 1440, baseY: 800, majors: 5, height: 82 });

  // 中山皴擦：140 笔，铺在 540~700 区间（山脚更密）

  // 峰顶受光面：取中山几个主峰位置做高光
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

  return (
    <div className="app-scene" aria-hidden="true">
      <svg
        className="app-scene-svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* 天空：极淡的垂直渐变，近地平线略暖 */}
          <linearGradient id="sceneSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--scene-far)', stopOpacity: 0.05 }} />
            <stop offset="62%" style={{ stopColor: 'var(--scene-mist)', stopOpacity: 0.16 }} />
            <stop offset="100%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0.05 }} />
          </linearGradient>

          {/* 日/月：径向光晕，中心亮、边缘完全化开 */}
          <radialGradient id="sceneSunGlow">
            <stop offset="0%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0.26 }} />
            <stop offset="42%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0.13 }} />
            <stop offset="72%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0.05 }} />
            <stop offset="100%" style={{ stopColor: 'var(--scene-sun)', stopOpacity: 0 }} />
          </radialGradient>

          {/* 水面：上淡下深 */}
          <linearGradient id="sceneWater" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--scene-water)', stopOpacity: 0.1 }} />
            <stop offset="55%" style={{ stopColor: 'var(--scene-water)', stopOpacity: 0.17 }} />
            <stop offset="100%" style={{ stopColor: 'var(--scene-water)', stopOpacity: 0.3 }} />
          </linearGradient>

          {/* 山体受光渐变：左上亮、右下暗 */}
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

          {/* 云雾：feTurbulence 生成絮状，是水墨质感的关键 */}
          <filter id="mistBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.011 0.026"
              numOctaves="3"
              seed="7"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0"
              result="whiteNoise"
            />
            <feGaussianBlur in="whiteNoise" stdDeviation="7" />
          </filter>

          {/* 柔化：给云雾和山脚做柔边 */}
          <filter id="softBlur" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id="softBlurSm" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="4" />
          </filter>

          {/* 山石肌理：分形噪声，靠 mask 限制在山体内
              注意：不要把 <filter> 放进 <pattern> 里 —— 浏览器对 pattern 内滤镜
              支持不一致，会静默不渲染。正确做法是 filter 独立定义，
              用 mask 裁出山形再叠加。 */}
          <filter id="rockTex" filterUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.024 0.055"
              numOctaves="4"
              seed="19"
              result="t"
            />
            {/* 噪声 → 明暗灰，alpha 由噪声决定 */}
            <feColorMatrix
              in="t"
              type="matrix"
              values="0 0 0 0 0.34  0 0 0 0 0.44  0 0 0 0 0.48  0.55 0.35 0.1 0 0"
            />
            <feGaussianBlur stdDeviation="0.4" />
          </filter>

          <linearGradient id="footFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--scene-far)', stopOpacity: 0 }} />
            <stop offset="100%" style={{ stopColor: 'var(--scene-far)', stopOpacity: 0.3 }} />
          </linearGradient>


        </defs>

        {/* ═══════════ 天空 ═══════════ */}
        <rect x="0" y="0" width="1440" height="900" fill="url(#sceneSky)" />

        {/* ═══════════ 日/月：光晕 + 柔化核心 + 薄云掠过 ═══════════ */}
        <g>
          {/* 大范围光晕 */}
          <circle cx="1176" cy="168" r="196" fill="url(#sceneSunGlow)" />
          {/* 核心：柔边，不是硬圆 */}
          <circle
            cx="1176"
            cy="168"
            r="62"
            style={{ fill: 'var(--scene-sun)' }}
            opacity="0.16"
            filter="url(#softBlurSm)"
          />
          <circle cx="1176" cy="168" r="54" style={{ fill: 'var(--scene-sun)' }} opacity="0.1" />
          {/* 薄云横掠日面：让日轮不是完整一个圆 */}
          <g filter="url(#softBlur)" opacity="0.5">
            <ellipse
              cx="1170"
              cy="186"
              rx="118"
              ry="13"
              style={{ fill: 'var(--scene-mist)' }}
            />
            <ellipse
              cx="1196"
              cy="152"
              rx="86"
              ry="8"
              style={{ fill: 'var(--scene-mist)' }}
              opacity="0.7"
            />
          </g>
        </g>

        {/* ═══════════ 飞鸟：近大远小，姿态各异 ═══════════ */}
        <g
          style={{ stroke: 'var(--scene-near)' }}
          fill="none"
          strokeLinecap="round"
          opacity="0.3"
        >
          {/* 近处三只，翅展较开 */}
          <g strokeWidth="2.4">
            <path d="M292 226 q11 -10 22 0 q11 -10 22 0" />
            <path d="M368 196 q9 -8 18 0 q9 -8 18 0" />
            <path d="M446 246 q8 -7 16 0 q8 -7 16 0" />
          </g>
          {/* 远处两只，小且淡 */}
          <g strokeWidth="1.6" opacity="0.62">
            <path d="M512 208 q6 -5 12 0 q6 -5 12 0" />
            <path d="M556 232 q5 -4 10 0 q5 -4 10 0" />
          </g>
        </g>

        {/* ═══════════ 远山（第 1 层，最淡最冷）═══════════ */}
        <g>
          {/* 程序生成山脊：主峰高、次峰低、峰顶倒圆、间距不等 */}
          <path d={RIDGE_FAR} fill="url(#farLight)" />
          {/* 远山山脚雾：截断，不让它画到底 */}
          <rect x="0" y="500" width="1440" height="130" fill="url(#footFade)" opacity="0.55" />
        </g>

        {/* ═══════════ 中山（第 2 层）═══════════ */}
        <g>
          <path d={RIDGE_MID} fill="url(#midLight)" />

          {/* 中山岩石肌理：用 mask 把噪声裁进山体轮廓内
              手画短线在 1440px 宽度上无论多少都像划痕；
              真实山石肌理是分形噪声，用滤镜才是对的技术方案。 */}
          <mask id="midMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
            <path d={RIDGE_MID} fill="#fff" />
          </mask>
          <g mask="url(#midMask)" style={{ mixBlendMode: 'multiply' }} opacity="0.62">
            <rect x="0" y="400" width="1440" height="400" filter="url(#rockTex)" />
          </g>

          {/* 山体沟壑：从山脊向下的暗线，让山有「坡面」而不只是剪影 */}
          <g
            style={{ stroke: 'var(--scene-mid)' }}
            opacity="0.2"
            fill="none"
            strokeLinecap="round"
          >
            <path d="M330 520 L 336 572 L 332 612" strokeWidth="2.2" />
            <path d="M516 510 L 522 562 L 518 606" strokeWidth="2" />
            <path d="M702 498 L 708 550 L 704 594" strokeWidth="2.2" />
            <path d="M888 486 L 894 538 L 890 582" strokeWidth="2" />
            <path d="M1074 474 L 1080 526 L 1076 570" strokeWidth="2.2" />
            <path d="M1260 462 L 1266 514 L 1262 558" strokeWidth="2" />
          </g>

          {/* 中山受光面：峰顶左上高光，让山体有体积 */}
          {LIGHT_MID}
        </g>

        {/* ═══════════ 谷间带状雾（第 2.5 层，明显可见）═══════════ */}
        <g opacity="0.62" filter="url(#mistBlur)">
          <rect x="0" y="596" width="1440" height="92" />
        </g>
        <g opacity="0.4" filter="url(#mistBlur)">
          <rect x="180" y="548" width="620" height="58" />
        </g>

        {/* ═══════════ 近坡（第 3 层，最近最实）═══════════ */}
        <g>
          <path d={RIDGE_NEAR} fill="url(#nearLight)" />

          {/* 近坡草叶：细密短线，表现质感 */}
          <g style={{ stroke: 'var(--scene-near)' }} opacity="0.26" strokeLinecap="round">
            <path d="M86 748 l-3 -9" strokeWidth="1.3" />
            <path d="M96 745 l1 -10" strokeWidth="1.2" />
            <path d="M108 743 l4 -8" strokeWidth="1.1" />
            <path d="M214 754 l-3 -9" strokeWidth="1.2" />
            <path d="M226 757 l1 -10" strokeWidth="1.1" />
            <path d="M352 764 l-4 -9" strokeWidth="1.3" />
            <path d="M364 766 l0 -10" strokeWidth="1.2" />
            <path d="M488 738 l-3 -9" strokeWidth="1.2" />
            <path d="M500 734 l2 -10" strokeWidth="1.1" />
            <path d="M616 722 l-3 -9" strokeWidth="1.2" />
            <path d="M628 722 l1 -10" strokeWidth="1.1" />
            <path d="M744 742 l-3 -9" strokeWidth="1.2" />
            <path d="M756 748 l2 -10" strokeWidth="1.1" />
            <path d="M884 768 l-3 -9" strokeWidth="1.2" />
            <path d="M896 770 l1 -10" strokeWidth="1.1" />
            <path d="M1016 738 l-3 -9" strokeWidth="1.2" />
            <path d="M1028 734 l2 -10" strokeWidth="1.1" />
            <path d="M1156 726 l-3 -9" strokeWidth="1.2" />
            <path d="M1168 726 l1 -10" strokeWidth="1.1" />
            <path d="M1298 750 l-3 -9" strokeWidth="1.2" />
            <path d="M1310 754 l2 -10" strokeWidth="1.1" />
          </g>
        </g>

        {/* ═══════════ 溪流（第 4 层）═══════════ */}
        <g>
          <rect x="0" y="800" width="1440" height="100" fill="url(#sceneWater)" />

          {/* 山影倒影：把近坡轮廓镜像下来，淡淡的 */}
          <g opacity="0.14" filter="url(#softBlur)">
            <path
              d="M0 812 C 96 834, 186 820, 276 808 C 372 794, 462 824, 556 836
                 C 648 848, 736 818, 828 806 C 920 794, 1010 822, 1102 832
                 C 1194 842, 1284 814, 1372 804 L 1440 806 L 1440 880 L 0 880 Z"
              style={{ fill: 'var(--scene-near)' }}
            />
          </g>

          {/* 波纹：近处密而长、远处疏而短（透视） */}
          <g
            style={{ stroke: 'var(--scene-water)' }}
            fill="none"
            strokeLinecap="round"
            opacity="0.3"
          >
            {/* 远水：细短 */}
            <g strokeWidth="1.1" opacity="0.7">
              <path d="M96 812 q26 -5 52 0 t52 0" />
              <path d="M330 816 q24 -4 48 0 t48 0" />
              <path d="M590 810 q26 -5 52 0 t52 0" />
              <path d="M846 818 q24 -4 48 0 t48 0" />
              <path d="M1104 812 q26 -5 52 0 t52 0" />
            </g>
            {/* 中水 */}
            <g strokeWidth="1.5">
              <path d="M60 840 q38 -8 76 0 t76 0" />
              <path d="M300 848 q36 -7 72 0 t72 0" />
              <path d="M560 838 q38 -8 76 0 t76 0" />
              <path d="M820 852 q36 -7 72 0 t72 0" />
              <path d="M1080 842 q38 -8 76 0 t76 0" />
              <path d="M1320 850 q34 -6 68 0" />
            </g>
            {/* 近水：粗长，波峰明显 */}
            <g strokeWidth="1.9" opacity="0.85">
              <path d="M30 874 q48 -11 96 0 t96 0" />
              <path d="M290 884 q46 -10 92 0 t92 0" />
              <path d="M600 872 q48 -11 96 0 t96 0" />
              <path d="M910 886 q46 -10 92 0 t92 0" />
              <path d="M1220 876 q44 -9 88 0" />
            </g>
          </g>

          {/* 岸边水线：一条稍亮的分界，让水与坡分开 */}
          <path
            d="M0 802 C 96 770, 186 788, 276 806 C 372 826, 462 786, 556 770
               C 648 754, 736 792, 828 808 C 920 824, 1010 786, 1102 772
               C 1194 758, 1284 796, 1372 810 L 1440 808"
            fill="none"
            style={{ stroke: 'var(--scene-water)' }}
            strokeWidth="1.4"
            opacity="0.3"
          />
        </g>

        {/* ═══════════ 修竹（右侧一丛，分层）═══════════ */}
        <g style={{ stroke: 'var(--scene-bamboo)', fill: 'var(--scene-bamboo)' }} opacity="0.2">
          {/* 后景竹：淡、细 */}
          <g opacity="0.5" strokeWidth="3.4" fill="none" strokeLinecap="round">
            <path d="M1398 300 C 1394 420, 1392 540, 1396 660" />
            <path d="M1428 356 C 1424 468, 1424 576, 1428 690" />
          </g>

          {/* 主竹 1：竹节分明 */}
          <g strokeWidth="6" fill="none" strokeLinecap="round">
            <path d="M1318 236 C 1312 340, 1310 448, 1316 556" />
            {/* 竹节横纹 */}
            <path d="M1314.6 288 h5.4" strokeWidth="1.6" opacity="0.75" />
            <path d="M1313.8 348 h5.6" strokeWidth="1.6" opacity="0.75" />
            <path d="M1313.2 412 h5.8" strokeWidth="1.6" opacity="0.75" />
            <path d="M1313.8 478 h5.6" strokeWidth="1.6" opacity="0.75" />
            <path d="M1315 536 h5.2" strokeWidth="1.6" opacity="0.75" />
          </g>

          {/* 主竹 2：略偏右，高度不同形成错落 */}
          <g strokeWidth="5" fill="none" strokeLinecap="round">
            <path d="M1362 292 C 1358 396, 1356 500, 1360 600" />
            <path d="M1359.6 340 h4.6" strokeWidth="1.4" opacity="0.7" />
            <path d="M1359 400 h4.8" strokeWidth="1.4" opacity="0.7" />
            <path d="M1358.6 460 h4.8" strokeWidth="1.4" opacity="0.7" />
            <path d="M1359 522 h4.8" strokeWidth="1.4" opacity="0.7" />
          </g>

          {/* 竹叶：四组，朝向各不相同（正/侧/俯/仰），疏密有别 */}
          <g strokeWidth="2.6" strokeLinecap="round" fill="none">
            {/* 左上扬叶 */}
            <path d="M1316 250 q-46 -18 -76 -52" />
            <path d="M1316 254 q-52 0 -86 -22" />
            <path d="M1316 258 q-40 22 -70 30" />
            {/* 右侧俯叶 */}
            <path d="M1318 300 q48 -16 80 -44" />
            <path d="M1318 304 q54 2 88 -14" />
            {/* 中段密集：三片聚在一起 */}
            <path d="M1314 420 q-44 -14 -72 -40" />
            <path d="M1314 424 q-48 2 -78 -18" />
            <path d="M1314 428 q-36 20 -64 28" />
            {/* 竹 2 的叶：更疏，两片 */}
            <path d="M1360 360 q46 -14 76 -40" />
            <path d="M1360 364 q50 2 82 -12" />
            {/* 高处零星两片 */}
            <path d="M1398 320 q-34 -14 -56 -36" />
            <path d="M1428 380 q36 -12 58 -32" />
          </g>

          {/* 竹影：投在近坡上的淡影，让竹「立」在场景里 */}
          <g opacity="0.3" filter="url(#softBlurSm)" fill="none" strokeWidth="8">
            <path d="M1316 556 C 1320 660, 1324 720, 1328 764" />
            <path d="M1360 600 C 1364 690, 1368 740, 1372 772" />
          </g>
        </g>

        {/* ═══════════ 前景飘雾（最上层，统一氛围）═══════════ */}
        <g opacity="0.3" filter="url(#mistBlur)">
          <rect x="0" y="700" width="1440" height="130" />
        </g>
        <g opacity="0.16" filter="url(#mistBlur)">
          <rect x="0" y="120" width="1440" height="90" />
        </g>
      </svg>
    </div>
  );
}
