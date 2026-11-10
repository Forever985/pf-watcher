'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  version: 1,
  source: {
    baseUrl: 'https://xivpf.littlenightmare.top',
    fallbackUrls: ['https://xivpf.ff14.xin'],
    // 由 buildUserAgent() 在请求时生成，这里只是兜底
    userAgent: 'PFWatcher (FF14-CN party finder desktop client)',
    // 上游 about 页要求 UA 中注明项目名称与联系方式；联系方式可选，由用户填
    contact: '',
  },
  poll: {
    intervalSec: 60,
    manualCooldownSec: 10,
    paused: false,
    notifyOnStart: false,
    maxPages: 8,
  },
  notify: {
    toast: true,
    sound: true,
    soundFile: '',
    volume: 0.7,
    flashTaskbar: true,
    focusOnClick: true,
    groupThreshold: 3,
  },
  window: {
    closeAction: 'ask',
    minimizeAction: 'taskbar',
    startMinimized: false,
    alwaysOnTop: false,
    bounds: null,
  },
  ui: {
    mode: 'dark',
    layout: 'card',
    accent: '#c9a227',
    density: 'cozy',
    fontScale: 1,
    defaultView: 'live',
    seenSourceNotice: false,
  },
  rules: {
    keywordGroups: [
      { id: 'g1', name: '关键字组 1', enabled: true, mode: 'or', scopes: ['desc'], keywords: [] },
    ],
    groupLogic: 'and',
    excludeWords: [],
    worlds: [],
    datacenters: [],
    categories: [],
    playerWhitelist: [],
    playerBlacklist: [],
    whitelistOnly: false,
    playerMatchMode: 'contains',
    minSlots: 0,
    onlyCrossWorld: false,
    ignoreAlmostFull: false,
  },
  history: { max: 600 },
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** 轮询间隔只允许 30 / 60 / 90 / 120 四档；旧配置一律吸附到最近档位 */
const INTERVAL_CHOICES = [30, 60, 90, 120];
function snapInterval(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 60;
  return INTERVAL_CHOICES.reduce((best, cur) => (Math.abs(cur - n) < Math.abs(best - n) ? cur : best), 60);
}

/**
 * 按上游 about 页的约定生成 User-Agent：
 * 必须带项目名称，最好带联系方式，出问题时对方能找到人。
 */
function buildUserAgent(version, contact) {
  const c = String(contact || '').trim();
  const tail = c ? `; contact: ${c}` : '';
  return `PFWatcher/${version || '1.0'} (FF14-CN party finder desktop client${tail})`;
}

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isPlainObject(patch)) return patch === undefined ? out : patch;
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(base[k])) out[k] = deepMerge(base[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.configPath = path.join(dir, 'config.json');
    this.hitsPath = path.join(dir, 'hits.json');
    this.data = this._load();
    this.hits = this._loadHits();
  }

  _ensureDir() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch (_) {}
  }

  _readJSON(p, fallback) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {
      return fallback;
    }
  }

  _writeJSON(p, obj) {
    this._ensureDir();
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, p);
  }

  _load() {
    const saved = this._readJSON(this.configPath, null);
    const merged = deepMerge(DEFAULT_CONFIG, saved || {});
    merged.poll.intervalSec = snapInterval(merged.poll.intervalSec);
    merged.poll.manualCooldownSec = 10;
    return merged;
  }

  _loadHits() {
    const h = this._readJSON(this.hitsPath, null);
    return Array.isArray(h) ? h : [];
  }

  get() {
    return this.data;
  }

  patch(patch) {
    this.data = deepMerge(this.data, patch);
    if (patch && patch.poll && patch.poll.intervalSec !== undefined) {
      this.data.poll.intervalSec = snapInterval(this.data.poll.intervalSec);
    }
    this._writeJSON(this.configPath, this.data);
    return this.data;
  }

  reset() {
    const { window: w, source: s } = this.data;
    this.data = deepMerge(DEFAULT_CONFIG, {
      window: { bounds: w.bounds },
      source: { baseUrl: s.baseUrl },
    });
    this._writeJSON(this.configPath, this.data);
    return this.data;
  }

  addHits(records) {
    if (!records.length) return this.hits;
    this.hits = records.concat(this.hits).slice(0, this.data.history.max || 600);
    this._writeJSON(this.hitsPath, this.hits);
    return this.hits;
  }

  setHits(records) {
    this.hits = records.slice(0, this.data.history.max || 600);
    this._writeJSON(this.hitsPath, this.hits);
    return this.hits;
  }

  clearHits() {
    this.hits = [];
    this._writeJSON(this.hitsPath, []);
    return this.hits;
  }
}

module.exports = { Store, DEFAULT_CONFIG, deepMerge, snapInterval, buildUserAgent, INTERVAL_CHOICES };
