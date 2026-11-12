/**
 * 通用 UI 组件：按钮、卡片、空状态、面包屑、标签
 */

import React from 'react';
import { getForwardNavCount } from './router';

// ─────────────────────────────────────────────────────────────
// 按钮
// ─────────────────────────────────────────────────────────────

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * quiet  = 无底色文字按钮
   * ghost  = 描边按钮
   * primary = 实底主色
   * create = **创建专用**：更大更深带投影，用于「新建/创建」这类要一眼看到的主操作
   * danger = 危险操作
   */
  variant?: 'primary' | 'ghost' | 'quiet' | 'danger' | 'create';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

/**
 * 按钮
 *
 * 默认变体是 **ghost（描边）而不是 quiet**。
 * 原因：quiet 是无底色纯文字，作为默认会让所有忘记写 variant 的按钮
 * 变成几乎看不见的灰字（曾导致「打开项目」在页头完全无法辨认）。
 * 默认值必须选"最不容易出错"的那个。
 */
export function Btn({
  variant = 'ghost',
  size = 'md',
  icon,
  children,
  className = '',
  ...rest
}: BtnProps): React.ReactElement {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// 创建按钮的前置加号
// ─────────────────────────────────────────────────────────────

/**
 * 「+ 新建」里的加号。
 * 符号先行，扫视时比纯文字更快识别为"创建动作"（docs/01 6.3.2）。
 */
export function PlusMark({ size = 11 }: { size?: number }): React.ReactElement {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} fill="none" aria-hidden="true">
      <path
        d="M6 2.1v7.8M2.1 6h7.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 书名包裹（中空双线 SVG 直角引号）
// ─────────────────────────────────────────────────────────────

/**
 * 书名符号（docs/01 第 3.3 节）—— 两套，不能混
 *
 * 用户原话：「一开始我让你地方去改的书名号...只要它是在导航栏当中的都是用直角引号来进行引用
 *   而在右边页面当中显示的时候是用的是书名号」
 *
 * | 位置 | 符号 |
 * |---|---|
 * | 导航栏里的书名 | **直角引号**（中空双线，正反 L） |
 * | 右侧页面里的书名 | **书名号《》** |
 */

/** 导航栏用：中空双线直角引号（正反 L，左上 + 右下对角互补） */
export function NavBookName({ name }: { name: string }): React.ReactElement {
  return (
    <>
      {/* 开引号：左上角 ┌ */}
      <svg
        className="book-quote"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="square"
        aria-hidden="true"
      >
        <path d="M2.2 11.2V2.2H11.2" />
        <path d="M4.6 11.2V4.6H11.2" />
      </svg>
      <span className="book-name">{name}</span>
      {/* 闭引号：右下角 ┘ */}
      <svg
        className="book-quote"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="square"
        aria-hidden="true"
      >
        <path d="M0.8 9.8H9.8V0.8" />
        <path d="M0.8 7.4H7.4V0.8" />
      </svg>
    </>
  );
}

/** 右侧页面用：中文书名号 */
export function BookName({ name }: { name: string }): React.ReactElement {
  return <span className="book-name">《{name}》</span>;
}

// ─────────────────────────────────────────────────────────────
// 面包屑（docs/01 待确认第 8 条：一级 / 二级 / 三级）
// ─────────────────────────────────────────────────────────────

/**
 * 「← 返回」按钮 —— 全站统一的"返回上一层"。
 *
 * 用户需求：每一个页面右侧都要能返回上一层，之前缺失或卡死。
 * 行为：优先走浏览器历史上一页；若没有可回退的历史（直接打开的深链），
 * 则回退到 fallback 指定的上级路由（默认 /）。
 */
export function BackButton({
  fallback = '/',
  label = '返回',
}: {
  fallback?: string;
  label?: string;
}): React.ReactElement {
  const onClick = () => {
    // 只有存在应用内的「上一页」时才用浏览器后退；
    // 深链直开（直接打开某个详情 URL）时没有应用内上一页，
    // 此时 history.back() 会退到空白页，故改走上级路由兜底。
    if (getForwardNavCount() > 0) {
      window.history.back();
      return;
    }
    if (fallback && fallback !== window.location.pathname) {
      window.history.pushState({}, '', fallback);
      window.dispatchEvent(new Event('loom:navigate'));
    }
  };
  return (
    <button type="button" className="back-btn" onClick={onClick} title="返回上一层">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
        <path
          d="M9.8 3.6 5.4 8l4.4 4.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export function Crumbs({
  items,
  back = true,
  backFallback,
}: {
  items: Array<{ label: string; to?: string }>;
  /** 是否在最左边显示「← 返回」按钮（默认显示） */
  back?: boolean;
  /** 深链直开、无历史可退时，返回按钮指向的上级路由 */
  backFallback?: string;
}): React.ReactElement {
  // 没有显式给 fallback 时，用面包屑里最后一个「可跳转」的上级作为兜底
  const fallback =
    backFallback ?? [...items].reverse().find((it) => Boolean(it.to))?.to ?? '/';
  return (
    <div className="crumbs-bar">
      {back && <BackButton fallback={fallback} />}
      <nav className="crumbs" aria-label="面包屑">
        {items.map((it, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="crumbs-sep" aria-hidden="true">/</span>}
            {it.to ? (
              <a
                className="crumbs-item"
                href={it.to}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  window.history.pushState({}, '', it.to);
                  window.dispatchEvent(new Event('loom:navigate'));
                }}
              >
                {it.label}
              </a>
            ) : (
              <span className="crumbs-item is-current">{it.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 空状态（docs/01 第 9 章：每个页面都要有，且含行动按钮）
// ─────────────────────────────────────────────────────────────

export function Empty({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon ?? <DefaultEmptyIcon />}
      </div>
      <h3 className="empty-title serif">{title}</h3>
      {hint && <p className="empty-hint">{hint}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

function DefaultEmptyIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" fill="none">
      <rect x="12" y="14" width="40" height="36" rx="3" stroke="currentColor" strokeWidth="1.2" opacity=".4" />
      <path d="M20 24h24M20 32h24M20 40h14" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity=".28" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 骨架
// ─────────────────────────────────────────────────────────────

export function Loading({ rows = 4 }: { rows?: number }): React.ReactElement {
  return (
    <div className="loading" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: i === 0 ? 26 : 15, width: i === 0 ? '38%' : `${88 - i * 9}%`, marginBottom: 12 }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 标签
// ─────────────────────────────────────────────────────────────

export function Tag({
  children,
  color,
  title,
}: {
  children: React.ReactNode;
  color?: string;
  title?: string;
}): React.ReactElement {
  return (
    <span
      className="tag"
      title={title}
      style={color ? { borderColor: `${color}55`, color, background: `${color}12` } : undefined}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// 统计块
// ─────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit?: string;
}): React.ReactElement {
  const display = typeof value === 'number' ? value.toLocaleString('zh-CN') : value;
  return (
    <div className="stat">
      <div className="stat-value serif">{display}</div>
      <div className="stat-label">
        {label}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 错误条
// ─────────────────────────────────────────────────────────────

export function ErrorBar({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): React.ReactElement {
  return (
    <div className="error-bar" role="alert">
      <span className="error-bar-text">{message}</span>
      {onRetry && (
        <Btn size="sm" variant="ghost" onClick={onRetry}>
          重试
        </Btn>
      )}
    </div>
  );
}
