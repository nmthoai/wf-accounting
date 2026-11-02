"use client";

import { useEffect } from "react";
import { signOutIdle } from "@/app/actions/auth";
import { isRedirect } from "@/lib/redirect-error";

// Auto sign-out after this many ms of no user activity.
const IDLE_MS = 30 * 60 * 1000; // 30 minutes
// After a failed sign-out (offline, server down), try again this much later.
const RETRY_MS = 60 * 1000;
// The last activity in any tab of the app, so working in one tab keeps the
// others signed in (signing out ends the session for every tab).
const KEY = "wf-last-activity";
const WRITE_EVERY_MS = 5000;

function readShared() {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(time: number) {
  try {
    localStorage.setItem(KEY, String(time));
  } catch {
    // Storage blocked: this tab counts its own activity only.
  }
}

export function IdleLogout() {
  useEffect(() => {
    let last = Date.now();
    let written = 0;
    let firing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const wait = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(check, ms);
    };
    // When the timer runs out, another tab may have been in use meanwhile.
    function check() {
      const idle = Date.now() - Math.max(last, readShared());
      if (idle < IDLE_MS) return wait(IDLE_MS - idle);
      firing = true;
      signOutIdle().catch((err) => {
        if (isRedirect(err)) return; // signed out: the page is leaving
        firing = false;
        wait(RETRY_MS);
      });
    }
    const onActivity = () => {
      if (firing) return;
      last = Date.now();
      if (last - written > WRITE_EVERY_MS) {
        written = last;
        writeShared(last);
      }
      wait(IDLE_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    onActivity();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, []);

  return null;
}
