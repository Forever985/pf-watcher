// 玩家条目的解析与展示。
// 角色名只在「服务器」内唯一，同名跨服是常态，所以社区通用写法是
// 名字@服务器（如 阿尔菲诺@红玉海），也支持 名字@大区 以及「一区」这类俗称。

const DC_ALIAS = {
  一区: '陆行鸟',
  鸟区: '陆行鸟',
  咕哎: '陆行鸟',
  二区: '莫古力',
  猪区: '莫古力',
  库啵: '莫古力',
  三区: '猫小胖',
  猫区: '猫小胖',
  三花: '猫小胖',
  四区: '豆豆柴',
  狗区: '豆豆柴',
};

/**
 * @param {string} raw 用户输入的条目
 * @param {object} catalog boot 回来的 catalog（用 worldToDc 判定服务器）
 */
export function parsePlayerEntry(raw, catalog) {
  const worldToDc = (catalog && catalog.worldToDc) || {};
  const dcNames = ((catalog && catalog.datacenters) || []).map((d) => d.name);
  const s = String(raw || '').trim().normalize('NFKC');
  if (!s) return { raw: s, name: '', world: '', dc: '' };

  const at = Math.max(s.lastIndexOf('@'), s.lastIndexOf('＠'));
  if (at <= 0 || at === s.length - 1) return { raw: s, name: s, world: '', dc: '' };

  const name = s.slice(0, at).trim();
  const tail = s.slice(at + 1).trim();
  if (!tail) return { raw: s, name, world: '', dc: '' };

  if (dcNames.includes(tail)) return { raw: s, name, world: '', dc: tail };
  if (DC_ALIAS[tail]) return { raw: s, name, world: '', dc: DC_ALIAS[tail] };
  const dc = worldToDc[tail] || '';
  return { raw: s, name, world: tail, dc };
}

/** 条目的展示形态：名字 + 范围（服务器 / 大区 / 全服） */
export function playerEntryView(entry) {
  if (entry.world) return { name: entry.name, scope: entry.world, kind: 'world' };
  if (entry.dc) return { name: entry.name, scope: entry.dc, kind: 'dc' };
  return { name: entry.name, scope: '全服', kind: 'all' };
}

/**
 * 当前在招里，这个名字出现在几个不同服务器上。
 * 用来提示「只写名字会误伤同名玩家」，建议补 @服务器。
 */
export function nameSpread(listings, name) {
  if (!name) return { worlds: [], count: 0 };
  const lower = name.toLowerCase();
  const set = new Set();
  for (const l of listings || []) {
    if (!l || !l.name) continue;
    if (String(l.name).toLowerCase().includes(lower)) set.add(l.world || '未知');
  }
  return { worlds: [...set], count: set.size };
}
