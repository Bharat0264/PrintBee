"use client";
import { useEffect, useRef, useState } from 'react';
import { activeOrders, canShowOTP, contactNumber, isActiveOrder, isReport, orderStage, type CustomerOrder } from './order-model';
import { BeeMascot } from './PrintBeeExperience';

export function OrderJourney({ order }: { order: CustomerOrder }) {
  const { steps, index } = orderStage(order);
  return <ol className="order-journey" aria-label="Order progress">{steps.map(([status, label], i) => <li key={status} className={i < index ? 'complete' : i === index ? 'current' : ''} aria-current={i === index ? 'step' : undefined}><span aria-hidden="true">{i < index ? '✓' : i + 1}</span><strong>{label}</strong></li>)}</ol>;
}

export function ActiveOrderLinks({ orders, open }: { orders: CustomerOrder[]; open: () => void }) {
  const list = activeOrders(orders);
  if (!list.length) return null;
  return <section className="active-order-links" aria-label="Active orders"><h3>In progress · {list.length}</h3>{list.map(order => <button key={order.id} onClick={open}><strong>{order.order_number || 'Your order'}</strong><span>{orderStage(order).label} →</span></button>)}</section>;
}

export function OrderDocuments({ order }: { order: CustomerOrder }) {
  return <details className="active-documents"><summary>{order.items?.length || 0} order items · View print details</summary><ul>{order.items?.map((item, index) => <li key={index}><strong>{item.fileName || item.name || item.serviceName || item.reference || 'Order item'}</strong>{item.kind !== 'ADDON' && <span>{item.pages || 0} pages · {item.copies || 1} copies · {item.mode?.replaceAll('-', ' ')}</span>}</li>)}</ul></details>;
}

export function OTPCard({ order }: { order: CustomerOrder }) {
  if (!canShowOTP(order)) return null;
  return <section className="delivery-otp" aria-label="Delivery OTP"><span>Your delivery OTP</span><strong aria-label={`Delivery OTP: ${order.deliveryCode?.split('').join(' ')}`}>{order.deliveryCode}</strong><p>Share this OTP only after receiving your prints.</p></section>;
}

export function RiderCard({ order }: { order: CustomerOrder }) {
  if (!order.rider_name || isReport(order)) return null;
  const phone = contactNumber(order);
  return <section className="active-rider"><span className="rider-avatar" aria-hidden="true">{order.rider_name.charAt(0).toUpperCase()}</span><div><small>Your PrintBee partner</small><strong>{order.rider_name}</strong><span>Delivery partner assigned</span></div>{phone && <a href={`tel:${phone}`} aria-label={`Call ${order.rider_name}`}>Call partner</a>}</section>;
}

export function OrderScene({ status }: { status: string }) {
  return <div className={`order-scene scene-${status.toLowerCase()}`} aria-hidden="true"><span className="scene-paper">▤</span><span className="scene-printer"><b /><em /></span><span className="scene-package">▣</span><span className="scene-rider">🛵</span><span className="scene-home">⌂</span><i /></div>;
}

