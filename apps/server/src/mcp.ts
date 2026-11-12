/**
 * MCP 协议实现（docs/03 第 7 章）
 *
 * 双通道：
 *   对外（Server）—— 本工作台作为 MCP 服务器，给其他 agent 接入
 *     · stdio      → Claude Desktop / Cursor / Cline
 *     · streamable-http → 远程 agent，POST /mcp
 *   对内（Client）—— 本工作台作为 MCP 客户端，接入外部 MCP 服务
 *
 * 只读 12 个 + 写入 6 个，共 18 个工具。
 */

import type { Workspace } from '@loom/core';
import { UNTYPED, isMetaType } from '@loom/core';

// ─────────────────────────────────────────────────────────────
// JSON-RPC 基础类型
// ─────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export const RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ─────────────────────────────────────────────────────────────
// 工具定义
// ─────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** 只读工具带此标记（docs/03 7.2） */
  readOnlyHint?: boolean;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface McpDeps {
  ws: Workspace;
}

/** 取项目 id：允许省略，缺省用当前激活的书 */
async function resolveProjectId(ws: Workspace, args: Record<string, unknown>): Promise<string> {
  const explicit = typeof args.projectId === 'string' ? args.projectId.trim() : '';
  if (explicit) return explicit;
  const active = await ws.activeId();
  if (active) return active;
  const list = await ws.list();
  if (list.length === 0) throw new Error('工作区里还没有小说，请先用 loom_create_project 建一本');
  return list[0]!.id;
}

async function engineOf(ws: Workspace, args: Record<string, unknown>) {
  const id = await resolveProjectId(ws, args);
  const e = await ws.engine(id);
  if (!e) throw new Error(`找不到小说：${id}`);
  return e;
}

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

