/**
 * 关系图 —— 照搬 Obsidian Graph View 的实现方式
 *
 * 依据：docs/04-视觉规范.md 第 8 章
 * 参考：Obsidian Graph View 用 d3-force 做物理模拟，节点大小由**度数**决定
 *      （"The more nodes that reference a given node, the bigger it gets."）
 *
 * 与旧实现的根本差别：
 *   旧：自写力导向 + 按字数定大小 → 看不出层次
 *   新：d3-force（与 Obsidian 同款物理）+ 按度数定大小 → 枢纽节点自然变大，层次分明
 *
 * Obsidian 的默认参数（graph view）：
 *   - 节点半径：4 + 4 * sqrt(degree)，再乘以 nodeSize 缩放
 *   - 连线宽度：1 * linkThickness，随缩放反比
 *   - 斥力：charge force，strength ≈ -300
 *   - 连线距离：linkDistance ≈ 250，strength ≈ 0.4
 *   - 向心力：center force 0.05
 *   - 碰撞：collide radius = 节点半径 + 2
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { GraphResponse } from './api';

// ─────────────────────────────────────────────────────────────
// 数据模型
// ─────────────────────────────────────────────────────────────

interface GNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: string | null;
  color: string;
  words: number;
  degree: number;
  radius: number;
  /** 文件路径，用于打开 */
  path: string;
}

interface GLink extends SimulationLinkDatum<GNode> {
  source: string | GNode;
  target: string | GNode;
  kind: string;
  label: string;
  origin: string;
}

/** 关系线色（docs/04 第 2.5 节） */
const EDGE_COLOR: Record<string, string> = {
  parallel: '#6E8CA0',
  sequential: '#8A93A8',
  replace: '#9A8FA8',
  oppose: '#B0605A',
  support: '#5B8C6E',
  depend: '#3E8E8A',
  cognate: '#A08A5A',
  erode: '#C4735A',
  contain: '#7BA05B',
  point: '#A8B4C0',
};

// ─────────────────────────────────────────────────────────────
// Obsidian 风格参数（可在操作杆里调）
// ─────────────────────────────────────────────────────────────

const DEFAULTS = {
  /** 节点大小倍率（Obsidian 的 Node size 滑块，0.2–3） */
  nodeSize: 1,
  /** 连线粗细倍率（Obsidian 的 Link thickness，0.2–3） */
  linkThickness: 1,
  /** 斥力强度（Obsidian 的 Force strength） */
  charge: -320,
  /** 连线长度（Obsidian 的 Link distance） */
  linkDistance: 90,
  /** 向心力 */
  centerStrength: 0.06,
  /** 是否显示标签 */
  showLabels: true,
  /** 标签淡出阈值（Obsidian 的 Text fade threshold） */
  textFade: 0.35,
};

/**
 * Obsidian 的节点半径公式：以度数为基准。
 * 度数越高 → 越大。这是"层次"的来源：
 * 枢纽节点（被大量引用）显著大于边缘节点。
 */
function radiusForDegree(degree: number, nodeSize: number): number {
  // 4 + 4*sqrt(degree)：degree=0 → 4，degree=1 → 8，degree=4 → 12，degree=9 → 16
  return (4 + 4 * Math.sqrt(degree)) * nodeSize;
}

// ─────────────────────────────────────────────────────────────
// 组件
// ─────────────────────────────────────────────────────────────

interface Props {
  data: GraphResponse;
  height?: number;
  onOpen?: (path: string) => void;
}

