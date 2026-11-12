/**
 * 极简 History API 路由（docs/01 第 7 章）
 *
 * 不用 react-router：路由表很稳定，自己实现更小、更可控。
 */

import { useEffect, useState, useCallback } from 'react';

export interface RouteState {
  path: string;
  segments: string[];
}

/**
 * 应用内「向前导航」计数：每次 navigate/pushState 触发 loom:navigate 时 +1。
 * 用来判断「返回上一层」是否真的有应用内上一页可退 —— 深链直开（直接打开
 * /library/:id）时这个计数为 0，此时退回上级路由而不是 history.back()（那会退到
 * 浏览器空白页 about:blank）。
 * popstate（浏览器后退）不算向前导航。
 */
let forwardNavCount = 0;
export function getForwardNavCount(): number {
  return forwardNavCount;
}

function current(): RouteState {
  const path = window.location.pathname;
  return { path, segments: path.split('/').filter(Boolean).map(decodeURIComponent) };
}

/** 订阅路由变化 */
export function useRoute(): RouteState {
  const [route, setRoute] = useState<RouteState>(current);

  useEffect(() => {
    const onChange = () => setRoute(current());
    window.addEventListener('popstate', onChange);
    window.addEventListener('loom:navigate', onChange);
    return () => {
      window.removeEventListener('popstate', onChange);
      window.removeEventListener('loom:navigate', onChange);
    };
  }, []);

  return route;
}

// 统计应用内「向前导航」次数（navigate / Crumbs 的 pushState 都会 dispatch loom:navigate）
if (typeof window !== 'undefined') {
  window.addEventListener('loom:navigate', () => {
    forwardNavCount += 1;
  });
}

/** 编程式跳转 */
export function navigate(to: string, replace = false): void {
  if (to === window.location.pathname) return;
  if (replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  window.dispatchEvent(new Event('loom:navigate'));
}

/** 生成 <a> 的点击处理，保留中键/修饰键的原生行为 */
export function useLinkHandler(): (to: string) => (e: React.MouseEvent) => void {
  return useCallback(
    (to: string) => (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigate(to);
    },
    [],
  );
}

import type React from 'react';
