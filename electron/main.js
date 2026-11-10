'use strict';

const {
  app,
  BrowserWindow,
  screen,
  Tray,
  Menu,
  Notification,
  nativeImage,
  ipcMain,
  dialog,
  shell,
  clipboard,
  powerMonitor,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { Store, snapInterval, buildUserAgent } = require('./config');
const { fetchAllListings, fetchDetail, testConnection } = require('./api');
const { evaluate, enrich } = require('./matcher');
const catalog = require('./catalog');

const APP_ID = 'xin.ff14.pfwatcher';
const IS_DEV = process.env.PF_DEV === '1';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setAppUserModelId(APP_ID);

// 单实例：第二次启动直接唤起已有窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let win = null;
let tray = null;
let store = null;
let iconImage = null;

let listings = [];
let hits = [];
let knownIds = new Set();
let hitIds = new Set();
let timer = null;
let polling = false;
let quitting = false;
let status = {
  running: false,
  paused: false,
  lastOk: 0,
  lastError: '',
  count: 0,
  base: '',
  nextIn: 0,
  firstLoad: true,
  hasCriteria: false,
  totalFetched: 0,
  intervalSec: 60,
  manualReadyAt: 0,
  manualCooldownMs: 10000,
};

// 手动刷新的冷却：只有「立即刷新」受限制，自动轮询不受影响
const MANUAL_COOLDOWN_MS = 10000;
let lastManualAt = 0;
function manualWait() {
  return Math.max(0, MANUAL_COOLDOWN_MS - (Date.now() - lastManualAt));
}
function stampManual() {
  lastManualAt = Date.now();
  status.manualReadyAt = lastManualAt + MANUAL_COOLDOWN_MS;
  status.manualCooldownMs = MANUAL_COOLDOWN_MS;
}
let trayTipShown = false;
let soundCache = { path: '', dataUrl: '' };

// ── 工具 ────────────────────────────────────────────────
function asset(p) {
  return path.join(__dirname, 'assets', p);
}

function loadIcon() {
  if (iconImage) return iconImage;
  const p = asset('icon.png');
  iconImage = nativeImage.createFromPath(p);
  if (iconImage.isEmpty()) iconImage = nativeImage.createEmpty();
  return iconImage;
}

function hasCriteria(rules) {
  const r = rules || {};
  const kw = (r.keywordGroups || []).some((g) => g && g.enabled !== false && (g.keywords || []).length);
  const wl = (r.playerWhitelist || []).length && r.whitelistOnly;
  return Boolean(kw || (r.worlds || []).length || (r.datacenters || []).length || (r.categories || []).length || wl);
}

function currentConfig() {
  return store.get();
}

/**
 * 带合规 User-Agent 的接口配置。
 * 上游要求 UA 里写明项目名与联系方式，所以每次请求现算，改了联系方式立刻生效。
 */
function sourceConfig(override) {
  const s = override || currentConfig().source;
  return { ...s, userAgent: buildUserAgent(app.getVersion(), (s && s.contact) || '') };
}

function snapshot() {
  return {
    listings,
    hits,
    status,
    config: currentConfig(),
  };
}

function send(channel, payload) {
  if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function broadcast() {
  send('state', snapshot());
}

// ── 窗口 ────────────────────────────────────────────────
function safeBounds(b) {
  if (!b || typeof b.x !== 'number' || typeof b.y !== 'number') return {};
  try {
    const area = screen.getDisplayMatching(b).workArea;
    const visible =
      b.x < area.x + area.width - 80 &&
      b.x + Math.min(b.width || 800, 400) > area.x &&
      b.y < area.y + area.height - 60 &&
      b.y + 60 > area.y;
    return visible ? b : {};
  } catch (_) {
    return {};
  }
}

function createWindow() {
  const cfg = currentConfig();
  const bounds = safeBounds(cfg.window.bounds);
  win = new BrowserWindow({
    width: bounds.width || 1320,
    height: bounds.height || 880,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1040,
    minHeight: 660,
    backgroundColor: cfg.ui.mode === 'light' ? '#f2f3f6' : '#12141c',
    title: '招募板监听器',
    icon: asset('icon.png'),
    autoHideMenuBar: true,
    show: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);
  if (cfg.window.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');

  if (IS_DEV) win.loadURL('http://127.0.0.1:5173/');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.once('ready-to-show', () => {
    if (!currentConfig().window.startMinimized) win.show();
    broadcast();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 关闭：询问 / 最小化到托盘 / 直接退出
  win.on('close', (e) => {
    if (quitting) return;
    const act = currentConfig().window.closeAction;
    if (act === 'tray') {
      e.preventDefault();
      hideToTray();
    } else if (act === 'quit') {
      quitting = true;
      app.quit();
    } else {
      e.preventDefault();
      showWindow();
      send('request-close');
    }
  });

  // 最小化：任务栏 / 托盘
  win.on('minimize', () => {
    if (currentConfig().window.minimizeAction === 'tray') {
      setTimeout(() => {
        if (win && !win.isDestroyed()) win.hide();
      }, 16);
    }
  });

  const saveBounds = () => {
    if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
    const b = win.getBounds();
    store.patch({ window: { bounds: b } });
  };
  let boundTimer = null;
  const debouncedSaveBounds = () => {
    clearTimeout(boundTimer);
    boundTimer = setTimeout(saveBounds, 600);
  };
  win.on('resize', debouncedSaveBounds);
  win.on('move', debouncedSaveBounds);

  win.on('closed', () => {
    win = null;
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (!win.isVisible()) win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}

function hideToTray() {
  if (!win || win.isDestroyed()) return;
  win.hide();
  if (!trayTipShown && tray) {
    trayTipShown = true;
    try {
      tray.displayBalloon({
        title: '招募板监听器仍在运行',
        content: '已最小化到托盘，有新招募会继续提醒。右键托盘图标可退出。',
        icon: loadIcon(),
      });
    } catch (_) {}
  }
}

// ── 托盘 ────────────────────────────────────────────────
function buildTrayMenu() {
  const cfg = currentConfig();
  return Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showWindow() },
    { type: 'separator' },
    {
      label: status.paused ? '继续监听' : '暂停监听',
      click: () => setPaused(!status.paused),
    },
    { label: '立即刷新', enabled: manualWait() === 0, click: () => pollOnce(true) },
    { type: 'separator' },
    { label: '打开配置文件夹', click: () => shell.openPath(store.dir) },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
  const s = status.paused
    ? '已暂停'
    : status.lastError
    ? '连接异常'
    : status.lastOk
    ? '监听中'
    : '启动中';
  tray.setToolTip(`招募板监听器 · ${s} · 在招 ${listings.length}`);
}

function createTray() {
  tray = new Tray(loadIcon().resize({ width: 20, height: 20 }));
  refreshTray();
  tray.on('click', () => {
    if (win && win.isVisible() && !win.isMinimized()) win.hide();
    else showWindow();
  });
  tray.on('double-click', () => showWindow());
}

// ── 提醒 ────────────────────────────────────────────────
function playAlert() {
  const cfg = currentConfig();
  if (!cfg.notify.sound) return;
  send('play-alert');
}

function notifyOne(item) {
  const cfg = currentConfig();
  const l = item.listing;
  const title = `招募命中 · ${l.name || '未知玩家'}`;
  const body = `${l.dc && l.dc !== '其他' ? l.dc + ' · ' : ''}${l.world} · ${
    l.category_label || '自由招募'
  }\n${(l.description || '').slice(0, 90)}`;

  if (cfg.notify.toast) {
    try {
      const n = new Notification({ title, body, icon: loadIcon(), silent: true });
      n.on('click', () => {
        showWindow();
        send('focus-listing', l.id);
        if (cfg.notify.focusOnClick) win && win.focus();
      });
      n.show();
    } catch (_) {
      if (tray) {
        try {
          tray.displayBalloon({ title, content: body, icon: loadIcon() });
        } catch (_) {}
      }
    }
  } else if (tray) {
    try {
      tray.displayBalloon({ title, content: body, icon: loadIcon() });
    } catch (_) {}
  }
}

function notifyGroup(items) {
  const cfg = currentConfig();
  const title = `${items.length} 条新招募命中`;
  const body = items
    .slice(0, 4)
    .map(
      (it) =>
        `· ${it.listing.name}（${it.listing.dc && it.listing.dc !== '其他' ? it.listing.dc + ' · ' : ''}${
          it.listing.world
        }）${(it.listing.description || '').slice(0, 26)}`
    )
    .join('\n');
  if (cfg.notify.toast) {
    try {
      const n = new Notification({ title, body, icon: loadIcon(), silent: true });
      n.on('click', () => showWindow());
      n.show();
    } catch (_) {}
  } else if (tray) {
    try {
      tray.displayBalloon({ title, content: body, icon: loadIcon() });
    } catch (_) {}
  }
}

function alertFor(newItems) {
  const cfg = currentConfig();
  if (!newItems.length) return;
  playAlert();
  if (cfg.notify.flashTaskbar && win && !win.isDestroyed() && !win.isFocused()) {
    win.flashFrame(true);
    setTimeout(() => win && !win.isDestroyed() && win.flashFrame(false), 6000);
  }
  if (newItems.length >= (cfg.notify.groupThreshold || 3)) notifyGroup(newItems);
  else newItems.forEach(notifyOne);
}

// ── 轮询 ────────────────────────────────────────────────
function computeMatches() {
  const rules = currentConfig().rules;
  const out = [];
  for (const l of listings) {
    const r = evaluate(l, rules);
    if (r.hit) out.push({ listing: l, reasons: r.reasons });
  }
  return out;
}

function scheduleNext() {
  clearTimeout(timer);
  const cfg = currentConfig();
  const sec = snapInterval(cfg.poll.intervalSec);
  status.intervalSec = sec;
  const iv = sec * 1000;
  status.nextIn = Date.now() + iv;
  if (status.paused) return;
  timer = setTimeout(() => pollOnce(), iv);
}

async function pollOnce(manual = false) {
  if (polling) return;
  if (status.paused && !manual) return;
  if (manual) stampManual();
  polling = true;
  status.running = true;
  broadcast();
  const cfg = currentConfig();
  try {
    const res = await fetchAllListings(sourceConfig(cfg.source), { maxPages: cfg.poll.maxPages });
    const enriched = res.listings.map(enrich);
    const incoming = enriched;

    const first = knownIds.size === 0;
    const fresh = incoming.filter((l) => !knownIds.has(l.id));
    incoming.forEach((l) => knownIds.add(l.id));
    listings = incoming;

    status.lastOk = Date.now();
    status.lastError = '';
    status.count = listings.length;
    status.base = res.base;
    status.totalFetched = res.total;
    status.firstLoad = false;
    status.hasCriteria = hasCriteria(cfg.rules);

    // 重新计算命中（规则可能已变）
    const matches = computeMatches();
    const newMatches = [];

    if (first) {
      // 首次加载：把当前已命中的记进历史，但不打扰
      if (!status.hasCriteria) {
        // 还没设置任何条件时不算命中，避免几百条噪音
      } else if (cfg.poll.notifyOnStart) {
        newMatches.push(...matches.filter((m) => !hitIds.has(m.listing.id)));
      } else {
        for (const m of matches) hitIds.add(m.listing.id);
        const records = matches.map((m) => ({
          id: m.listing.id,
          at: Date.now(),
          baseline: true,
          listing: m.listing,
          reasons: m.reasons,
        }));
        if (records.length) hits = store.addHits(records);
      }
    } else {
      for (const m of matches) {
        if (!hitIds.has(m.listing.id)) {
          hitIds.add(m.listing.id);
          newMatches.push(m);
        }
      }
    }

    if (newMatches.length && status.hasCriteria) {
      const records = newMatches.map((m) => ({
        id: m.listing.id,
        at: Date.now(),
        baseline: false,
        listing: m.listing,
        reasons: m.reasons,
      }));
      hits = store.addHits(records);
      alertFor(newMatches);
    }

    // 清掉早已下架招募的 id 记录，避免无限增长
    if (knownIds.size > 4000) {
      knownIds = new Set(listings.map((l) => l.id));
    }
  } catch (e) {
    status.lastError = String((e && e.message) || e);
    status.running = false;
  } finally {
    polling = false;
    status.running = false;
    refreshTray();
    broadcast();
    scheduleNext();
  }
}

function setPaused(p) {
  status.paused = Boolean(p);
  store.patch({ poll: { paused: status.paused } });
  if (status.paused) {
    clearTimeout(timer);
    status.nextIn = 0;
  } else {
    pollOnce(true);
    scheduleNext();
  }
  refreshTray();
  broadcast();
}

// ── 音效 ────────────────────────────────────────────────
function soundDataUrl() {
  const cfg = currentConfig();
  const p = cfg.notify.soundFile && fs.existsSync(cfg.notify.soundFile) ? cfg.notify.soundFile : asset('notify.wav');
  if (soundCache.path === p && soundCache.dataUrl) return soundCache;
  try {
    const buf = fs.readFileSync(p);
    if (buf.length > 6 * 1024 * 1024) throw new Error('音频文件过大');
    const ext = path.extname(p).toLowerCase().replace('.', '') || 'wav';
    const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : ext === 'm4a' ? 'audio/mp4' : 'audio/wav';
    soundCache = { path: p, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
    return soundCache;
  } catch (e) {
    return { path: '', dataUrl: '', error: String(e.message || e) };
  }
}

// ── IPC ─────────────────────────────────────────────────
function registerIpc() {
  ipcMain.handle('boot', () => ({
    config: currentConfig(),
    catalog: {
      datacenters: catalog.DATACENTERS,
      categories: catalog.CATEGORIES,
      worldToDc: catalog.WORLD_TO_DC,
      dcOrder: catalog.DC_ORDER,
      intervalChoices: [30, 60, 90, 120],
    },
    listings,
    hits,
    status,
    initialView: process.env.PF_VIEW || '',
    version: app.getVersion(),
    dataDir: store.dir,
    userData: app.getPath('userData'),
  }));

  ipcMain.handle('config:patch', (_e, patch) => {
    const before = JSON.stringify(currentConfig().rules);
    const cfg = store.patch(patch || {});
    const rulesChanged = JSON.stringify(cfg.rules) !== before;
    if (rulesChanged) {
      status.hasCriteria = hasCriteria(cfg.rules);
      // 规则变化后重新评估：已存在且新命中的，静默入库，不打扰
      const matches = status.hasCriteria ? computeMatches() : [];
      const add = [];
      for (const m of matches) {
        if (!hitIds.has(m.listing.id)) {
          hitIds.add(m.listing.id);
          add.push({ id: m.listing.id, at: Date.now(), baseline: true, listing: m.listing, reasons: m.reasons });
        }
      }
      if (add.length) hits = store.addHits(add);
      soundCache = { path: '', dataUrl: '' };
    }
    if (patch && patch.window && patch.window.alwaysOnTop !== undefined && win && !win.isDestroyed()) {
      win.setAlwaysOnTop(!!patch.window.alwaysOnTop, 'floating');
    }
    if (patch && patch.poll && patch.poll.intervalSec !== undefined) {
      scheduleNext();
    }
    refreshTray();
    broadcast();
    return cfg;
  });

  ipcMain.handle('config:reset', () => {
    const cfg = store.reset();
    status.hasCriteria = hasCriteria(cfg.rules);
    soundCache = { path: '', dataUrl: '' };
    pollOnce(true);
    return cfg;
  });

  ipcMain.handle('state:get', () => snapshot());

  ipcMain.handle('poll:now', async () => {
    const wait = manualWait();
    if (wait > 0) return { ...snapshot(), rejected: true, wait };
    if (polling) return { ...snapshot(), busy: true, wait: 0 };
    await pollOnce(true);
    return { ...snapshot(), rejected: false, wait: manualWait() };
  });

  ipcMain.handle('poll:pause', (_e, p) => {
    setPaused(p);
    return snapshot();
  });

  ipcMain.handle('detail:get', async (_e, id) => {
    try {
      return { ok: true, data: await fetchDetail(sourceConfig(), id) };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('notify:test', async () => {
    const cfg = currentConfig();
    playAlert();
    const demo = {
      listing: {
        name: '测试玩家',
        world: '红玉海',
        dc: '陆行鸟',
        category_label: '寻宝',
        description: '这是一条测试招募，用来确认提醒是否正常',
        id: -1,
      },
    };
    if (cfg.notify.toast) notifyOne(demo);
    else if (tray) {
      try {
        tray.displayBalloon({ title: '测试通知', content: '托盘气泡通道正常', icon: loadIcon() });
      } catch (_) {}
    }
    return { ok: true };
  });

  ipcMain.handle('sound:pick', async () => {
    const r = await dialog.showOpenDialog(win || undefined, {
      title: '选择提示音',
      properties: ['openFile'],
      filters: [{ name: '音频', extensions: ['wav', 'mp3', 'ogg', 'm4a'] }],
    });
    if (r.canceled || !r.filePaths.length) return { ok: false };
    const p = r.filePaths[0];
    store.patch({ notify: { soundFile: p } });
    soundCache = { path: '', dataUrl: '' };
    broadcast();
    return { ok: true, path: p };
  });

  ipcMain.handle('sound:get', () => soundDataUrl());

  ipcMain.handle('sound:clear', () => {
    store.patch({ notify: { soundFile: '' } });
    soundCache = { path: '', dataUrl: '' };
    broadcast();
    return { ok: true };
  });

  ipcMain.handle('window:close-decision', (_e, payload) => {
    const { action, remember } = payload || {};
    if (remember) store.patch({ window: { closeAction: action } });
    if (action === 'quit') {
      quitting = true;
      app.quit();
    } else {
      hideToTray();
      broadcast();
    }
    return { ok: true };
  });

  ipcMain.handle('window:action', (_e, action) => {
    if (!win || win.isDestroyed()) return { ok: false };
    if (action === 'minimize') win.minimize();
    else if (action === 'hide') hideToTray();
    else if (action === 'show') showWindow();
    return { ok: true };
  });

  ipcMain.handle('hits:clear', () => {
    hits = store.clearHits();
    hitIds = new Set();
    computeMatches().forEach((m) => hitIds.add(m.listing.id));
    broadcast();
    return { ok: true };
  });

  ipcMain.handle('source:test', async (_e, cfg) => {
    try {
      return { ok: true, ...(await testConnection(sourceConfig(cfg))) };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('app:openDataDir', () => shell.openPath(store.dir));
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (/^https?:/i.test(url)) return shell.openExternal(url);
    return null;
  });
  ipcMain.handle('clipboard:write', (_e, text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  });
}

// ── 启动 ────────────────────────────────────────────────
app.on('second-instance', () => showWindow());

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  hits = store.hits || [];
  hitIds = new Set(hits.map((h) => h.id));
  status.paused = !!store.get().poll.paused;
  status.intervalSec = snapInterval(store.get().poll.intervalSec);
  status.hasCriteria = hasCriteria(store.get().rules);

  registerIpc();
  createTray();
  createWindow();
  refreshTray();

  powerMonitor.on('resume', () => setTimeout(() => pollOnce(true), 3000));
  setTimeout(() => pollOnce(), 600);
  scheduleNext();
});

app.on('window-all-closed', () => {
  if (quitting) app.quit();
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('activate', () => showWindow());
