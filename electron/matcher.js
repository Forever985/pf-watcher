'use strict';

const { normalizeWorld, normalizeDc, dcOfWorld, CATEGORY_LABEL } = require('./catalog');

const ZERO_WIDTH = /[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;

function normText(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') {
    return v
      .split(/[\n,，、;；|]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function fieldOf(listing, scope, cache) {
  if (cache[scope] !== undefined) return cache[scope];
  let v = '';
  if (scope === 'desc') v = normText(listing.description);
  else if (scope === 'duty') v = normText((listing.duty || '') + ' ' + (listing.category_label || ''));
  else if (scope === 'name') v = normText(listing.name);
  else if (scope === 'world') v = normText(listing.world);
  else if (scope === 'all') {
    v = normText(
      [listing.name, listing.description, listing.duty, listing.category_label, listing.world]
        .filter(Boolean)
        .join(' \n ')
    );
  }
  cache[scope] = v;
  return v;
}

function hitKeyword(text, kw) {
  if (!kw) return false;
  if (kw.startsWith('/') && kw.lastIndexOf('/') > 1) {
    const end = kw.lastIndexOf('/');
    try {
      const re = new RegExp(kw.slice(1, end), kw.slice(end + 1) || 'i');
      return re.test(text);
    } catch (_) {
      return false;
    }
  }
  return text.includes(kw.toLowerCase());
}

/** 给一条招募补齐派生字段（服务器规范名、大区、分类中文名） */
function enrich(listing) {
  const world = normalizeWorld(listing.home_world || listing.created_world || '');
  const createdWorld = normalizeWorld(listing.created_world || '');
  return {
    ...listing,
    world,
    created_world_n: createdWorld,
    dc: dcOfWorld(world),
    category_label: CATEGORY_LABEL[listing.category] || listing.category || '自由招募',
  };
}

/**
 * 解析玩家条目。玩家名只在「服务器」内唯一，跨服同名是常态，
 * 所以社区通用写法是 名字@服务器（例如 阿尔菲诺@红玉海）。
 * 也接受 名字@大区 和 名字@一区 这类俗称。
 * 返回 { name, world, dc, raw }
 */
function parsePlayerEntry(raw) {
  const s = String(raw || '').trim();
  if (!s) return { name: '', world: '', dc: '', raw: s };
  const norm = s.normalize('NFKC');
  const at = Math.max(norm.lastIndexOf('@'), norm.lastIndexOf('＠'));
  if (at <= 0 || at === norm.length - 1) return { name: norm.trim(), world: '', dc: '', raw: s };
  const name = norm.slice(0, at).trim();
  const tail = norm.slice(at + 1).trim();
  if (!tail) return { name, world: '', dc: '', raw: s };

  const dc = normalizeDc(tail);
  if (dc) return { name, world: '', dc, raw: s };

  const world = normalizeWorld(tail);
  return { name, world, dc: dcOfWorld(world) === '其他' ? '' : dcOfWorld(world), raw: s };
}

/** 单条玩家规则是否命中（名字 + 可选服务器/大区）。 */
function playerMatches(listing, entry, mode) {
  if (!entry || !entry.name) return false;
  const nameText = normText(listing.name);
  const p = normText(entry.name);
  const nameOk = mode === 'exact' ? nameText === p : nameText.includes(p);
  if (!nameOk) return false;
  if (entry.world) {
    const w = normText(listing.world);
    const cw = normText(listing.created_world_n || '');
    const target = normText(entry.world);
    return w === target || cw === target;
  }
  if (entry.dc) return listing.dc === entry.dc;
  return true;
}

/** 把一条玩家规则说成人话，用于命中理由与设置页展示 */
function playerEntryLabel(entry) {
  if (!entry) return '';
  if (entry.world) return `${entry.name}@${entry.world}`;
  if (entry.dc) return `${entry.name}@${entry.dc}`;
  return entry.name;
}

/**
 * 判断一条招募是否命中监听规则。
 * 返回 { hit, reasons:[], exclude, diag }
 */
function evaluate(listing, rules) {
  const r = rules || {};
  const cache = {};
  const reasons = [];
  const diag = { filters: [], keywords: [] };

  // ① 服务器 / 大区
  const worlds = asArray(r.worlds);
  const dcs = asArray(r.datacenters);
  if (worlds.length || dcs.length) {
    const okWorld = worlds.includes(listing.world);
    const okDc = dcs.includes(listing.dc);
    if (!okWorld && !okDc) return { hit: false, reasons, exclude: '服务器不符', diag };
    diag.filters.push(okWorld ? listing.world : listing.dc);
  }

  // ② 招募模块（分类）
  const cats = asArray(r.categories);
  if (cats.length) {
    if (!cats.includes(listing.category)) return { hit: false, reasons, exclude: '模块不符', diag };
    diag.filters.push(listing.category_label);
  }

  // ③ 玩家黑 / 白名单（招募发起者）
  // 玩家名只在服务器内唯一，条目支持「名字@服务器」精确到服。
  const exact = r.playerMatchMode === 'exact';
  const entryOf = (pat) => parsePlayerEntry(pat);
  const test = (pat) => playerMatches(listing, entryOf(pat), exact);

  const black = asArray(r.playerBlacklist);
  const bad = black.find(test);
  if (bad) {
    const e = entryOf(bad);
    return {
      hit: false,
      reasons,
      exclude: e.world || e.dc ? `玩家黑名单（${playerEntryLabel(e)}）` : `玩家黑名单（${e.name}）`,
      diag,
    };
  }
  const white = asArray(r.playerWhitelist);
  if (r.whitelistOnly && white.length) {
    if (!white.some(test)) return { hit: false, reasons, exclude: '不在玩家白名单', diag };
    diag.filters.push('白名单：' + listing.name);
  } else if (white.length && white.some(test)) {
    diag.filters.push('白名单优先：' + listing.name);
  }

  // ④ 排除词
  const ex = asArray(r.excludeWords);
  if (ex.length) {
    const all = fieldOf(listing, 'all', cache);
    const bad = ex.find((w) => hitKeyword(all, w));
    if (bad) return { hit: false, reasons, exclude: '含排除词「' + bad + '」', diag };
  }

  // ⑤ 人数门槛 / 其他开关
  if (r.onlyCrossWorld && !listing.is_cross_world) return { hit: false, reasons, exclude: '非跨服招募', diag };
  const freeSlots = (listing.slots_available || 0) - (listing.slots_filled || 0);
  if (r.minSlots > 0 && freeSlots < r.minSlots) return { hit: false, reasons, exclude: '空位不足', diag };
  if (r.ignoreAlmostFull) {
    const filled = listing.slots_filled || 0;
    const avail = listing.slots_available || 0;
    if (avail > 0 && filled / avail >= 0.85) return { hit: false, reasons, exclude: '快满员', diag };
  }

  // ⑥ 关键字分组
  const groups = (r.keywordGroups || []).filter((g) => g && g.enabled !== false && asArray(g.keywords).length);
  if (groups.length) {
    const per = groups.map((g) => {
      const scopes = asArray(g.scopes).length ? asArray(g.scopes) : ['desc'];
      const texts = scopes.map((s) => fieldOf(listing, s, cache));
      const kws = asArray(g.keywords);
      const found = kws.filter((kw) => texts.some((t) => hitKeyword(t, kw)));
      const ok = g.mode === 'and' ? found.length === kws.length : found.length > 0;
      return { group: g, ok, found };
    });
    const logic = r.groupLogic === 'or' ? 'or' : 'and';
    const pass = logic === 'and' ? per.every((p) => p.ok) : per.some((p) => p.ok);
    if (!pass) {
      const missing = per.filter((p) => !p.ok).map((p) => p.group.name || '关键字组');
      return { hit: false, reasons, exclude: '关键字未命中：' + missing.join('、'), diag };
    }
    for (const p of per) {
      if (!p.ok) continue;
      reasons.push({ group: p.group.name || '关键字', words: p.found });
      diag.keywords.push(...p.found);
    }
  }

  return { hit: true, reasons, exclude: null, diag };
}

module.exports = {
  evaluate,
  enrich,
  normText,
  asArray,
  fieldOf,
  hitKeyword,
  parsePlayerEntry,
  playerMatches,
  playerEntryLabel,
};
