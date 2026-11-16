/**
 * 粒子场 —— 便签墙的「科技感」底板
 *
 * ── 原理（照用户对 LED 字幕灯的解释）────────────────────────────
 *   「像 LED 灯那样跑字幕……哪个灯亮、哪个灯不亮、哪个灯换颜色就产生了运动感。」
 *   「粒子它是比较小的，就像被鼠标给冲开了一定的区域。」
 *   「鼠标移动的区域以及它的拖尾能够有波纹，类似于水波，划船那种水波。」
 *
 * 所以粒子**不自己飘**：钉在网格上，运动感来自双色切换 + 被推开后的回弹。
 *
 * ── 2026-11-16 第二轮：让运动"自然"──────────────────────────
 * 用户反馈：「粒子的移动规律还是不自然，这只能你自己去调试。」
 *
 * 第一版为什么不自然（三个根因）：
 *   ① 单帧冲量 + 每帧乘 0.90 指数衰减 → 位移单调回落，没有过冲，
 *      像"橡皮筋被拉一下松开"，不像水被划开后先涌起再落回。
 *   ② 所有粒子同相位、同速度衰减 → 整片一起动，没有"波从近到远传过去"的感觉。
 *   ③ 波纹环是刚性的同心圆，边带内所有粒子被等量推 → 像音波扩散，不像水。
 *
 * 这一版改成「弹簧-阻尼-驱动」系统：
 *   · 每颗粒子有独立的固有频率（带一点随机），所以不同位置的粒子响应快慢不同
 *   · 用欠阻尼（damping ratio < 1）→ 天然产生过冲和余振，这是"自然"的关键
 *   · 波的传播有延迟：按粒子到波源的距离给一个相位偏移，
 *     远的粒子晚一点动，形成"波推过去"的连续感
 *   · 波纹带改成高斯分布而非硬边，衰减用 1/(1+d) 而不是线性
 *   · 鼠标移动的冲量按实际速度加权：慢移轻推、快划重推
 *   · 静止时有极慢的呼吸，但每颗粒子相位不同（用坐标哈希），避免整片同步闪烁
 *
 * 颜色取自 --particle-a / --particle-b，换主题粒子跟着变。
 */

import React, { useEffect, useRef } from 'react';

interface Props {
  className?: string;
  /** 粒子网格间距（px）：越小越密 */
  gap?: number;
  /** 鼠标影响半径（px） */
  radius?: number;
}