function num(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

// ─────────────────────────────────────────────────────────────
// 工具清单（docs/03 7.2）
// ─────────────────────────────────────────────────────────────

export function buildTools(deps: McpDeps): ToolDef[] {
  const { ws } = deps;

  return [
    // ── 只读 ×12 ──────────────────────────────────────────
    {
      name: 'loom_world_overview',
      title: '世界总览',
      readOnlyHint: true,
      description:
        '读取当前小说的世界规模与健康度：笔记数、字数、类型分布、关系数、断链数。' +
        '当你刚接入或需要判断这本书写到哪一步时，先调用它建立全局印象。',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string', description: '小说 id；省略则用当前激活的书' } },
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const [st, groups, check] = await Promise.all([e.stats(), e.groups(), e.check()]);
        return {
          project: e.meta.name,
          id: e.meta.id,
          notes: st.notes,
          words: st.words,
          chapters: st.chapters,
          types: groups.map((g) => ({ type: g.type, label: g.label, count: g.count, view: g.view })),
          relations: st.relations,
          brokenLinks: check.broken.length,
          untyped: check.untyped.length,
        };
      },
    },
    {
      name: 'loom_list_projects',
      title: '列出所有小说',
      readOnlyHint: true,
      description: '列出工作区里的全部小说及各自字数、章节数、笔记数。跨书操作前先看有哪些书。',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const list = await ws.list();
        const active = await ws.activeId();
        return { active, projects: list };
      },
    },
    {
      name: 'loom_search',
      title: '全文检索',
      readOnlyHint: true,
      description:
        '在小说里做全文检索，返回命中笔记的路径、标题、类型与上下文片段。' +
        '写新章节前用它查「这个设定/人物之前怎么写的」，避免前后矛盾。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索词' },
          limit: { type: 'number', description: '返回条数，默认 20' },
          projectId: { type: 'string' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const q = str(args, 'query');
        if (!q) throw new Error('缺少 query');
        const hits = await e.search(q, num(args, 'limit') ?? 20);
        return { query: q, count: hits.length, hits };
      },
    },
    {
      name: 'loom_read_note',
      title: '读取笔记',
      readOnlyHint: true,
      description:
        '读取一篇笔记的完整内容（frontmatter、结构化正文、出链、反链）。' +
        '写任何涉及该条目的内容之前必须读它。',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '笔记相对路径，如 05-人物/沈砚.md' },
          projectId: { type: 'string' },
        },
        required: ['path'],
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const p = str(args, 'path');
        if (!p) throw new Error('缺少 path');
        const note = await e.note(p);
        if (!note) throw new Error(`找不到笔记：${p}`);
        const [outgoing, backlinks] = await Promise.all([e.outgoing(p), e.backlinks(p)]);
        return {
          path: note.path,
          title: note.title,
          type: note.type,
          frontmatter: note.frontmatter,
          body: note.body,
          blocks: note.blocks,
          tags: note.tags,
          headings: note.headings,
          outgoing: outgoing.map((r) => ({
            path: r.target, label: r.label, kind: r.kind, resolved: r.target !== null,
          })),
          backlinks: backlinks.map((r) => ({ path: r.source, label: r.label, kind: r.kind })),
          words: note.words,
          scope: note.scope,
          paths: note.paths,
        };
      },
    },
    {
      name: 'loom_list_entries',
      title: '列出条目',
      readOnlyHint: true,
      description:
        '按类型或目录列出条目清单（含摘要与字数）。想知道「这本书有哪些人物/境界」时用它。',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: '实体类型；省略则列全部类型分组' },
          folder: { type: 'string', description: '按目录过滤' },
          projectId: { type: 'string' },
        },
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const type = str(args, 'type');
        const folder = str(args, 'folder');
        if (!type && !folder) {
          return { groups: await e.groups() };
        }
        if (type) {
          const data = await e.entriesOf(type);
          return folder ? { ...data, notes: data.notes.filter((n) => n.path.startsWith(folder)) } : data;
        }
        const state = await e.load();
        const notes = state.notes
          .filter((n) => n.path.startsWith(folder!))
          .filter((n) => !isMetaType(n.type))
          .map((n) => ({ path: n.path, title: n.title, type: n.type, words: n.words }));
        return { folder, notes };
      },
    },
    {
      name: 'loom_world_map',
      title: '关系图',
      readOnlyHint: true,
      description:
        '取关系网络：节点（笔记）+ 边（关系及其语义）。可只看某几类，或从某个节点出发限定深度。' +
        '判断「谁和谁有关系」「这条线牵到哪」时用它。',
      inputSchema: {
        type: 'object',
        properties: {
          types: { type: 'array', items: { type: 'string' }, description: '只保留这些类型' },
          centerOn: { type: 'string', description: '以该笔记为中心' },
          depth: { type: 'number', description: '中心扩散深度，默认 2' },
          projectId: { type: 'string' },
        },
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const types = Array.isArray(args.types) ? (args.types as string[]) : undefined;
        return e.graph({
          types,
          centerOn: str(args, 'centerOn'),
          depth: num(args, 'depth'),
        });
      },
    },
    {
      name: 'loom_types',
      title: '类型定义',
      readOnlyHint: true,
      description:
        '列出这本书定义的全部实体类型及字段结构。要新建条目但不确定该给什么字段时先看它。',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' } },
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const list = await e.types();
        return {
          types: list.map((t) => ({
            name: t.name, label: t.label, defaultView: t.defaultView,
            group: t.group, fields: t.fields, path: t.path,
          })),
        };
      },
    },
    {
      name: 'loom_concepts',
      title: '概念别名',
      readOnlyHint: true,
      description:
        '列出同物异名：一个概念在不同区域/时代的不同叫法，以及性质是否冲突。' +
        '写跨区域情节前查它，避免把「灵气」和「源力」当成同一个东西。',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' } },
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        return { concepts: await e.concepts() };
      },
    },
    {
      name: 'loom_active_at',
      title: '生效规则',
      readOnlyHint: true,
      description:
        '给定写作坐标（空间/时间），算出此刻哪些条目生效、哪些不生效。' +
        '写跨时代/跨区域章节前必须调用，避免让「地球的武者」出现在「宇宙篇」。',
      inputSchema: {
        type: 'object',
        properties: {
          space: { type: 'string', description: '当前写作位置，如 宇宙' },
          time: { type: 'string', description: '当前时代，如 宇宙历' },
          projectId: { type: 'string' },
        },
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        return e.activeAt({ space: str(args, 'space'), time: str(args, 'time') });
      },
    },
    {
      name: 'loom_check',
      title: '一致性检查',
      readOnlyHint: true,
      description:
        '检查四类问题：断链、作用域冲突、概念冲突、未归类条目。' +
        '交付前或章节写完时跑一次，它替你抓自己看不见的矛盾。',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' } },
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        return e.check();
      },
    },
    {
      name: 'loom_backlinks',
      title: '反向链接',
      readOnlyHint: true,
      description: '谁引用了这篇笔记。改设定前用它看清会波及哪些章节。',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          projectId: { type: 'string' },
        },
        required: ['path'],
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const p = str(args, 'path');
        if (!p) throw new Error('缺少 path');
        const links = await e.backlinks(p);
        return {
          path: p,
          backlinks: links.map((r) => ({
            path: r.source, label: r.label, kind: r.kind, origin: r.origin,
          })),
        };
      },
    },
    {
      name: 'loom_trace',
      title: '全链路回溯',
      readOnlyHint: true,
      description:
        '从一个节点沿关系向上（谁引用了它）或向下（它引用了谁）逐层展开。' +
        '想知道「这个细节服务于哪条主线」或「这个大纲最终落到哪些章节」时用它。',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          direction: { type: 'string', enum: ['up', 'down'], description: '默认 down' },
          depth: { type: 'number', description: '最大层数，默认 5' },
          projectId: { type: 'string' },
        },
        required: ['path'],
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const p = str(args, 'path');
        if (!p) throw new Error('缺少 path');
        const direction = args.direction === 'up' ? 'up' : 'down';
        return {
          path: p,
          direction,
          nodes: await e.trace(p, direction, num(args, 'depth') ?? 5),
        };
      },
    },

    // ── 写入 ×6 ──────────────────────────────────────────
    {
      name: 'loom_create_entry',
      title: '新建条目',
      readOnlyHint: false,
      description:
        '新建一篇笔记（人物、设定、章节…）。不需要先定义类型 —— 类型可以留空，之后再归类。' +
        '这是「先写后归类」的入口，永远不阻塞创作。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '条目标题' },
          type: { type: 'string', description: '实体类型，可省略' },
          folder: { type: 'string', description: '目标目录，可省略（按类型自动选）' },
          body: { type: 'string', description: '正文 Markdown' },
          frontmatter: { type: 'object', description: 'frontmatter 键值' },
          projectId: { type: 'string' },
        },
        required: ['title'],
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const title = str(args, 'title');
        if (!title) throw new Error('缺少 title');
        return e.createNote({
          title,
          type: str(args, 'type') ?? null,
          folder: str(args, 'folder'),
          body: str(args, 'body'),
          frontmatter:
            args.frontmatter && typeof args.frontmatter === 'object'
              ? (args.frontmatter as Record<string, unknown>)
              : undefined,
        });
      },
    },
    {
      name: 'loom_update_entry',
      title: '更新条目',
      readOnlyHint: false,
      description:
        '更新已有笔记：合并 frontmatter、替换正文、或在末尾追加。' +
        '追加适合「记一笔新进展」而不想重写全文的场景。',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          frontmatter: { type: 'object' },
          body: { type: 'string', description: '替换全文正文' },
          append: { type: 'string', description: '追加到正文末尾' },
          projectId: { type: 'string' },
        },
        required: ['path'],
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const p = str(args, 'path');
        if (!p) throw new Error('缺少 path');
        const note = await e.note(p);
        if (!note) throw new Error(`找不到笔记：${p}`);
        await e.updateNote(p, {
          frontmatter:
            args.frontmatter && typeof args.frontmatter === 'object'
              ? (args.frontmatter as Record<string, unknown>)
              : undefined,
          body: str(args, 'body'),
          append: str(args, 'append'),
        });
        return { path: p, updated: true };
      },
    },
    {
      name: 'loom_create_type',
      title: '定义新类型',
      readOnlyHint: false,
      description:
        '定义一个新的实体类型（写一篇 _type 笔记）。定义类型不改代码，只是写一篇笔记。' +
        '字段可选 text/number/boolean/date/ref/enum/tags/longtext。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '类型标识' },
          label: { type: 'string' },
          defaultView: {
            type: 'string',
            enum: ['list', 'ladder', 'tree', 'graph', 'timeline', 'swimlane', 'table'],
          },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
                type: { type: 'string' },
                required: { type: 'boolean' },
                options: { type: 'array', items: { type: 'string' } },
              },
              required: ['key'],
            },
          },
          projectId: { type: 'string' },
        },
        required: ['name'],
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const name = str(args, 'name');
        if (!name) throw new Error('缺少 name');
        return e.createNote({
          title: name,
          type: '_type',
          folder: '07-类型',
          body: `# ${name}\n\n类型定义。\n`,
          frontmatter: {
            name,
            label: str(args, 'label') ?? name,
            defaultView: str(args, 'defaultView') ?? 'list',
            group: '设定',
            fields: Array.isArray(args.fields) ? args.fields : [],
          },
        });
      },
    },
    {
      name: 'loom_link',
      title: '建立关系',
      readOnlyHint: false,
      description:
        '在两篇笔记之间建立关系（写入 from 的 frontmatter relations）。' +
        'kind 用自然语言即可（师徒/情感/对立…），系统自动归类语义。',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '源笔记路径' },
          to: { type: 'string', description: '目标笔记名或路径' },
          kind: { type: 'string', description: '关系类型，如 师徒 / 对立 / 并行' },
          note: { type: 'string', description: '备注' },
          mutual: { type: 'boolean', description: '是否双向，默认 true' },
          projectId: { type: 'string' },
        },
        required: ['from', 'to'],
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const from = str(args, 'from');
        const to = str(args, 'to');
        if (!from || !to) throw new Error('缺少 from 或 to');
        const note = await e.note(from);
        if (!note) throw new Error(`找不到笔记：${from}`);

        const existing = Array.isArray(note.frontmatter.relations)
          ? [...(note.frontmatter.relations as unknown[])]
          : [];
        existing.push({
          to,
          kind: str(args, 'kind') ?? '',
          note: str(args, 'note') ?? null,
          mutual: args.mutual === false ? false : true,
        });
        await e.updateNote(from, { frontmatter: { relations: existing } });
        return { from, to, kind: str(args, 'kind') ?? '', created: true };
      },
    },
    {
      name: 'loom_write_chapter',
      title: '写章节',
      readOnlyHint: false,
      description:
        '写一章正文，自动落到 03-章节/ 并带上章节序号与所在卷。' +
        '若该章已存在则更新正文。写前应先读相关人物与设定。',
      inputSchema: {
        type: 'object',
        properties: {
          chapter: { type: 'number', description: '章节序号' },
          title: { type: 'string', description: '章节标题' },
          content: { type: 'string', description: '正文' },
          arc: { type: 'string', description: '所属卷，如 卷二·缄默' },
          projectId: { type: 'string' },
        },
        required: ['chapter', 'title', 'content'],
      },
      handler: async (args) => {
        const e = await engineOf(ws, args);
        const chapter = num(args, 'chapter');
        const title = str(args, 'title');
        const content = str(args, 'content');
        if (chapter === undefined) throw new Error('缺少 chapter');
        if (!title) throw new Error('缺少 title');
        if (!content) throw new Error('缺少 content');

        const fileTitle = `第${chapter}章-${title}`;
        const target = `03-章节/${fileTitle}.md`;
        const exists = await e.note(target);
        const frontmatter: Record<string, unknown> = { chapter, title };
        const arc = str(args, 'arc');
        if (arc) frontmatter.arc = arc;

        if (exists) {
          await e.updateNote(target, { body: content, frontmatter });
          return { path: target, created: false, updated: true };
        }
        const created = await e.createNote({
          title: fileTitle,
          type: '章节',
          folder: '03-章节',
          body: content,
          frontmatter,
        });
        return { path: created.path, created: true };
      },
    },
    {
      name: 'loom_create_project',
      title: '新建小说',
      readOnlyHint: false,
      description:
        '新建一本小说（一个独立 vault）。packs 可选素材包：blank/xianxia/palace/mystery/romance/scifi/military/urban，' +
        '只是初始笔记，随时可改可删。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          packs: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
      },
      handler: async (args) => {
        const name = str(args, 'name');
        if (!name) throw new Error('缺少 name');
        const p = await ws.create({
          name,
          description: str(args, 'description') ?? '',
          packs: Array.isArray(args.packs) ? (args.packs as string[]) : [],
        });
        return { id: p.id, name: p.name, path: p.path, dirName: p.dirName };
      },
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// MCP Server（对外）
// ─────────────────────────────────────────────────────────────

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export const SERVER_INFO = {
  name: 'liuyun-loom',
  title: '流云织小说工作台',
  version: '0.1.0',
};

