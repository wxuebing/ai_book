/**
 * 索引层：SQLite（node:sqlite）
 *
 * 依据：docs/02-数据模型.md 第 10 章
 * 铁律：索引是可重建的派生数据 —— 删掉索引，下次启动自动重建，零数据损失。
 *
 * 注意：node:sqlite 在 Node 22/24 里是实验特性，必须容忍它不存在。
 * 若不可用，自动降级为纯内存索引（功能不减，只是不持久化）。
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { ParsedNote } from './types.ts';
import { notePlainText } from './note.ts';
import { hashContent } from './vault.ts';

// ─────────────────────────────────────────────────────────────
// node:sqlite 的宽松类型定义（避免依赖 @types）
// ─────────────────────────────────────────────────────────────

interface Stmt {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface Db {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
  close(): void;
}

type DatabaseSyncCtor = new (file: string) => Db;

async function loadSqlite(): Promise<DatabaseSyncCtor | null> {
  try {
    const mod = (await import('node:sqlite')) as unknown as { DatabaseSync: DatabaseSyncCtor };
    return mod.DatabaseSync ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  path        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  folder      TEXT NOT NULL,
  type        TEXT,
  status      TEXT,
  body        TEXT,
  frontmatter TEXT,
  mtime       INTEGER,
  size        INTEGER,
  words       INTEGER,
  hash        TEXT
);
CREATE TABLE IF NOT EXISTS links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  target_raw  TEXT NOT NULL,
  target_path TEXT,
  alias       TEXT,
  subpath     TEXT,
  sub_type    TEXT,
  embed       INTEGER,
  link_type   TEXT,
  resolved    INTEGER
);
CREATE TABLE IF NOT EXISTS tags (
  note TEXT NOT NULL,
  tag  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fields (
  note  TEXT NOT NULL,
  key   TEXT NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS headings (
  note     TEXT NOT NULL,
  level    INTEGER NOT NULL,
  text     TEXT NOT NULL,
  slug     TEXT NOT NULL,
  block_id TEXT
);
CREATE TABLE IF NOT EXISTS blocks (
  note     TEXT NOT NULL,
  block_id TEXT NOT NULL,
  text     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
CREATE INDEX IF NOT EXISTS idx_fields_key ON fields(key);
CREATE INDEX IF NOT EXISTS idx_headings_note ON headings(note);
`;

const FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  path, title, body,
  tokenize = 'trigram'
);
`;

// ─────────────────────────────────────────────────────────────
// 索引实现
// ─────────────────────────────────────────────────────────────

export interface SearchHit {
  path: string;
  title: string;
  type: string | null;
  excerpt: string;
  /** 命中片段（用于高亮） */
  snippet: string;
}

export interface IndexStats {
  notes: number;
  links: number;
  broken: number;
  tags: number;
  /** 是否使用了 SQLite 持久化；false = 内存降级 */
  persistent: boolean;
  /** 是否启用了 FTS5 全文检索 */
  fts: boolean;
}

export interface IndexOptions {
  /** 索引文件路径；null = 纯内存 */
  file: string | null;
}

export class NoteIndex {
  private db: Db | null = null;
  private memory: Map<string, ParsedNote> | null = null;
  private ftsAvailable = false;
  private persistent = false;
  private dirty = true;

  private opts: IndexOptions;

  private constructor(db: Db | null, opts: IndexOptions) {
    this.db = db;
    this.opts = opts;
    this.persistent = db !== null;
    if (!db) this.memory = new Map();
  }

  /**
   * 打开索引。db 文件损坏时自动删除重建（任务 1.21）。
   */
  static async open(opts: IndexOptions): Promise<NoteIndex> {
    if (!opts.file) {
      return new NoteIndex(null, opts);
    }
    const DatabaseSync = await loadSqlite();
    if (!DatabaseSync) {
      return new NoteIndex(null, opts);
    }
    const file = opts.file;
    await fs.mkdir(path.dirname(file), { recursive: true });
    try {
      const db = new DatabaseSync(file);
      db.exec(SCHEMA);
      let fts = true;
      try {
        db.exec(FTS_SCHEMA);
      } catch {
        fts = false; // 该 SQLite 构建无 trigram 分词器
      }
      const idx = new NoteIndex(db, opts);
      idx.ftsAvailable = fts;
      return idx;
    } catch {
      // 库损坏 → 删掉重建
      await fs.rm(file, { force: true }).catch(() => {});
      const db = new DatabaseSync(file);
      db.exec(SCHEMA);
      let fts = true;
      try {
        db.exec(FTS_SCHEMA);
      } catch {
        fts = false;
      }
      const idx = new NoteIndex(db, opts);
      idx.ftsAvailable = fts;
      return idx;
    }
  }

