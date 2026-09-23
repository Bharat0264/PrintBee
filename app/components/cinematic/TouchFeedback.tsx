"use client";

import { useEffect, useRef, useState } from "react";

type Ripple = { id: number; x: number; y: number } | null;

/** Touch-only polish: never intercepts an action and only uses audio after a user gesture. */
export default function TouchFeedback() {
  const [ripple, setRipple] = useState<Ripple>(null);
  const context = useRef<AudioContext | null>(null);
  const lastTouch = useRef(0);

  useEffect(() => {
    const isMobileTouch = () => window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const playKeyboardTap = () => {
      const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      const audio = context.current ?? new Audio();
      context.current = audio;
      const emit = () => {
        const now = audio.currentTime;
        const gain = audio.createGain();
        const tone = audio.createOscillator();
        // Dry, audible keyboard-tap feedback — intentionally short, with no
        // resonant glass/water tail.
        tone.type = "square";
        tone.frequency.setValueAtTime(1180, now);
        tone.frequency.exponentialRampToValueAtTime(760, now + .065);
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(.095, now + .003);
        gain.gain.exponentialRampToValueAtTime(.0001, now + .075);
        tone.connect(gain); gain.connect(audio.destination);
        tone.start(now); tone.stop(now + .08);
      };
      // Do not start an oscillator while the context is suspended: Chrome on
      // iOS silently discards it. Resume first, then emit the tap.
      if (audio.state === "running") emit();
      else void audio.resume().then(emit).catch(() => undefined);
    };
    const reactToTouch = (target: EventTarget | null, x: number, y: number, isTouch: boolean) => {
      const interactive = target instanceof Element ? target.closest("button,a,[role=button],[role=radio]") : null;
      if (!interactive || (interactive as HTMLButtonElement).disabled) return;
      const now = Date.now();
      if (now - lastTouch.current < 450) return;
      lastTouch.current = now;
      setRipple({ id: now, x, y });
      playKeyboardTap();
      if (isTouch && isMobileTouch() && "vibrate" in navigator) navigator.vibrate(Array.from({ length: 10 }, () => [45, 55]).flat());
    };
    const onPointerDown = (event: PointerEvent) => reactToTouch(event.target, event.clientX, event.clientY, event.pointerType !== "mouse");
    // Chrome on iOS can omit pointerdown for taps inside some composited cards.
    const onTouchStart = (event: TouchEvent) => { const touch = event.changedTouches[0]; if (touch) reactToTouch(event.target, touch.clientX, touch.clientY, true); };
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("touchstart", onTouchStart); context.current?.close(); };
  }, []);

  return ripple ? <i className="mobile-touch-ripple" aria-hidden="true" key={ripple.id} style={{ left: ripple.x, top: ripple.y }} onAnimationEnd={() => setRipple(null)} /> : null;
}