/** 连上即知道怎么用（docs/05 任务 2.17） */
export const INSTRUCTIONS = `这是「流云织小说工作台」的知识底座。它把一本小说的全部构成（大纲、章纲、章节、线索、人物、设定、体系、境界、世界）存成互相串联的 Obsidian Markdown 笔记。

使用约定：
1. 动手写之前先读。写章节前调用 loom_active_at 确认当前坐标生效的规则，调用 loom_search / loom_read_note 查相关人物与设定。
2. 不要凭记忆编设定。本书的设定在笔记里，以笔记为准。
3. 先写后归类。想写一个还不存在的东西，直接用 loom_create_entry 建它，type 可以留空，之后随时补。
4. 交付前跑 loom_check，它会报告断链、作用域冲突、概念冲突、未归类条目。
5. 关系用自然语言描述即可（师徒 / 对立 / 并行 / 支撑），系统会自动归类语义并画进关系图。
6. 路径用相对路径，如 05-人物/沈砚.md。省略 projectId 时操作当前激活的那本书。`;

export class McpServer {
  private tools: ToolDef[];
  private byName: Map<string, ToolDef>;
  private deps: McpDeps;

  constructor(deps: McpDeps) {
    this.deps = deps;
    this.tools = buildTools(deps);
    this.byName = new Map(this.tools.map((t) => [t.name, t]));
  }

