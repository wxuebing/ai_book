/**
 * 剧情：类型图谱（全局页）
 *
 * 不绑定任何一本小说。切换的是「小说类型」，不是书。
 * 每种类型给：主图、核心问题、读者承诺、主冲突、三幕九拍、开场三章、混搭禁区、写崩点。
 * 摄影图源：Unsplash（本地化到 public/plot）。
 */

import React, { useEffect, useState } from 'react';

interface Beat {
  title: string;
  line: string;
}

interface Act {
  name: string;
  goal: string;
  beats: Beat[];
}

interface Opening {
  title: string;
  line: string;
}

interface Genre {
  id: string;
  no: string;
  name: string;
  en: string;
  image: string;
  accent: string;
  tagline: string;
  question: string;
  promise: string;
  conflicts: string[];
  engineQuote: string;
  engine: string;
  acts: Act[];
  opening: Opening[];
  mixOk: string[];
  mixNo: string[];
  pitfall: string;
}

const GENRES: Genre[] = [
  {
    id: 'xianxia',
    no: '01',
    name: '仙侠',
    en: 'XIANXIA',
    image: '/plot/wuxia.jpg',
    accent: '#d6b26a',
    tagline: '以凡人之身，问长生之道。',
    question: '一个被规则压在底层的人，能不能靠自己的道，走到规则之上？',
    promise: '升级、奇遇、师门、道法、天劫——读者要看的是越阶与道心。',
    conflicts: ['师门恩怨', '正魔之争', '天劫', '道心'],
    engineQuote: '修行不是变强，是拿命换一个答案。',
    engine:
      '宗门、境界、天劫构成外部阶梯；道心与欲望构成内部裂缝。每一次升级，都要用一段关系或一条底线来换。',
    acts: [
      {
        name: '立局',
        goal: '让主角入道，并欠下第一笔债。',
        beats: [
          { title: '入道', line: '测灵根 / 入山门，天赋与出身同时被判定。' },
          { title: '试炼', line: '第一次越阶，赢下资格，也得罪人。' },
          { title: '第一笔债', line: '师门、亲人或同伴因他付出代价。' },
        ],
      },
      {
        name: '破局',
        goal: '让他发现「变强」解决不了真正的问题。',
        beats: [
          { title: '秘境', line: '得到传承，也放出更大的东西。' },
          { title: '宗门变局', line: '师父、掌门、同门站队，旧秩序裂开。' },
          { title: '道心崩塌', line: '他相信的道，被证明是别人写的。' },
        ],
      },
      {
        name: '定局',
        goal: '让他用自己的道，替世界做一次选择。',
        beats: [
          { title: '天劫', line: '外部考验与内部裂缝同时到来。' },
          { title: '正魔决战', line: '不是打赢，是决定谁有资格活。' },
          { title: '飞升 / 留人间', line: '得道之后，他选择留下还是离开。' },
        ],
      },
    ],
    opening: [
      { title: '测灵根', line: '全宗围观，他被判成最差的那一个。' },
      { title: '入山门', line: '他带着秘密进门，先学会低头。' },
      { title: '第一次见血', line: '救命的一剑，让他欠下第一条命。' },
    ],
    mixOk: ['悬疑：用谜案逼他问道心', '历史：把宗门放进王朝更替'],
    mixNo: ['硬科幻：修炼体系与物理规则互相拆台'],
    pitfall: '只写升级，不写代价；境界越写越高，人越来越薄。',
  },
  {
    id: 'fantasy',
    no: '02',
    name: '玄幻',
    en: 'FANTASY',
    image: '/plot/temple.jpg',
    accent: '#a58ad6',
    tagline: '世界很大，力量没有上限。',
    question: '一个最底层的人，能不能在万族并立的世界里，建立自己的秩序？',
    promise: '世界观、血脉、势力、神战；读者要看地图展开与越级。',
    conflicts: ['血脉', '家族', '万族', '神战'],
    engineQuote: '先画地图，再放怪物；每一次扩张都要有代价。',
    engine:
      '以地图扩张为骨、血脉传承为线、势力吞并为事件；世界变大时，主角的代价也要变大，否则战力会先于故事失控。',
    acts: [
      {
        name: '立局',
        goal: '让他从底层觉醒，第一次看见世界的尺度。',
        beats: [
          { title: '觉醒之日', line: '天赋 / 血脉被判定，家族给出冷漠结论。' },
          { title: '学院或部落', line: '第一次被当成异类，也第一次被看见。' },
          { title: '灭族危机', line: '他第一次为别人出手，代价开始累积。' },
        ],
      },
      {
        name: '破局',
        goal: '让他发现血脉是礼物，也是债。',
        beats: [
          { title: '远古遗迹', line: '得到传承，也放出不该醒的东西。' },
          { title: '势力战争', line: '站队、背叛、吞并，地图开始改写。' },
          { title: '身份反转', line: '他不是自己以为的那个人。' },
        ],
      },
      {
        name: '定局',
        goal: '让他决定新秩序由谁来定。',
        beats: [
          { title: '神战', line: '旧神与旧秩序一起压下来。' },
          { title: '秩序重建', line: '不是打赢，是决定谁有资格活。' },
          { title: '代价', line: '成为传说，或成为禁忌。' },
        ],
      },
    ],
    opening: [
      { title: '觉醒日', line: '全族看着他的血脉亮起错误的颜色。' },
      { title: '学院报到', line: '他带着最低的评价，走进最高的门槛。' },
      { title: '第一次追杀', line: '有人不想让他活到下一次觉醒。' },
    ],
    mixOk: ['仙侠：同源，可共用境界', '软科幻：废土 / 基因文明'],
    mixNo: ['现实向言情：力量尺度压过情感', '纯历史：神话逻辑破坏史实'],
    pitfall: '地图越画越大，人物越来越小；战力膨胀，冲突失效。',
  },
  {
    id: 'urban',
    no: '03',
    name: '都市',
    en: 'URBAN',
    image: '/plot/city.jpg',
    accent: '#6fb3c4',
    tagline: '在城市里，没有人会等你准备好。',
    question: '一个没有背景的人，能不能在规则和资本之间，拿回自己的位置？',
    promise: '逆袭、打脸、商战、身世、情感；读者要看现实规则的翻盘。',
    conflicts: ['职场', '资本', '家庭', '身份'],
    engineQuote: '城市的墙不是砖，是信息差和人情债。',
    engine:
      '资源与信息差制造机会，阶层壁垒制造阻力，情感债让胜利有代价；不要用金手指绕过规则。',
    acts: [
      {
        name: '立局',
        goal: '让他在最低处看见一个机会。',
        beats: [
          { title: '低谷', line: '被辞、被退婚、被赶出家门，退无可退。' },
          { title: '机会', line: '一份工作、一个案子或一个人递来梯子。' },
          { title: '第一次翻身', line: '赢下小局，也欠下人情。' },
        ],
      },
      {
        name: '破局',
        goal: '让他发现规则不是给所有人用的。',
        beats: [
          { title: '商战 / 职场战', line: '对手用规则内外两套打法。' },
          { title: '背叛', line: '盟友或亲人站到对面。' },
          { title: '身世', line: '真正的对手，和他有旧账。' },
        ],
      },
      {
        name: '定局',
        goal: '让他在赢和成为自己之间选一个。',
        beats: [
          { title: '终局谈判', line: '筹码、底牌、人情一次摊开。' },
          { title: '选择', line: '赢、救人、放手，只能选一个。' },
          { title: '代价', line: '位置、关系或名声，总得留一个在桌上。' },
        ],
      },
    ],
    opening: [
      { title: '被辞退', line: '他在雨天抱着纸箱，接到一个陌生电话。' },
      { title: '神秘来电', line: '对方知道他一个不该被知道的秘密。' },
      { title: '第一次进局', line: '他以为自己是来帮忙的，其实是来做棋子的。' },
    ],
    mixOk: ['悬疑：案件线推动现实压力', '言情：情感线给胜利加代价'],
    mixNo: ['高魔玄幻：力量尺度破坏现实规则', '纯爽文：打脸重复，现实感消失'],
    pitfall: '打脸重复、金手指过大；爽感吃掉现实感。',
  },
  {
    id: 'mystery',
    no: '04',
    name: '悬疑',
    en: 'MYSTERY',
    image: '/plot/forest.jpg',
    accent: '#9db6d6',
    tagline: '每个答案，都会打开一个更大的问题。',
    question: '一个人能不能在所有人都在说谎的地方，找到唯一的真相？',
    promise: '谜面、线索、误导、反转、真相；读者要公平地猜错。',
    conflicts: ['凶手', '警方', '受害者', '自己'],
    engineQuote: '悬疑不是藏答案，是让读者看见答案却不敢信。',
    engine:
      '信息不对称推进调查，时间压力逼出选择，信任崩塌制造第二层危险；每条线索都要能被读者看见。',
    acts: [
      {
        name: '立局',
        goal: '让日常裂开一道缝。',
        beats: [
          { title: '异常', line: '一个不该出现的细节，打破日常。' },
          { title: '调查', line: '他第一次进入现场与关系网。' },
          { title: '第一具尸体', line: '案件升级，退路消失。' },
        ],
      },
      {
        name: '破局',
        goal: '让所有答案都指向错误的人。',
        beats: [
          { title: '误导', line: '假线索、假动机，连读者也被骗。' },
          { title: '第二个死者', line: '规则改变，凶手开始主动。' },
          { title: '侦探被怀疑', line: '信任崩塌，他成了嫌疑人。' },
        ],
      },
      {
        name: '定局',
        goal: '让真相和代价同时到达。',
        beats: [
          { title: '反转', line: '真凶与动机同时翻面。' },
          { title: '真相', line: '所有线索拼成一张完整的图。' },
          { title: '代价', line: '抓住凶手，也可能失去某个人。' },
        ],
      },
    ],
    opening: [
      { title: '异常日常', line: '门锁没坏，屋里的东西却少了一件。' },
      { title: '失踪', line: '所有人说见过她，只有监控说没有。' },
      { title: '第一现场', line: '他看见一个只有凶手才看得懂的细节。' },
    ],
    mixOk: ['都市：现实土壤', '恐怖：氛围加码'],
    mixNo: ['纯甜言情：节奏冲突', '高魔玄幻：推理规则被超能力破坏'],
    pitfall: '线索不公平、凶手空降；为了反转而反转。',
  },
  {
    id: 'scifi',
    no: '05',
    name: '科幻',
    en: 'SCI-FI',
    image: '/plot/space.jpg',
    accent: '#7fc7e8',
    tagline: '技术每前进一步，人都要重新回答「我是谁」。',
    question: '当技术或文明越过人的边界，人还能不能决定自己的命运？',
    promise: '世界观、技术奇观、文明尺度、哲学问题；读者要看见「如果」。',
    conflicts: ['技术', '制度', '外星', '自我'],
    engineQuote: '科幻的冲突不在激光，在「谁有资格定义人」。',
    engine:
      '一个技术变量打破旧秩序；制度追赶技术；人的定义成为最终战场。设定必须逼人物做选择，而不是替人物做选择。',
    acts: [
      {
        name: '立局',
        goal: '让一个「不可能」变成日常。',
        beats: [
          { title: '发现', line: '异常数据或第一例，打破常识。' },
          { title: '第一次失控', line: '技术越过边界，代价出现。' },
          { title: '封锁', line: '制度开始反应，选择被压缩。' },
        ],
      },
      {
        name: '破局',
        goal: '让所有人都想用这件技术。',
        beats: [
          { title: '技术扩散', line: '阵营分裂，规则追不上变化。' },
          { title: '伦理冲突', line: '谁被牺牲，谁来定义「值得」。' },
          { title: '中点真相', line: '技术不是工具，它在改变人。' },
        ],
      },
      {
        name: '定局',
        goal: '让文明为「人是什么」做选择。',
        beats: [
          { title: '文明选择', line: '共存、清除或逃离，没有完美答案。' },
          { title: '牺牲', line: '谁代表人类按下那个按钮。' },
          { title: '新秩序', line: '代价落地，世界不再一样。' },
        ],
      },
    ],
    opening: [
      { title: '实验室异常', line: '仪器显示的结果，违背了所有已知。' },
      { title: '第一例失控', line: '一个普通人在系统里「消失」了。' },
      { title: '封锁令', line: '他们被封在城里，外面的人开始说谎。' },
    ],
    mixOk: ['悬疑：技术谜案', '架空历史：文明循环'],
    mixNo: ['纯仙侠：解释体系冲突', '纯言情：设定压过情感'],
    pitfall: '用设定解释代替人物选择；技术越硬，人越像说明书。',
  },
  {
    id: 'history',
    no: '06',
    name: '历史',
    en: 'HISTORICAL',
    image: '/plot/library.jpg',
    accent: '#c9a66b',
    tagline: '大势之下，每个人都得选一边。',
    question: '一个知道结局的人，能不能在洪流里保住想保的人？',
    promise: '权谋、战争、人心、时代感；读者要看「人在局中」。',
    conflicts: ['皇权', '门阀', '外敌', '民心'],
    engineQuote: '历史不是背景，是一张不断收紧的网。',
    engine:
      '时局给机会，利益结盟给阻力，信息差决定谁先动；每一次选择都要写进后果，不能开天眼。',
    acts: [
      {
        name: '立局',
        goal: '让他被时代推着入局。',
        beats: [
          { title: '时局', line: '战、乱、灾，旧秩序开始松动。' },
          { title: '入局', line: '站队、任职或被牵连，他不能旁观。' },
          { title: '第一次站队', line: '他选了一边，就得罪另一边。' },
        ],
      },
      {
        name: '破局',
        goal: '让他发现盟友比敌人更危险。',
        beats: [
          { title: '联盟', line: '利益交换，所有人都在算账。' },
          { title: '背叛', line: '旧主或盟友在关键时刻转身。' },
          { title: '战争', line: '大势压过来，个人选择被放大。' },
        ],
      },
      {
        name: '定局',
        goal: '让他决定史书怎么写这一页。',
        beats: [
          { title: '定局', line: '关键一战或一纸盟约，改变天下。' },
          { title: '代价', line: '亲人、名声或国土，总得失去一样。' },
          { title: '史书一笔', line: '他留下的，不一定是自己想要的。' },
        ],
      },
    ],
    opening: [
      { title: '城门告急', line: '他站在城楼上，看见时代压过来。' },
      { title: '朝堂站队', line: '所有人都在等他说一句错话。' },
      { title: '第一次杀人', line: '他为了救人，先杀了一个人。' },
    ],
    mixOk: ['悬疑：案中案看人心', '武侠：江湖入朝'],
    mixNo: ['高魔玄幻：历史逻辑被破坏', '纯爽文：权谋没有代价'],
    pitfall: '现代价值观硬套古人；权谋只有算计，没有代价。',
  },
  {
    id: 'romance',
    no: '07',
    name: '言情',
    en: 'ROMANCE',
    image: '/plot/romance.jpg',
    accent: '#e0a58c',
    tagline: '爱不是答案，是选择的代价。',
    question: '两个人能不能在身份、时间和选择之间，走到一起？',
    promise: '心动、拉扯、误会、成长、HE / BE；读者要的是情感因果。',
    conflicts: ['身份', '家庭', '事业', '自我'],
    engineQuote: '言情的高潮不是告白，是两个人同时暴露最怕失去的东西。',
    engine:
      '情感需求推进靠近，外部阻力制造分离，自我成长决定结局；误会要服务人物，不要替代人物。',
    acts: [
      {
        name: '立局',
        goal: '让两个人靠近，但各有不能说的东西。',
        beats: [
          { title: '相遇', line: '错位、冲突或意外，让两个人不得不认识。' },
          { title: '靠近', line: '被迫共处或共同目标，距离缩短。' },
          { title: '第一次心动', line: '一个人看见另一个人的软肋。' },
        ],
      },
      {
        name: '破局',
        goal: '让外部阻力和内部恐惧同时到来。',
        beats: [
          { title: '误会', line: '不是降智，是信息差和立场不同。' },
          { title: '分离', line: '家庭、事业或身份，把人推开。' },
          { title: '各自成长', line: '没有对方，也要能活下去。' },
        ],
      },
      {
        name: '定局',
        goal: '让他们重新选择彼此。',
        beats: [
          { title: '重逢', line: '身份和位置变了，人还是不是那个人。' },
          { title: '选择', line: '爱、自我、责任，只能选一个。' },
          { title: '结局', line: 'HE / BE 都要有因果，不要为了虐而虐。' },
        ],
      },
    ],
    opening: [
      { title: '雨夜相遇', line: '他们在同一把伞下，谁也没先开口。' },
      { title: '被迫同居', line: '两个人都以为只是暂时的。' },
      { title: '第一次撒谎', line: '她说的那句话，把自己也骗了。' },
    ],
    mixOk: ['都市：现实压力', '悬疑：共同调查'],
    mixNo: ['硬科幻 / 高魔：情感密度被稀释', '纯爽文：关系变成奖励'],
    pitfall: '误会拖沓、角色降智；为了虐而虐。',
  },
  {
    id: 'wuxia',
    no: '08',
    name: '武侠',
    en: 'WUXIA',
    image: '/plot/xianxia.jpg',
    accent: '#a8c08a',
    tagline: '江湖不是地方，是人心的去处。',
    question: '一个人能不能在恩仇和规矩之间，守住自己的刀？',
    promise: '武功、门派、恩义、江湖气；读者要看「出手的理由」。',
    conflicts: ['师门', '仇家', '朝廷', '道义'],
    engineQuote: '刀快不难，难的是这一刀为什么砍下去。',
    engine:
      '恩仇推动行动，门派与朝廷划定边界，道义让胜利变成代价；武功是手段，不是数值。',
    acts: [
      {
        name: '立局',
        goal: '让他下山，第一次面对恩仇。',
        beats: [
          { title: '出师', line: '师命、规矩、旧账，一起交到他手上。' },
          { title: '第一场恩怨', line: '救人还是杀人，他第一次自己决定。' },
          { title: '卷入江湖', line: '门派、朝廷、旧案，把他拖进更大的局。' },
        ],
      },
      {
        name: '破局',
        goal: '让他发现仇人不止一个。',
        beats: [
          { title: '追杀', line: '身份暴露，旧仇新敌一起上门。' },
          { title: '盟友', line: '同路不同心，谁都在算自己的账。' },
          { title: '真相', line: '旧案或师门秘密，推翻他的恨。' },
        ],
      },
      {
        name: '定局',
        goal: '让他决定刀最后砍向谁。',
        beats: [
          { title: '决战', line: '恩仇与道义，只能选一边。' },
          { title: '归隐或立派', line: '他选择离开江湖，还是重写规矩。' },
          { title: '江湖余波', line: '人走了，传说和代价还在。' },
        ],
      },
    ],
    opening: [
      { title: '下山', line: '师父只给了他一句话，和一把旧刀。' },
      { title: '灭门', line: '他在雨里看见一地的名字。' },
      { title: '第一次拔刀', line: '刀出鞘时，他才知道自己怕什么。' },
    ],
    mixOk: ['历史：庙堂与江湖', '悬疑：旧案追凶'],
    mixNo: ['都市甜宠：江湖逻辑冲突', '高魔玄幻：武力体系压过侠义'],
    pitfall: '武功数值化、江湖变擂台；只有打，没有义。',
  },
];

