import React, { useEffect, useState } from 'react';
import { cls, remainText, remainTone, localTime } from '../lib/format.js';
import { Place } from './ListingCard.jsx';

const JOB_CN = {
  GLA: '剑术', PGL: '格斗', MRD: '斧术', LNC: '枪术', ARC: '弓术', CNJ: '幻术', THM: '咒术',
  PLD: '骑士', MNK: '武僧', WAR: '战士', DRG: '龙骑', BRD: '吟游', WHM: '白魔', BLM: '黑魔',
  ACN: '秘术', SMN: '召唤', SCH: '学者', ROG: '双剑', NIN: '忍者', MCH: '机工', DRK: '暗骑',
  AST: '占星', SAM: '武士', RDM: '赤魔', BLU: '青魔', GNB: '绝枪', DNC: '舞者', RPR: '钐镰',
  SGE: '贤者', VPR: '蛇刃', PCT: '绘灵',
};

const ROLE_CN = { Tank: '防护', Healer: '治疗', DPS: '输出', Crafter: '制作', Gatherer: '采集' };

export default function DetailDrawer({ item, onClose, onToast }) {
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setErr('');
    if (!item) return;
    window.pf
      .getDetail(item.id)
      .then((r) => {
        if (!alive) return;
        if (r && r.ok) setDetail(r.data);
        else setErr((r && r.error) || '详情拉取失败');
      })
      .catch((e) => alive && setErr(String(e.message || e)));
    return () => {
      alive = false;
    };
  }, [item && item.id]);

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!item) return null;

  const d = detail || item;
  const slots = (detail && detail.slots) || [];

  const copyText = async (text, label) => {
    await window.pf.copy(text);
    onToast && onToast(label + '已复制');
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>{item.name}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Place dc={item.dc} world={item.world} />
              <span className="chip">{item.category_label}</span>
              {item.is_cross_world && <span className="chip">跨服招募</span>}
              {item.is_alliance_raid && <span className="chip">团队任务</span>}
              {item.beginners_welcome && <span className="chip ok">欢迎初见</span>}
            </div>
          </div>
          <button className="btn sm" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="drawer-body">
          {err && (
            <div className="banner err" style={{ marginBottom: 14 }}>
              拉取详情失败（{err}），以下为列表缓存信息
            </div>
          )}

          <div className="kv">
            <div className="k">所在服务器</div>
            <div className="v">
              <Place dc={item.dc} world={item.world} />
              {item.created_world_n && item.created_world_n !== item.world ? (
                <span className="hint"> （原始服 {item.created_world_n}）</span>
              ) : null}
            </div>
            <div className="k">招募模块</div>
            <div className="v">{item.category_label}</div>
            <div className="k">任务 / 副本</div>
            <div className="v">{item.duty && item.duty !== '无' ? item.duty : '未指定'}</div>
            <div className="k">人数</div>
            <div className="v">
              {item.slots_filled} / {item.slots_available} 人
            </div>
            <div className="k">剩余时间</div>
            <div className={cls('v', remainTone(item.time_left))}>{remainText(item.time_left)}</div>
            <div className="k">最低装等</div>
            <div className="v">{item.min_item_level ? 'iLv ' + item.min_item_level : '不限'}</div>
            <div className="k">更新时间</div>
            <div className="v mono">{localTime(item.updated_at)}</div>
            <div className="k">招募 ID</div>
            <div className="v mono">{item.id}</div>
          </div>

          <div className="section-title" style={{ marginBottom: 7 }}>
            招募内容
          </div>
          <div className="desc-block">{item.description || '（无描述）'}</div>

          {slots.length > 0 && (
            <>
              <div className="section-title" style={{ marginBottom: 7 }}>
                职业位置
              </div>
              <div className="slot-grid">
                {slots.map((s, i) => {
                  const jobs = String(s.job || '')
                    .split(' ')
                    .filter(Boolean);
                  const label = jobs.length > 2 ? ROLE_CN[s.role] || s.role : jobs.map((j) => JOB_CN[j] || j).join('/');
                  return (
                    <span key={i} className={cls('slot', s.filled && 'filled')} title={s.job}>
                      {label || '任意'}
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="src-line">
          本条目来自 xivpf 社区众包
          <button onClick={() => window.pf.openExternal('https://xivpf.ff14.xin/about')}>数据来源</button>
        </div>

        <div className="drawer-foot">
          <button className="btn primary" onClick={() => copyText(item.description || '', '招募内容')}>
            复制招募内容
          </button>
          <button
            className="btn"
            onClick={() =>
              copyText(
                `【${item.category_label}】${item.world} · ${item.name}\n${item.description || ''}`,
                '完整信息'
              )
            }
          >
            复制整条
          </button>
          <button
            className="btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => window.pf.openExternal(`https://xivpf.ff14.xin/listing/${item.id}`)}
          >
            网页查看
          </button>
        </div>
      </aside>
    </>
  );
}