export function Graph({ data, height = 560, onOpen }: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  const rafRef = useRef<number | null>(null);

  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [opts, setOpts] = useState(DEFAULTS);
  const [showPanel, setShowPanel] = useState(false);

  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const dragRef = useRef<{
    node: GNode | null;
    panning: boolean;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
  }>({ node: null, panning: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: false });

  // ── 构建节点与连线，并启动 d3-force ──
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const w = wrap.clientWidth || 800;
    const h = height;

    // 度数统计：这是节点大小的唯一依据（与 Obsidian 一致）
    const degree = new Map<string, number>();
    for (const n of data.nodes) degree.set(n.id, 0);
    for (const e of data.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }

    // 初始位置：黄金角螺旋，避免全部叠在原点
    const nodes: GNode[] = data.nodes.map((n, i) => {
      const angle = i * 2.399963;
      const r = 30 * Math.sqrt(i + 0.6);
      const d = degree.get(n.id) ?? 0;
      return {
        id: n.id,
        path: n.id,
        label: n.label,
        type: n.type,
        color: n.color,
        words: n.words,
        degree: d,
        radius: radiusForDegree(d, optsRef.current.nodeSize),
        x: w / 2 + Math.cos(angle) * r,
        y: h / 2 + Math.sin(angle) * r,
      };
    });

    const links: GLink[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      kind: e.kind,
      label: e.label,
      origin: e.origin,
    }));

    nodesRef.current = nodes;
    linksRef.current = links;

    // ── d3-force 模拟（Obsidian 同款物理）──
    // 注意：forceCenter 没有 .strength()，向心力由 forceX/forceY 的 strength 控制
    const sim = forceSimulation<GNode>(nodes)
      .force(
        'link',
        forceLink<GNode, GLink>(links)
          .id((d) => d.id)
          .distance(optsRef.current.linkDistance)
          .strength(0.4),
      )
      .force('charge', forceManyBody<GNode>().strength(optsRef.current.charge).distanceMax(1200))
      .force('center', forceCenter(w / 2, h / 2))
      .force('collide', forceCollide<GNode>().radius((d) => d.radius + 3).iterations(2))
      .force('x', forceX(w / 2).strength(optsRef.current.centerStrength))
      .force('y', forceY(h / 2).strength(optsRef.current.centerStrength))
      .alpha(1)
      .alphaDecay(0.0228) // Obsidian 默认衰减
      .velocityDecay(0.4);

    simRef.current = sim;
    sim.on('tick', () => {
      /* 渲染由 rAF 驱动，这里不做事 */
    });

    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [data, height]);

  // ── 参数变化时更新力 ──
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const w = wrapRef.current?.clientWidth ?? 800;
    const h = height;

    for (const n of nodesRef.current) {
      n.radius = radiusForDegree(n.degree, opts.nodeSize);
    }

    sim.force(
      'link',
      forceLink<GNode, GLink>(linksRef.current)
        .id((d) => d.id)
        .distance(opts.linkDistance)
        .strength(0.4),
    );
    sim.force('charge', forceManyBody<GNode>().strength(opts.charge).distanceMax(1200));
    sim.force('center', forceCenter(w / 2, h / 2));
    sim.force('collide', forceCollide<GNode>().radius((d) => d.radius + 3).iterations(2));
    sim.force('x', forceX(w / 2).strength(opts.centerStrength));
    sim.force('y', forceY(h / 2).strength(opts.centerStrength));
    sim.alpha(0.5).restart();
  }, [opts, height]);

  // ── 渲染循环 ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const w = wrap.clientWidth;
      const h = height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const indexOf = new Map<string, GNode>();
    for (const n of nodesRef.current) indexOf.set(n.id, n);

    /** 视图变换：世界坐标 → 屏幕坐标 */
    const transform = (w: number, h: number) => {
      const z = zoomRef.current;
      const cx = w / 2;
      const cy = h / 2;
      return (x: number, y: number): [number, number] => [
        (x - cx) * z + cx + panRef.current.x,
        (y - cy) * z + cy + panRef.current.y,
      ];
    };

    const draw = () => {
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const w = wrap.clientWidth;
      const h = height;
      const z = zoomRef.current;
      const o = optsRef.current;
      const toScreen = transform(w, h);

      ctx.clearRect(0, 0, w, h);

      const activeId = hovered ?? selected;
      const neighbors = new Set<string>();
      if (activeId) {
        neighbors.add(activeId);
        for (const l of links) {
          const s = typeof l.source === 'object' ? l.source.id : l.source;
          const t = typeof l.target === 'object' ? l.target.id : l.target;
          if (s === activeId) neighbors.add(t);
          if (t === activeId) neighbors.add(s);
        }
      }

      // ── 连线（先画，压在节点下）──
      for (const l of links) {
        const s = typeof l.source === 'object' ? l.source : indexOf.get(l.source as string);
        const t = typeof l.target === 'object' ? l.target : indexOf.get(l.target as string);
        if (!s || !t || s.x == null || t.x == null) continue;

        const [x1, y1] = toScreen(s.x, s.y!);
        const [x2, y2] = toScreen(t.x, t.y!);

        const linked = activeId
          ? (s.id === activeId || t.id === activeId)
          : false;
        const dim = activeId !== null && !linked;

        // Obsidian：连线粗细随缩放反比，保证缩小时线仍可见
        const baseW = 1 * o.linkThickness;
        ctx.globalAlpha = dim ? 0.06 : linked ? 0.9 : 0.28;
        ctx.strokeStyle = EDGE_COLOR[l.kind] ?? EDGE_COLOR.point!;
        ctx.lineWidth = Math.max(0.4, baseW / Math.max(z, 0.4));
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // ── 节点 ──
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        const [sx, sy] = toScreen(n.x, n.y);
        const r = Math.max(1.5, n.radius * z);

        const filtered = typeFilter !== null && n.type !== typeFilter;
        const isNeighbor = neighbors.has(n.id);
        const dim = filtered || (activeId !== null && !isNeighbor);

        // 填充：Obsidian 用实心 + 低不透明度，hover 时提亮
        ctx.globalAlpha = dim ? 0.12 : n.id === activeId ? 1 : 0.85;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();

        // 描边：同色更深一圈，让节点在浅底上有边界
        ctx.globalAlpha = dim ? 0.1 : 0.95;
        ctx.lineWidth = Math.max(1, 1.2 * z);
        ctx.strokeStyle = n.id === activeId ? '#1F414B' : shade(n.color, -0.28);
        ctx.stroke();

        // 选中光环
        if (n.id === activeId) {
          ctx.globalAlpha = 0.28;
          ctx.beginPath();
          ctx.arc(sx, sy, r + 5 * z, 0, Math.PI * 2);
          ctx.strokeStyle = n.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // ── 标签（最后画，压在最上）──
      if (o.showLabels) {
        // docs/04 8.0：标签可见性按「缩放级别 + 度数」判断，不按节点半径
        //   ≥100%  → 所有节点都显示名称（默认视图必须信息完整）
        //   60-100% → 度数 ≥1 的节点
        //   <60%   → 度数 ≥3 的枢纽节点
        const zoomPct = z * 100;
        for (const n of nodes) {
          if (n.x == null || n.y == null) continue;
          const filtered = typeFilter !== null && n.type !== typeFilter;
          if (filtered) continue;

          const active = n.id === activeId || neighbors.has(n.id);
          const visibleByZoom =
            zoomPct >= 100 ? true : zoomPct >= 60 ? n.degree >= 1 : n.degree >= 3;
          // 用户手动调淡出阈值时，仍尊重该设置作为额外收紧条件
          const byFade = zoomPct >= 100 ? true : n.radius * z >= 7 / Math.max(o.textFade, 0.1);
          if (!active && !(visibleByZoom && byFade)) continue;

          const [sx, sy] = toScreen(n.x, n.y);
          const r = n.radius * z;
          const dim = activeId !== null && !active;
          ctx.globalAlpha = dim ? 0.16 : active ? 1 : 0.82;

          const fontSize = Math.max(10, Math.min(14, r * 0.95));
          ctx.font = `400 ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
          ctx.fillStyle = '#1A2E34';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          const maxChars = Math.max(6, Math.floor(fontSize * 1.1));
          const text =
            n.label.length > maxChars ? n.label.slice(0, maxChars) + '…' : n.label;
          ctx.fillText(text, sx, sy + r + 3);
        }
      }

      ctx.globalAlpha = 1;
    };

    let alive = true;
    const loop = () => {
      if (!alive) return;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    // ── 交互 ──
    const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const w = wrap.clientWidth;
      const h = height;
      const z = zoomRef.current;
      const cx = w / 2;
      const cy = h / 2;
      return {
        x: (mx - panRef.current.x - cx) / z + cx,
        y: (my - panRef.current.y - cy) / z + cy,
      };
    };

    const hitTest = (clientX: number, clientY: number): GNode | null => {
      const p = toWorld(clientX, clientY);
      let best: GNode | null = null;
      let bestD = Infinity;
      for (const n of nodesRef.current) {
        if (n.x == null || n.y == null) continue;
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        const r = n.radius + 6;
        if (d <= r && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const n = hitTest(e.clientX, e.clientY);
      dragRef.current = {
        node: n,
        panning: !n,
        sx: e.clientX,
        sy: e.clientY,
        ox: panRef.current.x,
        oy: panRef.current.y,
        moved: false,
      };
      if (n) {
        n.fx = n.x;
        n.fy = n.y;
        simRef.current?.alphaTarget(0.3).restart();
      }
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d.node) {
        d.moved = true;
        const p = toWorld(e.clientX, e.clientY);
        d.node.fx = p.x;
        d.node.fy = p.y;
        return;
      }
      if (d.panning) {
        d.moved = true;
        panRef.current = {
          x: d.ox + (e.clientX - d.sx),
          y: d.oy + (e.clientY - d.sy),
        };
        return;
      }
      const n = hitTest(e.clientX, e.clientY);
      setHovered(n?.id ?? null);
      canvas.style.cursor = n ? 'pointer' : 'grab';
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d.node) {
        // Obsidian：松手后解除固定，让节点回归力平衡
        d.node.fx = null;
        d.node.fy = null;
        simRef.current?.alphaTarget(0);
        const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
        if (dist < 5 && onOpen) onOpen(d.node.path);
      }
      dragRef.current = { node: null, panning: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: false };
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = Math.max(0.18, Math.min(3.2, zoomRef.current * (e.deltaY > 0 ? 0.92 : 1.08)));
      zoomRef.current = next;
      setZoom(next);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      alive = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [data, height, hovered, selected, typeFilter, onOpen]);

  // ── fitToView：Obsidian 布局完成后必须做，否则图缩在角落 ──
  const fitToView = useCallback(() => {
    const wrap = wrapRef.current;
    const nodes = nodesRef.current;
    if (!wrap || nodes.length === 0) return;
    const w = wrap.clientWidth;
    const h = height;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x == null || n.y == null) continue;
      minX = Math.min(minX, n.x - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    if (!Number.isFinite(minX)) return;

    const pad = 48;
    const gw = Math.max(1, maxX - minX);
    const gh = Math.max(1, maxY - minY);
    const z = Math.max(0.18, Math.min(2.4, Math.min((w - pad * 2) / gw, (h - pad * 2) / gh)));

    zoomRef.current = z;
    setZoom(z);

    // 把包围盒中心对齐到画布中心
    const cxWorld = (minX + maxX) / 2;
    const cyWorld = (minY + maxY) / 2;
    panRef.current = {
      x: -(cxWorld - w / 2) * z,
      y: -(cyWorld - h / 2) * z,
    };
  }, [height]);

  /** 力场稳定后自动 fit 一次 */
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const onEnd = () => fitToView();
    sim.on('end', onEnd);
    return () => {
      sim.on('end', null);
    };
  }, [data, height, fitToView]);

  const types = Array.from(new Set(data.nodes.map((n) => n.type ?? '未归类')));
  const selectedNode = data.nodes.find((n) => n.id === selected);
  const selectedDeg = selected ? nodesRef.current.find((n) => n.id === selected)?.degree ?? 0 : 0;

  return (
    <div className="graph" ref={wrapRef}>
      <canvas ref={canvasRef} className="graph-canvas" />

      {/* 操作杆（docs/04 第 8.4 节） */}
      <div className="graph-controls">
        <button
          className="graph-btn"
          onClick={() => {
            const n = Math.max(0.18, zoomRef.current * 0.85);
            zoomRef.current = n;
            setZoom(n);
          }}
          title="缩小"
        >
          −
        </button>
        <span className="graph-zoom">{Math.round(zoom * 100)}%</span>
        <button
          className="graph-btn"
          onClick={() => {
            const n = Math.min(3.2, zoomRef.current * 1.18);
            zoomRef.current = n;
            setZoom(n);
          }}
          title="放大"
        >
          +
        </button>
        <button className="graph-btn graph-btn-wide" onClick={fitToView} title="适应视图">
          适应
        </button>
        <button
          className={`graph-btn graph-btn-wide ${showPanel ? 'is-on' : ''}`}
          onClick={() => setShowPanel((v) => !v)}
          title="显示设置"
        >
          显示
        </button>
      </div>

      {/* 显示设置面板（照搬 Obsidian 的 Graph settings） */}
      {showPanel && (
        <div className="graph-settings">
          <div className="graph-settings-title">显示</div>
          <Slider
            label="节点大小"
            value={opts.nodeSize}
            min={0.3}
            max={3}
            step={0.1}
            onChange={(v) => setOpts((o) => ({ ...o, nodeSize: v }))}
          />
          <Slider
            label="连线粗细"
            value={opts.linkThickness}
            min={0.2}
            max={3}
            step={0.1}
            onChange={(v) => setOpts((o) => ({ ...o, linkThickness: v }))}
          />
          <div className="graph-settings-title">力场</div>
          <Slider
            label="斥力"
            value={opts.charge}
            min={-900}
            max={-60}
            step={10}
            onChange={(v) => setOpts((o) => ({ ...o, charge: v }))}
          />
          <Slider
            label="连线长度"
            value={opts.linkDistance}
            min={30}
            max={300}
            step={5}
            onChange={(v) => setOpts((o) => ({ ...o, linkDistance: v }))}
          />
          <Slider
            label="向心力"
            value={opts.centerStrength}
            min={0}
            max={0.5}
            step={0.01}
            onChange={(v) => setOpts((o) => ({ ...o, centerStrength: v }))}
          />
          <div className="graph-settings-title">标签</div>
          <label className="graph-toggle">
            <input
              type="checkbox"
              checked={opts.showLabels}
              onChange={(e) => setOpts((o) => ({ ...o, showLabels: e.target.checked }))}
            />
            <span>显示标签</span>
          </label>
          <Slider
            label="淡出阈值"
            value={opts.textFade}
            min={0.05}
            max={1}
            step={0.05}
            onChange={(v) => setOpts((o) => ({ ...o, textFade: v }))}
          />
          <button className="graph-settings-reset" onClick={() => setOpts(DEFAULTS)}>
            恢复默认
          </button>
        </div>
      )}

      {/* 类型过滤 */}
      {types.length > 1 && (
        <div className="graph-filters">
          <button
            className={`graph-chip ${typeFilter === null ? 'is-on' : ''}`}
            onClick={() => setTypeFilter(null)}
          >
            全部
          </button>
          {types.slice(0, 8).map((t) => (
            <button
              key={t}
              className={`graph-chip ${typeFilter === t ? 'is-on' : ''}`}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* 选中详情 */}
      {selectedNode && (
        <div className="graph-panel">
          <div className="graph-panel-title serif">{selectedNode.label}</div>
          <div className="graph-panel-meta">
            {selectedNode.type ?? '未归类'} · {selectedNode.words} 字 · {selectedDeg} 条连接
          </div>
          <div className="graph-panel-path mono">{selectedNode.id}</div>
          {onOpen && (
            <button className="graph-panel-open" onClick={() => onOpen(selectedNode.id)}>
              打开这篇 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 滑块
// ─────────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <label className="graph-slider">
      <span className="graph-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** 颜色加深/减淡（用于节点描边） */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1]!, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  r = f(r);
  g = f(g);
  b = f(b);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
