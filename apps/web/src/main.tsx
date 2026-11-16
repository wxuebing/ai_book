import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

import './styles/tokens.css';
import './styles/themes.css';
import './styles/texture.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/gufeng.css';

import { initTheme } from './theme';

// 先落地已保存的主题，再渲染，避免首屏闪一下默认色
initTheme();

const el = document.getElementById('root');
if (!el) throw new Error('找不到 #root');

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
