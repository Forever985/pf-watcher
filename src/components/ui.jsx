import React, { useEffect, useRef, useState, forwardRef } from 'react';
import { cls } from '../lib/format.js';

export function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      className={cls('switch', checked && 'on')}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    />
  );
}

/** 只读标签：看起来就必须不像按钮（无边框、无 hover、无指针） */
export function Chip({ children, tone, onClick, onRemove, title, className }) {
  const act = !!(onClick || onRemove);
  return (
    <span
      className={cls('chip', tone, act && 'act', className)}
      onClick={onClick}
      title={title}
      role={act ? 'button' : undefined}
    >
      {children}
      {onRemove && (
        <span
          className="x"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </span>
      )}
    </span>
  );
}

export function SettingRow({ title, desc, children, align, stack }) {
  return (
    <div className={cls('setting-row', stack && 'stack')}>
      <div className="label">
        <b>{title}</b>
        {desc && <span>{desc}</span>}
      </div>
      <div className="ctl" style={align ? { alignItems: align } : undefined}>
        {children}
      </div>
    </div>
  );
}

export function PillGroup({ options, value, onChange, size }) {
  return (
    <div className={cls('pill-group', size === 'sm' && 'sm')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cls('pill', value === o.value && 'on')}
          onClick={() => onChange(o.value)}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 标签输入：回车 / 逗号 添加，支持粘贴多行 */
export function ChipInput({ value = [], onChange, placeholder, renderChip }) {
  const [draft, setDraft] = useState('');

  const commit = (raw) => {
    const parts = String(raw)
      .split(/[\n,，、;；|]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = value.slice();
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft('');
  };

  return (
    <div className="chipbox">
      {value.map((v) => (
        <span key={v} className="chip accent act chip-lg" title={v}>
          {renderChip ? renderChip(v) : v}
          <span className="x" onClick={() => onChange(value.filter((x) => x !== v))}>
            ×
          </span>
        </span>
      ))}
      <input
        value={draft}
        placeholder={placeholder || '输入后回车添加，可用逗号分隔'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && commit(draft)}
        onPaste={(e) => {
          const t = e.clipboardData.getData('text');
          if (/[\n,，;；]/.test(t)) {
            e.preventDefault();
            commit(t);
          }
        }}
      />
    </div>
  );
}

/** 带「一键清零」的输入框：有内容时尾部出现小 × */
export const Field = forwardRef(function Field(
  {
    value,
    onChange,
    placeholder,
    onEnter,
    onKeyDown,
    className,
    style,
    mono,
    autoFocus,
    onBlur,
    title,
    maxLength,
    type,
    clearAlways = true,
  },
  ref
) {
  const inner = useRef(null);
  const setRef = (el) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  return (
    <div className={cls('field', !clearAlways && 'clear-on-hover', className)} style={style}>
      <input
        ref={setRef}
        type={type || 'text'}
        value={value}
        placeholder={placeholder}
        title={title}
        maxLength={maxLength}
        autoFocus={autoFocus}
        className={mono ? 'mono' : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter(e);
          if (onKeyDown) onKeyDown(e);
        }}
      />
      {!!value && (
        <button
          type="button"
          className="field-clear"
          title="清空"
          tabIndex={-1}
          onClick={() => {
            onChange('');
            if (inner.current) inner.current.focus();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
});

/**
 * 下拉选择器。支持分组标题与「子菜单」式缩进项：
 * options 里的 { group } 只作分类标题（不可点），{ value } 才是可选项。
 */
export function Dropdown({ value, onChange, options = [], placeholder, width, disabled, title, icon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sel = options.find((o) => o && !o.group && !o.sep && o.value === value);
  const isAll = value === '' || value === undefined || value === null;
  const label = sel ? sel.label : placeholder || '全部';

  return (
    <div className={cls('dd', open && 'is-open', disabled && 'is-disabled')} ref={ref} style={width ? { width } : undefined}>
      <button
        type="button"
        className={cls('dd-trigger', isAll && 'is-all')}
        disabled={disabled}
        title={title || label}
        onClick={() => setOpen((v) => !v)}
      >
        {icon && <span className="dd-icon">{icon}</span>}
        <span className="dd-val">{label}</span>
        {sel && sel.sub && <span className="dd-sub">{sel.sub}</span>}
        {sel && sel.count != null && <span className="dd-count">{sel.count}</span>}
        <span className="dd-caret">▾</span>
      </button>

      {open && (
        <div className="dd-menu">
          {options.map((o, i) => {
            if (!o) return null;
            if (o.sep) return <div className="dd-sep" key={'s' + i} />;
            if (o.group) {
              return (
                <div className="dd-group" key={'g' + i + o.group}>
                  <span>{o.group}</span>
                  {o.hint && <i>{o.hint}</i>}
                </div>
              );
            }
            return (
              <button
                type="button"
                key={o.value}
                className={cls(
                  'dd-item',
                  o.value === value && 'on',
                  o.indent && 'indent',
                  o.note && 'has-note',
                  o.disabled && 'is-disabled'
                )}
                disabled={o.disabled}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="dd-item-main">
                  <span className="dd-item-label">{o.label}</span>
                  {o.note && <span className="dd-item-note">{o.note}</span>}
                </span>
                {o.sub && <span className="dd-item-sub">{o.sub}</span>}
                {o.count != null && <span className="dd-item-count">{o.count}</span>}
                {o.value === value && <span className="dd-item-tick">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, text, children, actions, onBackdrop, width }) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onBackdrop && onBackdrop();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onBackdrop]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onBackdrop && onBackdrop()}>
      <div className="modal" style={width ? { width } : undefined}>
        <div className="modal-body">
          <div className="modal-title">{title}</div>
          {text && <div className="modal-text">{text}</div>}
          {children}
        </div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}

export function Checkbox({ checked, onChange, children }) {
  return (
    <label className="remember">
      <span
        className={cls('cbx', checked && 'on')}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
      >
        ✓
      </span>
      {children}
    </label>
  );
}

export function useClickOutside(ref, cb) {
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) cb();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, cb]);
}
