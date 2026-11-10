import React, { useMemo } from 'react';
import { Chip } from '../components/ui.jsx';
import { Place } from '../components/ListingCard.jsx';
import { cls, dayKey, hhmm, remainText } from '../lib/format.js';

export function ruleSummary(rules, catalog) {
  const r = rules || {};
  const out = [];
  const groups = (r.keywordGroups || []).filter((g) => g.enabled !== false && (g.keywords || []).length);
  if (groups.length) {
    out.push({
      k: '关键字',
      v: groups.map((g) => (g.keywords || []).join(g.mode === 'and' ? ' + ' : ' / ')).join(' | '),
      tone: 'accent',
    });
  }
  if ((r.datacenters || []).length) out.push({ k: '大区', v: r.datacenters.join('、') });
  if ((r.worlds || []).length) out.push({ k: '服务器', v: r.worlds.join('、') });
  if ((r.categories || []).length) {
    const map = {};
    (catalog || []).forEach((c) => (map[c.id] = c.label));
    out.push({ k: '模块', v: r.categories.map((c) => map[c] || c).join('、') });
  }
  if ((r.playerWhitelist || []).length && r.whitelistOnly)
    out.push({ k: '白名单', v: r.playerWhitelist.join('、'), tone: 'ok' });
  if ((r.playerBlacklist || []).length) out.push({ k: '黑名单', v: r.playerBlacklist.join('、'), tone: 'bad' });
  if ((r.excludeWords || []).length) out.push({ k: '排除词', v: r.excludeWords.join('、'), tone: 'warn' });
  return out;
}

export default function HitsView({ hits, config, catalog, onOpen, onGoSettings, onClear }) {
  const summary = useMemo(() => ruleSummary(config.rules, catalog), [config.rules, catalog]);

  const grouped = useMemo(() => {
    const m = new Map();
    for (const h of hits) {
      const k = dayKey(h.at);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(h);
    }
    return [...m.entries()];
  }, [hits]);

  return (
    <div style={{ maxWidth: 1000 }}>
      <div className="panel section" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px' }}>
          <div style={{ flex: 1 }}>
            <div className="section-title">当前监听条件</div>
            <div className="section-desc">只有同时满足下面全部条件的招募才会提醒你</div>
          </div>
          <button className="btn sm" onClick={onGoSettings}>
            修改规则
          </button>
        </div>
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {summary.length === 0 ? (
            <div className="banner" style={{ margin: 0 }}>
              还没有设置任何条件，此时不会产生提醒。先去「设置 · 监听规则」里加一组关键字或选服务器。
              <button className="btn sm primary" onClick={onGoSettings}>
                去设置
              </button>
            </div>
          ) : (
            summary.map((s) => (
              <div key={s.k} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span className="hint" style={{ width: 48, flex: '0 0 48px' }}>
                  {s.k}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', wordBreak: 'break-word' }}>{s.v}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="section-head">
        <span className="section-title">命中记录</span>
        <span className="chip">{hits.length} 条</span>
        <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={onClear} disabled={!hits.length}>
          清空记录
        </button>
      </div>

      {hits.length === 0 ? (
        <div className="empty">
          <div className="big">🔔</div>
          <b>还没有命中过</b>
          <span>
            条件写得越准，提醒越少但越有用。建议先用「寻宝」这类模块 + 一个关键字试一次，
            命中的招募会在这里留档，随时能翻回去看。
          </span>
        </div>
      ) : (
        grouped.map(([day, list]) => (
          <div key={day}>
            <div className="day-sep">{day}</div>
            {list.map((h) => {
              const l = h.listing || {};
              return (
                <div
                  key={h.id + '-' + h.at}
                  className={cls('hit-item', h.baseline && 'is-baseline')}
                  onClick={() => onOpen(l)}
                >
                  <div className="hit-time">{hhmm(h.at)}</div>
                  <div className="hit-body">
                    <div className="hit-title">
                      <b style={{ fontSize: 13 }}>{l.name}</b>
                      <Place dc={l.dc} world={l.world} compact />
                      <span className="chip">{l.category_label}</span>
                      <span className="hint">剩余 {remainText(l.time_left)}</span>
                      {h.baseline && <span className="chip">启动时已存在</span>}
                    </div>
                    <div className="hit-desc">{l.description}</div>
                    {(h.reasons || []).length > 0 && (
                      <div className="reason-line">
                        {(h.reasons || []).map((r, i) => {
                          const words = (r.words || []).join('、');
                          const g = r.group || '';
                          const text = g && g !== words && !(r.words || []).includes(g) ? `${g}：${words}` : words;
                          return (
                            <Chip key={i} tone="accent">
                              {text || '命中'}
                            </Chip>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
