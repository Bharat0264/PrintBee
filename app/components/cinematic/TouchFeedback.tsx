"use client";

import { useEffect, useRef, useState } from "react";

type Ripple = { id: number; x: number; y: number } | null;

/** Touch-only polish: never intercepts an action and only uses audio after a user gesture. */
export default function TouchFeedback() {
  const [ripple, setRipple] = useState<Ripple>(null);
  const clickAudio = useRef<HTMLAudioElement | null>(null);
  const clickAudioUrl = useRef<string | null>(null);
  const lastTouch = useRef(0);
  const lastSound = useRef(0);

  useEffect(() => {
    const isMobileTouch = () => window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const playMouseClick = () => {
      // Native audio playback is more dependable than Web Audio's unlock
      // policy in Chrome on iOS. Generate a tiny WAV once, then replay it.
      if (!clickAudio.current) {
        const rate = 11025, samples = Math.round(rate * .075), bytes = new ArrayBuffer(44 + samples * 2), view = new DataView(bytes);
        const text = (at: number, value: string) => [...value].forEach((character, index) => view.setUint8(at + index, character.charCodeAt(0)));
        text(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); text(8, "WAVEfmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples * 2, true);
        for (let index = 0; index < samples; index += 1) { const t = index / rate, envelope = Math.exp(-t * 55), signal = (Math.sin(t * Math.PI * 2 * 720) * .72 + (Math.random() * 2 - 1) * .28) * envelope; view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, signal)) * 32767, true); }
        clickAudioUrl.current = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
        clickAudio.current = new window.Audio(clickAudioUrl.current); clickAudio.current.volume = .9;
      }
      const audio = clickAudio.current; audio.currentTime = 0; void audio.play().catch(() => undefined);
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
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("touchstart", onTouchStart); document.removeEventListener("click", onClick, { capture: true }); if (clickAudioUrl.current) URL.revokeObjectURL(clickAudioUrl.current); };
  }, []);

  return ripple ? <i className="mobile-touch-ripple" aria-hidden="true" key={ripple.id} style={{ left: ripple.x, top: ripple.y }} onAnimationEnd={() => setRipple(null)} /> : null;
}