export function ActiveOrderWidget({ orders, hidden, email, error, refresh, details }: { orders: CustomerOrder[]; hidden: boolean; email: string; error: string; refresh: () => Promise<void>; details: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState<CustomerOrder | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [anotherDialog, setAnotherDialog] = useState(false);
  const previous = useRef<Map<string, string> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const list = activeOrders(orders);
  const order = notice?.id === selected && !isActiveOrder(notice) ? notice : list.find(item => item.id === selected) || list[0];
  useEffect(() => {
    const timer = setTimeout(() => { try { setExpanded(sessionStorage.getItem(`printbee-active-expanded:${email}`) === 'yes'); } catch {} }, 0);
    return () => clearTimeout(timer);
  }, [email]);
  useEffect(() => {
    const before = previous.current;
    const changed = orders.find(item => before?.has(item.id) && before.get(item.id) !== item.status);
    previous.current = new Map(orders.map(item => [item.id, item.status]));
    if (changed) {
      setNotice(changed); setSelected(changed.id);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), 8000);
    }
  }, [orders]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    const focus = () => setKeyboard(document.activeElement?.matches('input,textarea,select') || false);
    document.addEventListener('focusin', focus); document.addEventListener('focusout', focus);
    return () => { document.removeEventListener('focusin', focus); document.removeEventListener('focusout', focus); };
  }, []);
  useEffect(() => {
    const sync = () => setAnotherDialog(Boolean(document.querySelector('[role="dialog"]:not([data-active-order-dialog])')));
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList:true, subtree:true });
    return () => observer.disconnect();
  }, []);
  const visible = Boolean(order) && !hidden && !keyboard && !anotherDialog;
  useEffect(() => {
    document.documentElement.classList.toggle('has-active-widget', visible);
    return () => document.documentElement.classList.remove('has-active-widget');
  }, [visible]);
  const toggle = (value: boolean) => { setExpanded(value); try { sessionStorage.setItem(`printbee-active-expanded:${email}`, value ? 'yes' : 'no'); } catch {} };
  if (!order || !visible) return null;
  const { label } = orderStage(order);
  const position = Math.max(0, list.findIndex(item => item.id === order.id));
  return <>
    {expanded && <div className="active-order-backdrop" aria-hidden="true" onClick={() => toggle(false)} />}
    {notice && <button className="order-update-toast" onClick={() => toggle(true)}><span role="status">🐝 {orderStage(notice).label}</span><span>View order →</span></button>}
    <aside className={`active-order-widget ${expanded ? 'is-expanded' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} data-active-order-dialog aria-label="Your active order" onKeyDown={event => { if (event.key === 'Escape') toggle(false); }}>
      <button className="active-order-summary" aria-expanded={expanded} aria-controls="active-order-panel" onClick={() => toggle(!expanded)}><img src="/printbee-logo.png" width="44" height="44" alt="" /><span><small>{order.order_number || 'Your order'}{list.length > 1 ? ` · ${position + 1} of ${list.length}` : ''}</small><strong key={order.status}>{label}</strong><span>{expanded ? 'Minimize' : 'View order'} {expanded ? '↓' : '↑'}</span></span></button>
      {expanded && <section id="active-order-panel" className="active-order-panel" aria-label="Active order details">
        <button className="active-minimize" aria-label="Close active order" onClick={() => toggle(false)}>Minimize ↓</button>
        {list.length > 1 && <div className="active-order-switch"><button onClick={() => setSelected(list[(position + list.length - 1) % list.length].id)} aria-label="Previous active order">←</button><span>Order {position + 1} of {list.length}</span><button onClick={() => setSelected(list[(position + 1) % list.length].id)} aria-label="Next active order">→</button></div>}
        <RiderCard order={order} /><OTPCard order={order} />
        {notice?.id === order.id && notice.status === 'DELIVERED' ? <div className="delivery-celebration"><BeeMascot celebrate /><strong>Delivered! Hope your prints make your day easier 🐝</strong></div> : <OrderScene status={order.status} />}
        <OrderJourney order={order} />
        {isReport(order) && <p className="active-order-note">Your report is delivered on WhatsApp. No delivery OTP is needed.</p>}
        <details className="active-documents"><summary>{order.items?.length || 0} order items · View print details</summary><ul>{order.items?.map((item, index) => <li key={index}><strong>{item.fileName || item.name || item.serviceName || item.reference || 'Order item'}</strong>{item.kind !== 'ADDON' && <span>{item.pages || 0} pages · {item.copies || 1} copies · {item.mode?.replaceAll('-', ' ')}</span>}</li>)}</ul></details>
        <div className="active-order-total"><span>Order total · paid</span><strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.total_paise / 100)}</strong></div>
        {order.location_name && <p className="active-order-address">{order.location_name}</p>}
        {error && <p className="active-order-error" role="status">{error} <button onClick={() => void refresh()}>Retry updates</button></p>}
        <button className="primary-cta active-details" onClick={() => { toggle(false); details(); }}>Complete order details →</button>
      </section>}
    </aside>
  </>;
}
