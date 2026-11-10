export function cls(...args) {
  return args.filter(Boolean).join(' ');
}

export function timeAgo(ts) {
  if (!ts) return '—';
  const d = Date.now() - ts;
  if (d < 0) return '刚刚';
  const s = Math.floor(d / 1000);
  if (s < 10) return '刚刚';
  if (s < 60) return s + ' 秒前';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const day = Math.floor(h / 24);
  if (day < 30) return day + ' 天前';
  return new Date(ts).toLocaleDateString('zh-CN');
}

export function clock(ts) {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export function hhmm(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes()].map((n) => String(n).padStart(2, '0')).join(':');
}

export function dayKey(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yst = new Date(Date.now() - 86400000);
  const same = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return '今天';
  if (same(d, yst)) return '昨天';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** time_left 单位为小时 */
export function remainText(h) {
  if (h == null || isNaN(h)) return '—';
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' 分钟';
  if (h < 24) return h.toFixed(1) + ' 小时';
  const d = Math.floor(h / 24);
  const rh = Math.floor(h % 24);
  return rh > 0 ? `${d} 天 ${rh} 小时` : `${d} 天`;
}

export function remainTone(h) {
  if (h == null || isNaN(h)) return '';
  if (h < 1) return 'bad';
  if (h < 3) return 'warn';
  return '';
}

export function pct(filled, avail) {
  if (!avail) return 0;
  return Math.min(100, Math.round((filled / avail) * 100));
}

export function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** ISO 时间转本地时间显示 */
export function localTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