  get stats(): IndexStats {
    if (!this.db) {
      const m = this.memory!;
      return {
        notes: m.size,
        links: 0,
        broken: 0,
        tags: 0,
        persistent: false,
        fts: false,
      };
    }
    const one = (sql: string): number => {
      const row = this.db!.prepare(sql).get() as { n: number } | undefined;
      return row?.n ?? 0;
    };
    return {
      notes: one('SELECT COUNT(*) AS n FROM notes'),
      links: one('SELECT COUNT(*) AS n FROM links'),
      broken: one('SELECT COUNT(*) AS n FROM links WHERE resolved = 0'),
      tags: one('SELECT COUNT(DISTINCT tag) AS n FROM tags'),
      persistent: true,
      fts: this.ftsAvailable,
    };
  }

  /** 全量重建（任务 1.18：1000 篇 < 2s） */
  async rebuild(notes: ParsedNote[]): Promise<{ notes: number; ms: number }> {
    const t0 = Date.now();
    if (!this.db) {
      const m = new Map<string, ParsedNote>();
      for (const n of notes) m.set(n.path, n);
      this.memory = m;
      this.dirty = false;
      return { notes: notes.length, ms: Date.now() - t0 };
    }

    const db = this.db;
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM notes');
      db.exec('DELETE FROM links');
      db.exec('DELETE FROM tags');
      db.exec('DELETE FROM fields');
      db.exec('DELETE FROM headings');
      db.exec('DELETE FROM blocks');
      if (this.ftsAvailable) db.exec("DELETE FROM notes_fts");

      const insNote = db.prepare(
        `INSERT INTO notes (path,title,folder,type,status,body,frontmatter,mtime,size,words,hash)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      );
      const insLink = db.prepare(
        `INSERT INTO links (source,target_raw,target_path,alias,subpath,sub_type,embed,link_type,resolved)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      );
      const insTag = db.prepare('INSERT INTO tags (note,tag) VALUES (?,?)');
      const insField = db.prepare('INSERT INTO fields (note,key,value) VALUES (?,?,?)');
      const insHead = db.prepare(
        'INSERT INTO headings (note,level,text,slug,block_id) VALUES (?,?,?,?,?)',
      );
      const insBlock = db.prepare('INSERT INTO blocks (note,block_id,text) VALUES (?,?,?)');
      const insFts = this.ftsAvailable
        ? db.prepare('INSERT INTO notes_fts (path,title,body) VALUES (?,?,?)')
        : null;

      for (const n of notes) {
        const plain = notePlainText(n);
        insNote.run(
          n.path,
          n.title,
          n.folder,
          n.type,
          typeof n.frontmatter.status === 'string' ? n.frontmatter.status : null,
          n.body,
          JSON.stringify(n.frontmatter),
          Math.round(n.mtime),
          n.size,
          n.words,
          hashContent(n.body),
        );
        for (const l of n.links) {
          insLink.run(
            n.path,
            l.targetRaw,
            l.targetPath,
            l.alias,
            l.subpath,
            l.subType,
            l.embed ? 1 : 0,
            'wikilink',
            l.targetPath ? 1 : 0,
          );
        }
        for (const t of n.tags) insTag.run(n.path, t);
        for (const f of n.fields) insField.run(n.path, f.key, f.value);
        for (const h of n.headings) insHead.run(n.path, h.level, h.text, h.slug, h.blockId);
        for (const bid of n.blockIds) insBlock.run(n.path, bid, '');
        insFts?.run(n.path, n.title, plain);
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    this.dirty = false;
    return { notes: notes.length, ms: Date.now() - t0 };
  }

  /**
   * 增量更新单篇（任务 1.19：单篇变更 < 50ms）。
   * 为简洁与正确性，这里做「删除该篇所有行 + 重新插入」，
   * 而非字段级 diff —— 千篇规模下开销可忽略。
   */
  async upsert(note: ParsedNote): Promise<void> {
    if (!this.db) {
      this.memory!.set(note.path, note);
      return;
    }
    const db = this.db;
    db.exec('BEGIN');
    try {
      this.deleteRows(note.path);
      const plain = notePlainText(note);
      db.prepare(
        `INSERT INTO notes (path,title,folder,type,status,body,frontmatter,mtime,size,words,hash)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        note.path,
        note.title,
        note.folder,
        note.type,
        typeof note.frontmatter.status === 'string' ? note.frontmatter.status : null,
        note.body,
        JSON.stringify(note.frontmatter),
        Math.round(note.mtime),
        note.size,
        note.words,
        hashContent(note.body),
      );
      const insLink = db.prepare(
        `INSERT INTO links (source,target_raw,target_path,alias,subpath,sub_type,embed,link_type,resolved)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      );
      for (const l of note.links) {
        insLink.run(
          note.path, l.targetRaw, l.targetPath, l.alias, l.subpath, l.subType,
          l.embed ? 1 : 0, 'wikilink', l.targetPath ? 1 : 0,
        );
      }
      const insTag = db.prepare('INSERT INTO tags (note,tag) VALUES (?,?)');
      for (const t of note.tags) insTag.run(note.path, t);
      const insField = db.prepare('INSERT INTO fields (note,key,value) VALUES (?,?,?)');
      for (const f of note.fields) insField.run(note.path, f.key, f.value);
      const insHead = db.prepare(
        'INSERT INTO headings (note,level,text,slug,block_id) VALUES (?,?,?,?,?)',
      );
      for (const h of note.headings) insHead.run(note.path, h.level, h.text, h.slug, h.blockId);
      const insBlock = db.prepare('INSERT INTO blocks (note,block_id,text) VALUES (?,?,?)');
      for (const bid of note.blockIds) insBlock.run(note.path, bid, '');
      if (this.ftsAvailable) {
        db.prepare('INSERT INTO notes_fts (path,title,body) VALUES (?,?,?)').run(
          note.path, note.title, plain,
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  async remove(relPath: string): Promise<void> {
    if (!this.db) {
      this.memory!.delete(relPath);
      return;
    }
    this.db.exec('BEGIN');
    try {
      this.deleteRows(relPath);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private deleteRows(relPath: string): void {
    const db = this.db!;
    db.prepare('DELETE FROM notes WHERE path = ?').run(relPath);
    db.prepare('DELETE FROM links WHERE source = ?').run(relPath);
    db.prepare('DELETE FROM tags WHERE note = ?').run(relPath);
    db.prepare('DELETE FROM fields WHERE note = ?').run(relPath);
    db.prepare('DELETE FROM headings WHERE note = ?').run(relPath);
    db.prepare('DELETE FROM blocks WHERE note = ?').run(relPath);
    if (this.ftsAvailable) db.prepare('DELETE FROM notes_fts WHERE path = ?').run(relPath);
  }

  // ───────────────────────────────────────────────────────────
  // 检索（任务 1.20：中文可用，1000 篇 < 200ms）
  // ───────────────────────────────────────────────────────────

  /**
   * 全文检索。trigram 分词要求查询串 ≥3 字符；
   * 更短的查询（如两字中文词）自动降级为 LIKE 前缀匹配。
   */
  search(query: string, limit = 50): SearchHit[] {
    const q = query.trim();
    if (q === '') return [];

    if (!this.db) {
      const out: SearchHit[] = [];
      const lower = q.toLowerCase();
      for (const n of this.memory!.values()) {
        const plain = notePlainText(n);
        const hitTitle = n.title.toLowerCase().includes(lower);
        const hitBody = plain.toLowerCase().includes(lower);
        if (!hitTitle && !hitBody) continue;
        out.push({
          path: n.path,
          title: n.title,
          type: n.type,
          excerpt: makeExcerpt(plain, q),
          snippet: makeExcerpt(plain, q, 80),
        });
        if (out.length >= limit) break;
      }
      return out;
    }

    const useFts = this.ftsAvailable && [...q].length >= 3;
    if (useFts) {
      try {
        const rows = this.db
          .prepare(
            `SELECT f.path AS path, n.title AS title, n.type AS type,
                    snippet(notes_fts, 2, '', '', '…', 16) AS snippet
             FROM notes_fts f
             JOIN notes n ON n.path = f.path
             WHERE notes_fts MATCH ?
             ORDER BY rank
             LIMIT ?`,
          )
          .all(ftsEscape(q), limit) as Array<{
          path: string; title: string; type: string | null; snippet: string;
        }>;
        if (rows.length > 0) {
          return rows.map((r) => ({
            path: r.path,
            title: r.title,
            type: r.type,
            excerpt: (r.snippet ?? '').replace(/\s+/g, ' ').trim(),
            snippet: r.snippet ?? '',
          }));
        }
      } catch {
        // FTS 语法错误 → 降级
      }
    }

    const like = `%${escapeLike(q)}%`;
    const rows = this.db
      .prepare(
        `SELECT path, title, type, body FROM notes
         WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\'
         ORDER BY CASE WHEN title LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, mtime DESC
         LIMIT ?`,
      )
      .all(like, like, like, limit) as Array<{
      path: string; title: string; type: string | null; body: string;
    }>;
    return rows.map((r) => {
      const plain = stripMd(r.body ?? '');
      return {
        path: r.path,
        title: r.title,
        type: r.type,
        excerpt: makeExcerpt(plain, q),
        snippet: makeExcerpt(plain, q, 80),
      };
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

// ─────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────

/** FTS5 查询串转义：整体加引号当作短语，避免 AND/OR/NEAR 被当运算符 */
function ftsEscape(q: string): string {
  return '"' + q.replace(/"/g, '""') + '"';
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

function stripMd(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_~`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeExcerpt(plain: string, query: string, radius = 60): string {
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return plain.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(plain.length, idx + query.length + radius);
  return (start > 0 ? '…' : '') + plain.slice(start, end).trim() + (end < plain.length ? '…' : '');
}
