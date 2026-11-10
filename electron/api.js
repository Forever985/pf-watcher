'use strict';

// 优先使用 Electron 的 net.fetch（走 Chromium 网络栈，能正确处理系统代理 / 证书 / DNS），
// 失败时再退到 Node 原生 fetch。
let electronNet = null;
try {
  electronNet = require('electron').net;
} catch (_) {
  electronNet = null;
}

const PER_PAGE = 100;

function makeSignal(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function rawFetch(url, headers, ms) {
  const { signal, done } = makeSignal(ms);
  try {
    if (electronNet && typeof electronNet.fetch === 'function') {
      return await electronNet.fetch(url, { headers, signal, cache: 'no-store' });
    }
    return await fetch(url, { headers, signal });
  } finally {
    done();
  }
}

async function getJson(url, userAgent, ms = 20000) {
  let res;
  try {
    res = await rawFetch(
      url,
      {
        'User-Agent': userAgent,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      ms
    );
  } catch (e) {
    // net.fetch 偶发失败时退回 Node fetch 再试一次
    if (electronNet && typeof globalThis.fetch === 'function') {
      res = await rawFetch(url, { 'User-Agent': userAgent, Accept: 'application/json' }, ms);
    } else {
      throw new Error('网络不可达：' + ((e && e.message) || e));
    }
  }

  if (res.status === 429) throw new Error('HTTP 429（请求过于频繁）');
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const text = await res.text();
  const head = text.replace(/^\uFEFF/, '').trimStart();
  if (!head.startsWith('{') && !head.startsWith('[')) {
    throw new Error('返回的不是 JSON（接口可能被拦截或域名已变更）');
  }
  try {
    return JSON.parse(head);
  } catch (e) {
    throw new Error('JSON 解析失败：' + ((e && e.message) || e));
  }
}

/** 带一次重试的请求，抵御偶发网络抖动 */
async function getJsonRetry(url, userAgent, ms = 20000) {
  try {
    return await getJson(url, userAgent, ms);
  } catch (e) {
    if (/HTTP 4\d\d/.test(String(e.message))) throw e;
    await new Promise((r) => setTimeout(r, 600));
    return getJson(url, userAgent, ms);
  }
}

function trimBase(u) {
  return String(u || '').trim().replace(/\/+$/, '');
}

/**
 * 拉取当前全部在招招募。逐页读取，按 id 去重。
 */
async function fetchAllListings(source, opts = {}) {
  const ua = (source && source.userAgent) || 'PFWatcher/1.0';
  const maxPages = Math.min(opts.maxPages || 8, 10);
  const bases = [trimBase(source && source.baseUrl)]
    .concat((source && source.fallbackUrls) || [])
    .map(trimBase)
    .filter(Boolean);

  let lastErr = null;
  const attempts = [];
  for (const base of bases) {
    try {
      const all = [];
      const seen = new Set();
      let page = 1;
      let totalPages = 1;
      let total = 0;
      do {
        const j = await getJsonRetry(`${base}/api/listings?page=${page}&per_page=${PER_PAGE}`, ua);
        const rows = Array.isArray(j.data) ? j.data : Array.isArray(j) ? j : null;
        if (!rows) throw new Error('返回格式异常');
        for (const r of rows) {
          if (r && r.id != null && !seen.has(r.id)) {
            seen.add(r.id);
            all.push(r);
          }
        }
        totalPages = (j.pagination && j.pagination.total_pages) || 1;
        total = (j.pagination && j.pagination.total) || all.length;
        page += 1;
      } while (page <= Math.min(totalPages, maxPages));

      if (!all.length) throw new Error('接口返回 0 条招募');
      return { listings: all, total, totalPages, base, fetchedAt: Date.now() };
    } catch (e) {
      lastErr = e;
      attempts.push(`${base.replace(/^https?:\/\//, '')} → ${(e && e.message) || e}`);
    }
  }
  const err = lastErr || new Error('网络请求失败');
  err.message = attempts.length > 1 ? attempts.join('；') : err.message;
  throw err;
}

async function fetchDetail(source, id) {
  const ua = (source && source.userAgent) || 'PFWatcher/1.0';
  const base = trimBase(source && source.baseUrl);
  return getJsonRetry(`${base}/api/listing/${encodeURIComponent(id)}`, ua, 15000);
}

async function testConnection(source) {
  const base = trimBase(source && source.baseUrl);
  const t0 = Date.now();
  const j = await getJsonRetry(`${base}/api/listings?page=1&per_page=1`, (source && source.userAgent) || 'PFWatcher/1.0', 12000);
  return {
    ok: true,
    base,
    ms: Date.now() - t0,
    total: (j.pagination && j.pagination.total) || (Array.isArray(j.data) ? j.data.length : 0),
  };
}

module.exports = { fetchAllListings, fetchDetail, testConnection, PER_PAGE };
