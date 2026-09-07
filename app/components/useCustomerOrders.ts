"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { isActiveOrder, type CustomerOrder } from './order-model';

/** One authenticated read stream. Order/OTP data never enters browser storage. */
export function useCustomerOrders(email: string | undefined, enabled: boolean, historyOpen: boolean) {
  const [snapshot, setSnapshot] = useState<{ owner?: string; orders: CustomerOrder[]; error: string }>({ orders: [], error: '' });
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!email || !enabled) return;
    let alive = true;
    let pending = false;
    let unauthorized = false;
    let current: CustomerOrder[] = [];
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (alive && !unauthorized && !document.hidden && current.some(isActiveOrder)) timer = setTimeout(() => void refresh(), 25000);
    };
    const refresh = async () => {
      if (!alive || pending || document.hidden) return;
      clearTimeout(timer);
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15000);
      try {
        const response = await fetch('/api/orders/my', { cache: 'no-store', signal: controller.signal });
        if (!alive) return;
        if (response.status === 401 || response.status === 403) {
          unauthorized = true;
          current = [];
          setSnapshot({ owner: email, orders: [], error: 'Sign in again to view your orders.' });
          return;
        }
        if (!response.ok) throw new Error('Order refresh failed');
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid order response');
        if (!alive) return;
        current = data;
        unauthorized = false;
        setSnapshot({ owner: email, orders: current, error: '' });
      } catch {
        if (alive && !document.hidden) setSnapshot(previous => ({ owner: email, orders: previous.owner === email ? previous.orders : [], error: 'Updates paused. Your last order status is shown. Try again.' }));
      } finally { clearTimeout(timeout); pending = false; schedule(); }
    };
    refreshRef.current = refresh;
    const visibility = () => { if (document.hidden) { clearTimeout(timer); controller?.abort(); } else void refresh(); };
    const focus = () => void refresh();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', focus);
    void refresh();
    return () => { alive = false; controller?.abort(); clearTimeout(timer); refreshRef.current = async () => {}; document.removeEventListener('visibilitychange', visibility); window.removeEventListener('focus', focus); };
  }, [email, enabled]);
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => { if (historyOpen) void refresh(); }, [historyOpen, refresh]);
  const setOrders = useCallback((update: (orders: CustomerOrder[]) => CustomerOrder[]) => {
    setSnapshot(previous => previous.owner === email ? { ...previous, orders: update(previous.orders) } : previous);
  }, [email]);
  const visible = enabled && snapshot.owner === email;
  return { orders: visible ? snapshot.orders : [], error: visible ? snapshot.error : '', refresh, setOrders };
}
