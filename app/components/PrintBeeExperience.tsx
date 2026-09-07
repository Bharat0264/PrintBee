"use client";

import { useEffect, useRef } from "react";

/** CSS-only dimensional mascot: no canvas, animation loop or graphics dependency. */
export function BeeMascot({ celebrate = false }: { celebrate?: boolean }) {
  return <div className={`bee-scene ${celebrate ? "bee-celebrate" : ""}`} aria-hidden="true"><div className="bee-wing wing-left" /><div className="bee-wing wing-right" /><div className="bee-body"><i className="bee-eye" /><i className="bee-eye" /><i className="bee-smile" /></div><div className="bee-shadow" /></div>;
}

export function DocumentPreview({ pages, copies, colour, doubleSided, file }: { pages: number; copies: number; colour: boolean; doubleSided: boolean; file: File | null }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return;
    const url = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const hasImage = file && /^image\/(jpeg|png|webp)$/.test(file.type);
  return <div className="document-preview"><div className={`paper-stack ${colour ? "is-colour" : ""} ${doubleSided ? "is-duplex" : ""}`} aria-hidden="true">{Array.from({ length: Math.min(5, Math.max(1, Math.ceil(pages * copies / 20))) }, (_, i) => <i key={i} style={{ transform: `translate(${i * 3}px, ${i * -3}px)` }} />)}<div className="paper-face">{hasImage ? <img ref={imageRef} alt="" /> : <><b>A4</b><span /><span /><span /><span /></>}</div></div><div><strong>Your print, at a glance</strong><p>{pages} {pages === 1 ? "page" : "pages"} · {copies} {copies === 1 ? "copy" : "copies"}</p><small>{colour ? "Colour" : "Black & white"} · {doubleSided ? "Double-sided" : "Single-sided"}</small><small>Illustrative preview · original file layout retained</small></div></div>;
}

export function MobileNavigation({ orders, profile, cartCount }: { orders: () => void; profile: () => void; cartCount: number }) {
  return <nav className="mobile-dock" aria-label="Quick navigation"><a href="#top"><span aria-hidden="true">⌂</span>Home</a><button onClick={orders}><span aria-hidden="true">▤</span>Orders</button><a className="dock-upload" href="#upload"><span aria-hidden="true">↑</span>Upload</a><a href="#cart"><span aria-hidden="true">▱</span>Cart{cartCount > 0 && <b>{cartCount}</b>}</a><button onClick={profile}><span aria-hidden="true">☺</span>Account</button></nav>;
}

/** Keyboard containment and focus restoration for existing conditional dialogs. */
export function DialogAccessibility() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    let previous: HTMLElement | null = null;
    const sync = () => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      const next = dialogs.item(dialogs.length - 1);
      if (next === active) return;
      if (next) { previous = document.activeElement as HTMLElement; active = next; active.tabIndex = -1; active.focus(); }
      else { active = null; if (previous?.isConnected) previous.focus(); }
    };
    const key = (event: KeyboardEvent) => {
      if (!active) return;
      if (event.key === "Escape") { active.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click(); return; }
      if (event.key !== "Tab") return;
      const items = [...active.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === active)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === active)) { event.preventDefault(); first.focus(); }
    };
    const observer = new MutationObserver(sync); observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", key); sync();
    return () => { observer.disconnect(); document.removeEventListener("keydown", key); };
  }, []);
  return null;
}
