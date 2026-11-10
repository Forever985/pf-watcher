// 搜索台用的纯函数：并行关键字匹配、按游戏习惯排序、大区/服务器索引。

/** 归一化：全半角、大小写、不可见字符 */
export function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '')
    .toLowerCase();
}

/** 一条招募的可搜索文本（含大区名，方便直接搜「陆行鸟」） */
export function haystack(l) {
  return norm([l.name, l.description, l.duty, l.category_label, l.world, l.dc].filter(Boolean).join(' \n '));
}

/** 单个搜索词命中：支持 /正则/ 写法 */
export function termHit(text, term) {
  const t = String(term || '').trim();
  if (!t) return false;
  if (t.startsWith('/') && t.lastIndexOf('/') > 1) {
    const end = t.lastIndexOf('/');
    try {
      return new RegExp(t.slice(1, end), t.slice(end + 1) || 'i').test(text);
    } catch (_) {
      return text.includes(norm(t));
    }
  }
  return text.includes(norm(t));
}

/** 多词并行：返回该条命中的词（any）或是否全部命中（all） */
export function matchTerms(l, terms, mode) {
  const text = haystack(l);
  const hits = [];
  for (const t of terms) if (termHit(text, t)) hits.push(t);
  if (!terms.length) return { ok: true, hits: [] };
  return { ok: mode === 'all' ? hits.length === terms.length : hits.length > 0, hits };
}

export function freeSlots(l) {
  return Math.max(0, (l.slots_available || 0) - (l.slots_filled || 0));
}

function ts(l) {
  const t = Date.parse(l.updated_at || '');
  return isNaN(t) ? 0 : t;
}

/** 大区/服务器在客户端里的顺序 */
export function buildOrder(catalog) {
  const worldIdx = {};
  const dcIdx = {};
  ((catalog && catalog.datacenters) || []).forEach((dc, i) => {
    dcIdx[dc.name] = i;
    dc.worlds.forEach((w, j) => {
      worldIdx[w] = { dc: dc.name, dcOrder: i, order: j };
    });
  });
  const catIdx = {};
  ((catalog && catalog.categories) || []).forEach((c, i) => {
    catIdx[c.id] = c.order == null ? i : c.order;
  });
  return { worldIdx, dcIdx, catIdx };
}

export const SORTS = [
  { value: 'time', label: '最新更新', desc: '刚刷新过的排前面' },
  { value: 'remain', label: '剩余时间', desc: '快结束的排前面' },
  { value: 'slots', label: '缺人最多', desc: '空位多的排前面' },
  { value: 'place', label: '大区顺序', desc: '陆行鸟 → 豆豆柴，服内按客户端顺序' },
  { value: 'category', label: '模块顺序', desc: '按游戏内任务类型顺序' },
  { value: 'hit', label: '命中优先', desc: '命中监听条件的排前面' },
];

export function sortListings(arr, sort, order) {
  const out = arr.slice();
  const w = (l) => order.worldIdx[l.world] || { dcOrder: 99, order: 99 };
  const c = (l) => {
    const v = order.catIdx[l.category];
    return v == null ? 900 : v;
  };
  switch (sort) {
    case 'remain':
      out.sort((a, b) => (a.time_left == null ? 1e9 : a.time_left) - (b.time_left == null ? 1e9 : b.time_left));
      break;
    case 'slots':
      out.sort((a, b) => freeSlots(b) - freeSlots(a) || ts(b) - ts(a));
      break;
    case 'place':
      out.sort((a, b) => {
        const A = w(a);
        const B = w(b);
        return A.dcOrder - B.dcOrder || A.order - B.order || ts(b) - ts(a);
      });
      break;
    case 'category':
      out.sort((a, b) => c(a) - c(b) || ts(b) - ts(a));
      break;
    case 'hit':
      out.sort((a, b) => (b.__hit ? 1 : 0) - (a.__hit ? 1 : 0) || ts(b) - ts(a));
      break;
    default:
      out.sort((a, b) => ts(b) - ts(a));
  }
  return out;
}
