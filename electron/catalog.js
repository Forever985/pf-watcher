'use strict';

// ── 国服大区与服务器 ───────────────────────────────────
// 顺序按客户端登录界面（陆行鸟 → 莫古力 → 猫小胖 → 豆豆柴），
// 大区内服务器顺序也按客户端列表，用于「按游戏习惯」排序。
const DATACENTERS = [
  {
    name: '陆行鸟',
    alias: ['一区', '鸟区', '咕哎'],
    worlds: ['拉诺西亚', '幻影群岛', '神意之地', '红玉海', '萌芽池', '宇宙和音', '沃仙曦染', '晨曦王座'],
  },
  {
    name: '莫古力',
    alias: ['二区', '猪区', '库啵'],
    worlds: ['白银乡', '白金幻象', '神拳痕', '潮风亭', '拂晓之间', '旅人栈桥', '龙巢神殿', '梦羽宝境'],
  },
  {
    name: '猫小胖',
    alias: ['三区', '猫区', '三花'],
    worlds: ['紫水栈桥', '延夏', '静语庄园', '摩杜纳', '海猫茶屋', '柔风海湾', '琥珀原'],
  },
  {
    name: '豆豆柴',
    alias: ['四区', '狗区'],
    worlds: ['水晶塔', '银泪湖', '太阳海岸', '伊修加德', '红茶川'],
  },
];

// 繁体 / 异体 → 简体规范名（数据源里会混入繁体、旧称与国际服污染）
const WORLD_ALIASES = {
  陸行鳥: '陆行鸟',
  紅玉海: '红玉海',
  靜語莊園: '静语庄园',
  紫水橋: '紫水栈桥',
  紫水橋樑: '紫水栈桥',
  紫水桥: '紫水栈桥',
  夢羽寶境: '梦羽宝境',
  夢羽寶鏡: '梦羽宝境',
  龍巢神殿: '龙巢神殿',
  拂曉之間: '拂晓之间',
  旅人棧橋: '旅人栈桥',
  神拳痕: '神拳痕',
  白銀鄉: '白银乡',
  白金幻象: '白金幻象',
  潮風亭: '潮风亭',
  太陽海岸: '太阳海岸',
  銀淚湖: '银泪湖',
  紅茶川: '红茶川',
  伊修加德: '伊修加德',
  水晶塔: '水晶塔',
  延夏: '延夏',
  摩杜納: '摩杜纳',
  海貓茶屋: '海猫茶屋',
  柔風海灣: '柔风海湾',
  琥珀原: '琥珀原',
  宇宙和音: '宇宙和音',
  沃仙曦染: '沃仙曦染',
  晨曦王座: '晨曦王座',
  萌芽池: '萌芽池',
  神意之地: '神意之地',
  幻影群島: '幻影群岛',
  拉諾西亞: '拉诺西亚',
  // 国际服风格名（数据源偶发污染，单独归到「其他」）
  巴哈姆特: '巴哈姆特',
  泰坦: '泰坦',
  伊弗利特: '伊弗利特',
  迦樓羅: '迦楼罗',
  迦楼罗: '迦楼罗',
  利維坦: '利维坦',
  利维坦: '利维坦',
  奧汀: '奥汀',
  奥汀: '奥汀',
  鳳凰: '凤凰',
  凤凰: '凤凰',
  芬里尔: '芬里尔',
};

const WORLD_TO_DC = {};
const WORLD_INDEX = {}; // world -> { dc, dcOrder, order }
const DC_ORDER = {};
DATACENTERS.forEach((dc, di) => {
  DC_ORDER[dc.name] = di;
  dc.worlds.forEach((w, wi) => {
    WORLD_TO_DC[w] = dc.name;
    WORLD_INDEX[w] = { dc: dc.name, dcOrder: di, order: wi };
  });
});

const DC_ALIAS = {};
for (const dc of DATACENTERS) for (const a of dc.alias || []) DC_ALIAS[a] = dc.name;

function normalizeWorld(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  return WORLD_ALIASES[s] || s;
}

function dcOfWorld(raw) {
  const w = normalizeWorld(raw);
  return WORLD_TO_DC[w] || '其他';
}

/** 大区名归一（支持「一区/鸟区」这类俗称）；不是大区则返回空 */
function normalizeDc(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (DC_ORDER[s] !== undefined) return s;
  return DC_ALIAS[s] || '';
}

/** 「大区 · 服务器」统一写法，任何地方都不要只显示服务器名 */
function worldLabel(raw) {
  const w = normalizeWorld(raw);
  if (!w) return '';
  const dc = dcOfWorld(w);
  return dc === '其他' ? w : `${dc} · ${w}`;
}

// ── 招募模块 ────────────────────────────────────────────
// 顺序与客户端招募板「任务类型」下拉一致（无 → 随机任务 → 迷宫挑战 → …），
// group 只用于视觉分组标题，组内顺序仍是游戏顺序。
const CATEGORIES = [
  { id: 'None', label: '自由招募', menu: '无（自由填写）', group: '综合', order: 1 },
  { id: 'DutyRoulette', label: '随机任务', group: '任务', order: 10 },
  { id: 'Dungeons', label: '迷宫挑战', group: '任务', order: 11 },
  { id: 'Guildhests', label: '行会令', group: '任务', order: 12 },
  { id: 'Trials', label: '讨伐歼灭战', group: '战斗', order: 20 },
  { id: 'Raids', label: '大型任务', group: '战斗', order: 21 },
  { id: 'HighEndDuty', label: '高难度任务', group: '战斗', order: 22 },
  { id: 'Pvp', label: '玩家对战', group: '战斗', order: 23 },
  { id: 'GoldSaucer', label: '金碟游乐场', group: '休闲', order: 30 },
  { id: 'Fates', label: '危命任务', group: '休闲', order: 31 },
  { id: 'TreasureHunt', label: '寻宝', group: '休闲', order: 32 },
  { id: 'TheHunt', label: '怪物狩猎', group: '休闲', order: 33 },
  { id: 'DeepDungeons', label: '深层迷宫', group: '探索', order: 40 },
  { id: 'V&C Dungeon Finder', label: '特殊迷宫探索', group: '探索', order: 41 },
  { id: 'Criterion', label: '特殊场景探索', group: '探索', order: 42 },
];

const CATEGORY_LABEL = {};
const CATEGORY_ORDER = {};
for (const c of CATEGORIES) {
  CATEGORY_LABEL[c.id] = c.label;
  CATEGORY_ORDER[c.id] = c.order;
}

function categoryOrder(id) {
  return CATEGORY_ORDER[id] === undefined ? 900 : CATEGORY_ORDER[id];
}

module.exports = {
  DATACENTERS,
  DC_ORDER,
  WORLD_ALIASES,
  WORLD_TO_DC,
  WORLD_INDEX,
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  categoryOrder,
  normalizeWorld,
  normalizeDc,
  dcOfWorld,
  worldLabel,
};
