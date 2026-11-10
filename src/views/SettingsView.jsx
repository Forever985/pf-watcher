import React, { useState } from 'react';
import { PillGroup, SettingRow, Switch, ChipInput, Chip, Field } from '../components/ui.jsx';
import { KeywordGroupsEditor, WorldPicker, PlayerListEditor, CategoryPicker } from '../components/RuleEditors.jsx';
import { cls } from '../lib/format.js';

const ACCENTS = ['#c9a227', '#d97757', '#5aa9e6', '#7ec97e', '#b57edc', '#e0578a', '#e8e6e1'];

function Section({ title, desc, children, right }) {
  return (
    <div className="panel section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px' }}>
        <div style={{ flex: 1 }}>
          <div className="section-title">{title}</div>
          {desc && <div className="section-desc">{desc}</div>}
        </div>
        {right}
      </div>
      <div className="divider" style={{ margin: 0 }} />
      {children}
    </div>
  );
}

export default function SettingsView({ config, catalog, patch, status, boot, listings, onPause, playSound, onReset, onToast }) {
  const [srcTest, setSrcTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const r = config.rules;
  const setRules = (p) => patch({ rules: p });

  const testSource = async () => {
    setTesting(true);
    setSrcTest(null);
    const res = await window.pf.testSource(config.source);
    setSrcTest(res);
    setTesting(false);
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* ── 监听规则 ── */}
      <Section
        title="监听规则 · 关键字"
        desc="分组的写法能把「内容」和「场景」分开，比如 A 组盯副本名、B 组盯「缺 T」"
      >
        <KeywordGroupsEditor
          groups={r.keywordGroups || []}
          groupLogic={r.groupLogic}
          onGroupLogic={(v) => setRules({ groupLogic: v })}
          onChange={(groups) => setRules({ keywordGroups: groups })}
        />
        <div className="divider" />
        <div style={{ padding: '0 16px 14px' }}>
          <div className="section-title" style={{ marginBottom: 4 }}>
            排除词
          </div>
          <div className="hint" style={{ marginBottom: 8 }}>
            命中这些词的招募直接忽略：代练、卖金、招募固定队广告……（对全部字段生效）
          </div>
          <ChipInput value={r.excludeWords || []} onChange={(v) => setRules({ excludeWords: v })} placeholder="输入排除词后回车" />
        </div>
      </Section>

      <Section title="监听规则 · 服务器" desc="不选 = 全服。选大区等于该大区下所有服务器">
        <div style={{ padding: '14px 16px' }}>
          <WorldPicker
            datacenters={catalog.datacenters}
            worlds={r.worlds || []}
            dcs={r.datacenters || []}
            onChange={(v) => setRules(v)}
          />
        </div>
      </Section>

      <Section title="监听规则 · 招募模块" desc="寻宝、讨伐战、高难度副本… 不选 = 全部模块">
        <div style={{ padding: '14px 16px' }}>
          <CategoryPicker
            catalog={catalog.categories}
            selected={r.categories || []}
            onChange={(v) => setRules({ categories: v })}
          />
        </div>
      </Section>

      <Section title="监听规则 · 玩家" desc="按招募发起者（队长）的玩家名过滤；同名跨服很常见，建议写成 名字@服务器">
        <PlayerListEditor rules={r} onChange={setRules} catalog={catalog} listings={listings} />
      </Section>

      <Section title="监听规则 · 人数与其他">
        <SettingRow title="最少空位" desc="招募至少还缺几个人才提醒，避免快满员的队伍">
          <select
            className="select"
            value={r.minSlots || 0}
            onChange={(e) => setRules({ minSlots: Number(e.target.value) })}
          >
            <option value={0}>不限</option>
            <option value={2}>≥ 2 个空位</option>
            <option value={3}>≥ 3 个空位</option>
            <option value={4}>≥ 4 个空位</option>
            <option value={6}>≥ 6 个空位</option>
          </select>
        </SettingRow>
        <SettingRow title="仅跨服招募" desc="只提醒勾了「跨服招募」的队伍（通常是同大区组队）">
          <Switch checked={!!r.onlyCrossWorld} onChange={(v) => setRules({ onlyCrossWorld: v })} />
        </SettingRow>
        <SettingRow title="过滤快满员的队伍" desc="已满 85% 以上的不提醒，减少无效点击">
          <Switch checked={!!r.ignoreAlmostFull} onChange={(v) => setRules({ ignoreAlmostFull: v })} />
        </SettingRow>
      </Section>

      {/* ── 轮询 ── */}
      <Section
        title="轮询与数据源"
        desc="客户端直接读取公开招募接口，不经过任何自建服务器；没有常驻服务、不写注册表"
      >
        <SettingRow
          title="轮询间隔"
          desc="数据源本身有几十秒上报延迟，30 秒已经追得很紧；间隔越短对数据源压力越大"
        >
          <PillGroup
            value={config.poll.intervalSec}
            onChange={(v) => patch({ poll: { intervalSec: v } })}
            options={[
              { value: 30, label: '30 秒' },
              { value: 60, label: '60 秒' },
              { value: 90, label: '90 秒' },
              { value: 120, label: '120 秒' },
            ]}
          />
        </SettingRow>
        <SettingRow
          title="立即刷新"
          desc={`主界面右上角的刷新按钮，点一次拉一次；冷却 ${Math.round(
            (config.poll.manualCooldownSec || 10) / 1
          )} 秒，冷却期间按钮上会显示倒计时`}
        >
          <span className="hint">冷却固定 10 秒，防止手抖连点</span>
        </SettingRow>
        <SettingRow title="监听状态" desc={status.paused ? '已暂停，不会拉取也不会提醒' : '正在后台轮询'}>
          <Switch checked={!status.paused} onChange={(v) => onPause(!v)} />
        </SettingRow>
        <SettingRow title="启动时提醒当前已符合条件的" desc="关闭时，启动瞬间就存在的招募只记入历史，不弹通知">
          <Switch checked={!!config.poll.notifyOnStart} onChange={(v) => patch({ poll: { notifyOnStart: v } })} />
        </SettingRow>
        <SettingRow title="接口地址" desc="默认使用国服公开 API，可换成自建后端">
          <Field
            className="w-320"
            value={config.source.baseUrl}
            onChange={(v) => patch({ source: { baseUrl: v } })}
            mono
          />
          <button className="btn sm" onClick={testSource} disabled={testing}>
            {testing ? '测试中…' : '测试连接'}
          </button>
        </SettingRow>
        {srcTest && (
          <div style={{ padding: '0 16px 14px' }}>
            <div className={cls('banner', !srcTest.ok && 'err')} style={{ margin: 0 }}>
              {srcTest.ok
                ? `连接正常 · 延迟 ${srcTest.ms}ms · 当前在招 ${srcTest.total} 条`
                : `连接失败：${srcTest.error}`}
            </div>
          </div>
        )}
      </Section>

      {/* ── 提醒 ── */}
      <Section title="提醒方式" desc="命中规则时怎么通知你">
        <SettingRow title="Windows 系统通知" desc="右下角弹出通知，点击可切回并定位到该招募">
          <Switch checked={!!config.notify.toast} onChange={(v) => patch({ notify: { toast: v } })} />
        </SettingRow>
        <SettingRow title="提示音" desc="窗口在托盘里也会响">
          <button className="btn sm" onClick={() => playSound()}>
            试听
          </button>
          <Switch
            checked={!!config.notify.sound}
            onChange={(v) => {
              patch({ notify: { sound: v } });
              if (v) setTimeout(playSound, 120);
            }}
          />
        </SettingRow>
        <SettingRow title="自定义提示音" desc={config.notify.soundFile || '当前使用内置音效'}>
          <button className="btn sm" onClick={() => window.pf.pickSound()}>
            选择文件
          </button>
          {config.notify.soundFile && (
            <button
              className="btn sm ghost"
              onClick={async () => {
                await window.pf.clearSound();
                onToast('已恢复内置音效');
              }}
            >
              恢复默认
            </button>
          )}
        </SettingRow>
        <SettingRow title="音量">
          <input
            className="range"
            type="range"
            min={0}
            max={100}
            value={Math.round((config.notify.volume ?? 0.7) * 100)}
            onChange={(e) => patch({ notify: { volume: Number(e.target.value) / 100 } })}
          />
          <span className="mono" style={{ width: 42, textAlign: 'right' }}>
            {Math.round((config.notify.volume ?? 0.7) * 100)}%
          </span>
        </SettingRow>
        <SettingRow title="任务栏闪烁" desc="窗口不在前台时闪一下任务栏，不看通知也能察觉">
          <Switch checked={!!config.notify.flashTaskbar} onChange={(v) => patch({ notify: { flashTaskbar: v } })} />
        </SettingRow>
        <SettingRow title="合并通知" desc="一次命中这么多条以上时，合成一条通知而不是连弹">
          <select
            className="select"
            value={config.notify.groupThreshold}
            onChange={(e) => patch({ notify: { groupThreshold: Number(e.target.value) } })}
          >
            <option value={2}>2 条</option>
            <option value={3}>3 条</option>
            <option value={5}>5 条</option>
            <option value={99}>从不合并</option>
          </select>
        </SettingRow>
        <SettingRow title="测试一下" desc="确认通知和声音都能正常工作">
          <button
            className="btn sm primary"
            onClick={async () => {
              await window.pf.testNotify();
              onToast('已发送测试通知');
            }}
          >
            发送测试
          </button>
        </SettingRow>
      </Section>

      {/* ── 窗口 ── */}
      <Section title="窗口行为" desc="关闭和最小化时怎么处理，改完立即生效">
        <SettingRow title="点右上角关闭时" desc="选「每次问我」时，关闭会弹窗让你现场选">
          <PillGroup
            value={config.window.closeAction}
            onChange={(v) => patch({ window: { closeAction: v } })}
            options={[
              { value: 'ask', label: '每次问我' },
              { value: 'tray', label: '最小化到托盘' },
              { value: 'quit', label: '直接退出' },
            ]}
          />
        </SettingRow>
        <SettingRow title="点最小化时" desc="最小化到托盘后任务栏不留图标，靠托盘图标唤回">
          <PillGroup
            value={config.window.minimizeAction}
            onChange={(v) => patch({ window: { minimizeAction: v } })}
            options={[
              { value: 'taskbar', label: '留任务栏' },
              { value: 'tray', label: '最小化到托盘' },
            ]}
          />
        </SettingRow>
        <SettingRow title="启动时直接进托盘" desc="开机自启或只想后台监听时打开">
          <Switch
            checked={!!config.window.startMinimized}
            onChange={(v) => patch({ window: { startMinimized: v } })}
          />
        </SettingRow>
        <SettingRow title="窗口置顶" desc="游戏用窗口化时，让监听器浮在上面">
          <Switch checked={!!config.window.alwaysOnTop} onChange={(v) => patch({ window: { alwaysOnTop: v } })} />
        </SettingRow>
      </Section>

      {/* ── 外观 ── */}
      <Section title="外观" desc="主题、布局、强调色都可以换，改成你喜欢的样子">
        <SettingRow title="明暗模式">
          <PillGroup
            value={config.ui.mode}
            onChange={(v) => patch({ ui: { mode: v } })}
            options={[
              { value: 'dark', label: '深色' },
              { value: 'light', label: '浅色' },
            ]}
          />
        </SettingRow>
        <SettingRow title="列表布局" desc="卡片适合浏览内容，表格适合快速扫读">
          <PillGroup
            value={config.ui.layout}
            onChange={(v) => patch({ ui: { layout: v } })}
            options={[
              { value: 'card', label: '卡片' },
              { value: 'table', label: '表格' },
            ]}
          />
        </SettingRow>
        <SettingRow title="强调色">
          <div className="swatches">
            {ACCENTS.map((c) => (
              <button
                key={c}
                className={cls('swatch', config.ui.accent === c && 'on')}
                style={{ background: c }}
                onClick={() => patch({ ui: { accent: c } })}
              />
            ))}
            <input
              type="color"
              value={config.ui.accent}
              onChange={(e) => patch({ ui: { accent: e.target.value } })}
              style={{
                width: 26,
                height: 24,
                border: '1px solid var(--border)',
                borderRadius: 7,
                background: 'var(--panel-2)',
                cursor: 'pointer',
                padding: 1,
              }}
              title="自定义颜色"
            />
          </div>
        </SettingRow>
        <SettingRow title="密度">
          <PillGroup
            value={config.ui.density}
            onChange={(v) => patch({ ui: { density: v } })}
            options={[
              { value: 'cozy', label: '舒适' },
              { value: 'compact', label: '紧凑' },
            ]}
          />
        </SettingRow>
        <SettingRow title="字号">
          <input
            className="range"
            type="range"
            min={90}
            max={125}
            step={5}
            value={Math.round((config.ui.fontScale || 1) * 100)}
            onChange={(e) => patch({ ui: { fontScale: Number(e.target.value) / 100 } })}
          />
          <span className="mono" style={{ width: 42, textAlign: 'right' }}>
            {Math.round((config.ui.fontScale || 1) * 100)}%
          </span>
        </SettingRow>
      </Section>

      {/* ── 关于 ── */}
      <Section title="数据与关于" desc={`版本 ${boot.version} · 配置目录：${boot.dataDir}`}>
        <div className="about">
          <div className="about-lead">
            <div className="about-h">这些招募不是抓来的，是玩家一条条传上来的</div>
            <div className="about-p">
              某个大区看着是空的，通常不是没人开队，而是那一刻没人在线开着上报插件。
              本工具只读公开接口，一条数据都不产生——你能看到多少，取决于社区里有多少人愿意开着插件。
            </div>
          </div>

          <div className="about-flow">
            <div className="fl-step">
              <span className="fl-n">1</span>
              <span className="fl-t">在线玩家打开招募板</span>
              <span className="fl-d">游戏内的招募内容被读出来</span>
            </div>
            <div className="fl-arrow">›</div>
            <div className="fl-step">
              <span className="fl-n">2</span>
              <span className="fl-t">匿名传到上游服务器</span>
              <span className="fl-d">只传招募内容，不知道是谁</span>
            </div>
            <div className="fl-arrow">›</div>
            <div className="fl-step">
              <span className="fl-n">3</span>
              <span className="fl-t">汇总成公开接口</span>
              <span className="fl-d">本工具每 60 秒读一次</span>
            </div>
          </div>

          <div className="about-block">
            <div className="about-h">原站与作者</div>
            <div className="about-p">
              数据、网页和上报插件都是别人做的，本程序只是这些数据的一个本地看板。
              想直接查招募、反馈问题或看源码，从下面这些地址进：
            </div>
            <div className="about-links">
              <button className="btn sm" onClick={() => window.pf.openExternal('https://xivpf.ff14.xin/')}>
                招募查询网页
              </button>
              <button
                className="btn sm"
                onClick={() => window.pf.openExternal('https://github.com/LittleNightmare/remote-party-finder')}
              >
                国服后端 / 上报插件
              </button>
              <button
                className="btn sm"
                onClick={() => window.pf.openExternal('https://github.com/Cindy-Master/remote-party-finder-frontend')}
              >
                国服前端
              </button>
              <button
                className="btn sm"
                onClick={() => window.pf.openExternal('https://git.anna.lgbt/ascclemens/remote-party-finder')}
              >
                国际服原项目
              </button>
              <button
                className="btn sm"
                onClick={() => window.pf.openExternal('https://bbs.nga.cn/read.php?tid=36684573')}
              >
                作者答疑帖
              </button>
            </div>
          </div>

          <details className="about-fold">
            <summary>我想帮忙上传数据，该怎么做</summary>
            <div className="about-p">
              上报端是 Dalamud 插件（国服叫「卫月」）里的 <code>RemotePartyFinder</code>。它在 Dalamud
              官方插件库里，名字叫「Remote Party Finder Uploader」，下载量四万多——但官方库那一版默认传到国际服
              （xivpf.com）。
            </div>
            <div className="about-p">
              国服分支（源码在国服后端仓库的 <code>csharp/</code> 目录）只动了默认上传地址和国服游戏数据，
              没有发布编译好的包。所以国服这边有两条路：自己编这个分支，或者装官方库那一版、
              在插件设置里勾上「Enable Advanced Settings」，再手动加一条
              <code>https://xivpf.littlenightmare.top/contribute/multiple</code>。
            </div>
            <div className="about-p">
              官方库里的这一项默认是隐藏的，插件列表里要勾上「显示隐藏插件」才看得到。
            </div>
            <div className="about-p">
              隐私上不用担心：上传的只有招募板上的公开内容，服务端不知道是谁传的，这是作者自己的说法。
            </div>
          </details>

          <div className="about-block">
            <div className="about-h">给上游留个联系方式（可选）</div>
            <div className="about-p">
              上游要求每个调用方在请求头里写明项目名和联系方式，出问题时好找到人。填了会拼进 User-Agent，
              不填也能正常用。
            </div>
            <div style={{ maxWidth: 420, marginTop: 8 }}>
              <Field
                value={config.source.contact || ''}
                onChange={(v) => patch({ source: { contact: v } })}
                placeholder="邮箱或主页，可留空"
              />
            </div>
            <div className="about-mono">
              当前请求标识：PFWatcher/{boot.version} (FF14-CN party finder desktop client
              {config.source.contact ? `; contact: ${config.source.contact}` : ''})
            </div>
          </div>

          <div className="about-foot">
            <div className="about-p" style={{ flex: 1 }}>
              本程序非官方，与 Square Enix、盛趣游戏及上述项目的作者均无隶属关系。
              不修改游戏、不注入进程、不注册系统服务，所有规则与记录只存在本机。
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => window.pf.openDataDir()}>
              打开配置文件夹
            </button>
            <button className="btn sm" onClick={() => window.pf.pollNow()}>
              立即刷新一次
            </button>
            <button
              className="btn sm ghost danger"
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                if (confirm('恢复默认会清空所有监听规则与外观设置（不影响命中记录），确定？')) onReset();
              }}
            >
              恢复默认设置
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}
