import { useEffect, useRef, useState } from 'react';

/** 持久化在 localStorage 里的状态（重启不丢） */
export function useLocalState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ...initial, ...parsed };
      return parsed;
    } catch (_) {
      return initial;
    }
  });

  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {
        /* 存不下就算了，不影响使用 */
      }
    }, 220);
    return () => clearTimeout(timer.current);
  }, [key, value]);

  return [value, setValue];
}
