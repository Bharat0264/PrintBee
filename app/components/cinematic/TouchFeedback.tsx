"use client";

import { useEffect, useRef, useState } from "react";

type Ripple = { id: number; x: number; y: number } | null;

/** Touch-only polish: never intercepts an action and only uses audio after a user gesture. */
export default function TouchFeedback() {
  const [ripple, setRipple] = useState<Ripple>(null);
  const context = useRef<AudioContext | null>(null);
  const lastTouch = useRef(0);
  const lastSound = useRef(0);

  useEffect(() => {
    const isMobileTouch = () => window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const playMouseClick = () => {
      const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      const audio = context.current ?? new Audio();
      context.current = audio;
      const emit = () => {
        const now = audio.currentTime;
        const gain = audio.createGain();
        const tone = audio.createOscillator();
        // A crisp mouse click: a short down/up transient, audible on mobile
        // and desktop without the old glass or water-like resonance.
        tone.type = "square";
        tone.frequency.setValueAtTime(920, now);
        tone.frequency.exponentialRampToValueAtTime(420, now + .085);
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(.16, now + .002);
        gain.gain.exponentialRampToValueAtTime(.0001, now + .095);
        tone.connect(gain); gain.connect(audio.destination);
        tone.start(now); tone.stop(now + .1);
      };
      // Click is a user-activation event in Chrome, Safari, Windows and macOS.
      // Starting an inaudible oscillator first unlocks the context reliably on
      // iOS before the audible click is emitted.
      if (audio.state !== "running") {
        const unlock = audio.createOscillator(), silent = audio.createGain();
        silent.gain.value = .0001; unlock.connect(silent); silent.connect(audio.destination);
        unlock.start(); unlock.stop(audio.currentTime + .01);
        void audio.resume().then(emit).catch(() => undefined);
      } else emit();
    };
    const reactToTouch = (target: EventTarget | null, x: number, y: number, isTouch: boolean) => {
      const interactive = target instanceof Element ? target.closest("button,a,[role=button],[role=radio]") : null;
      if (!interactive || (interactive as HTMLButtonElement).disabled) return;
      const now = Date.now();
      if (now - lastTouch.current < 450) return;
      lastTouch.current = now;
      setRipple({ id: now, x, y });
      if (isTouch && isMobileTouch() && "vibrate" in navigator) navigator.vibrate(Array.from({ length: 10 }, () => [45, 55]).flat());
    };
    const onPointerDown = (event: PointerEvent) => reactToTouch(event.target, event.clientX, event.clientY, event.pointerType !== "mouse");
    // Chrome on iOS can omit pointerdown for taps inside some composited cards.
    const onTouchStart = (event: TouchEvent) => { const touch = event.changedTouches[0]; if (touch) reactToTouch(event.target, touch.clientX, touch.clientY, true); };
    const onClick = (event: MouseEvent) => {
      const interactive = event.target instanceof Element ? event.target.closest("button,a,[role=button],[role=radio]") : null;
      if (!interactive || (interactive as HTMLButtonElement).disabled || Date.now() - lastSound.current < 90) return;
      lastSound.current = Date.now(); playMouseClick();
    };
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("click", onClick, { capture: true });
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("touchstart", onTouchStart); document.removeEventListener("click", onClick, { capture: true }); context.current?.close(); };
  }, []);

  return ripple ? <i className="mobile-touch-ripple" aria-hidden="true" key={ripple.id} style={{ left: ripple.x, top: ripple.y }} onAnimationEnd={() => setRipple(null)} /> : null;
}
