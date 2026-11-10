import React, { useMemo } from 'react';
import { ListingCard, ListingTable } from '../components/ListingCard.jsx';
import SearchConsole, { DEFAULT_SEARCH } from '../components/SearchConsole.jsx';
import { useLocalState } from '../lib/useLocalState.js';
import { buildOrder, matchTerms, sortListings, SORTS } from '../lib/search.js';
import { clock } from '../lib/format.js';

export default function LiveView({
  listings,
  hitsById,
  freshIds,
  onOpen,
  config,
  catalog,
  patch,
  onToast,
  status,
}) {
  const [rawSearch, setSearch] = useLocalState('pf.search.v3', DEFAULT_SEARCH);

  const search = {
    ...DEFAULT_SEARCH,
    ...rawSearch,
    filters: { ...DEFAULT_SEARCH.filters, ...((rawSearch && rawSearch.filters) || {}) },
  };
  const f = search.filters;

  // 输入框里的草稿也算一个并行搜索词：边打边出结果，回车则固化成 chip
  const terms = useMemo(() => {
    const arr = [...(search.terms || [])];
    const d = String(search.draft || '').trim();
    if (d && !arr.some((t) => t.text.toLowerCase() === d.toLowerCase())) arr.push({ id: '__draft', text: d });
    return arr;
  }, [search.terms, search.draft]);

  const texts = useMemo(() => terms.map((t) => t.text), [terms]);
  const key = texts.join('\u0000');
  const mode = search.mode || 'any';
  const order = useMemo(() => buildOrder(catalog), [catalog]);

  // 每个词各自命中多少条（并行搜索的关键信息）
  const counts = useMemo(() => {
    const m = {};
    for (const t of texts) m[t] = 0;
    if (!texts.length) return m;
    for (const l of listings) {
      const r = matchTerms(l, texts, mode);
      if (!r.ok) continue;
      for (const h of r.hits) m[h] = (m[h] || 0) + 1;
    }
    return m;
  }, [listings, key, mode]);

  const rows = useMemo(() => {
    const out = [];
    for (const l of listings) {
      if (f.dc && (l.dc || '其他') !== f.dc) continue;
      if (f.world && l.world !== f.world) continue;
      if (f.category && l.category !== f.category) continue;
      if (f.onlyHit && !hitsById[l.id]) continue;
      const r = matchTerms(l, texts, mode);
      if (!r.ok) continue;
      out.push({ ...l, __hits: r.hits, __hit: !!hitsById[l.id] });
    }
    return sortListings(out, f.sort, order);
  }, [listings, f.dc, f.world, f.category, f.onlyHit, key, mode, f.sort, hitsById, order]);

  const isTable = config.ui.layout === 'table';
  const sortLabel = (SORTS.find((s) => s.value === f.sort) || SORTS[0]).label;
  const hasFilter = !!(f.dc || f.world || f.category || f.onlyHit || texts.length);
  const [onlyDc, onlyWorld] = [f.dc, f.world];

  return (
    <>
      <SearchConsole
        search={search}
        setSearch={setSearch}
        catalog={catalog}
        listings={listings}
        counts={counts}
        stats={{ total: listings.length, shown: rows.length }}
        onToast={onToast}
        patch={patch}
        config={config}
      />

      <div className="list-head">
        <span className="list-title">在招</span>
        <span className="list-count">{rows.length}</span>
        <span className="list-meta">{sortLabel}</span>
        <span className="list-meta">
          {onlyDc || onlyWorld ? [onlyDc, onlyWorld].filter(Boolean).join(' · ') : '全部大区'}
        </span>
        <span className="list-meta push">上次更新 {status && status.lastOk ? clock(status.lastOk) : '—'}</span>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="big">🪧</div>
          <b>{listings.length === 0 ? '还没有拿到招募数据' : '这个条件下没有在招的招募'}</b>
          <span>
            {listings.length === 0
              ? '首次拉取需要几秒；如果一直为空，看看右上角有没有连接异常。'
              : hasFilter
              ? '试着删掉几个搜索词、放宽筛选，或点「置零」回到全部招募。'
              : '等下一轮刷新，新招募会自动出现在这里。'}
          </span>
        </div>
      ) : isTable ? (
        <ListingTable items={rows} hitsById={hitsById} freshIds={freshIds} onOpen={onOpen} />
      ) : (
        <div className="grid">
          {rows.map((l) => {
            const h = hitsById[l.id];
            return (
              <ListingCard
                key={l.id}
                item={l}
                hit={!!h}
                matched={h ? h.matched : null}
                termHits={l.__hits}
                fresh={freshIds.has(l.id)}
                onClick={() => onOpen(l)}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
