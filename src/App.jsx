import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LiveView from './views/LiveView.jsx';
import HitsView from './views/HitsView.jsx';
import SettingsView from './views/SettingsView.jsx';
import DetailDrawer from './components/DetailDrawer.jsx';
import { Modal, Checkbox } from './components/ui.jsx';
import { cls, clock, timeAgo } from './lib/format.js';

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}
function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isObj(patch)) return patch === undefined ? out : patch;
  for (const [k, v] of Object.entries(patch)) {
    if (isObj(v) && isObj(base[k])) out[k] = deepMerge(base[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

const NAV = [
  { id: 'live', label: '在招', icon: '🪧' },
  { id: 'hits', label: '命中', icon: '🔔' },
  { id: 'settings', label: '设置', icon: '⚙' },
];

export default function App() {
  const [boot, setBoot] = useState(null);
  const [config, setConfig] = useState(null);
  const [listings, setListings] = useState([]);
  const [hits, setHits] = useState([]);
  const [status, setStatus] = useState({});
  const [view, setView] = useState('live');
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState('');
  const [closeAsk, setCloseAsk] = useState(false);
  const [remember, setRemember] = useState(false);
  const [srcNotice, setSrcNotice] = useState(false);
  const [srcNoMore, setSrcNoMore] = useState(true);
  const [freshIds, setFreshIds] = useState(new Set());
  const [, forceTick] = useState(0);

  const configRef = useRef(null);
  const prevIds = useRef(new Set());
  const audioRef = useRef(null);
  const listingsRef = useRef([]);
  const pendingRef = useRef({});
  const debounceRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  // ── 启动加载 ──
  useEffect(() => {
    window.pf.boot().then((b) => {
      setBoot(b);
      setConfig(b.config);
      configRef.current = b.config;
      setListings(b.listings || []);
      setHits(b.hits || []);
      setStatus(b.status || {});
      prevIds.current = new Set((b.listings || []).map((l) => l.id));
      setView(b.initialView || b.config.ui.defaultView || 'live');
      if (!b.config.ui.seenSourceNotice) setSrcNotice(true);
    });
  }, []);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  const playSound = useCallback(async () => {
    try {
      const s = await window.pf.getSound();
      if (!s || !s.dataUrl) return;
      const a = audioRef.current || new Audio();
      audioRef.current = a;
      if (a.src !== s.dataUrl) a.src = s.dataUrl;
      a.volume = Math.max(0, Math.min(1, (configRef.current && configRef.current.notify.volume) ?? 0.7));
      a.currentTime = 0;
      await a.play();
    } catch (e) {
      /* 音效失败不影响监听 */
    }
  }, []);

  // ── 主进程推送 ──
  useEffect(() => {
    const off = window.pf.onState((s) => {
      if (!s) return;
      setListings(s.listings || []);
      setHits(s.hits || []);
      setStatus(s.status || {});
    });
    const offAlert = window.pf.onPlayAlert(() => playSound());
    const offFocus = window.pf.onFocusListing((id) => {
      const l = (listingsRef.current || []).find((x) => x.id === id);
      if (l) setDetail(l);
      setView('live');
    });
    const offClose = window.pf.onRequestClose(() => {
      setRemember(false);
      setCloseAsk(true);
      setView('live');
    });
    return () => {
      off && off();
      offAlert && offAlert();
      offFocus && offFocus();
      offClose && offClose();
    };
  }, [playSound]);

  // 新出现的招募做一次高亮
  useEffect(() => {
    if (!listings.length) return;
    const cur = new Set(listings.map((l) => l.id));
    const added = [...cur].filter((id) => !prevIds.current.has(id));
    prevIds.current = cur;
    if (added.length) {
      setFreshIds(new Set(added));
      setTimeout(() => setFreshIds(new Set()), 6000);
    }
  }, [listings]);

  // 倒计时刷新
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // 主题
  useEffect(() => {
    if (!config) return;
    const el = document.documentElement;
    el.dataset.mode = config.ui.mode;
    el.dataset.density = config.ui.density;
    el.dataset.layout = config.ui.layout;
    el.style.setProperty('--accent', config.ui.accent);
    el.style.setProperty('--font-scale', String(config.ui.fontScale || 1));
  }, [config && config.ui]);

  // ── 配置修改（本地立即生效，落盘合并防抖） ──
  const patch = useCallback((p) => {
    setConfig((c) => deepMerge(c, p));
    pendingRef.current = deepMerge(pendingRef.current, p);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const payload = pendingRef.current;
      pendingRef.current = {};
      window.pf.patchConfig(payload).then((cfg) => {
        setConfig((c) => deepMerge(c, cfg));
      });
    }, 320);
  }, []);

  const playSoundRef = useRef(playSound);
  useEffect(() => {
    playSoundRef.current = playSound;
  }, [playSound]);

  // 数据来源提示：看过就不再弹（除非用户取消勾选）
  const dismissSrc = useCallback(
    (goAbout) => {
      setSrcNotice(false);
      if (goAbout) setView('settings');
      if (srcNoMore) patch({ ui: { seenSourceNotice: true } });
    },
    [srcNoMore, patch]
  );

  const hitsById = useMemo(() => {
    const m = {};
    for (const h of hits) {
      if (!h || h.id == null) continue;
      const words = [];
      for (const r of h.reasons || []) for (const w of r.words || []) words.push(w);
      if (!m[h.id]) m[h.id] = { at: h.at, matched: words, baseline: h.baseline };
    }
    return m;
  }, [hits]);

  const onPause = useCallback(async (paused) => {
    await window.pf.setPaused(paused);
    setStatus((s) => ({ ...s, paused }));
  }, []);

  const [coolUntil, setCoolUntil] = useState(0);

  const doRefresh = useCallback(async () => {
    const r = await window.pf.pollNow();
    if (!r) return;
    if (r.status) setStatus(r.status);
    if (r.listings) setListings(r.listings);
    if (r.hits) setHits(r.hits);
    if (r.rejected) {
      setCoolUntil(Date.now() + (r.wait || 0));
      showToast(`刷新冷却中，${Math.ceil((r.wait || 0) / 1000)} 秒后可再刷新`);
      return;
    }
    if (r.busy) {
      showToast('正在刷新，稍等');
      return;
    }
    showToast('已刷新招募数据');
  }, [showToast]);

  if (!boot || !config) {
    return (
      <div className="empty" style={{ height: '100vh' }}>
        <b>正在启动…</b>
      </div>
    );
  }

  const paused = !!status.paused;
  const err = status.lastError;
  const nextSec = status.nextIn ? Math.max(0, Math.ceil((status.nextIn - Date.now()) / 1000)) : 0;
  const coolSec = Math.max(
    status.manualReadyAt ? Math.ceil((status.manualReadyAt - Date.now()) / 1000) : 0,
    coolUntil > Date.now() ? Math.ceil((coolUntil - Date.now()) / 1000) : 0,
    0
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">招募</div>
          <div className="brand-text">
            <div className="brand-title">招募板监听器</div>
            <div className="brand-sub">FFXIV · CN</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={cls('nav-item', view === n.id && 'active')}
              onClick={() => setView(n.id)}
            >
              <span className="ico">{n.icon}</span>
              {n.label}
              {n.id === 'live' && <span className="badge">{listings.length}</span>}
              {n.id === 'hits' && (
                <span className={cls('badge', hits.length > 0 && 'hot')}>{hits.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="status-line">
            <span className={cls('status-dot', paused ? 'pause' : err ? 'err' : 'on')} />
            {paused ? '已暂停监听' : err ? '连接异常' : '监听中'}
          </div>
          <div className="status-meta">
            上次更新 {status.lastOk ? clock(status.lastOk) : '—'}
            <br />
            {paused ? '恢复后自动继续轮询' : nextSec > 0 ? `${nextSec}s 后刷新 · 每 ${config.poll.intervalSec}s` : '准备刷新…'}
            <br />
            在招 {listings.length} 条
          </div>
          <button className="side-src" onClick={() => setView('settings')} title="数据是玩家自发上报的，点开看说明">
            数据来自玩家众包
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="topbar-title">
              {view === 'live' ? '在招招募' : view === 'hits' ? '监听命中' : '设置'}
            </div>
            <div className="topbar-sub">
              {view === 'live'
                ? '实时汇总当前招募板上的所有公开招募'
                : view === 'hits'
                ? '按你的规则命中的招募都记在这里'
                : '规则、提醒、窗口与外观'}
            </div>
          </div>

          <div className="topbar-actions">
            {err && !paused && (
              <span className="chip bad" title={err}>
                连接异常
              </span>
            )}
            <span className="chip" title="上次成功刷新时间">
              {status.lastOk ? timeAgo(status.lastOk) : '尚未刷新'}
            </span>
            <button
              className={cls('btn', paused ? 'primary' : '')}
              onClick={() => onPause(!paused)}
              title={paused ? '恢复监听' : '暂停监听'}
            >
              {paused ? '▶ 恢复监听' : '⏸ 暂停'}
            </button>
            <button
              className={cls('btn refresh', coolSec > 0 && 'cooling')}
              onClick={doRefresh}
              disabled={coolSec > 0}
              title={coolSec > 0 ? `冷却中，${coolSec} 秒后可再刷新` : '立即拉取一次招募数据（冷却 10 秒）'}
            >
              <span className={cls('r-ico', status.running && 'spin')}>⟳</span>
              {coolSec > 0 ? <span className="r-cool">{coolSec}s 后可刷新</span> : '立即刷新'}
            </button>
          </div>
        </header>

        <div className="content">
          <div className="content-inner">
            {err && (
              <div className="banner err">
                <span>拉取失败：{err}</span>
                <button className="btn sm" onClick={doRefresh} disabled={coolSec > 0}>
                  {coolSec > 0 ? `${coolSec}s 后可重试` : '重试'}
                </button>
              </div>
            )}

            {view === 'live' && (
              <LiveView
                listings={listings}
                hitsById={hitsById}
                freshIds={freshIds}
                config={config}
                catalog={boot.catalog}
                patch={patch}
                onToast={showToast}
                status={status}
                onOpen={setDetail}
              />
            )}

            {view === 'hits' && (
              <HitsView
                hits={hits}
                config={config}
                catalog={boot.catalog.categories}
                onOpen={setDetail}
                onGoSettings={() => setView('settings')}
                onClear={async () => {
                  await window.pf.clearHits();
                  setHits([]);
                  showToast('命中记录已清空');
                }}
              />
            )}

            {view === 'settings' && (
              <SettingsView
                config={config}
                catalog={boot.catalog}
                status={status}
                boot={boot}
                listings={listings}
                patch={patch}
                onPause={onPause}
                playSound={playSound}
                onToast={showToast}
                onReset={async () => {
                  const cfg = await window.pf.resetConfig();
                  setConfig(cfg);
                  showToast('已恢复默认设置');
                }}
              />
            )}
          </div>
        </div>
      </main>

      {detail && (
        <DetailDrawer item={detail} onClose={() => setDetail(null)} onToast={showToast} />
      )}

      {closeAsk && (
        <Modal
          title="要退出监听器吗？"
          text="最小化到托盘后仍在后台监听，有新招募照样提醒；直接退出则完全停止。"
          onBackdrop={() => setCloseAsk(false)}
          actions={
            <>
              <button
                className="btn primary"
                onClick={() => {
                  window.pf.closeDecision({ action: 'tray', remember });
                  setCloseAsk(false);
                }}
              >
                最小化到托盘
              </button>
              <div className="row">
                <button
                  className="btn"
                  onClick={() => {
                    window.pf.closeDecision({ action: 'quit', remember });
                    setCloseAsk(false);
                  }}
                >
                  直接退出
                </button>
                <button className="btn ghost" onClick={() => setCloseAsk(false)}>
                  取消
                </button>
              </div>
              <Checkbox checked={remember} onChange={setRemember}>
                记住我的选择（以后可在设置里改）
              </Checkbox>
            </>
          }
        />
      )}

      {srcNotice && (
        <Modal
          title="这些招募，是玩家一条条传上来的"
          width={520}
          onBackdrop={() => dismissSrc(false)}
          actions={
            <>
              <div className="row">
                <button className="btn" onClick={() => dismissSrc(true)}>
                  看看数据从哪来
                </button>
                <button className="btn primary" onClick={() => dismissSrc(false)}>
                  知道了
                </button>
              </div>
              <Checkbox checked={srcNoMore} onChange={setSrcNoMore}>
                不再提示
              </Checkbox>
            </>
          }
        >
          <div className="src-first">
            <p>
              本程序只是把这些数据摆到你桌面上的一个看板，自己一条都不产生。数据来自国服公开接口，
              而接口里的内容，是<b>在线的玩家打开招募板的那一瞬</b>被插件读走、匿名传上去的。
            </p>
            <div className="src-pts">
              <div className="src-pt">
                <span>·</span>
                <span>某大区一条都没有，通常不是没人开队，而是那一刻没人在线上报。</span>
              </div>
              <div className="src-pt">
                <span>·</span>
                <span>传的只有招募板上的公开内容，上游不知道是谁传的。</span>
              </div>
              <div className="src-pt">
                <span>·</span>
                <span>想知道怎么帮忙贡献，设置页最下面有说明和原站地址。</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {toast && <div className="toast-inline">{toast}</div>}
    </div>
  );
}
