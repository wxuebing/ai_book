import React from 'react';
import { Empty } from '../ui';

export function NotFound(): React.ReactElement {
  return (
    <div className="page">
      <Empty
        title="页面不存在"
        hint="这个地址没有对应的页面。可能是链接过期，或功能还没做。"
        action={
          <a className="btn btn-primary btn-md" href="/library">
            回到小说库
          </a>
        }
      />
    </div>
  );
}
