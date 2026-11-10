import React from 'react';
import { ChipInput, PillGroup, Switch, Field } from './ui.jsx';
import { cls } from '../lib/format.js';
import { parsePlayerEntry, playerEntryView, nameSpread } from '../lib/players.js';

const SCOPES = [
  { value: 'desc', label: '招募内容' },
  { value: 'duty', label: '任务/模块' },
  { value: 'name', label: '玩家名' },
  { value: 'all', label: '全字段' },
];

let uid = 0;
const newId = () => 'g' + Date.now().toString(36) + (uid++).toString(36);

export function KeywordGroupsEditor({ groups = [], onChange, groupLogic, onGroupLogic }) {
  const update = (id, patch) => onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  return (
    <>
      <div className="setting-row">
        <div className="label">
          <b>组间逻辑</b>
          <span>多个关键字组之间的关系。「且」= 每一组都要命中；「或」= 任一组命中即可。</span>
        </div>
        <div className="ctl">
          <PillGroup
            value={groupLogic}
            onChange={onGroupLogic}
            options={[
              { value: 'and', label: '且（全部组）' },
              { value: 'or', label: '或（任一组）' },
            ]}
          />
        </div>
      </div>

      <div className="pad">
        {groups.length === 0 && (
          <div className="hint" style={{ padding: '4px 0 12px' }}>
            还没有关键字组。新建一组后，只有内容命中的招募才会提醒你。
          </div>
        )}

        {groups.map((g, i) => {
          const scopes = g.scopes && g.scopes.length ? g.scopes : ['desc'];
          return (
            <div className={cls('kg', g.enabled === false && 'off')} key={g.id}>
              <div className="kg-head">
                <Switch checked={g.enabled !== false} onChange={(v) => update(g.id, { enabled: v })} />
                <Field
                  className="kg-name"
                  value={g.name || ''}
                  placeholder={'关键字组 ' + (i + 1)}
                  onChange={(v) => update(g.id, { name: v })}
                  title="点一下就能改名字"
                  clearAlways={false}
                />
                <span className="kg-count">{(g.keywords || []).length} 词</span>
                <button
                  className="btn sm danger kg-del"
                  title="删除该组"
                  onClick={() => onChange(groups.filter((x) => x.id !== g.id))}
                >
                  删除
                </button>
              </div>
              <div className="kg-sub">
                <span className="kg-tip">匹配范围</span>
                <div className="kg-scopes">
                  {SCOPES.map((s) => {
                    const on = scopes.includes(s.value);
                    return (
                      <button
                        key={s.value}
                        type="button"
                        className={cls('mini-tab', on && 'on')}
                        onClick={() => {
                          let next = on ? scopes.filter((x) => x !== s.value) : [...scopes, s.value];
                          if (!next.length) next = ['desc'];
                          update(g.id, { scopes: next });
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <span className="kg-spacer" />
                <span className="kg-tip">组内</span>
                <PillGroup
                  size="sm"
                  value={g.mode || 'or'}
                  onChange={(v) => update(g.id, { mode: v })}
                  options={[
                    { value: 'or', label: '任一' },
                    { value: 'and', label: '全部' },
                  ]}
                />
              </div>
              <ChipInput
                value={g.keywords || []}
                onChange={(v) => update(g.id, { keywords: v })}
                placeholder={
                  scopes.includes('desc') ? '例如：零式、绝龙诗、开荒、缺T…（回车添加）' : '输入关键字后回车'
                }
              />
            </div>
          );
        })}

        <button
          className="btn"
          onClick={() =>
            onChange([
              ...groups,
              {
                id: newId(),
                name: '关键字组 ' + (groups.length + 1),
                enabled: true,
                mode: 'or',
                scopes: ['desc'],
                keywords: [],
              },
            ])
          }
        >
          ＋ 新建关键字组
        </button>
        <div className="hint" style={{ marginTop: 9 }}>
          关键字支持正则，写成 <span className="mono">/零式|绝境/</span> 即可。匹配不区分大小写，并自动忽略全半角差异。
          主界面搜索台里的「→ 监听条件」也能直接把搜索词变成一组规则。
        </div>
      </div>
    </>
  );
}

export function WorldPicker({ datacenters = [], worlds = [], dcs = [], onChange }) {
  const toggleWorld = (w) => {
    const has = worlds.includes(w);
    onChange({ worlds: has ? worlds.filter((x) => x !== w) : [...worlds, w], datacenters: dcs });
  };

  const toggleDc = (name) => {
    const has = dcs.includes(name);
    onChange({ datacenters: has ? dcs.filter((x) => x !== name) : [...dcs, name], worlds });
  };

  const dcState = (dc) => {
    if (dcs.includes(dc.name)) return 'all';
    const any = dc.worlds.some((w) => worlds.includes(w));
    return any ? 'some' : 'none';
  };

  const all = !worlds.length && !dcs.length;
  const dcOf = (w) => (datacenters.find((d) => d.worlds.includes(w)) || {}).name || '';

  return (
    <>
      <div className="wp-head">
        <span className={cls('chip', all ? 'accent' : '')}>{all ? '全部服务器（不限）' : `已选 ${dcs.length} 个大区 · ${worlds.length} 个服务器`}</span>
        <button className="btn sm ghost" onClick={() => onChange({ worlds: [], datacenters: [] })}>
          清空（不限）
        </button>
        <span className="hint push">同一大区内自动跨服，建议直接勾大区</span>
      </div>

      {!all && (
        <div className="wp-selected">
          {dcs.map((d) => (
            <span className="chip accent act" key={'dc' + d} onClick={() => toggleDc(d)} title="点一下取消整个大区">
              {d} <span className="x">×</span>
            </span>
          ))}
          {worlds.map((w) => (
            <span className="chip accent act" key={'w' + w} onClick={() => toggleWorld(w)} title="点一下取消这个服务器">
              {dcOf(w) ? dcOf(w) + ' · ' + w : w} <span className="x">×</span>
            </span>
          ))}
        </div>
      )}

      <div className="world-grid">
        {datacenters.map((dc) => {
          const st = dcState(dc);
          return (
            <div className="dc-box" key={dc.name}>
              <div className="dc-head">
                <button
                  className={cls('cbx', st === 'all' && 'on')}
                  onClick={() => toggleDc(dc.name)}
                  title="整个大区"
                  style={st === 'some' ? { borderColor: 'var(--accent)' } : undefined}
                >
                  {st === 'all' ? '✓' : st === 'some' ? '–' : ''}
                </button>
                <span className="dc-name">{dc.name}</span>
                <span className="dc-hint">{dc.worlds.length} 服</span>
              </div>
              <div className="dc-worlds">
                {dc.worlds.map((w) => (
                  <button
                    key={w}
                    className={cls('wchip', (dcs.includes(dc.name) || worlds.includes(w)) && 'on')}
                    onClick={() => toggleWorld(w)}
                    title={`${dc.name} · ${w}`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function PlayerListEditor({ rules, onChange, catalog, listings }) {
  const parse = (v) => parsePlayerEntry(v, catalog);
  const black = rules.playerBlacklist || [];
  const white = rules.playerWhitelist || [];
  const bare = [...black, ...white].map(parse).filter((e) => !e.world && !e.dc && e.name);

  const renderChip = (raw) => {
    const e = parse(raw);
    const view = playerEntryView(e);
    const spread = view.kind === 'all' ? nameSpread(listings, e.name) : { count: 0, worlds: [] };
    return (
      <span className="pl-chip">
        <b>{view.name}</b>
        {view.kind !== 'all' && <span className={cls('pl-scope', view.kind)}>{view.scope}</span>}
        {spread.count > 1 && (
          <span
            className="pl-warn"
            title={`当前在招里「${view.name}」出现在 ${spread.count} 个服务器：${spread.worlds.join(
              '、'
            )}。只写名字会把这些同名玩家一起算进来，建议写成 ${view.name}@${spread.worlds[0]}`}
          >
            ⚠ {spread.count} 服同名
          </span>
        )}
      </span>
    );
  };

  return (
    <>
      <div className="note">
        <div className="note-title">名字要带服务器，才分得清谁是谁</div>
        <div className="note-text">
          角色名只在<b>服务器</b>内唯一，不同服完全可以重名，所以玩家之间约定用
          <span className="mono">名字@服务器</span> 来指代具体某个号（比如
          <span className="mono">阿尔菲诺@红玉海</span>）。这里支持三种写法：
          <span className="mono">名字@服务器</span> 精确到服、
          <span className="mono">名字@陆行鸟</span> 整区生效、
          <span className="mono">名字</span> 所有服务器同名都算。
        </div>
      </div>

      <div className="setting-row">
        <div className="label">
          <b>名字匹配方式</b>
          <span>精确 = 名字完全一致；模糊 = 包含即可（更容易误伤，慎用）</span>
        </div>
        <div className="ctl">
          <PillGroup
            value={rules.playerMatchMode || 'contains'}
            onChange={(v) => onChange({ playerMatchMode: v })}
            options={[
              { value: 'contains', label: '模糊包含' },
              { value: 'exact', label: '精确' },
            ]}
          />
        </div>
      </div>

      <div className="setting-row stack">
        <div className="label">
          <b>黑名单</b>
          <span>这些玩家发的招募一律不提醒（也不进命中记录）。推荐写成 名字@服务器。</span>
        </div>
        <ChipInput
          value={black}
          onChange={(v) => onChange({ playerBlacklist: v })}
          placeholder="名字@服务器 回车添加，如 妮柯柯@萌芽池"
          renderChip={renderChip}
        />
      </div>

      <div className="setting-row stack">
        <div className="label">
          <b>白名单</b>
          <span>只想盯特定玩家的招募时，把名字加进来并打开下面的开关</span>
        </div>
        <ChipInput
          value={white}
          onChange={(v) => onChange({ playerWhitelist: v })}
          placeholder="名字@服务器 回车添加，如 阿尔菲诺@红玉海"
          renderChip={renderChip}
        />
      </div>

      <div className="setting-row">
        <div className="label">
          <b>只提醒白名单玩家</b>
          <span>开启后，白名单非空时忽略其他所有玩家</span>
        </div>
        <div className="ctl">
          <Switch checked={!!rules.whitelistOnly} onChange={(v) => onChange({ whitelistOnly: v })} />
        </div>
      </div>

      {bare.length > 0 && (
        <div className="setting-row stack">
          <div className="label">
            <b>有 {bare.length} 条只写了名字</b>
            <span>没带 @服务器，会对所有服务器生效。如果只是想拦某一个人，建议补上 @服务器。</span>
          </div>
          <div className="wp-selected">
            {bare.slice(0, 12).map((e) => {
              const s = nameSpread(listings, e.name);
              return (
                <span className={cls('chip', s.count > 1 ? 'warn' : '')} key={e.raw}>
                  {e.name}
                  <i className="pl-note">{s.count > 1 ? `${s.count} 服同名` : '全服'}</i>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export function CategoryPicker({ catalog, selected = [], onChange }) {
  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  const groups = [];
  for (const c of catalog) {
    const g = c.group || '其他';
    let box = groups.find((x) => x.name === g);
    if (!box) groups.push((box = { name: g, list: [] }));
    box.list.push(c);
  }
  return (
    <>
      <div className="wp-head">
        <span className={cls('chip', !selected.length ? 'accent' : '')}>
          {!selected.length ? '全部模块' : `已选 ${selected.length} 个模块`}
        </span>
        <button className="btn sm ghost" onClick={() => onChange([])}>
          清空（全部）
        </button>
        <button className="btn sm ghost" onClick={() => onChange(catalog.map((c) => c.id))}>
          全选
        </button>
      </div>
      {groups.map((g) => (
        <div className="cat-row" key={g.name}>
          <span className="cat-group">{g.name}</span>
          <div className="cat-grid">
            {g.list.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cls('wchip', selected.includes(c.id) && 'on')}
                onClick={() => toggle(c.id)}
                title={c.menu || c.label}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="hint" style={{ marginTop: 8 }}>
        顺序与游戏内招募板的「任务类型」一致；「自由填写」对应游戏里没选类型的招募。
      </div>
    </>
  );
}
