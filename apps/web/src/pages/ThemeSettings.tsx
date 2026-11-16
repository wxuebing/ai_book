/**
 * 设置 → 外观主题
 *
 * 用户要求：在设置里提供不少于五种古风风格，可肆意切换 UI 风格。
 * 这里做成一排主题卡：每张卡拉一幅「迷你山水」预览 + 主题名 + 气质描述 + 配色点。
 * 点一下就即时换肤（写 localStorage，下次打开仍是这套）。
 */

import React, { useState } from 'react';
import { THEMES, loadTheme, saveTheme, applyTheme, type ThemeId, type ThemeMeta } from '../theme';
import { Btn } from '../ui';

export function ThemeSettings(): React.ReactElement {
  const [cur, setCur] = useState<ThemeId>(loadTheme);

  const choose = (id: ThemeId) => {
    setCur(id);
    applyTheme(id);
    saveTheme(id);
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title serif">外观主题</h1>
          <p className="page-sub">
            为工作台换一身古风衣裳 —— 山川、溪流、修竹随主题而变。点一下即时生效，记在本机。
          </p>
        </div>
        {cur !== 'moyun' && (
          <div className="page-actions">
            <Btn size="sm" variant="ghost" onClick={() => choose('moyun')}>
              还原默认
            </Btn>
          </div>
        )}
      </header>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title serif">主题风格</h2>
        </div>
        <p className="section-desc">共 {THEMES.length} 套。当前使用：{meta(cur).name}。</p>

        <div className="theme-grid">
          {THEMES.map((t) => (
            <div
              key={t.id}
              className={`theme-card ${cur === t.id ? 'is-active' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={cur === t.id}
              title={`切换到「${t.name}」`}
              onClick={() => choose(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  choose(t.id);
                }
              }}
            >
              <div className="theme-preview" style={{ background: `linear-gradient(160deg, ${t.paper} 0%, ${t.paper} 46%, ${t.far} 100%)` }}>
                <ThemeScene t={t} />
                {cur === t.id && <span className="theme-badge">当前</span>}
              </div>
              <div className="theme-meta">
                <span className="theme-name serif">{t.name}</span>
                <span className="theme-tag">{t.tagline}</span>
                <span className="theme-dots" aria-hidden="true">
                  <i style={{ background: t.paper }} />
                  <i style={{ background: t.far }} />
                  <i style={{ background: t.accent }} />
                  <i style={{ background: t.ink }} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title serif">说明</h2>
        </div>
        <p className="section-desc">
          主题只改变配色与背景山水，不改动数据与排版。所有主题共用同一套字号与信息层级，
          无论选哪套，正文都保持清晰可读。
        </p>
      </section>
    </>
  );
}

/** 取主题元数据（cur 一定在 THEMES 里，兜底第一项） */
function meta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

/** 迷你山水预览：三层山 + 一轮日月 */
function ThemeScene({ t }: { t: ThemeMeta }): React.ReactElement {
  return (
    <svg viewBox="0 0 300 120" preserveAspectRatio="none" className="theme-scene" aria-hidden="true">
      <circle cx="238" cy="30" r="16" fill={t.accent} opacity="0.16" />
      <path
        d="M0 78 L34 52 L64 66 L96 46 L128 64 L160 44 L196 64 L228 50 L262 66 L300 54 L300 120 L0 120 Z"
        fill={t.far}
        opacity="0.55"
      />
      <path
        d="M0 94 L40 76 L78 88 L118 74 L160 88 L200 74 L244 90 L300 78 L300 120 L0 120 Z"
        fill={t.accent}
        opacity="0.28"
      />
      <g stroke={t.ink} strokeWidth="1" strokeLinecap="round" opacity="0.35" fill="none">
        <path d="M40 40 q4 -4 8 0 q4 -4 8 0" />
        <path d="M72 30 q3 -3 6 0 q3 -3 6 0" />
      </g>
    </svg>
  );
}
