/**
 * API 路由（docs/03-接口契约.md）
 *
 * 命名空间与三大库一一对应：
 *   /api/library/*  → 小说库
 *   /api/project/*  → 项目库
 *   /api/tools/*    → 工具库
 *   /api/nav        → 导航树
 *   /api/events     → SSE
 */

import type { Router, Ctx } from './http.ts';
import { ApiError, ok, SseWriter } from './http.ts';
import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import type { Workspace } from '@loom/core';
import {
  PACKS,
  UNTYPED,
  colorForType,
  excerptOf,
  isMetaType,
  parseConcept,
  parseTypeDef,
  sanitizeFileName,
} from '@loom/core';

export interface ApiDeps {
  ws: Workspace;
  sse: SseWriter;
  /** 服务启动时间，用于健康检查 */
  startedAt: number;
}

export function registerRoutes(router: Router, deps: ApiDeps): void {
  const { ws } = deps;

  // ───────────────────────────────────────────────────────────
  // 0. 健康检查
  // ───────────────────────────────────────────────────────────

  router.get('/api/health', async (ctx) => {
    const meta = await ws.getMeta();
    ok(ctx.res, {
      ok: true,
      workspace: meta.name,
      root: ws.root,
      activeProject: meta.activeProject,
      uptimeMs: Date.now() - deps.startedAt,
    });
  });

  // ───────────────────────────────────────────────────────────
  // 1. 小说库（docs/03 第 2 章）
  // ───────────────────────────────────────────────────────────

  /** 2.1 列出所有小说 */
  router.get('/api/library', async (ctx) => {
    const [projects, meta] = await Promise.all([ws.list(), ws.getMeta()]);
    ok(ctx.res, {
      workspace: meta.name,
      root: ws.root,
      active: meta.activeProject,
      projects,
    });
  });

  /** 2.2 创建小说 */
  router.post('/api/library', async (ctx) => {
    const body = asObject(ctx.body);
    const name = requireString(body, 'name');
    const description = optionalString(body, 'description') ?? '';
    const packs = optionalStringArray(body, 'packs') ?? [];

    const p = await ws.create({ name, description, packs });
    deps.sse.emit('project-created', { id: p.id, name: p.name });
    ok(ctx.res, { id: p.id, name: p.name, path: p.path, dirName: p.dirName }, 201);
  });

  /** 2.6 素材包列表（放在 :id 之前，避免被吃掉） */
  router.get('/api/library/packs', async (ctx) => {
    ok(ctx.res, {
      packs: PACKS.map((p) => ({
        id: p.id,
        label: p.label,
        desc: p.desc,
        types: p.types.map((t) => t.name),
      })),
    });
  });

  /** 2.3 更新小说（可改 name / description / dirName / packs） */
  router.patch('/api/library/:id', async (ctx) => {
    const body = asObject(ctx.body);
    const patch: { name?: string; description?: string; dirName?: string; packs?: string[] } = {};
    const name = optionalString(body, 'name');
    if (name !== undefined) patch.name = name;
    const desc = optionalString(body, 'description');
    if (desc !== undefined) patch.description = desc;
    const dirName = optionalString(body, 'dirName');
    if (dirName !== undefined) patch.dirName = dirName;
    const packs = optionalStringArray(body, 'packs');
    if (packs !== undefined) patch.packs = packs;

    const p = await ws.update(ctx.params.id!, patch);
    if (!p) throw ApiError.notFound(`找不到小说：${ctx.params.id}`);
    ok(ctx.res, p);
  });

  /**
   * 2.5 封面（docs/01 第 3.3.1 节）
   *
   * 用户原话：「左上角显示的是小说的封面用户可以上传图片也可以直接控制是空着
   *   空着的时候是留着图标明白吗空白图标」
   *
   * 存到 `<书>/08-共享/封面.<ext>`，随书走，Obsidian 里也能看到。
   */
  router.post('/api/project/:id/cover', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const body = asObject(ctx.body);
    const b64 = requireString(body, 'data');
    const mime = optionalString(body, 'mime') ?? 'image/jpeg';

    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buf = Buffer.from(b64, 'base64');
    if (buf.length === 0) throw ApiError.badRequest('封面数据为空');
    if (buf.length > 6 * 1024 * 1024) throw ApiError.badRequest('封面不能超过 6MB');

    const dir = nodePath.join(engine.vault.root, '08-共享');
    await fs.mkdir(dir, { recursive: true });
    // 删掉旧封面（不同扩展名）
    for (const old of ['封面.jpg', '封面.png', '封面.webp']) {
      await fs.rm(nodePath.join(dir, old), { force: true }).catch(() => undefined);
    }
    await fs.writeFile(nodePath.join(dir, `封面.${ext}`), buf);
    ok(ctx.res, { saved: `08-共享/封面.${ext}`, size: buf.length }, 201);
  });

  /** 2.5b 读取封面（没有则 404，前端显示占位图标） */
  router.get('/api/project/:id/cover', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const dir = nodePath.join(engine.vault.root, '08-共享');
    for (const [ext, mime] of [
      ['jpg', 'image/jpeg'],
      ['png', 'image/png'],
      ['webp', 'image/webp'],
    ] as const) {
      const p = nodePath.join(dir, `封面.${ext}`);
      try {
        const buf = await fs.readFile(p);
        ctx.res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': String(buf.length),
          'Cache-Control': 'no-cache',
        });
        ctx.res.end(buf);
        return;
      } catch {
        /* 试下一个扩展名 */
      }
    }
    throw ApiError.notFound('这本书还没有封面');
  });

  /** 2.5c 上传便签附件（图片等），返回可在 frontmatter 引用的相对路径 */
  router.post('/api/project/:id/attach', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const body = asObject(ctx.body);
    const b64 = requireString(body, 'data');
    const mime = optionalString(body, 'mime') ?? 'image/png';
    const name = optionalString(body, 'name');
    const ext =
      mime.includes('png') ? 'png'
      : mime.includes('webp') ? 'webp'
      : mime.includes('gif') ? 'gif'
      : 'jpg';
    const buf = Buffer.from(b64, 'base64');
    if (buf.length === 0) throw ApiError.badRequest('附件数据为空');
    if (buf.length > 10 * 1024 * 1024) throw ApiError.badRequest('附件不能超过 10MB');

    const safe = sanitizeFileName(name ?? 'img').slice(0, 40);
    const fileName = `${safe}-${Date.now().toString(36)}.${ext}`;
    const dir = nodePath.join(engine.vault.root, '08-共享', 'attachments');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(nodePath.join(dir, fileName), buf);
    ok(ctx.res, { path: `08-共享/attachments/${fileName}`, size: buf.length }, 201);
  });

  /** 2.5d 读取便签附件 */
  router.get('/api/project/:id/attach/*file', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const rel = ctx.wildcard.replace(/\\/g, '/');
    if (!rel) throw ApiError.badRequest('缺少附件路径');
    // 附件只落 08-共享/attachments/ 下一层，文件名不允许再带目录分隔符
    const prefix = '08-共享/attachments/';
    if (!rel.startsWith(prefix)) throw ApiError.badRequest('非法附件路径');
    const fileName = rel.slice(prefix.length);
    if (
      !fileName ||
      fileName === '.' ||
      fileName === '..' ||
      fileName.includes('/') ||
      fileName.includes('\0')
    ) {
      throw ApiError.badRequest('非法附件路径');
    }
    const p = nodePath.join(engine.vault.root, prefix, fileName);
    const mime =
      fileName.endsWith('.png') ? 'image/png'
      : fileName.endsWith('.webp') ? 'image/webp'
      : fileName.endsWith('.gif') ? 'image/gif'
      : 'image/jpeg';
    try {
      const buf = await fs.readFile(p);
      ctx.res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': String(buf.length),
        'Cache-Control': 'no-cache',
      });
      ctx.res.end(buf);
    } catch {
      throw ApiError.notFound('附件不存在');
    }
  });

  /** 2.4 删除小说（移 .trash） */
  router.delete('/api/library/:id', async (ctx) => {
    const res = await ws.remove(ctx.params.id!);
    if (!res) throw ApiError.notFound(`找不到小说：${ctx.params.id}`);
    ok(ctx.res, res);
  });

  /**
   * 2.4b 归档小说（docs/01 第 3.5 节）
   *
   * 用户原话：「还可以归档项目（本代码项目可以归档一级直接删除，但删除在回收站中，可以恢复归档）」
   *
   * 归档 = 移到 .trash/，但**记录归档信息**，可在「已归档」列表里恢复。
   * 与删除的区别：删除是终态（需手工去 .trash 找回），归档是软删除（可从 UI 恢复）。
   */
  router.post('/api/library/:id/archive', async (ctx) => {
    const res = await ws.archive(ctx.params.id!);
    if (!res) throw ApiError.notFound(`找不到小说：${ctx.params.id}`);
    deps.sse.emit('change', { archived: ctx.params.id });
    ok(ctx.res, res);
  });

  /** 2.4c 列出已归档的小说 */
  router.get('/api/library/archived', async (ctx) => {
    ok(ctx.res, { archived: await ws.listArchived() });
  });

  /** 2.4d 从归档恢复 */
  router.post('/api/library/archived/:id/restore', async (ctx) => {
    const res = await ws.restore(ctx.params.id!);
    if (!res) throw ApiError.notFound(`找不到归档：${ctx.params.id}`);
    deps.sse.emit('project-created', { id: res.id, name: res.name });
    ok(ctx.res, res);
  });

  /** 2.4e 彻底清除某一本归档（真删，不可恢复） */
  router.delete('/api/library/archived/:id', async (ctx) => {
    const res = await ws.purgeArchived(ctx.params.id!);
    if (!res) throw ApiError.notFound(`找不到归档：${ctx.params.id}`);
    ok(ctx.res, res);
  });

  /** 2.4f 彻底清除全部归档（清空回收站） */
  router.post('/api/library/archived/purge-all', async (ctx) => {
    const res = await ws.purgeAllArchived();
    ok(ctx.res, res);
  });

  /** 2.5 激活小说 */
  router.post('/api/library/:id/activate', async (ctx) => {
    const p = await ws.project(ctx.params.id!);
    if (!p) throw ApiError.notFound(`找不到小说：${ctx.params.id}`);
    await ws.activate(p.id);
    ok(ctx.res, { active: p.id });
  });

  // ───────────────────────────────────────────────────────────
  // 2. 项目库（docs/03 第 3 章）
  // ───────────────────────────────────────────────────────────

  const engineOf = async (id: string) => {
    const e = await ws.engine(id);
    if (!e) throw ApiError.notFound(`找不到小说：${id}`);
    return e;
  };

  /** 3.1 项目概览 */
  router.get('/api/project/:id', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const [st, groups, scopes] = await Promise.all([
      engine.stats(),
      engine.groups(),
      engine.scopes(),
    ]);
    ok(ctx.res, {
      name: engine.meta.name,
      path: engine.vault.root,
      notes: st.notes,
      typed: st.typed,
      untyped: st.untyped,
      words: st.words,
      types: st.types,
      concepts: st.concepts,
      relations: st.relations,
      groups,
      scopes,
    });
  });

  /** 3.2 类型分组 */
  router.get('/api/project/:id/groups', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    ok(ctx.res, { groups: await engine.groups() });
  });

  /** 3.3 某类型的全部条目 */
  router.get('/api/project/:id/group/:type', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const data = await engine.entriesOf(ctx.params.type!);
    ok(ctx.res, data);
  });

  /** 3.4 单篇笔记 */
  router.get('/api/project/:id/note/*path', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const rel = ctx.wildcard;
    if (!rel) throw ApiError.badRequest('缺少笔记路径');

    const note = await engine.note(rel);
    if (!note) throw ApiError.notFound(`找不到笔记：${rel}`);

    const [outgoing, backlinks] = await Promise.all([
      engine.outgoing(rel),
      engine.backlinks(rel),
    ]);

    ok(ctx.res, {
      projectId: engine.meta.id,
      path: note.path,
      title: note.title,
      type: note.type,
      folder: note.folder,
      frontmatter: note.frontmatter,
      body: note.body,
      blocks: note.blocks,
      headings: note.headings,
      tags: note.tags,
      links: note.links,
      backlinks: backlinks
        .filter((r) => r.origin !== 'frontmatter-reverse')
        .map((r) => ({
          path: r.source,
          title: r.source.replace(/\.md$/, ''),
          label: r.label,
          kind: r.kind,
        })),
      outgoing: outgoing.map((r) => ({
        path: r.target,
        target: r.targetRaw,
        label: r.label,
        kind: r.kind,
        resolved: r.target !== null,
      })),
      words: note.words,
      mtime: note.mtime,
      scope: note.scope,
      paths: note.paths,
    });
  });

  /** 3.4b 读取笔记里引用的图片（只读、只允许位图，防 SVG/HTML 注入） */
  const ASSET_MIME: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
  };

  router.get('/api/project/:id/asset/*path', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const rel = ctx.wildcard.replace(/\\/g, '/');
    if (!rel) throw ApiError.badRequest('缺少资源路径');
    const mime = ASSET_MIME[nodePath.extname(rel).toLowerCase()];
    if (!mime) throw ApiError.badRequest('不支持的资源类型');
    let abs: string;
    try {
      abs = engine.vault.resolve(rel);
    } catch {
      throw ApiError.badRequest('非法资源路径');
    }
    try {
      const buf = await fs.readFile(abs);
      ctx.res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': String(buf.length),
        'Cache-Control': 'no-cache',
      });
      ctx.res.end(buf);
    } catch {
      throw ApiError.notFound('资源不存在');
    }
  });

  /** 3.4c 导出整本书为单个 Markdown（备份/交付用） */
  router.get('/api/project/:id/export', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const state = await engine.load();
    const notes = state.notes.filter((n) => !isMetaType(n.type));
    const parts: string[] = [`# ${engine.meta.name}`, ''];
    if (engine.meta.description) parts.push(`> ${engine.meta.description}`, '');
    for (const n of notes) {
      parts.push(`## ${n.title}`, '', `<!-- ${n.path} -->`, '', n.body.trim(), '');
    }
    const body = parts.join('\n');
    const filename = `${engine.meta.name}.md`;
    ctx.res.writeHead(200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(body)),
      'Content-Disposition': `attachment; filename="book.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    });
    ctx.res.end(body);
  });

  /** 3.5 更新笔记 */
  router.patch('/api/project/:id/note/*path', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const rel = ctx.wildcard;
    if (!rel) throw ApiError.badRequest('缺少笔记路径');

    const exists = await engine.note(rel);
    if (!exists) throw ApiError.notFound(`找不到笔记：${rel}`);

    const body = asObject(ctx.body);
    await engine.updateNote(rel, {
      frontmatter: isPlainObject(body.frontmatter)
        ? (body.frontmatter as Record<string, unknown>)
        : undefined,
      body: typeof body.body === 'string' ? body.body : undefined,
      append: typeof body.append === 'string' ? body.append : undefined,
    });

    deps.sse.emit('change', { project: ctx.params.id, path: rel });
    const fresh = await engine.note(rel);
    ok(ctx.res, { path: rel, title: fresh?.title ?? '', mtime: fresh?.mtime ?? 0 });
  });

  /** 3.6 删除笔记（真删） */
  router.delete('/api/project/:id/note/*path', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const rel = ctx.wildcard;
    if (!rel) throw ApiError.badRequest('缺少笔记路径');
    const exists = await engine.note(rel);
    if (!exists) throw ApiError.notFound(`找不到笔记：${rel}`);

    await engine.deleteNote(rel);
    deps.sse.emit('change', { project: ctx.params.id, path: rel });
    ok(ctx.res, { deleted: rel });
  });

  /** 3.7 新建条目 */
  router.post('/api/project/:id/entry', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const body = asObject(ctx.body);
    const title = requireString(body, 'title');
    const type = optionalString(body, 'type') ?? null;
    const folder = optionalString(body, 'folder');
    const noteBody = optionalString(body, 'body');
    const frontmatter = isPlainObject(body.frontmatter)
      ? (body.frontmatter as Record<string, unknown>)
      : undefined;

    const created = await engine.createNote({
      title,
      type,
      folder: folder ?? undefined,
      body: noteBody ?? undefined,
      frontmatter,
    });

    deps.sse.emit('change', { project: ctx.params.id, path: created.path });
    ok(ctx.res, created, 201);
  });

  /** 3.8 关系图 */
  router.get('/api/project/:id/graph', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const typesParam = ctx.query.get('types');
    const types = typesParam ? typesParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const centerOn = ctx.query.get('centerOn') ?? undefined;
    const depthRaw = ctx.query.get('depth');
    const depth = depthRaw ? Number(depthRaw) : undefined;

    const g = await engine.graph({
      types,
      centerOn: centerOn || undefined,
      depth: Number.isFinite(depth) ? depth : undefined,
    });
    ok(ctx.res, g);
  });

  /** 3.9 类型定义 */
  router.get('/api/project/:id/types', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const list = await engine.types();
    ok(ctx.res, {
      types: list.map((t) => ({
        name: t.name,
        label: t.label,
        color: t.color ?? colorForType(t.name),
        defaultView: t.defaultView,
        group: t.group,
        hidden: t.hidden,
        fields: t.fields,
        path: t.path,
      })),
    });
  });

  /** 3.9b 新建类型（写一篇 _type 笔记） */
  router.post('/api/project/:id/types', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const body = asObject(ctx.body);
    const name = requireString(body, 'name');
    const fields = Array.isArray(body.fields) ? body.fields : [];
    const defaultView = optionalString(body, 'defaultView') ?? 'list';
    const color = optionalString(body, 'color') ?? colorForType(name);
    const group = optionalString(body, 'group') ?? '设定';

    const created = await engine.createNote({
      title: name,
      type: '_type',
      folder: '07-类型',
      body: `# ${name}\n\n类型定义。\n`,
      frontmatter: {
        name,
        label: name,
        color,
        defaultView,
        group,
        fields,
      },
    });
    deps.sse.emit('change', { project: ctx.params.id, path: created.path });
    ok(ctx.res, created, 201);
  });

  /**
   * 3.9c 更新类型定义（docs/01 第 4.8 节）
   *
   * 可改：label / color / defaultView / group / fields / 改名（name）
   * 改名时同步更新所有引用该类型的条目的 type 字段。
   */
  router.patch('/api/project/:id/types/:name', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const oldName = ctx.params.name!;
    const body = asObject(ctx.body);

    const types = await engine.types();
    const def = types.find((t) => t.name === oldName);
    if (!def) throw ApiError.notFound(`找不到类型：${oldName}`);

    const patch: Record<string, unknown> = {};
    const newName = optionalString(body, 'name');
    if (newName !== undefined && newName.trim() !== '') patch.name = newName.trim();
    const label = optionalString(body, 'label');
    if (label !== undefined) patch.label = label;
    const color = optionalString(body, 'color');
    if (color !== undefined) patch.color = color;
    const view = optionalString(body, 'defaultView');
    if (view !== undefined) patch.defaultView = view;
    const group = optionalString(body, 'group');
    if (group !== undefined) patch.group = group;
    if (Array.isArray(body.fields)) patch.fields = body.fields;

    await engine.updateNote(def.path, { frontmatter: patch });

    // 改名 → 同步所有条目的 type 字段
    if (patch.name && patch.name !== oldName) {
      const state = await engine.load();
      const affected = state.notes.filter((n) => n.type === oldName);
      for (const n of affected) {
        await engine.updateNote(n.path, { frontmatter: { type: patch.name } });
      }
    }

    deps.sse.emit('change', { project: ctx.params.id, path: def.path });
    ok(ctx.res, { name: patch.name ?? oldName, updated: true });
  });

  /**
   * 3.9d 删除类型（docs/01 第 4.8 节）
   *
   * 只删类型定义笔记，**条目本身不删** —— 它们变为未归类，数据零丢失。
   */
  router.delete('/api/project/:id/types/:name', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const name = ctx.params.name!;

    const types = await engine.types();
    const def = types.find((t) => t.name === name);
    if (!def) throw ApiError.notFound(`找不到类型：${name}`);

    // 统计受影响条目（只报告，不修改）
    const state = await engine.load();
    const affected = state.notes.filter((n) => n.type === name).length;

    await engine.deleteNote(def.path);

    // 受影响条目 type 置空 → 归入未归类
    for (const n of state.notes.filter((x) => x.type === name)) {
      await engine.updateNote(n.path, { frontmatter: { type: null } });
    }

    deps.sse.emit('change', { project: ctx.params.id, path: def.path });
    ok(ctx.res, { deleted: name, affected, becameUntyped: affected });
  });

  /**
   * 3.9e 恢复默认类型（docs/01 第 4.8 节）
   *
   * 只重置类型定义（07-类型/），不碰任何内容笔记。
   */
  router.post('/api/project/:id/types/reset', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const body = asObject(ctx.body);
    const packs = optionalStringArray(body, 'packs') ?? [];

    // 删掉现有全部 _type 笔记
    const state = await engine.load();
    const typeNotes = state.notes.filter((n) => n.type === '_type');
    for (const n of typeNotes) {
      await engine.deleteNote(n.path);
    }

    // 重装素材包的类型
    const { PACKS } = await import('@loom/core');
    const installed: string[] = [];
    for (const packId of packs) {
      const pack = PACKS.find((p) => p.id === packId);
      if (!pack) continue;
      for (const t of pack.types) {
        await engine.createNote({
          title: t.name,
          type: '_type',
          folder: '07-类型',
          body: `# ${t.label}\n\n${t.desc}\n`,
          frontmatter: {
            name: t.name,
            label: t.label,
            color: t.color,
            defaultView: t.view,
            group: pack.group,
            fields: t.fields,
          },
        });
        installed.push(t.name);
      }
    }

    deps.sse.emit('reindex', { project: ctx.params.id });
    ok(ctx.res, { removed: typeNotes.length, installed, packs });
  });

  /** 3.10 概念别名 */
  router.get('/api/project/:id/concepts', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    ok(ctx.res, { concepts: await engine.concepts() });
  });

  /** 3.11 作用域查询 */
  router.get('/api/project/:id/scopes', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    ok(ctx.res, await engine.scopes());
  });

  /** 3.12 生效规则计算 */
  router.get('/api/project/:id/active-at', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const space = ctx.query.get('space');
    const time = ctx.query.get('time');
    ok(ctx.res, await engine.activeAt({ space, time }));
  });

  /** 3.13 搜索 */
  router.get('/api/project/:id/search', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const q = ctx.query.get('q') ?? '';
    if (q.trim() === '') throw ApiError.badRequest('缺少查询词 q');
    const limitRaw = ctx.query.get('limit');
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 50, 1), 200) : 50;
    const hits = await engine.search(q, limit);
    ok(ctx.res, { query: q, count: hits.length, hits });
  });

  /** 3.14 重建索引 */
  router.post('/api/project/:id/reindex', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const r = await engine.reindex();
    deps.sse.emit('reindex', { project: ctx.params.id, notes: r.notes, ms: r.ms });
    ok(ctx.res, r);
  });

  /** 一致性检查（docs/03 4.3） */
  router.get('/api/project/:id/check', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    ok(ctx.res, await engine.check());
  });

  /** 全链路回溯 */
  router.get('/api/project/:id/trace', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    const p = ctx.query.get('path');
    if (!p) throw ApiError.badRequest('缺少 path');
    const direction = ctx.query.get('direction') === 'up' ? 'up' : 'down';
    const depth = Number(ctx.query.get('depth') ?? 5) || 5;
    ok(ctx.res, { path: p, direction, nodes: await engine.trace(p, direction, depth) });
  });

  /** 目录清单 */
  router.get('/api/project/:id/folders', async (ctx) => {
    const engine = await engineOf(ctx.params.id!);
    ok(ctx.res, { folders: await engine.folders() });
  });

  // ───────────────────────────────────────────────────────────
  // 3. 工具库（docs/03 第 4 章）
  // ───────────────────────────────────────────────────────────

  /**
   * 4.1 工具清单（平面，不分三级）
   *
   * docs/01 第 5.2 节：工具库只有一层，每个条目就是一个功能页。
   * 知识链接排第一；MCP 对内对外合并为一项；全局搜索移到品牌区；
   * 设置与导入导出移到右下角常驻工具条。
   */
  router.get('/api/tools', async (ctx) => {
    ok(ctx.res, {
      items: [
        { id: 'links', label: '信息关系网', hint: '信息关系网' },
        { id: 'mcp', label: 'MCP', hint: 'MCP' },
        { id: 'skills', label: 'Skills', hint: 'Skills' },
        { id: 'plugins', label: '插件', hint: '插件' },
        { id: 'types', label: '类型管理', hint: '类型管理' },
        { id: 'templates', label: '模板管理', hint: '模板管理' },
        { id: 'check', label: '一致性检查', hint: '一致性检查' },
        { id: 'stats', label: '统计', hint: '统计' },
      ],
    });
  });

  /** 4.2 七种视图定义 */
  router.get('/api/views', async (ctx) => {
    ok(ctx.res, {
      views: {
        list: { label: '列表', hint: '一堆同类条目', needs: [] },
        ladder: { label: '阶梯', hint: '有序层级', needs: ['order'] },
        tree: { label: '树', hint: '包含关系', needs: ['parent'] },
        graph: { label: '图', hint: '任意关系', needs: ['relations'] },
        timeline: { label: '时间轴', hint: '时间序列', needs: ['date'] },
        swimlane: { label: '泳道', hint: '跨度对比', needs: ['span'] },
        table: { label: '表格', hint: '多维属性', needs: [] },
      },
    });
  });

  // ───────────────────────────────────────────────────────────
  // 4. 导航 API（docs/03 第 5 章）
  // ───────────────────────────────────────────────────────────

  router.get('/api/nav', async (ctx) => {
    const meta = await ws.getMeta();
    const projects = await ws.list();
    const activeId = ctx.query.get('active') ?? meta.activeProject;

    // 项目库三级：五个主入口 + 关系网（关系网是具体信息，不进首页）
    const PROJECT_ENTRIES = [
      { id: 'outline', label: '大纲' },
      { id: 'ideas', label: '灵感' },
      { id: 'chapterOutline', label: '章纲' },
      { id: 'threads', label: '线索' },
      { id: 'characters', label: '人物' },
      { id: 'settings', label: '设定' },
      { id: 'graph', label: '关系网' },
    ];

    ok(ctx.res, {
      roots: [
        {
          // 一级 1：小说库（docs/01 2.1）—— 导航栏里不列书
          id: 'library',
          label: '小说库',
          children: [],
        },
        {
          // 一级 2：灵感墙
          id: 'ideas',
          label: '灵感墙',
          children: [],
        },
        {
          // 一级 3：关系网
          id: 'graph',
          label: '关系网',
          children: [],
        },
        {
          id: 'project',
          label: '工作区',
          children: projects.map((p) => ({
            id: p.id,
            label: p.name,
            level: 2,
            expanded: p.id === activeId,
            children: p.id === activeId
              ? PROJECT_ENTRIES.map((e) => ({ id: e.id, label: e.label, level: 3 }))
              : null,
            meta: { words: p.words, chapters: p.chapters, notes: p.notes },
          })),
        },
      ],
      // 设置不在一级导航（docs/01 2.1）—— 在底部，有独立的 6 项二级导航
      settingsTabs: [
        { id: 'plain', label: '普通编辑' },
        { id: 'mcp', label: 'MCP' },
        { id: 'plugins', label: '插件' },
        { id: 'types', label: '类型管理' },
        { id: 'templates', label: '模板管理' },
        { id: 'trash', label: '回收站' },
      ],
      meta: { activeProject: activeId, model: 'four-roots-plus-bottom' },
    });
  });

  // ───────────────────────────────────────────────────────────
  // 5. 事件流（docs/03 第 6 章）
  // ───────────────────────────────────────────────────────────

  router.get('/api/events', async (ctx) => {
    deps.sse.attach(ctx.res);
    deps.sse.emit('hello', { t: Date.now() });
    // 连接保持打开，由客户端断开
    await new Promise<void>((resolve) => {
      ctx.res.on('close', resolve);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// 参数校验工具
// ─────────────────────────────────────────────────────────────

function asObject(body: unknown): Record<string, unknown> {
  if (body === null || body === undefined) return {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('请求体必须是 JSON 对象');
  }
  return body as Record<string, unknown>;
}

function isPlainObject(v: unknown): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function requireString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw ApiError.validation(`字段 ${key} 必填且必须是非空字符串`, { field: key });
  }
  return v.trim();
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (v === null) return undefined;
  if (typeof v !== 'string') {
    throw ApiError.validation(`字段 ${key} 必须是字符串`, { field: key });
  }
  return v;
}

function optionalStringArray(body: Record<string, unknown>, key: string): string[] | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    throw ApiError.validation(`字段 ${key} 必须是字符串数组`, { field: key });
  }
  return v.filter((x): x is string => typeof x === 'string');
}

// 让未使用的 import 保持显式（供后续扩展）
void UNTYPED;
void excerptOf;
void isMetaType;
void parseConcept;
void parseTypeDef;
void ((_x: Ctx) => _x);