interface Extra {
  readerWhy: string;
  readerPayoff: string;
  formula: string;
  openingNote: string;
  pitfalls: string[];
  actNotes: string[];
}

const EXTRAS: Record<string, Extra> = {
  xianxia: {
    readerWhy:
      '仙侠读者追的不是境界表，是「一个普通人凭什么走到规则之上」。他们要看见越阶的爽，也要看见越阶的代价；要看见道法，也要看见道心。升级若没有代价，只是数字变大。',
    readerPayoff: '你修的不是仙，是你愿意为道付出什么。',
    formula: '凡人 × 阶梯 × 代价 = 越阶',
    openingNote:
      '开场别从三千年前的大战讲起。先写一个具体的人，在一次具体的判定里被看轻；读者先共情，再接受世界观。',
    pitfalls: ['只升级，不问道心', '境界膨胀，人物变薄', '天劫变成数值结算'],
    actNotes: [
      '让读者先看见代价，再看见天赋；入道不是奖励，是欠债。',
      '不要急着升级，先让旧方法失效，让道心裂开。',
      '外部天劫和内部选择放在同一刻；飞升不是奖励，是取舍。',
    ],
  },
  fantasy: {
    readerWhy:
      '玄幻读者追的是世界展开的惊喜：新种族、新地图、新力量体系。每翻一页都该有「原来世界这么大」的感觉，但地图变大时，人物不能变小。',
    readerPayoff: '世界越大，选择越贵。',
    formula: '地图 × 血脉 × 势力 = 扩张',
    openingNote:
      '开场先给一个可感知的尺度差：他以为的世界，只是世界的一角。用一个具体事件把差距打在他脸上。',
    pitfalls: ['地图膨胀，人物失焦', '战力崩坏，冲突失效', '血脉万能，选择消失'],
    actNotes: [
      '先露世界的一角，别一次讲完；让读者跟着主角看见更大的东西。',
      '每一次扩张都要死人或失地，地图变大要有人付账。',
      '让旧神/旧秩序亲自下场，胜负决定谁定新规矩。',
    ],
  },
  urban: {
    readerWhy:
      '都市读者追的是现实规则的翻盘：不靠天降神力，靠信息、人情、胆识和选择。打脸要建立在规则上，胜利要带代价，现实感是爽感的底座。',
    readerPayoff: '规则不帮你，但你可以学会用规则。',
    formula: '资源 × 信息差 × 人情 = 翻盘',
    openingNote:
      '开场先让主角失去一个具体的东西：工作、住处、尊严。现实压力越具体，后面的翻盘越有感觉。',
    pitfalls: ['打脸重复，爽感疲劳', '金手指过大，规则失效', '现实感被爽感吃掉'],
    actNotes: [
      '先把主角逼到退无可退，再给一个看起来不体面的机会。',
      '规则内外两套力量同时压过来；赢一次，就要欠一次人情。',
      '把赢和做人放在天平上，让他选一个，别让他全拿。',
    ],
  },
  mystery: {
    readerWhy:
      '悬疑读者追的是「我能不能比侦探先猜到」。线索要公平，误导要合理，反转要重写前文。真相不只是答案，还要改变一个人。',
    readerPayoff: '你看见的答案，可能只是凶手的第二层设计。',
    formula: '谜面 × 误导 × 时间 = 真相',
    openingNote:
      '开场先给异常，不给解释。让读者和主角同时看见一个「不对劲」的细节，再一起往里走。',
    pitfalls: ['线索不公平，读者无法参与', '凶手空降，前文没有伏笔', '为了反转而反转'],
    actNotes: [
      '先给一个解释不通的细节，不要先给尸体；让读者先不安。',
      '每条新线索都要推翻一个旧判断，让读者至少猜错两次。',
      '真凶必须在前文出现过；反转要重写前文意义，不是加一个新人。',
    ],
  },
  scifi: {
    readerWhy:
      '科幻读者追的是「如果世界这样，人会怎样」。技术奇观是入口，人的选择才是核心；设定越硬，人物越要有温度。',
    readerPayoff: '技术改变世界，人决定世界变成什么。',
    formula: '技术 × 制度 × 人的定义 = 选择',
    openingNote:
      '开场先让技术落在一个人身上：他的手、他的记忆、他的孩子。不要先讲一百年后的世界。',
    pitfalls: ['设定解释代替人物选择', '技术堆砌，情感缺席', '文明尺度压过个体命运'],
    actNotes: [
      '让一个技术细节先改变一个人的日常，再谈文明。',
      '制度追着技术跑；所有人都想用它，没人想付代价。',
      '把选择放在人身上，不要用设定替人物做决定。',
    ],
  },
  history: {
    readerWhy:
      '历史读者追的是「人在局中」：明知大势不可逆，仍要选一边。权谋要算得清，代价要付得起，人物不能开天眼。',
    readerPayoff: '大势不由人，但每一步都是人走的。',
    formula: '时局 × 联盟 × 背叛 = 定局',
    openingNote:
      '开场先写一个具体的人在一个具体的局里：城门、朝堂、粮道。天下大势要通过一个人的选择露出来。',
    pitfalls: ['现代价值观硬套古人', '权谋只有算计，没有代价', '人物开天眼，历史失去重量'],
    actNotes: [
      '先写时局怎么压到具体的人身上，不要先讲天下大势。',
      '让盟友按利益行动；背叛要有提前埋下的账。',
      '让胜利和失去同时发生；史书只记结果，不记代价。',
    ],
  },
  romance: {
    readerWhy:
      '言情读者追的是情感的因果：为什么是这个人，为什么现在，为什么不能在一起。心动要有细节，分离要有理由，成长要让人相信。',
    readerPayoff: '爱不是结局，是两个人愿不愿意为彼此改一次。',
    formula: '靠近 × 阻力 × 自我成长 = 选择',
    openingNote:
      '开场先让两个人有不得不相处的理由：一场雨、一份合同、一桩案子。心动要从摩擦里长出来。',
    pitfalls: ['误会拖沓，关系原地打转', '角色降智，只为制造冲突', '为了虐而虐，结局没有因果'],
    actNotes: [
      '让两个人不得不靠近，但各有不能说的东西。',
      '误会来自信息差和立场，不来自降智；分离要有外部理由。',
      '重逢时两个人都变了，选择才有重量；HE/BE 都要有因果。',
    ],
  },
  wuxia: {
    readerWhy:
      '武侠读者追的是「出手的理由」：刀快不难，难的是这一刀为什么砍。江湖不是擂台，是人情、恩义、规矩和代价。',
    readerPayoff: '江湖没有胜负，只有代价。',
    formula: '恩仇 × 规矩 × 道义 = 出手',
    openingNote:
      '开场先写规矩，再写破规矩的人。让读者看见江湖的秩序，再看见主角为什么不得不出手。',
    pitfalls: ['武功数值化，侠义消失', '江湖变擂台，只剩打斗', '只有恩仇，没有道义'],
    actNotes: [
      '让规矩先出手，再让主角拔刀；出手理由比招式重要。',
      '让仇人不止一个；旧案的真相推翻他的恨。',
      '最后一刀砍向谁，决定他是侠、是魔，还是归隐。',
    ],
  },
};

