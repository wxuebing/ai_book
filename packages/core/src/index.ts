/**
 * 流云织小说工作台 · 内核公开 API
 *
 * 铁律：内核里没有「题材」「分类」「体裁」。
 */

export * from './types.ts';
// yaml 与 markdown 都有 parseInline：显式指定优先导出 markdown 的版本，
// yaml 的版本改名导出，避免歧义
export {
  parseYaml,
  parseFrontmatter,
  stringifyYaml,
  YamlError,
  parseInline as parseYamlInline,
} from './yaml.ts';
export type { YamlValue, YamlObject } from './yaml.ts';
export * from './markdown.ts';
export * from './note.ts';
export * from './vault.ts';
export * from './relations.ts';
export * from './index-db.ts';
export * from './engine.ts';
export * from './workspace.ts';
export * from './packs.ts';
