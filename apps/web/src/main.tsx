import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

import './styles/tokens.css';
import './styles/texture.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';

const el = document.getElementById('root');
if (!el) throw new Error('找不到 #root');

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
