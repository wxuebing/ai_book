/**
 * 端到端测试：工作区 → 建书 → 写笔记 → 索引 → 检索 → 关系 → 检查
 * （docs/05 任务 1.31 ~ 1.36，2.23 ~ 2.26）
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Workspace, STANDARD_DIRS } from '../src/workspace.ts';

let root: string;
let ws: Workspace;

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'loom-e2e-'));
  ws = new Workspace(root);
  await ws.init('测试工作区');
});

after(async () => {
  ws.releaseAll();
  await fs.rm(root, { recursive: true, force: true });
});

test('1.31 工作区初始化：目录与 .workspace.json', async () => {
  const meta = await ws.getMeta();
  assert.equal(meta.name, '测试工作区');
  assert.equal(meta.version, 1);
  const stat = await fs.stat(path.join(root, '.workspace.json'));
  assert.ok(stat.isFile());
});

test('1.32 创建小说：标准目录 + .project.json + README', async () => {
  const p = await ws.create({ name: '归墟纪', description: '境界靠被记住程度决定的世界' });
  assert.equal(p.name, '归墟纪');
  assert.equal(p.dirName, '归墟纪');

  for (const d of STANDARD_DIRS) {
    const st = await fs.stat(path.join(p.path, d));
    assert.ok(st.isDirectory(), `缺少目录 ${d}`);
  }
  const meta = JSON.parse(await fs.readFile(path.join(p.path, '.project.json'), 'utf8'));
  assert.equal(meta.name, '归墟纪');
  assert.ok(meta.id);
  assert.ok(await fs.readFile(path.join(p.path, 'README.md'), 'utf8'));
});

test('创建小说：自动激活', async () => {
  const all = await ws.list();
  const active = await ws.activeId();
  assert.ok(all.length >= 1);
  assert.equal(active, all[0]!.id);
});

test('1.33 素材包安装：写入 _type 笔记', async () => {
  const p = await ws.create({ name: '仙侠测试', packs: ['xianxia'] });
  const typeDir = path.join(p.path, '07-类型');
  const files = await fs.readdir(typeDir);
  assert.ok(files.includes('境界.md'));
  assert.ok(files.includes('修炼体系.md'));

  const content = await fs.readFile(path.join(typeDir, '境界.md'), 'utf8');
  assert.match(content, /type: _type/);
  assert.match(content, /defaultView: ladder/);
});

test('目录名冲突自动加序号', async () => {
  const a = await ws.create({ name: '重名书' });
  const b = await ws.create({ name: '重名书' });
  assert.notEqual(a.dirName, b.dirName);
  assert.equal(b.dirName, '重名书 2');
});

test('1.34 列出小说：含字数/章节/笔记数', async () => {
  const all = await ws.list();
  assert.ok(all.length >= 3);
  const target = all.find((p) => p.name === '归墟纪')!;
  assert.equal(typeof target.notes, 'number');
  assert.equal(typeof target.words, 'number');
  assert.equal(typeof target.chapters, 'number');
});

test('1.35 删除小说：移入 .trash 不真删', async () => {
  const p = await ws.create({ name: '待删除' });
  const res = await ws.remove(p.id);
  assert.ok(res);
  assert.ok(res!.movedTo.includes('.trash'));
  const st = await fs.stat(res!.movedTo);
  assert.ok(st.isDirectory());
  const after = await ws.list();
  assert.ok(!after.some((x) => x.id === p.id));
});

test('1.36 改名：同时重命名目录', async () => {
  const p = await ws.create({ name: '原名' });
  const updated = await ws.update(p.id, { name: '新名' });
  assert.ok(updated);
  assert.equal(updated!.name, '新名');
  assert.equal(updated!.dirName, '新名');
  const st = await fs.stat(path.join(root, '小说', '新名'));
  assert.ok(st.isDirectory());
});

test('引擎：写入笔记后可读、可检索、可建关系', async () => {
  const p = await ws.create({ name: '引擎测试' });
  const engine = (await ws.engine(p.id))!;
  assert.ok(engine);

  await engine.createNote({
    title: '沈砚',
    type: '人物',
    body: [
      '# 沈砚',
      '',
      '二十七岁，眉骨有一道旧疤。',
      '',
      '他记得所有人的名字，唯独忘了自己是谁。',
      '',
      '与[[苏挽]]互为锚点。',
    ].join('\n'),
    frontmatter: { age: 27, faction: '云隐宗' },
  });

  await engine.createNote({
    title: '苏挽',
    type: '人物',
    body: '# 苏挽\n\n沈砚的锚。',
  });

  const st = await engine.stats();
  assert.equal(st.notes, 2);
  assert.equal(st.typed, 2);
  assert.ok(st.words > 0);

  // 检索
  const hits = await engine.search('锚点');
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.title, '沈砚');

  // 关系
  const out = await engine.outgoing('05-人物/沈砚.md');
  assert.equal(out.length, 1);
  assert.equal(out[0]!.target, '05-人物/苏挽.md');

  const back = await engine.backlinks('05-人物/苏挽.md');
  assert.equal(back.length, 1);
  assert.equal(back[0]!.source, '05-人物/沈砚.md');
});

test('引擎：类型分组含未归类', async () => {
  const p = await ws.create({ name: '分组测试' });
  const engine = (await ws.engine(p.id))!;
  await engine.createNote({ title: '甲', type: '人物', body: '# 甲' });
  await engine.createNote({ title: '乙', type: null, body: '# 乙' });

  const groups = await engine.groups();
  const people = groups.find((g) => g.type === '人物');
  const untyped = groups.find((g) => g.type === '__untyped');
  assert.ok(people);
  assert.equal(people!.count, 1);
  assert.ok(untyped);
  assert.equal(untyped!.count, 1);
  // 未归类恒排最后
  assert.equal(groups[groups.length - 1]!.type, '__untyped');
});

test('引擎：关系图含节点与边', async () => {
  const p = await ws.create({ name: '图谱测试' });
  const engine = (await ws.engine(p.id))!;
  await engine.createNote({ title: 'A', type: '人物', body: '# A\n\n[[B]]' });
  await engine.createNote({ title: 'B', type: '人物', body: '# B' });

  const g = await engine.graph();
  assert.equal(g.nodes.length, 2);
  assert.equal(g.edges.length, 1);
  assert.equal(g.edges[0]!.target, '05-人物/B.md');
});

test('引擎：一致性检查发现断链与未归类', async () => {
  const p = await ws.create({ name: '检查测试' });
  const engine = (await ws.engine(p.id))!;
  await engine.createNote({ title: '有断链', type: '人物', body: '# X\n\n[[不存在的东西]]' });
  await engine.createNote({ title: '无类型', type: null, body: '# Y' });

  const c = await engine.check();
  assert.equal(c.broken.length, 1);
  assert.equal(c.broken[0]!.target, '不存在的东西');
  assert.ok(c.untyped.some((u) => u.title === '无类型'));
});

test('引擎：作用域计算生效规则', async () => {
  const p = await ws.create({ name: '作用域测试' });
  const engine = (await ws.engine(p.id))!;
  await engine.createNote({
    title: '武者', type: '境界', body: '# 武者',
    frontmatter: { scope: { space: '地球', time: '21世纪' } },
  });
  await engine.createNote({
    title: '行星级', type: '境界', body: '# 行星级',
    frontmatter: { scope: { space: '宇宙', time: '宇宙历' } },
  });
  await engine.createNote({ title: '通用', type: '设定', body: '# 通用' });

  const earth = await engine.activeAt({ space: '地球', time: '21世纪' });
  const names = earth.active.map((x) => x.title);
  assert.ok(names.includes('武者'));
  assert.ok(names.includes('通用'));
  assert.ok(!names.includes('行星级'));

  const universe = await engine.activeAt({ space: '宇宙', time: '宇宙历' });
  const un = universe.active.map((x) => x.title);
  assert.ok(un.includes('行星级'));
  assert.ok(!un.includes('武者'));
});

test('引擎：全链路回溯', async () => {
  const p = await ws.create({ name: '回溯测试' });
  const engine = (await ws.engine(p.id))!;
  await engine.createNote({ title: '大纲', type: '大纲', body: '# 大纲\n\n[[卷一]]' });
  await engine.createNote({ title: '卷一', type: '大纲', body: '# 卷一\n\n[[第1章]]' });
  await engine.createNote({ title: '第1章', type: '章节', body: '# 第1章' });

  const down = await engine.trace('01-大纲/大纲.md', 'down', 5);
  assert.equal(down.length, 2);
  assert.equal(down[0]!.title, '卷一');
  assert.equal(down[1]!.title, '第1章');

  const up = await engine.trace('03-章节/第1章.md', 'up', 5);
  assert.ok(up.some((x) => x.title === '卷一'));
});

test('路径安全：拒绝 .. 逃逸与绝对路径', async () => {
  const p = await ws.create({ name: '安全测试' });
  const engine = (await ws.engine(p.id))!;

  // 标题里的 ../ 被净化成合法文件名，不会逃逸
  const created = await engine.createNote({ title: '../../evil', type: '人物', body: 'x' });
  assert.ok(!created.path.includes('..'));

  // 直接走 vault.resolve 时，非法路径必须拒绝
  const vault = engine.vault;
  assert.throws(() => vault.resolve('../outside.md'), /逃逸/);
  assert.throws(() => vault.resolve('/etc/passwd'), /绝对路径/);
  assert.throws(() => vault.resolve('a/../../outside.md'), /逃逸/);
});

test('原子写入：并发写不撕裂', async () => {
  const p = await ws.create({ name: '写入测试' });
  const engine = (await ws.engine(p.id))!;
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      engine.createNote({ title: `并${i}`, type: '人物', body: `# 并${i}\n内容${i}` }),
    ),
  );
  const st = await engine.stats();
  assert.equal(st.notes, 10);
});

test('索引可重建：删掉 .loom 后自动重建', async () => {
  const p = await ws.create({ name: '重建测试' });
  const engine = (await ws.engine(p.id))!;
  await engine.createNote({ title: '甲', type: '人物', body: '# 甲' });
  await engine.stats();

  // 删索引
  await engine.release();
  await fs.rm(path.join(p.path, '.loom'), { recursive: true, force: true });

  const engine2 = (await ws.engine(p.id))!;
  const st = await engine2.stats();
  assert.equal(st.notes, 1);
});

test('更新笔记：frontmatter 合并 + 正文替换', async () => {
  const p = await ws.create({ name: '更新测试' });
  const engine = (await ws.engine(p.id))!;
  const { path: relPath } = await engine.createNote({
    title: '甲', type: '人物', body: '# 甲\n\n原文',
    frontmatter: { age: 20 },
  });

  await engine.updateNote(relPath, { frontmatter: { age: 21, status: 'active' } });
  const n = await engine.note(relPath);
  assert.equal(n!.frontmatter.age, 21);
  assert.equal(n!.frontmatter.status, 'active');

  await engine.updateNote(relPath, { body: '# 甲\n\n新正文' });
  const n2 = await engine.note(relPath);
  assert.match(n2!.body, /新正文/);
  assert.equal(n2!.frontmatter.age, 21);
});

test('删除笔记：真删（笔记级）', async () => {
  const p = await ws.create({ name: '删笔记测试' });
  const engine = (await ws.engine(p.id))!;
  const { path: relPath } = await engine.createNote({ title: '甲', type: '人物', body: '# 甲' });
  assert.equal((await engine.stats()).notes, 1);
  await engine.deleteNote(relPath);
  assert.equal((await engine.stats()).notes, 0);
});
