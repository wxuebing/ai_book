/**
 * Markdown 块渲染器（docs/03 第 8 章）
 *
 * 后端返回结构化 blocks，前端渲染 React 组件 —— 天然防 XSS。
 * 绝不使用 dangerouslySetInnerHTML 渲染用户内容。
 */

import React from 'react';
import type { Block, InlineToken } from './api';
import { navigate } from './router';

interface Props {
  blocks: Block[];
  /** 当前笔记路径，用于解析相对链接 */
  currentPath?: string;
  /** 当前小说 id，用于把笔记里的图片解析到只读资源接口 */
  projectId?: string;
}

export function Markdown({ blocks, currentPath, projectId }: Props): React.ReactElement {
  return <div className="md">{blocks.map((b, i) => renderBlock(b, i, currentPath, projectId))}</div>;
}

function renderBlock(
  block: Block,
  key: number,
  currentPath?: string,
  projectId?: string,
): React.ReactElement | null {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(Math.max(block.level ?? 2, 1), 6);
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      return (
        <Tag key={key} id={block.id} className={`md-h md-h${level}`}>
          {renderInline(block.inline ?? [], currentPath, projectId)}
        </Tag>
      );
    }

    case 'paragraph':
      return (
        <p key={key} className="md-p" id={block.blockId ?? undefined}>
          {renderInline(block.inline ?? [], currentPath, projectId)}
        </p>
      );

    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag key={key} className={`md-list ${block.ordered ? 'is-ordered' : ''}`}>
          {(block.items ?? []).map((item, i) => (
            <li
              key={i}
              className={`md-li ${item.task !== null ? 'is-task' : ''}`}
              style={{ marginLeft: `${(item.depth ?? 0) * 18}px` }}
            >
              {item.task !== null && (
                <span className={`md-task ${item.task === 'x' ? 'is-done' : ''} ${item.task === '/' ? 'is-doing' : ''}`}>
                  {item.task === 'x' ? '✓' : item.task === '/' ? '◐' : ''}
                </span>
              )}
              {renderInline(item.inline, currentPath, projectId)}
            </li>
          ))}
        </Tag>
      );
    }

    case 'code':
      return (
        <pre key={key} className="md-code">
          {block.lang ? <span className="md-code-lang">{block.lang}</span> : null}
          <code>{block.code ?? ''}</code>
        </pre>
      );

    case 'quote':
      return (
        <blockquote key={key} className="md-quote">
          {renderInline(block.inline ?? [], currentPath, projectId)}
        </blockquote>
      );

    case 'callout':
      return (
        <div key={key} className={`md-callout kind-${block.kind ?? 'note'}`}>
          <div className="md-callout-title">{block.title || block.kind}</div>
          <div className="md-callout-body">
            {(block.blocks ?? []).map((b, i) => renderBlock(b, i, currentPath, projectId))}
          </div>
        </div>
      );

    case 'table':
      return (
        <div key={key} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {(block.header ?? []).map((cell, i) => (
                  <th key={i} style={{ textAlign: alignOf(block.align, i) }}>
                    {renderInline(cell, currentPath, projectId)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(block.rows ?? []).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ textAlign: alignOf(block.align, ci) }}>
                      {renderInline(cell, currentPath, projectId)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'hr':
      return <hr key={key} className="md-hr" />;

    case 'mathblock':
      return (
        <div key={key} className="md-math">
          {block.text}
        </div>
      );

    case 'html':
      // 安全起见：HTML 块原样当文本显示，不执行
      return (
        <pre key={key} className="md-html">
          {block.html}
        </pre>
      );

    default:
      return null;
  }
}

function alignOf(align: Array<string | null> | undefined, i: number): 'left' | 'center' | 'right' | undefined {
  const a = align?.[i];
  if (a === 'left' || a === 'center' || a === 'right') return a;
  return undefined;
}

export function renderInline(
  tokens: InlineToken[],
  currentPath?: string,
  projectId?: string,
): React.ReactNode {
  return tokens.map((t, i) => renderToken(t, i, currentPath, projectId));
}

/**
 * 笔记正文可能含作者随手写的链接；只放行 http(s)/mailto 与站内相对路径。
 * 先去掉控制字符，避免 `java\nscript:` 这类绕过。
 */
function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  const t = href.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (!t) return null;
  if (/^(https?:\/\/|mailto:)/i.test(t)) return t;
  if (t.startsWith('/') || t.startsWith('#')) return t;
  // 不含协议头的相对路径（foo/bar、./x、../x）
  if (/^[^:/?#]+(?:[/?#]|$)/.test(t)) return t;
  return null;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

/** 图片地址：只放行 http(s) 与库内相对路径，其余（javascript:/data:/file:）一律拒绝 */
function assetSrc(raw: string | undefined, projectId?: string): string | null {
  if (!raw) return null;
  const t = raw.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (!projectId) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  const rel = t.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!rel) return null;
  const parts = rel.split('/');
  if (parts.some((p) => p === '' || p === '..')) return null;
  return `/api/project/${encodeURIComponent(projectId)}/asset/${parts.map(encodeURIComponent).join('/')}`;
}

function renderImage(src: string | null, alt: string, key: number): React.ReactNode {
  if (!src) return <span key={key}>{alt}</span>;
  return (
    <figure key={key} className="md-image">
      <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" />
      {alt && <figcaption>{alt}</figcaption>}
    </figure>
  );
}

function renderToken(
  t: InlineToken,
  key: number,
  currentPath?: string,
  projectId?: string,
): React.ReactNode {
  switch (t.type) {
    case 'text':
      return t.text;

    case 'strong':
      return <strong key={key}>{t.text}</strong>;
    case 'em':
      return <em key={key}>{t.text}</em>;
    case 'del':
      return <del key={key}>{t.text}</del>;
    case 'mark':
      return (
        <mark key={key} className="md-mark">
          {t.text}
        </mark>
      );
    case 'code':
      return (
        <code key={key} className="md-inline-code">
          {t.text}
        </code>
      );
    case 'math':
      return (
        <span key={key} className="md-inline-math">
          {t.text}
        </span>
      );

    case 'wikilink': {
      const label = t.alias ?? t.target ?? '';
      // ![[图片.png]]：目标不是 .md，解析器不会索引它，直接走资源接口
      if (t.embed && t.target && IMAGE_EXT.test(t.target.trim())) {
        return renderImage(assetSrc(t.target, projectId), label, key);
      }
      const resolved = t.targetPath !== null && t.targetPath !== undefined;
      if (!resolved) {
        // 断链：红色虚线下划线（docs/04 待确认第 8 条）
        return (
          <span key={key} className="md-wikilink is-broken" title={`断链：${t.target}`}>
            {label}
          </span>
        );
      }
      const to = `/project/note?path=${encodeURIComponent(t.targetPath!)}`;
      return (
        <a
          key={key}
          className="md-wikilink"
          href={to}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            navigate(to);
          }}
          title={t.subpath ? `${t.target}#${t.subpath}` : t.target}
        >
          {label}
          {t.embed ? <span className="md-embed-mark">嵌入</span> : null}
        </a>
      );
    }

    case 'mdlink': {
      const href = safeHref(t.href);
      if (!href) {
        // 危险协议（javascript:/data:/vbscript: 等）不渲染成可点击链接
        return <span key={key}>{t.text}</span>;
      }
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer noopener">
          {t.text}
        </a>
      );
    }

    case 'image':
      return renderImage(assetSrc(t.href, projectId), t.alt ?? '', key);

    case 'tag':
      return (
        <span key={key} className="md-tag">
          #{t.tag}
        </span>
      );

    case 'inlinefield':
      return (
        <span key={key} className="md-field">
          <span className="md-field-key">{t.key}</span>
          <span className="md-field-sep">::</span>
          <span className="md-field-value">{t.value}</span>
        </span>
      );

    default:
      return null;
  }
}

void React;
