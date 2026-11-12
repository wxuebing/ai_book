/** 造几条灵感条目，用于便签墙视觉验收 */

const BASE = 'http://127.0.0.1:5178';
const PID = 'ad02a01b';

const ideas = [
  ['无字木牌的来历', '磨掉字的人是他自己。但为什么？可能是为了保护某个人。'],
  ['织机为什么自己会动', '苏挽从来没踩过它，但它一直在响。也许它记得某种节奏。'],
  ['第七次问名字', '这个数字不是巧合 —— 七次之后他就会彻底消失。'],
  ['陆沉舟忘掉的那个人', '他找回了自己的名字，代价是忘了另一个人的。那个人是谁？'],
  ['名字变淡的视觉表现', '不是透明，是边缘开始模糊，像水墨在纸上洇开。'],
  ['东域的天为什么蓝得像假的', '因为那片天是"被记住"的产物，不是真实的天空。'],
  ['归墟的含义', '归墟是传说中众水汇聚之处 —— 所有被遗忘的名字都流向那里。'],
  ['第三幕的反转', '抹名的源头是他自己，但他不记得做过这件事。'],
  ['苏挽的锚点身份', '她不是普通记名弟子，她是被安排来"钉住"他的。'],
  ['木牌原本刻的字', '可能是"归墟"两个字，也可能是他自己的真名。'],
  ['为什么是境界而不是力量', '因为"被记住"才是这个世界真正的资源。'],
  ['卷一结尾的钩子', '他终于问出那句：我到底是谁？'],
];

async function main(): Promise<void> {
  for (const [title, body] of ideas) {
    const res = await fetch(`${BASE}/api/project/${PID}/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type: '灵感', body: `# ${title}\n\n${body}` }),
    });
    const j = (await res.json()) as { data?: { path?: string } };
    console.log(`${res.status} ${title} → ${j?.data?.path ?? ''}`);
  }
}

main().catch(console.error);