/** #rgb / #rrggbb -> [r,g,b] */
function toRgb(s: string): [number, number, number] {
  const h = s.trim().replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0]! + h[0]!, 16),
      parseInt(h[1]! + h[1]!, 16),
      parseInt(h[2]! + h[2]!, 16),
    ];
  }
  if (h.length < 6) return [128, 128, 128];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** 稳定的伪随机（按坐标），保证每颗粒子的"个性"固定 */
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function ParticleField({ className = '', gap = 13, radius = 112 }: Props): React.ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const host = wrap.parentElement ?? wrap;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const readVar = (name: string, fallback: string): string => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    };
    let rgbA = toRgb(readVar('--particle-a', '#7ba3ae'));
    let rgbB = toRgb(readVar('--particle-b', '#c4735a'));

    const themeObs = new MutationObserver(() => {
      rgbA = toRgb(readVar('--particle-a', '#7ba3ae'));
      rgbB = toRgb(readVar('--particle-b', '#c4735a'));
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cols = 0;
    let rows = 0;

    // 基准位置
    let bx = new Float32Array(0);
    let by = new Float32Array(0);
    // 位移 / 速度
    let ox = new Float32Array(0);
    let oy = new Float32Array(0);
    let vx = new Float32Array(0);
    let vy = new Float32Array(0);
    // 每颗粒子的个性：固有频率倍率 + 呼吸相位
    let freq = new Float32Array(0);
    let phase = new Float32Array(0);

    const resize = (): void => {
      const r = wrap.getBoundingClientRect();
      W = Math.max(1, Math.floor(r.width));
      H = Math.max(1, Math.floor(r.height));
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cols = Math.floor(W / gap) + 1;
      rows = Math.floor(H / gap) + 1;
      const n = cols * rows;
      bx = new Float32Array(n);
      by = new Float32Array(n);
      ox = new Float32Array(n);
      oy = new Float32Array(n);
      vx = new Float32Array(n);
      vy = new Float32Array(n);
      freq = new Float32Array(n);
      phase = new Float32Array(n);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          const px = i * gap + gap / 2;
          const py = j * gap + gap / 2;
          bx[k] = px;
          by[k] = py;
          // 固有频率 0.86~1.14：让不同位置的粒子响应快慢有细微差别
          freq[k] = 0.86 + hash2(px, py) * 0.28;
          // 呼吸相位 0~2π：避免整片同步闪
          phase[k] = hash2(py, px) * Math.PI * 2;
        }
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // 鼠标状态
    let mx = -99999;
    let my = -99999;
    let hasMoved = false;
    /** 本次移动的速度（px/帧），用于加权冲量：慢移轻推、快划重推 */
    let moveSpeed = 0;

    const onMove = (e: PointerEvent): void => {
      const r = host.getBoundingClientRect();
      const nx = e.clientX - r.left;
      const ny = e.clientY - r.top;
      if (mx > -90000) {
        moveSpeed = Math.hypot(nx - mx, ny - my);
      } else {
        moveSpeed = 0;
      }
      mx = nx;
      my = ny;
      hasMoved = true;
    };
    const onLeave = (): void => {
      mx = -99999;
      my = -99999;
      moveSpeed = 0;
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);

    /**
     * 波源：每个点记录位置、出生时间、强度
     * 不再维护"半径不断增大的圆环"，而是让每颗粒子自己根据
     * 「距离 - 波速*已过时间」算出自己此刻处在波的哪个相位。
     * 这样天然产生"波从中心传到边缘"的延迟感，而不是整圈同时亮。
     */
    interface Wave {
      x: number;
      y: number;
      born: number;
      strength: number;
    }
    const waves: Wave[] = [];
    let lastWaveAt = 0;

    const WAVE_SPEED = 0.30; // px / ms —— 慢一点，看得清"推过去"的过程
    const WAVE_LIFE = 2400; // ms
    const MAX_WAVES = 22;

    let raf = 0;
    let last = performance.now();

    const frame = (now: number): void => {
      const dtMs = Math.min(40, now - last);
      const dt = dtMs / 16.67;
      last = now;
      const t = now * 0.001;

      // 沿路径按时间间隔撒波源（不是每帧都撒，避免糊成一片）
      if (hasMoved && mx > -90000 && now - lastWaveAt > 42) {
        waves.push({
          x: mx,
          y: my,
          born: now,
          // 速度加权：0.35（慢移）~1.0（快划）
          strength: 0.35 + Math.min(1, moveSpeed / 26) * 0.65,
        });
        if (waves.length > MAX_WAVES) waves.shift();
        lastWaveAt = now;
      }
      hasMoved = false;

      // 淘汰过期波源
      for (let i = waves.length - 1; i >= 0; i--) {
        if (now - waves[i]!.born > WAVE_LIFE) waves.splice(i, 1);
      }

      ctx.clearRect(0, 0, W, H);

      const R2 = radius * radius;
      // 欠阻尼弹簧：ω0 是固有角频率，ζ 是阻尼比
      // ζ 越小过冲越明显、余振越久。0.22 有肉眼可见的"回弹再落定"
      const ZETA = 0.22;

      for (let k = 0; k < bx.length; k++) {
        const px = bx[k]!;
        const py = by[k]!;
        const cx = px + ox[k]!;
        const cy = py + oy[k]!;

        let ax = 0;
        let ay = 0;
        /** 本帧的"被波扫到"强度，决定双色切换 */
        let wave = 0;

        // ① 鼠标斥力：形成被冲开的空腔
        // 用 (1-d/R)^2.4 让中心强、边缘迅速衰减，空腔边界清晰而不糊
        if (mx > -90000) {
          const dx = cx - mx;
          const dy = cy - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < R2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const q = 1 - d / radius;
            const f = q * q * Math.sqrt(q) * 2.4;
            ax += (dx / d) * f;
            ay += (dy / d) * f;
            wave = Math.max(wave, q * q * 0.9);
          }
        }

        // ② 波源：按「距离 - 波速*时间」算相位，天然带传播延迟
        for (let i = 0; i < waves.length; i++) {
          const w = waves[i]!;
          const age = now - w.born;
          const dx = cx - w.x;
          const dy = cy - w.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.01) continue;
          // 波前半径：从 0 扩散出去
          const front = age * WAVE_SPEED;
          const band = d - front;
          // 波只在「已到达、且没跑太远」的窄带里存在
          // 带宽随年龄略增（色散），并且用高斯衰减而非硬边
          const width = 15 + age * 0.022;
          if (band > -width && band < width) {
            // 高斯包络：中心最强
            const g = Math.exp(-(band * band) / (width * width * 0.42));
            // 生命衰减：1/(1+age/τ)，τ 调大让波活得久一点
            const decay = 1 / (1 + age / 1050);
            // 距离衰减：越远越弱，但别太快
            const distDecay = 1 / (1 + d / 260);
            const amp = g * decay * distDecay * w.strength;
            // 推的方向：从波源向外
            ax += (dx / d) * amp * 4.6;
            ay += (dy / d) * amp * 4.6;
            wave = Math.max(wave, amp * 1.25);
          }
        }

        // ③ 欠阻尼弹簧回位
        // a = -ω0²·x - 2ζω0·v   （标准二阶系统）
        const w0 = 0.24 * freq[k]!;
        const c = 2 * ZETA * w0;
        ax += -w0 * w0 * ox[k]! - c * vx[k]!;
        ay += -w0 * w0 * oy[k]! - c * vy[k]!;

        // 积分（半隐式欧拉，稳定）
        vx[k]! += ax * dt;
        vy[k]! += ay * dt;
        // 限速，避免数值爆炸
        const sp = Math.hypot(vx[k]!, vy[k]!);
        if (sp > 2.6) {
          vx[k] = (vx[k]! / sp) * 2.6;
          vy[k] = (vy[k]! / sp) * 2.6;
        }
        ox[k]! += vx[k]! * dt;
        oy[k]! += vy[k]! * dt;

        // 位移封顶（留一点余量给过冲）
        const off = Math.hypot(ox[k]!, oy[k]!);
        if (off > 13) {
          ox[k] = (ox[k]! / off) * 13;
          oy[k] = (oy[k]! / off) * 13;
        }

        // ④ 双色 + 亮度
        // 呼吸：每颗粒子相位独立，幅度极低，只在余光里"活着"
        const breathe = reduce ? 0 : 0.5 + 0.5 * Math.sin(t * 0.55 + phase[k]!);
        // 位移也会带来一点变色（被推开的地方更亮），但权重低于波
        const dispMix = Math.min(1, off / 13) * 0.35;
        let mix = Math.max(wave * 0.95, dispMix) + breathe * 0.05;
        mix = Math.max(0, Math.min(1, mix));

        const cr = (rgbA[0] + (rgbB[0] - rgbA[0]) * mix) | 0;
        const cg = (rgbA[1] + (rgbB[1] - rgbA[1]) * mix) | 0;
        const cb = (rgbA[2] + (rgbB[2] - rgbA[2]) * mix) | 0;
        const alpha = 0.18 + mix * 0.76;
        const size = 1.25 + mix * 1.5;

        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObs.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
    };
  }, [gap, radius]);

  return (
    <div ref={wrapRef} className={`particle-field ${className}`.trim()}>
      <canvas ref={canvasRef} className="particle-field-canvas" aria-hidden="true" />
    </div>
  );
}
