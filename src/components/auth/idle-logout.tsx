"use client";

import { useEffect, useRef } from "react";
import { signOutIdle } from "@/app/actions/auth";

// Auto sign-out after this many ms of no user activity.
const IDLE_MS = 30 * 60 * 1000; // 30 minutes

export function IdleLogout() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    const reset = () => {
      if (firedRef.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        firedRef.current = true;
        signOutIdle();
      }, IDLE_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  return null;
}
