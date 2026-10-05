import { useCallback, useEffect, useRef, useState } from 'react';
import { config } from '../config/config';

interface ToastItem {
  readonly key: number;
  readonly text: string;
}

export interface ToastApi {
  readonly items: readonly ToastItem[];
  readonly show: (text: string) => void;
}

export function useToasts(): ToastApi {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const nextKey = useRef(0);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);

  const show = useCallback((text: string) => {
    const key = nextKey.current++;
    setItems((current) => [...current, { key, text }]);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setItems((current) => current.filter((item) => item.key !== key));
    }, config.toast.durationSeconds * 1000);
    timers.current.add(timer);
  }, []);

  return { items, show };
}

export function Toasts({ items }: { readonly items: readonly ToastItem[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.key} className="toast">
          {item.text}
        </div>
      ))}
    </div>
  );
}
