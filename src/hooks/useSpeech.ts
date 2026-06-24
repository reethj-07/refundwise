/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

// Whether the browser exposes SpeechRecognition. Read via useSyncExternalStore so
// it's SSR-safe (server snapshot is always false, so no hydration mismatch) without
// calling setState inside an effect. Support never changes, so we never resubscribe.
const subscribe = () => () => {};
const getSupported = () => {
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
};

// Browser Web Speech API — speech-to-text (SpeechRecognition) and
// text-to-speech (SpeechSynthesis). No external services, no API keys.
export function useSpeech() {
  const supported = useSyncExternalStore(subscribe, getSupported, () => false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const listen = useCallback((onResult: (text: string) => void) => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text) onResult(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  }, []);

  return { supported, listening, listen, stop, speak };
}
