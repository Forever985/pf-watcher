import React from 'react';
import { cls, remainText, remainTone, pct } from '../lib/format.js';

function SlotBar({ filled, avail }) {
  const p = pct(filled, avail);
  return (
    <span className="slots" title={`${filled}/${avail}`}>
      <span style={{ display: 'inline-block', width: 28, height: 4, borderRadius: 2, background: 'var(--panel-3)', overflow: 'hidden' }}>
        <span style={{ display: 'block', width: p + '%', height: '100%', background: 'var(--accent)' }} />
      </span>
      <b>{filled}</b>/{avail}
    </span>
  );
}

/** 大区 + 服务器：任何时候都一起出现，省得自己换算 */
export function Place({ dc, world, compact }) {
  return (
    <span className={cls('place', compact && 'compact')} title={dc && dc !== '其他' ? `${dc} · ${world}` : world}>
      {dc && dc !== '其他' && <i>{dc}</i>}
      <b>{world}</b>
    </span>
  );
}

export function ListingCard({ item, hit, matched, termHits, fresh, onClick }) {
  const rest = item.time_left;
  return (
    <article className={cls('listing', hit && 'hit', fresh && 'fresh')} onClick={onClick}>
      <div className="l-top">
        <span className="l-name" title={item.name}>
          {item.name || '（未命名）'}
        </span>
        <Place dc={item.dc} world={item.world} />
        {item.is_cross_world && <span className="tag-soft">跨服</span>}
        <span className="l-cat">{item.category_label}</span>
      </div>

      <div className="l-desc">{item.description || '（无描述）'}</div>

      {termHits && termHits.length > 0 && (
        <div className="l-terms">
          {termHits.slice(0, 4).map((t) => (
            <span className="match-term" key={t} title={`搜索词「${t}」命中`}>
              {t}
            </span>
          ))}
          {termHits.length > 4 && <span className="match-more">+{termHits.length - 4}</span>}
        </div>
      )}

      <div className="l-bottom">
        <SlotBar filled={item.slots_filled || 0} avail={item.slots_available || 0} />
        <i className="dot" />
        <span className={cls(remainTone(rest))}>剩余 {remainText(rest)}</span>
        {item.duty && item.duty !== '无' && (
          <>
            <i className="dot" />
            <span className="l-duty" title={item.duty}>
              {item.duty}
            </span>
          </>
        )}
        {hit && matched && matched.length > 0 && (
          <span className="chip accent" style={{ marginLeft: 'auto' }} title={'规则命中：' + matched.join('、')}>
            规则命中 {matched.slice(0, 2).join('·')}
            {matched.length > 2 ? '…' : ''}
          </span>
        )}
      </div>
    </article>
  );
}

export function ListingTable({ items, hitsById, freshIds, onOpen }) {
  return (
    <div className="table-wrap">
      <div className="table-head">
        <div>玩家</div>
        <div>招募内容</div>
        <div>服务器 / 大区</div>
        <div>模块</div>
        <div>人数</div>
        <div>剩余</div>
      </div>
      {items.map((item) => {
        const h = hitsById[item.id];
        return (
          <div
            key={item.id}
            className={cls('table-row', h && 'hit', freshIds && freshIds.has(item.id) && 'fresh')}
            onClick={() => onOpen(item)}
            title={item.description}
          >
            <div className="ell" style={{ fontWeight: 600 }}>
              {item.name}
            </div>
            <div className="ell dim">{item.description}</div>
            <div className="stack">
              <span className="ell">{item.world}</span>
              {item.dc && item.dc !== '其他' && <span className="stack-sub">{item.dc}</span>}
            </div>
            <div className="ell dim">{item.category_label}</div>
            <div className="dim num">
              {item.slots_filled}/{item.slots_available}
            </div>
            <div className={cls('dim num', remainTone(item.time_left))}>{remainText(item.time_left)}</div>
          </div>
        );
      })}
    </div>
  );
}