const GENRE_KEY = 'loom:plot:genre';

function loadGenre(): string {
  try {
    const id = localStorage.getItem(GENRE_KEY);
    return id && GENRES.some((g) => g.id === id) ? id : 'xianxia';
  } catch {
    return 'xianxia';
  }
}

const RAIL = [
  { id: 'engine', no: '01', label: '引擎' },
  { id: 'acts', no: '02', label: '三幕' },
  { id: 'opening', no: '03', label: '开场' },
  { id: 'mix', no: '04', label: '混搭' },
];

/** 滚动入场：元素进入视口后上浮/去模糊 */
function useReveal(dep: string): void {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.genre-page [data-reveal]'));
    els.forEach((el) => el.classList.remove('is-in'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [dep]);
}

/** 头图与引擎图的轻视差 */
function useParallax(dep: string): void {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const root = document.querySelector<HTMLElement>('main#main');
    const target: EventTarget = root ?? window;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const hero = document.querySelector<HTMLElement>('.genre-hero-image');
        if (hero) {
          const y = Math.min(root?.scrollTop ?? window.scrollY, 780);
          hero.style.transform = `translateY(${y * 0.11}px) scale(1.045)`;
        }
        const engine = document.querySelector<HTMLElement>('.genre-engine-media img');
        if (engine) {
          const r = engine.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) {
            const shift = Math.min(44, Math.max(-44, (window.innerHeight - r.top) * 0.045));
            engine.style.transform = `translateY(${shift}px) scale(1.06)`;
          }
        }
      });
    };
    target.addEventListener('scroll', onScroll as EventListener, { passive: true });
    onScroll();
    return () => {
      target.removeEventListener('scroll', onScroll as EventListener);
      cancelAnimationFrame(raf);
    };
  }, [dep]);
}

