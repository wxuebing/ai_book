/**
 * 粒子场 —— 便签墙的「科技感」底板
 *
 * 用户原话与原理（2026-11-16）：
 *   「双色离子……像 LED 灯那样跑字幕。商场上面那种字幕灯，它是不是你周围的颜色不一样，
 *    就感觉是在运动一样？霓虹灯换颜色是不是就感觉像在运动，但其实就是哪个灯亮、
 *    哪个灯不亮、哪个灯换颜色就产生了运动感。」
 *   「鼠标移动过去的区域以及它的拖尾能够有波纹，类似于水波，划船那种水波。」
 *   「粒子它是比较小的，就像被鼠标给冲开了一定的区域。」
 *
 * 所以本组件刻意**不让粒子自己飘**：
 *   - 每颗粒子钉在网格上（基准位置不动），运动感来自「双色切换」的序列
 *   - 鼠标 = 扰源：把附近粒子推开形成空腔，位移越大越偏 B 色
 *   - 拖尾 = 沿路径连续留下的波纹环（划船尾迹），逐圈向外扩散并衰减
 *
 * 颜色取自主题变量 --particle-a / --particle-b，换主题粒子跟着变。
 */

import React, { useEffect, useRef } from 'react';

interface Props {
  /** 额外类名 */
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

export function ParticleField({ className = '', gap = 13, radius = 108 }: Props): React.ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 事件挂在父容器（.idea-wall）上：canvas 本身 pointer-events:none，不挡便签点击
    const host = wrap.parentElement ?? wrap;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const readVar = (name: string, fallback: string): string => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    };
    let rgbA = toRgb(readVar('--particle-a', '#7ba3ae'));
    let rgbB = toRgb(readVar('--particle-b', '#c4735a'));

    // 换主题时重新取色
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
    let bx = new Float32Array(0);
    let by = new Float32Array(0);
    let ox = new Float32Array(0);
    let oy = new Float32Array(0);
    let vx = new Float32Array(0);
    let vy = new Float32Array(0);

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
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          bx[k] = i * gap + gap / 2;
          by[k] = j * gap + gap / 2;
        }
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // 鼠标位置（相对容器）
    let mx = -99999;
    let my = -99999;
    let pmx = -99999;
    let pmy = -99999;
    let hasMoved = false;

    const onMove = (e: PointerEvent): void => {
      const r = host.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
      hasMoved = true;
    };
    const onLeave = (): void => {
      mx = -99999;
      my = -99999;
      pmx = -99999;
      pmy = -99999;
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);

    interface Ring {
      x: number;
      y: number;
      r: number;
      life: number;
    }
    const rings: Ring[] = [];
    let lastRingAt = 0;

    let raf = 0;
    let last = performance.now();

    const frame = (now: number): void => {
      const dt = Math.min(32, now - last) / 16.67;
      last = now;
      const t = now * 0.001;

      // 鼠标移动 -> 沿路径按「时间间隔」留下波纹环
      // 用时间间隔而非距离阈值，环与环之间才有明显间隙，扩散时像水波一圈圈推出去
      if (hasMoved && mx > -90000 && now - lastRingAt > 46) {
        rings.push({ x: mx, y: my, r: 4, life: 1 });
        if (rings.length > 14) rings.shift();
        lastRingAt = now;
        pmx = mx;
        pmy = my;
      }
      hasMoved = false;

      ctx.clearRect(0, 0, W, H);

      // 波纹向外扩散并衰减
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]!;
        ring.r += 7.4 * dt;
        ring.life -= 0.021 * dt;
        if (ring.life <= 0) rings.splice(i, 1);
      }

      const maxOff = 11;
      const R2 = radius * radius;

      for (let k = 0; k < bx.length; k++) {
        const px = bx[k]!;
        const py = by[k]!;
        let ax = 0;
        let ay = 0;
        /** 本帧该粒子被「波」扫到的强度，决定双色切换（0=静，1=最亮） */
        let wave = 0;

        // ① 鼠标斥力：推开附近粒子，形成「被冲开的空腔」
        if (mx > -90000) {
          const dx = px + ox[k]! - mx;
          const dy = py + oy[k]! - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < R2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const f = (1 - d / radius) ** 2 * 2.1;
            ax += (dx / d) * f;
            ay += (dy / d) * f;
            wave = Math.max(wave, (1 - d / radius) ** 2 * 0.85);
          }
        }

        // ② 波纹环：只有落在环带上的粒子才被推、才变色 —— 这是「水波」的关键
        // band 略大于粒子间距(gap)，保证每一圈都能扫到至少一排粒子，不留断点
        const bandW = gap * 1.25;
        for (let i = 0; i < rings.length; i++) {
          const ring = rings[i]!;
          const dx = px - ring.x;
          const dy = py - ring.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.01) continue;
          const band = Math.abs(d - ring.r);
          if (band < bandW) {
            const falloff = 1 - band / bandW;
            // 波峰：位移推出去；life 衰减让外圈渐弱
            const f = falloff * falloff * ring.life * 3.2;
            ax += (dx / d) * f;
            ay += (dy / d) * f;
            wave = Math.max(wave, falloff * ring.life);
          }
        }

        // ③ 弹簧回位 + 阻尼（回得快，才不会糊成一片）
        vx[k]! += ax * dt;
        vy[k]! += ay * dt;
        vx[k]! *= 0.86;
        vy[k]! *= 0.86;
        ox[k]! = (ox[k]! + vx[k]! * dt) * 0.90;
        oy[k]! = (oy[k]! + vy[k]! * dt) * 0.90;

        // 位移封顶，避免粒子飞出网格太远
        const off = Math.hypot(ox[k]!, oy[k]!);
        if (off > maxOff) {
          ox[k] = (ox[k]! / off) * maxOff;
          oy[k] = (oy[k]! / off) * maxOff;
        }

        // ④ 双色：主要看「波是否扫到这里」，静止时几乎全 A 色，只留极弱呼吸
        const breathe = reduce ? 0 : 0.5 + 0.5 * Math.sin(t * 0.6 + px * 0.019 + py * 0.015);
        let mix = wave * 0.92 + breathe * 0.06;
        mix = Math.max(0, Math.min(1, mix));

        const cr = (rgbA[0] + (rgbB[0] - rgbA[0]) * mix) | 0;
        const cg = (rgbA[1] + (rgbB[1] - rgbA[1]) * mix) | 0;
        const cb = (rgbA[2] + (rgbB[2] - rgbA[2]) * mix) | 0;
        const alpha = 0.2 + mix * 0.72;
        const size = 1.3 + mix * 1.5;

        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.beginPath();
        ctx.arc(px + ox[k]!, py + oy[k]!, size, 0, Math.PI * 2);
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