  /** 工具清单（MCP tools/list 格式） */
  listTools(): unknown[] {
    return this.tools.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: {
        readOnlyHint: t.readOnlyHint === true,
        destructiveHint: t.readOnlyHint === false,
        idempotentHint: t.readOnlyHint === true,
        openWorldHint: false,
      },
    }));
  }

  /**
   * 处理一条 JSON-RPC 消息。
   * 通知（无 id）返回 null，不写响应。
   */
  async handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const isNotification = msg.id === undefined || msg.id === null;

    try {
      const result = await this.dispatch(msg);
      if (isNotification) return null;
      return { jsonrpc: '2.0', id: msg.id ?? null, result };
    } catch (err) {
      if (isNotification) return null;
      const message = err instanceof Error ? err.message : String(err);
      const isNotFound = message.startsWith('MCP_METHOD_NOT_FOUND:');
      return {
        jsonrpc: '2.0',
        id: msg.id ?? null,
        error: {
          code: isNotFound ? RPC_ERRORS.METHOD_NOT_FOUND : RPC_ERRORS.INTERNAL_ERROR,
          message: isNotFound ? message.replace('MCP_METHOD_NOT_FOUND:', '') : message,
        },
      };
    }
  }

  private async dispatch(msg: JsonRpcRequest): Promise<unknown> {
    const method = msg.method;
    const params = msg.params ?? {};

    switch (method) {
      case 'initialize':
        return {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
            prompts: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        };

      case 'notifications/initialized':
      case 'initialized':
        return {};

      case 'ping':
        return {};

      case 'tools/list':
        return { tools: this.listTools() };

      case 'tools/call': {
        const name = typeof params.name === 'string' ? params.name : '';
        const tool = this.byName.get(name);
        if (!tool) {
          return {
            content: [{ type: 'text', text: `没有这个工具：${name}` }],
            isError: true,
          };
        }
        const args =
          params.arguments && typeof params.arguments === 'object'
            ? (params.arguments as Record<string, unknown>)
            : {};
        try {
          const out = await tool.handler(args);
          return {
            content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
            structuredContent: out,
            isError: false,
          };
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: `工具 ${name} 执行失败：${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'resources/list': {
        const projectId = await this.deps.ws.activeId();
        if (!projectId) return { resources: [] };
        const e = await this.deps.ws.engine(projectId);
        if (!e) return { resources: [] };
        const state = await e.load();
        return {
          resources: state.notes
            .filter((n) => !isMetaType(n.type))
            .slice(0, 500)
            .map((n) => ({
              uri: `loom://note/${encodeURI(n.path)}`,
              name: n.title,
              title: n.title,
              mimeType: 'text/markdown',
              description: n.type ? `${n.type} · ${n.words} 字` : `未归类 · ${n.words} 字`,
            })),
        };
      }

      case 'resources/read': {
        const uri = typeof params.uri === 'string' ? params.uri : '';
        const m = /^loom:\/\/note\/(.+)$/.exec(uri);
        if (!m) throw new Error(`不支持的资源 URI：${uri}`);
        const relPath = decodeURIComponent(m[1]!);
        const projectId = await this.deps.ws.activeId();
        if (!projectId) throw new Error('没有激活的小说');
        const e = await this.deps.ws.engine(projectId);
        if (!e) throw new Error('找不到激活的小说');
        const note = await e.note(relPath);
        if (!note) throw new Error(`找不到笔记：${relPath}`);
        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: `---\n${JSON.stringify(note.frontmatter, null, 2)}\n---\n\n${note.body}`,
            },
          ],
        };
      }

      case 'prompts/list':
        return {
          prompts: [
            {
              name: 'write-chapter',
              title: '写一章',
              description: '按当前坐标的生效规则与已有设定，写指定章节。',
              arguments: [
                { name: 'chapter', description: '章节序号', required: true },
                { name: 'intent', description: '本章要完成什么', required: true },
              ],
            },
            {
              name: 'audit-world',
              title: '体检世界观',
              description: '跑一致性检查，报告断链、作用域冲突、概念冲突、未归类条目。',
              arguments: [],
            },
            {
              name: 'trace-thread',
              title: '追一条线',
              description: '从某个节点向上回溯它服务于什么，向下展开它落到哪些章节。',
              arguments: [{ name: 'path', description: '起点笔记路径', required: true }],
            },
          ],
        };

      case 'prompts/get': {
        const name = typeof params.name === 'string' ? params.name : '';
        const args =
          params.arguments && typeof params.arguments === 'object'
            ? (params.arguments as Record<string, unknown>)
            : {};
        if (name === 'write-chapter') {
          return {
            description: '写一章',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: [
                    `请写第 ${String(args.chapter ?? '?')} 章，本章要完成：${String(args.intent ?? '')}`,
                    '',
                    '步骤：',
                    '1. loom_active_at 确认当前坐标生效的规则',
                    '2. loom_search / loom_read_note 读相关人物与设定',
                    '3. loom_backlinks 看会波及哪些已有内容',
                    '4. 写正文，用 [[双链]] 连到已有条目',
                    '5. loom_write_chapter 落盘',
                    '6. loom_check 自检',
                  ].join('\n'),
                },
              },
            ],
          };
        }
        if (name === 'audit-world') {
          return {
            description: '体检世界观',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: '调用 loom_check，然后逐条解释每个问题的成因与修复建议。不要只罗列，要说清为什么会矛盾。',
                },
              },
            ],
          };
        }
        if (name === 'trace-thread') {
          return {
            description: '追一条线',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `从 ${String(args.path ?? '')} 出发：先 loom_trace direction=up 看它服务于什么，再 direction=down 看它落到哪些章节，最后总结这条线的完整弧光。`,
                },
              },
            ],
          };
        }
        throw new Error(`没有这个 prompt：${name}`);
      }

      default:
        throw new Error(`MCP_METHOD_NOT_FOUND:${method}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 对内：MCP Client（docs/03 7.3）
// ─────────────────────────────────────────────────────────────

export interface McpClientConfig {
  id: string;
  name: string;
  /** stdio 配置 */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** http 配置 */
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  /** 工具级权限：allow 为空表示全允许 */
  permissions?: { mode: 'allow' | 'deny'; tools: string[] };
}

export interface McpClientStatus {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  connected: boolean;
  tools: Array<{ name: string; description: string }>;
  error: string | null;
  lastChecked: number | null;
}

/**
 * 外部 MCP 客户端管理器。
 * 连接测试只做握手与 tools/list，不启动长期进程。
 */
export class McpClientManager {
  private configs = new Map<string, McpClientConfig>();
  private status = new Map<string, McpClientStatus>();

  list(): McpClientConfig[] {
    return [...this.configs.values()];
  }

  add(cfg: McpClientConfig): McpClientConfig {
    this.configs.set(cfg.id, cfg);
    return cfg;
  }

  remove(id: string): boolean {
    this.status.delete(id);
    return this.configs.delete(id);
  }

  get(id: string): McpClientConfig | undefined {
    return this.configs.get(id);
  }

  setPermissions(id: string, permissions: McpClientConfig['permissions']): boolean {
    const c = this.configs.get(id);
    if (!c) return false;
    c.permissions = permissions;
    return true;
  }

  statusOf(id: string): McpClientStatus | null {
    return this.status.get(id) ?? null;
  }

  statuses(): McpClientStatus[] {
    return this.list().map(
      (c) =>
        this.status.get(c.id) ?? {
          id: c.id,
          name: c.name,
          transport: c.url ? 'http' : 'stdio',
          connected: false,
          tools: [],
          error: null,
          lastChecked: null,
        },
    );
  }

  /**
   * 连接测试：http 走 POST initialize；stdio 走子进程握手。
   * 只做探活，不常驻。
   */
  async test(id: string, timeoutMs = 8000): Promise<McpClientStatus> {
    const cfg = this.configs.get(id);
    if (!cfg) throw new Error(`没有这个 MCP 服务：${id}`);

    const base: McpClientStatus = {
      id: cfg.id,
      name: cfg.name,
      transport: cfg.url ? 'http' : 'stdio',
      connected: false,
      tools: [],
      error: null,
      lastChecked: Date.now(),
    };

    try {
      const tools = cfg.url ? await testHttp(cfg, timeoutMs) : await testStdio(cfg, timeoutMs);
      base.connected = true;
      base.tools = tools;
    } catch (err) {
      base.error = err instanceof Error ? err.message : String(err);
    }

    this.status.set(id, base);
    return base;
  }
}

async function testHttp(cfg: McpClientConfig, timeoutMs: number): Promise<McpClientStatus['tools']> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(cfg.headers ?? {}),
    };
    const init = await fetch(cfg.url!, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'liuyun-loom', version: '0.1.0' },
        },
      }),
    });
    if (!init.ok) throw new Error(`握手失败：HTTP ${init.status}`);
    const initJson = (await parseMaybeSse(init)) as JsonRpcResponse;
    if (initJson.error) throw new Error(`握手被拒：${initJson.error.message}`);

    const listRes = await fetch(cfg.url!, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    if (!listRes.ok) throw new Error(`tools/list 失败：HTTP ${listRes.status}`);
    const listJson = (await parseMaybeSse(listRes)) as JsonRpcResponse;
    if (listJson.error) throw new Error(`tools/list 被拒：${listJson.error.message}`);
    const tools = (listJson.result as { tools?: Array<{ name: string; description?: string }> })?.tools ?? [];
    return tools.map((t) => ({ name: t.name, description: t.description ?? '' }));
  } finally {
    clearTimeout(timer);
  }
}

/** streamable-http 可能返回 SSE 帧，取第一条 data */
async function parseMaybeSse(res: Response): Promise<unknown> {
  const text = await res.text();
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/event-stream')) {
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t.startsWith('data:')) {
        try {
          return JSON.parse(t.slice(5).trim());
        } catch {
          /* 继续找 */
        }
      }
    }
    throw new Error('SSE 响应里没有可解析的 data 帧');
  }
  return JSON.parse(text);
}

async function testStdio(cfg: McpClientConfig, timeoutMs: number): Promise<McpClientStatus['tools']> {
  const { spawn } = await import('node:child_process');
  if (!cfg.command) throw new Error('stdio 配置缺少 command');

  return new Promise((resolve, reject) => {
    const child = spawn(cfg.command!, cfg.args ?? [], {
      cwd: cfg.cwd,
      env: { ...process.env, ...(cfg.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let buf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`连接测试超时（${timeoutMs}ms）`));
    }, timeoutMs);

    const finish = (err: Error | null, tools: McpClientStatus['tools'] = []) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(tools);
    };

    child.on('error', (e) => finish(e));
    // 子进程提前退出时写 stdin 会抛 EPIPE；不接住会变成未捕获异常
    child.stdin.on('error', () => {
      /* 交给 exit / 超时统一收尾 */
    });
    child.stderr.on('data', () => {
      /* 吞掉，避免噪音 */
    });

    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        let msg: JsonRpcResponse;
        try {
          msg = JSON.parse(t) as JsonRpcResponse;
        } catch {
          continue;
        }
        if (msg.id === 1 && msg.result) {
          // 握手成功 → 要工具清单
          try {
            child.stdin.write(
              JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n',
            );
          } catch {
            finish(new Error('子进程已关闭 stdin'));
            return;
          }
        } else if (msg.id === 2) {
          if (msg.error) {
            finish(new Error(`tools/list 被拒：${msg.error.message}`));
            return;
          }
          const tools =
            (msg.result as { tools?: Array<{ name: string; description?: string }> })?.tools ?? [];
          finish(null, tools.map((x) => ({ name: x.name, description: x.description ?? '' })));
          return;
        }
      }
    });

    child.on('exit', (code) => {
      finish(new Error(`子进程提前退出，code=${code}`));
    });

    try {
      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'liuyun-loom', version: '0.1.0' },
          },
        }) + '\n',
      );
    } catch {
      finish(new Error('无法写入子进程 stdin'));
    }
  });
}

// 让未使用的导出保持显式
void UNTYPED;
