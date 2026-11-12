/**
 * 素材包（docs/02-数据模型.md 第 13 章）
 *
 * 定位：素材包不是体裁，只是初始笔记。
 * 安装 = 往 07-类型/ 写入一批 _type 笔记。不改内核，所以永远不限制创新。
 */

import type { FieldDef, ViewKind } from './types.ts';

export interface PackType {
  name: string;
  label: string;
  color: string;
  view: ViewKind;
  desc: string;
  fields: FieldDef[];
}

export interface Pack {
  id: string;
  label: string;
  desc: string;
  /** 导航栏归属 */
  group: string;
  types: PackType[];
}

const f = (
  key: string,
  label: string,
  type: FieldDef['type'] = 'text',
  required = false,
): FieldDef => ({ key, label, type, required });

export const PACKS: Pack[] = [
  {
    id: 'blank',
    label: '空白',
    desc: '什么都不装。从零开始，随时补类型。',
    group: '设定',
    types: [],
  },
  {
    id: 'xianxia',
    label: '仙侠 · 素材包',
    desc: '修炼体系、境界、灵根、丹药、法宝、宗门、秘境',
    group: '设定',
    types: [
      {
        name: '修炼体系', label: '修炼体系', color: '#4E9CA8', view: 'tree',
        desc: '一套可以并行或串行的力量路径。',
        fields: [f('order', '序', 'number'), f('parent', '上级体系', 'ref')],
      },
      {
        name: '境界', label: '境界', color: '#4E9CA8', view: 'ladder',
        desc: '体系内的阶位。用 order 排序成阶梯。',
        fields: [
          f('order', '阶数', 'number', true),
          f('parent', '所属体系', 'ref'),
          f('lifespan', '寿元'),
        ],
      },
      {
        name: '灵根', label: '灵根', color: '#7BA05B', view: 'list',
        desc: '天赋资质。',
        fields: [f('element', '属性'), f('grade', '品阶')],
      },
      {
        name: '丹药', label: '丹药', color: '#B08A5A', view: 'list',
        desc: '消耗品。',
        fields: [f('grade', '品阶'), f('effect', '功效', 'longtext')],
      },
      {
        name: '法宝', label: '法宝', color: '#7A6A9B', view: 'list',
        desc: '装备。',
        fields: [f('grade', '品阶'), f('owner', '持有者', 'ref')],
      },
      {
        name: '宗门', label: '宗门', color: '#5B7C99', view: 'tree',
        desc: '势力组织。',
        fields: [f('parent', '上级', 'ref'), f('region', '所在地')],
      },
      {
        name: '秘境', label: '秘境', color: '#3E8E8A', view: 'list',
        desc: '特殊地点。',
        fields: [f('region', '所在地'), f('danger', '危险度')],
      },
    ],
  },
  {
    id: 'palace',
    label: '宫廷 · 素材包',
    desc: '位分、家族、派系、圣眷、宫规、事件',
    group: '设定',
    types: [
      {
        name: '位分', label: '位分', color: '#B06A8A', view: 'ladder',
        desc: '后宫等级。',
        fields: [f('order', '品级', 'number', true), f('salary', '俸禄')],
      },
      {
        name: '家族', label: '家族', color: '#5B7C99', view: 'tree',
        desc: '门第。',
        fields: [f('parent', '本家', 'ref'), f('rank', '门第')],
      },
      {
        name: '派系', label: '派系', color: '#9A8FA8', view: 'graph',
        desc: '朝堂/后宫的联盟。',
        fields: [f('leader', '首领', 'ref')],
      },
      {
        name: '圣眷', label: '圣眷', color: '#C4735A', view: 'timeline',
        desc: '恩宠的起伏。',
        fields: [f('date', '时间', 'date'), f('delta', '变化')],
      },
      {
        name: '宫规', label: '宫规', color: '#8A93A8', view: 'list',
        desc: '规则条文。',
        fields: [],
      },
      {
        name: '事件', label: '事件', color: '#C4915A', view: 'timeline',
        desc: '宫中的事。',
        fields: [f('date', '时间', 'date'), f('impact', '影响', 'longtext')],
      },
    ],
  },
  {
    id: 'mystery',
    label: '悬疑 · 素材包',
    desc: '案件、线索、嫌疑人、诡计、动机',
    group: '设定',
    types: [
      {
        name: '案件', label: '案件', color: '#B0605A', view: 'list',
        desc: '一桩案子。',
        fields: [f('status', '状态'), f('date', '发生时间', 'date')],
      },
      {
        name: '线索', label: '线索', color: '#C4735A', view: 'list',
        desc: '指向真相的碎片。',
        fields: [f('status', '状态'), f('pointsTo', '指向', 'ref')],
      },
      {
        name: '嫌疑人', label: '嫌疑人', color: '#7A6A9B', view: 'list',
        desc: '有嫌疑的人。',
        fields: [f('motive', '动机', 'longtext'), f('alibi', '不在场证明', 'longtext')],
      },
      {
        name: '诡计', label: '诡计', color: '#9A8FA8', view: 'list',
        desc: '作案手法。',
        fields: [f('kind', '类型')],
      },
      {
        name: '动机', label: '动机', color: '#B08A5A', view: 'list',
        desc: '为什么做。',
        fields: [],
      },
    ],
  },
  {
    id: 'romance',
    label: '言情 · 素材包',
    desc: '情感阶段、误会、心动点、情敌',
    group: '设定',
    types: [
      {
        name: '情感阶段', label: '情感阶段', color: '#B06A8A', view: 'ladder',
        desc: '关系的推进台阶。',
        fields: [f('order', '序', 'number', true)],
      },
      {
        name: '误会', label: '误会', color: '#C4915A', view: 'list',
        desc: '制造张力的误会。',
        fields: [f('status', '状态'), f('resolvedIn', '化解于', 'ref')],
      },
      {
        name: '心动点', label: '心动点', color: '#C4735A', view: 'timeline',
        desc: '情感的高光时刻。',
        fields: [f('date', '时间', 'date')],
      },
      {
        name: '情敌', label: '情敌', color: '#8A93A8', view: 'list',
        desc: '竞争者。',
        fields: [f('target', '争夺对象', 'ref')],
      },
    ],
  },
  {
    id: 'scifi',
    label: '科幻 · 素材包',
    desc: '科技、种族、星球、纪元、舰队',
    group: '设定',
    types: [
      {
        name: '科技', label: '科技', color: '#3E8E8A', view: 'tree',
        desc: '技术树。',
        fields: [f('parent', '前置科技', 'ref'), f('level', '等级', 'number')],
      },
      {
        name: '种族', label: '种族', color: '#7BA05B', view: 'list',
        desc: '智慧生命。',
        fields: [f('homeworld', '母星', 'ref')],
      },
      {
        name: '星球', label: '星球', color: '#4E9CA8', view: 'tree',
        desc: '天体。',
        fields: [f('parent', '所属星系', 'ref')],
      },
      {
        name: '纪元', label: '纪元', color: '#A08A5A', view: 'timeline',
        desc: '历史分期。',
        fields: [f('date', '起点', 'date'), f('order', '序', 'number')],
      },
      {
        name: '舰队', label: '舰队', color: '#5B7C99', view: 'table',
        desc: '军事力量。',
        fields: [f('size', '规模', 'number'), f('owner', '所属', 'ref')],
      },
    ],
  },
  {
    id: 'military',
    label: '军事 · 素材包',
    desc: '军衔、部队、战役、装备、地形',
    group: '设定',
    types: [
      {
        name: '军衔', label: '军衔', color: '#5B7C99', view: 'ladder',
        desc: '等级序列。',
        fields: [f('order', '序', 'number', true)],
      },
      {
        name: '部队', label: '部队', color: '#7BA05B', view: 'tree',
        desc: '编制。',
        fields: [f('parent', '上级部队', 'ref'), f('size', '人数', 'number')],
      },
      {
        name: '战役', label: '战役', color: '#B0605A', view: 'timeline',
        desc: '战斗。',
        fields: [f('date', '时间', 'date'), f('result', '结果')],
      },
      {
        name: '装备', label: '装备', color: '#8A93A8', view: 'table',
        desc: '武器与器材。',
        fields: [f('spec', '规格'), f('count', '数量', 'number')],
      },
      {
        name: '地形', label: '地形', color: '#A08A5A', view: 'list',
        desc: '战场环境。',
        fields: [],
      },
    ],
  },
  {
    id: 'urban',
    label: '现实/都市 · 素材包',
    desc: '人物、地点、事件',
    group: '设定',
    types: [
      {
        name: '地点', label: '地点', color: '#4E9CA8', view: 'tree',
        desc: '城市、街区、建筑。',
        fields: [f('parent', '上级地点', 'ref'), f('address', '地址')],
      },
      {
        name: '事件', label: '事件', color: '#C4915A', view: 'timeline',
        desc: '发生的事。',
        fields: [f('date', '时间', 'date')],
      },
    ],
  },
];

export function packById(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}