/** 右侧章节进度 */
function useActiveRail(): string {
  const [active, setActive] = useState('engine');
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('main#main');
    const target: EventTarget = root ?? window;
    const onScroll = () => {
      let current = 'engine';
      for (const x of RAIL) {
        const el = document.getElementById(`genre-${x.id}`);
        if (el && el.getBoundingClientRect().top <= 180) current = x.id;
      }
      if (root && root.scrollTop + root.clientHeight >= root.scrollHeight - 8) current = "mix";
      setActive(current);
    };
    target.addEventListener('scroll', onScroll as EventListener, { passive: true });
    onScroll();
    return () => target.removeEventListener('scroll', onScroll as EventListener);
  }, []);
  return active;
}

export function PlotBoard(): React.ReactElement {
  const [genreId, setGenreId] = useState<string>(() => loadGenre());
  const [copied, setCopied] = useState(false);
  const g = GENRES.find((x) => x.id === genreId) ?? GENRES[0]!;
  const extra = EXTRAS[g.id]!;
  const activeRail = useActiveRail();
  useReveal(g.id);
  useParallax(g.id);

  useEffect(() => {
    try {
      localStorage.setItem(GENRE_KEY, genreId);
    } catch {
      /* 忽略 */
    }
    setCopied(false);
  }, [genreId]);

  const outlineText = () => {
    const acts = g.acts
      .map(
        (a, i) =>
          `第 ${i + 1} 幕 · ${a.name}\n目标：${a.goal}\n` +
          a.beats.map((b, j) => `  ${j + 1}. ${b.title}：${b.line}`).join('\n'),
      )
      .join('\n\n');
    const opening = g.opening.map((o, i) => `${i + 1}. ${o.title}：${o.line}`).join('\n');
    return `${g.name}｜${g.tagline}\n\n核心问题：${g.question}\n读者承诺：${g.promise}\n主冲突：${g.conflicts.join(' / ')}\n\n三幕九拍\n${acts}\n\n开场三章\n${opening}\n\n容易写崩：${g.pitfall}\n`;
  };

  const copyOutline = async () => {
    const text = outlineText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="page genre-page" style={{ ['--genre-accent' as string]: g.accent }}>
      <nav className="genre-rail" aria-label="页内进度">
        {RAIL.map((x) => (
          <button
            key={x.id}
            className={activeRail === x.id ? 'is-on' : ''}
            onClick={() =>
              document
                .getElementById(`genre-${x.id}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            title={x.label}
          >
            <span>{x.no}</span>
            <i />
            <em>{x.label}</em>
          </button>
        ))}
      </nav>

      {/* 类型切换：图片胶片 */}
      <nav className="genre-strip" aria-label="切换小说类型">
        <div className="genre-strip-head">
          <span className="genre-strip-kicker">GENRE ATLAS</span>
          <strong>类型</strong>
          <em>08</em>
        </div>
        <div className="genre-strip-scroll">
          {GENRES.map((x) => (
            <button
              key={x.id}
              className={`genre-tab ${x.id === g.id ? 'is-on' : ''}`}
              onClick={() => setGenreId(x.id)}
              title={x.name}
              aria-pressed={x.id === g.id}
            >
              <span className="genre-tab-img">
                <img src={x.image} alt="" loading="lazy" />
              </span>
              <span className="genre-tab-no">{x.no}</span>
              <span className="genre-tab-name">{x.name}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* 头图：选中类型 */}
      <section className="genre-hero" key={g.id}>
        <img className="genre-hero-image" src={g.image} alt={`${g.name}氛围图`} />
        <div className="genre-hero-shade" />
        <div className="genre-hero-inner">
          <div className="genre-hero-copy">
            <p className="genre-kicker">
              GENRE FILE <span>{g.no}</span> / 08
            </p>
            <h1>{g.name}</h1>
            <p className="genre-en">{g.en}</p>
            <p className="genre-tagline">{g.tagline}</p>
            <div className="genre-hero-actions">
              <button className="genre-copy" onClick={() => void copyOutline()}>
                {copied ? '已复制 ✓' : '复制这类故事的骨架'}
              </button>
              <span className="genre-hero-hint">三幕九拍 · 开场三章 · 混搭禁区</span>
            </div>
          </div>

          <div className="genre-hero-facts">
            <div>
              <span>核心问题</span>
              <p>{g.question}</p>
            </div>
            <div>
              <span>读者承诺</span>
              <p>{g.promise}</p>
            </div>
          </div>
        </div>
        <div className="genre-hero-stamp" aria-hidden="true">
          {g.no}
        </div>
      </section>

      {/* 引擎：第二次图片冲击 */}
      <section className="genre-engine-band" id="genre-engine" data-reveal>
        <div className="genre-engine-media">
          <img src={g.image} alt={`${g.name}氛围图`} loading="lazy" />
          <div className="genre-engine-veil" />
        </div>
        <div className="genre-engine-content">
          <div className="genre-kicker">01 / 这类故事的引擎</div>
          <blockquote>{g.engineQuote}</blockquote>
          <p>{g.engine}</p>
        </div>
      </section>

      {/* 读者为什么追 */}
      <section className="genre-section genre-reader" data-reveal>
        <div className="genre-reader-grid">
          <div>
            <div className="genre-kicker">读者为什么追</div>
            <p className="genre-reader-copy">{extra.readerWhy}</p>
          </div>
          <blockquote className="genre-reader-quote">{extra.readerPayoff}</blockquote>
        </div>
        <div className="genre-formula">
          <span>类型公式</span>
          <strong>{extra.formula}</strong>
        </div>
      </section>

      <section className="genre-facts" data-reveal>
        <div className="genre-fact">
          <span>主冲突</span>
          <ul>
            {g.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div className="genre-fact">
          <span>常见混搭</span>
          <ul>
            {g.mixOk.slice(0, 2).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
        <div className="genre-fact genre-fact-warn">
          <span>类型陷阱</span>
          <ul className="genre-pitfalls">
            {extra.pitfalls.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* 三幕九拍 */}
      <section className="genre-section genre-acts" id="genre-acts">
        <div className="genre-section-head" data-reveal>
          <div className="genre-kicker">02 / 三幕九拍</div>
          <span>每一拍只回答一件事：局面怎么变。</span>
        </div>
        <div className="genre-act-grid">
          {g.acts.map((a, ai) => (
            <article
              className="genre-act"
              key={a.name}
              data-reveal
              style={{ ['--delay' as string]: `${ai * 90}ms` }}
            >
              <header>
                <span className="genre-act-no">第 {String(ai + 1).padStart(2, '0')} 幕</span>
                <h2>{a.name}</h2>
                <p>{a.goal}</p>
                <p className="genre-act-note">{extra.actNotes[ai]}</p>
              </header>
              <ol>
                {a.beats.map((b, bi) => (
                  <li key={b.title}>
                    <span className="genre-beat-no">{String(ai * 3 + bi + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{b.title}</strong>
                      <p>{b.line}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      {/* 开场三章：同一张图的三种裁切 */}
      <section className="genre-section genre-opening" id="genre-opening" data-reveal>
        <div className="genre-section-head">
          <div className="genre-kicker">03 / 开场三章</div>
          <span>前三章不是介绍世界观，是让一个人被逼着做选择。</span>
        </div>
        <div className="genre-opening-grid">
          {g.opening.map((o, i) => (
            <article
              className="genre-opening-card"
              key={o.title}
              data-reveal
              style={{ ['--delay' as string]: `${i * 90}ms` }}
            >
              <img
                src={g.image}
                alt=""
                loading="lazy"
                style={{
                  objectPosition: ['18% 45%', '50% 50%', '82% 55%'][i] ?? '50% 50%',
                }}
              />
              <div className="genre-opening-veil" />
              <div className="genre-opening-copy">
                <span>0{i + 1}</span>
                <h3>{o.title}</h3>
                <p>{o.line}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="genre-opening-note">{extra.openingNote}</p>
      </section>

      {/* 混搭 */}
      <section className="genre-section genre-mix" id="genre-mix" data-reveal>
        <div className="genre-section-head">
          <div className="genre-kicker">04 / 能不能混着写</div>
          <span>混类型不是贴两个标签，是先决定读者到底在追哪一件事。</span>
        </div>
        <div className="genre-mix-grid">
          <div className="genre-mix-col genre-mix-ok" data-reveal>
            <h3>可以搭</h3>
            <ul>
              {g.mixOk.map((m) => (
                <li key={m}>
                  <span>✓</span>
                  {m}
                </li>
              ))}
            </ul>
          </div>
          <div className="genre-mix-col genre-mix-no" data-reveal>
            <h3>别硬搭</h3>
            <ul>
              {g.mixNo.map((m) => (
                <li key={m}>
                  <span>✕</span>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="genre-foot" data-reveal>
        <p>
          类型是骨架，不是牢笼。换类型，换的是冲突引擎和读者承诺，不是把同一个故事换张皮。
        </p>
        <span>摄影图源：Unsplash</span>
      </footer>
    </div>
  );
}
