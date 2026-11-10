import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown, Field, ChipInput, Modal, Checkbox, PillGroup } from './ui.jsx';
import { SORTS } from '../lib/search.js';
import { cls } from '../lib/format.js';

const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const DEFAULT_SEARCH = {
  terms: [],
  tags: [],
  draft: '',
  mode: 'any',
  filters: { dc: '', world: '', category: '', sort: 'time', onlyHit: false },
};

const union = (a, b) => {
  const out = Array.isArray(a) ? a.slice() : [];
  for (const x of b || []) if (x && !out.includes(x)) out.push(x);
  return out;
};

const SCOPES = [
  { value: 'all', label: '全字段' },
  { value: 'desc', label: '招募内容' },
  { value: 'duty', label: '任务/模块' },
  { value: 'name', label: '玩家名' },
];

export default function SearchConsole({ search, setSearch, catalog, listings, counts, stats, onToast, patch, config }) {
  const [tagModal, setTagModal] = useState(null);
  const [ruleModal, setRuleModal] = useState(null);
  const rootRef = useRef(null);

  // 搜索台是吸顶的，把自身高度写进 CSS 变量，表格表头才能正好贴在它下面
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const apply = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--search-h', h + 'px');
    };
    apply();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(apply);
      ro.observe(el);
    }
    return () => ro && ro.disconnect();
  }, []);

  const terms = search.terms || [];
  const tags = search.tags || [];
  const draft = search.draft || '';
  const f = { ...DEFAULT_SEARCH.filters, ...(search.filters || {}) };
  const activeTexts = useMemo(
    () => terms.map((t) => t.text).filter(Boolean),
    [terms]
  );

  const set = (p) => setSearch((s) => ({ ...s, ...p }));
  const setF = (p) => setSearch((s) => ({ ...s, filters: { ...(s.filters || {}), ...p } }));

  // ── 计数（用于下拉里的分布，帮你判断值不值得点） ──
  const dcCount = useMemo(() => {
    const m = {};
    for (const l of listings) m[l.dc || '其他'] = (m[l.dc || '其他'] || 0) + 1;
    return m;
  }, [listings]);

  const worldCount = useMemo(() => {
    const m = {};
    for (const l of listings) if (l.world) m[l.world] = (m[l.world] || 0) + 1;
    return m;
  }, [listings]);

  const catCount = useMemo(() => {
    const m = {};
    for (const l of listings) m[l.category] = (m[l.category] || 0) + 1;
    return m;
  }, [listings]);

  // ── 大区下拉 ──
  const dcOptions = useMemo(() => {
    const out = [{ value: '', label: '全部大区' }, { sep: true }];
    for (const dc of catalog.datacenters) {
      out.push({ value: dc.name, label: dc.name, count: dcCount[dc.name] || 0 });
    }
    if (dcCount['其他']) out.push({ value: '其他', label: '其他（未识别服务器）', count: dcCount['其他'] });
    return out;
  }, [catalog, dcCount]);

  // ── 服务器下拉：按大区分组，子项缩进，右侧标注所属大区 ──
  const worldOptions = useMemo(() => {
    const out = [{ value: '', label: '全部服务器' }, { sep: true }];
    for (const dc of catalog.datacenters) {
      if (f.dc && f.dc !== dc.name) continue; // 选了大区就只显示该大区下的服
      const list = dc.worlds;
      out.push({ group: dc.name, hint: `${list.length} 服` });
      for (const w of list) {
        out.push({ value: w, label: w, sub: dc.name, indent: true, count: worldCount[w] || 0 });
      }
    }
    return out;
  }, [catalog, f.dc, worldCount]);

  // ── 模块下拉：按游戏内任务类型顺序分组 ──
  const catOptions = useMemo(() => {
    const out = [{ value: '', label: '全部模块' }, { sep: true }];
    let group = null;
    for (const c of catalog.categories) {
      if (c.group !== group) {
        group = c.group;
        out.push({ group });
      }
      out.push({ value: c.id, label: c.menu || c.label, indent: true, count: catCount[c.id] || 0 });
    }
    return out;
  }, [catalog, catCount]);

  const sortOptions = useMemo(() => {
    const out = [];
    for (const s of SORTS) out.push({ value: s.value, label: s.label, note: s.desc });
    return out;
  }, []);

  // ── 搜索词操作 ──
  const addTerm = (text, pinned) => {
    const t = String(text || '').trim();
    if (!t) return;
    if (terms.some((x) => x.text.toLowerCase() === t.toLowerCase())) {
      onToast('这个搜索词已经在列表里了');
      return;
    }
    set({ terms: [...terms, { id: uid(), text: t, pinned: !!pinned }], draft: '' });
  };

  const removeTerm = (id) => set({ terms: terms.filter((t) => t.id !== id) });

  const togglePin = (id) =>
    set({ terms: terms.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)) });

  // ── 标签操作 ──
  const applyTag = (tag) => {
    const keep = terms.filter((t) => t.pinned);
    const merged = keep.slice();
    for (const txt of tag.terms || []) {
      if (!merged.some((m) => m.text.toLowerCase() === String(txt).toLowerCase())) {
        merged.push({ id: uid(), text: txt, pinned: false });
      }
    }
    const next = { terms: merged };
    if (tag.filters) next.filters = { ...f, ...tag.filters };
    set(next);
    onToast(`已应用「${tag.name}」`);
  };

  const saveTag = () => {
    const name = String(tagModal.name || '').trim() || String(tagModal.terms[0] || '').trim();
    const list = (tagModal.terms || []).map((s) => String(s).trim()).filter(Boolean);
    if (!list.length) {
      onToast('标签至少要有一个搜索词');
      return;
    }
    const entry = {
      id: tagModal.id || uid(),
      name: name || '未命名搜索',
      terms: list,
      filters: tagModal.withFilters ? { ...f } : null,
    };
    const next = tagModal.id ? tags.map((t) => (t.id === tagModal.id ? entry : t)) : [...tags, entry];
    set({ tags: next });
    setTagModal(null);
    onToast(tagModal.id ? '标签已更新' : '已存为常用搜索');
  };

  const delTag = (tag) => {
    if (!window.confirm(`删除搜索标签「${tag.name}」？`)) return;
    set({ tags: tags.filter((t) => t.id !== tag.id) });
    onToast('标签已删除');
  };

  // ── 生成为监听条件 ──
  const openRule = () => {
    if (!activeTexts.length) {
      onToast('先加一个搜索词');
      return;
    }
    setRuleModal({
      name: activeTexts.join(' + '),
      scope: 'all',
      mode: 'or',
      includeFilters: !!(f.dc || f.world || f.category),
    });
  };

  const makeRule = () => {
    const kw = activeTexts;
    if (!kw.length) return;
    const rules = config.rules || {};
    const groups = rules.keywordGroups || [];
    const rule = {
      id: 'g' + Date.now().toString(36),
      name: String(ruleModal.name || '').trim() || kw.join(' / '),
      enabled: true,
      mode: ruleModal.mode,
      scopes: [ruleModal.scope],
      keywords: kw,
    };
    const nextRules = { keywordGroups: [...groups, rule] };
    if (ruleModal.includeFilters) {
      nextRules.datacenters = union(rules.datacenters, f.dc && f.dc !== '其他' ? [f.dc] : []);
      nextRules.worlds = union(rules.worlds, f.world ? [f.world] : []);
      nextRules.categories = union(rules.categories, f.category ? [f.category] : []);
    }
    patch({ rules: nextRules });
    setRuleModal(null);
    onToast(`已生成为监听条件「${rule.name}」，可在设置里继续微调`);
  };

  const resetAll = () => {
    set({
      terms: terms.filter((t) => t.pinned),
      draft: '',
      filters: { ...DEFAULT_SEARCH.filters },
    });
    onToast(terms.some((t) => t.pinned) ? '已置零，常驻词保留' : '已置零');
  };

  return (
    <section className="search-console panel" ref={rootRef}>
      {/* ① 搜索输入 */}
      <div className="sc-top">
        <div className="field sc-field">
          <span className="sc-mag">🔍</span>
          <input
            value={draft}
            placeholder="输入关键字后回车加入并行搜索，支持 /正则/ 写法"
            onChange={(e) => set({ draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTerm(draft);
              } else if (e.key === 'Backspace' && !draft && terms.length) {
                removeTerm(terms[terms.length - 1].id);
              }
            }}
          />
          {!!draft && (
            <button type="button" className="field-clear" title="清空输入框" onClick={() => set({ draft: '' })}>
              ×
            </button>
          )}
        </div>
        <button className="btn" onClick={() => addTerm(draft)} disabled={!draft.trim()}>
          ＋ 加入
        </button>
        <button
          className="btn ghost"
          onClick={() => setTagModal({ name: '', terms: activeTexts, withFilters: !!(f.dc || f.world || f.category) })}
          title="把当前搜索存成一个常用标签"
        >
          存为常用
        </button>
        <button className="btn tint" onClick={openRule} disabled={!activeTexts.length} title="把这些搜索词变成一组监听规则">
          → 监听条件
        </button>
      </div>

      {/* ② 并行搜索词 */}
      <div className="sc-row">
        <span className="sc-label">搜索词</span>
        <div className="sc-terms">
          {terms.map((t) => (
            <span key={t.id} className={cls('term', t.pinned && 'pinned')}>
              <button
                type="button"
                className={cls('term-pin', t.pinned && 'on')}
                title={t.pinned ? '常驻词：置零也不会清掉' : '设为常驻（置零时保留）'}
                onClick={() => togglePin(t.id)}
              >
                {t.pinned ? '★' : '☆'}
              </button>
              <span className="term-text" title={t.text}>
                {t.text}
              </span>
              <span className="term-count" title="当前命中条数">
                {counts[t.text] || 0}
              </span>
              <button type="button" className="term-x" title="移除这个搜索词" onClick={() => removeTerm(t.id)}>
                ×
              </button>
            </span>
          ))}
          {!terms.length && <span className="sc-empty">还没有搜索词。加多个词就是并行搜索，互不覆盖。</span>}
          {terms.length > 1 && (
            <PillGroup
              size="sm"
              value={search.mode || 'any'}
              onChange={(v) => set({ mode: v })}
              options={[
                { value: 'any', label: '任一命中', title: '命中任意一个词就显示' },
                { value: 'all', label: '全部命中', title: '必须同时命中所有词' },
              ]}
            />
          )}
        </div>
      </div>

      {/* ③ 常用搜索标签 */}
      <div className="sc-row">
        <span className="sc-label">常用搜索</span>
        <div className="sc-tags">
          {tags.map((tag) => (
            <span className="tag" key={tag.id}>
              <button type="button" className="tag-name" onClick={() => applyTag(tag)} title={`应用「${tag.name}」`}>
                {tag.name}
              </button>
              <button
                type="button"
                className="tag-act"
                title="编辑标签"
                onClick={() =>
                  setTagModal({
                    id: tag.id,
                    name: tag.name,
                    terms: tag.terms || [],
                    withFilters: !!tag.filters,
                  })
                }
              >
                ✎
              </button>
              <button type="button" className="tag-act del" title="删除标签" onClick={() => delTag(tag)}>
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="tag-new"
            onClick={() => setTagModal({ name: '', terms: activeTexts, withFilters: !!(f.dc || f.world || f.category) })}
          >
            ＋ 新建标签
          </button>
        </div>
      </div>

      <div className="sc-divider" />

      {/* ④ 筛选 */}
      <div className="sc-filters">
        <span className="sc-label">筛选</span>
        <Dropdown
          value={f.dc}
          onChange={(v) => {
            const dc = catalog.datacenters.find((d) => d.name === v);
            const keepWorld = v ? !!(dc && dc.worlds.includes(f.world)) : true;
            setF({ dc: v, world: keepWorld ? f.world : '' });
          }}
          options={dcOptions}
          placeholder="全部大区"
          title="按大区筛选"
        />
        <Dropdown
          value={f.world}
          onChange={(v) => {
            const dc = v ? (catalog.worldToDc || {})[v] : '';
            setF({ world: v, ...(v && dc ? { dc } : {}) });
          }}
          options={worldOptions}
          placeholder="全部服务器"
          title="按服务器筛选（选服务器会自动带出所属大区）"
        />
        <Dropdown
          value={f.category}
          onChange={(v) => setF({ category: v })}
          options={catOptions}
          placeholder="全部模块"
          title="按招募模块筛选"
        />
        <Dropdown
          value={f.sort}
          onChange={(v) => setF({ sort: v })}
          options={sortOptions}
          placeholder="排序"
          title="排序方式"
        />
        <button
          type="button"
          className={cls('btn sm', f.onlyHit && 'primary')}
          onClick={() => setF({ onlyHit: !f.onlyHit })}
          title="只显示命中监听规则的招募"
        >
          {f.onlyHit ? '✓ 只看命中' : '只看命中'}
        </button>
        <span className="sc-spacer" />
        <span className="sc-stat">
          在招 <b>{stats.total}</b> · 搜到 <b>{stats.shown}</b>
        </span>
        <button type="button" className="btn ghost" onClick={resetAll} title="清空搜索词与筛选（常驻词会保留）">
          置零
        </button>
      </div>

      {(f.dc || f.world || f.category || f.onlyHit) && (
        <div className="sc-active">
          <span className="sc-label">当前筛选</span>
          {f.dc && (
            <button type="button" className="chip accent act" onClick={() => setF({ dc: '', world: '' })} title="取消大区筛选">
              大区：{f.dc} <span className="x">×</span>
            </button>
          )}
          {f.world && (
            <button type="button" className="chip accent act" onClick={() => setF({ world: '' })} title="取消服务器筛选">
              服务器：{f.world} <span className="x">×</span>
            </button>
          )}
          {f.category && (
            <button type="button" className="chip accent act" onClick={() => setF({ category: '' })} title="取消模块筛选">
              模块：{(catalog.categories.find((c) => c.id === f.category) || {}).label || f.category}
              <span className="x">×</span>
            </button>
          )}
          {f.onlyHit && (
            <button type="button" className="chip accent act" onClick={() => setF({ onlyHit: false })}>
              只看命中 <span className="x">×</span>
            </button>
          )}
        </div>
      )}

      {/* ── 标签编辑 ── */}
      {tagModal && (
        <Modal
          title={tagModal.id ? '编辑搜索标签' : '新建搜索标签'}
          text="标签可以理解成「常用搜索」的快捷方式：点一下就把这些搜索词和筛选条件套回来。"
          onBackdrop={() => setTagModal(null)}
          actions={
            <>
              <button className="btn primary" onClick={saveTag}>
                {tagModal.id ? '保存修改' : '保存标签'}
              </button>
              <button className="btn ghost" onClick={() => setTagModal(null)}>
                取消
              </button>
            </>
          }
        >
          <div className="form">
            <label className="form-label">标签名</label>
            <Field
              value={tagModal.name}
              onChange={(v) => setTagModal((m) => ({ ...m, name: v }))}
              placeholder="例如：零式开荒"
              autoFocus
            />
            <label className="form-label" style={{ marginTop: 12 }}>
              搜索词
            </label>
            <ChipInput
              value={tagModal.terms}
              onChange={(v) => setTagModal((m) => ({ ...m, terms: v }))}
              placeholder="输入后回车，可加多个（并行搜索）"
            />
            <div style={{ marginTop: 12 }}>
              <Checkbox
                checked={!!tagModal.withFilters}
                onChange={(v) => setTagModal((m) => ({ ...m, withFilters: v }))}
              >
                连当前筛选一起记住（大区 / 服务器 / 模块 / 排序）
              </Checkbox>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 生成监听条件 ── */}
      {ruleModal && (
        <Modal
          title="把搜索生成为监听条件"
          text="会新建一组关键字规则，追加到「设置 · 监听规则」里；已命中的招募只入库不打扰。"
          onBackdrop={() => setRuleModal(null)}
          actions={
            <>
              <button className="btn primary" onClick={makeRule}>
                生成监听条件
              </button>
              <button className="btn ghost" onClick={() => setRuleModal(null)}>
                取消
              </button>
            </>
          }
        >
          <div className="form">
            <label className="form-label">规则名</label>
            <Field
              value={ruleModal.name}
              onChange={(v) => setRuleModal((m) => ({ ...m, name: v }))}
              placeholder="例如：零式 / 缺T"
              autoFocus
            />
            <label className="form-label" style={{ marginTop: 12 }}>
              关键字
            </label>
            <div className="sc-terms" style={{ padding: '2px 0' }}>
              {activeTexts.map((t) => (
                <span className="chip accent" key={t}>
                  {t}
                </span>
              ))}
            </div>
            <div className="form-line">
              <span className="form-label">匹配范围</span>
              <PillGroup size="sm" value={ruleModal.scope} onChange={(v) => setRuleModal((m) => ({ ...m, scope: v }))} options={SCOPES} />
            </div>
            <div className="form-line">
              <span className="form-label">多个词</span>
              <PillGroup
                size="sm"
                value={ruleModal.mode}
                onChange={(v) => setRuleModal((m) => ({ ...m, mode: v }))}
                options={[
                  { value: 'or', label: '任一命中' },
                  { value: 'and', label: '全部命中' },
                ]}
              />
            </div>
            <div style={{ marginTop: 6 }}>
              <Checkbox
                checked={!!ruleModal.includeFilters}
                onChange={(v) => setRuleModal((m) => ({ ...m, includeFilters: v }))}
              >
                把当前筛选（大区 / 服务器 / 模块）也并入规则
              </Checkbox>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
