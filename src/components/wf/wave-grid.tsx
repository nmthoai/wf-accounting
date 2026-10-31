"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// The dotted grid that waves and curls behind every screen. Dots on a 26px lattice
// (22px on phones) move with two travelling waves (the height) and a curl field, so
// they swirl around drifting eddies instead of bunching. Crests light in --wave-crest;
// about one dot in 170 is an agent that glows --wave-agent as a crest passes.
// Calm behind the books; full strength on sign-in and onboarding, where it swirls
// around the pointer. 30 fps, paused in a hidden tab, one still frame under reduced
// motion or when "Moving background" is off.

export const MOTION_KEY = "wf-motion";
export const MOTION_EVENT = "wf-motion-change";

const HERO_PATHS = ["/login", "/onboard", "/setup-2fa"];
const B = 8;
const TAU = Math.PI * 2;
const FRAME_MS = 1000 / 30;
const STILL_T = 11.5;

type RGB = [number, number, number];

function parse(v: string, fb: RGB): RGB {
  v = v.trim();
  if (v.charAt(0) === "#") {
    let h = v.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h.slice(0, 6), 16);
    if (!isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = v.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length >= 3) return [p[0], p[1], p[2]];
  }
  return fb;
}

function hash(i: number, j: number) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function motionOn() {
  try {
    return localStorage.getItem(MOTION_KEY) !== "off";
  } catch {
    return true;
  }
}

export function WaveGrid() {
  const ref = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  const isHero = HERO_PATHS.some((p) => pathname.startsWith(p));
  const heroTarget = useRef(isHero ? 1 : 0);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const root = document.documentElement;

    let pal = { dot: [100, 116, 139] as RGB, crest: [56, 189, 248] as RGB, agent: [251, 146, 60] as RGB, strength: 0.55 };
    function readPalette() {
      const cs = getComputedStyle(root);
      pal = {
        dot: parse(cs.getPropertyValue("--wave-dot"), [100, 116, 139]),
        crest: parse(cs.getPropertyValue("--wave-crest"), [56, 189, 248]),
        agent: parse(cs.getPropertyValue("--wave-agent"), [251, 146, 60]),
        strength: parseFloat(cs.getPropertyValue("--wave-strength")) || 0.55,
      };
    }

    let W = 0, H = 0, cols = 0, rows = 0;
    let colX = new Float32Array(0), rowY = new Float32Array(0);
    let sX1 = colX, cX1 = colX, sX2 = colX, cX2 = colX, sXc = colX, cXc = colX, colS = colX, colC = colX;
    let rowA = rowY, rowB = rowY, rowC = rowY, rowD = rowY, rowE = rowY, rowF = rowY, rowG = rowY, rowH = rowY;
    let agents = new Uint8Array(0);
    let buf: Float32Array[] = [];
    const count = new Int32Array(3 * B);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const S = W < 640 ? 22 : 26;
      cols = Math.ceil(W / S) + 3;
      rows = Math.ceil(H / S) + 3;
      const ox = (W - (cols - 1) * S) / 2, oy = (H - (rows - 1) * S) / 2;
      colX = new Float32Array(cols); rowY = new Float32Array(rows);
      sX1 = new Float32Array(cols); cX1 = new Float32Array(cols); sX2 = new Float32Array(cols); cX2 = new Float32Array(cols);
      sXc = new Float32Array(cols); cXc = new Float32Array(cols); colS = new Float32Array(cols); colC = new Float32Array(cols);
      for (let i = 0; i < cols; i++) {
        const x = ox + i * S;
        colX[i] = x;
        sX1[i] = Math.sin(x * 0.0058); cX1[i] = Math.cos(x * 0.0058);
        sX2[i] = Math.sin(-x * 0.0031); cX2[i] = Math.cos(-x * 0.0031);
        sXc[i] = Math.sin(x * 0.7 * 0.0033); cXc[i] = Math.cos(x * 0.7 * 0.0033);
      }
      rowA = new Float32Array(rows); rowB = new Float32Array(rows); rowC = new Float32Array(rows); rowD = new Float32Array(rows);
      rowE = new Float32Array(rows); rowF = new Float32Array(rows); rowG = new Float32Array(rows); rowH = new Float32Array(rows);
      for (let j = 0; j < rows; j++) rowY[j] = oy + j * S;
      agents = new Uint8Array(cols * rows);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) agents[j * cols + i] = hash(i, j) < 0.006 ? 1 : 0;
      buf = [];
      for (let k = 0; k < 3 * B; k++) buf.push(new Float32Array(cols * rows * 2));
    }

    let hero = heroTarget.current;
    const ptr = { x: -1e5, y: -1e5, on: false, glow: 0 };

    function draw(t: number) {
      const amp = 7 + 5 * hero, lift = 5 + 3 * hero;
      const a = 0.0046, b = 0.0046, c = 0.0033;
      for (let i = 0; i < cols; i++) { const u = colX[i] * a + t * 0.21; colS[i] = Math.sin(u); colC[i] = Math.cos(u); }
      for (let j = 0; j < rows; j++) {
        const y = rowY[j];
        const w1 = y * 0.0036 - t * 0.55; rowA[j] = Math.sin(w1); rowB[j] = Math.cos(w1);
        const w2 = y * 0.0071 + t * 0.37 + 1.7; rowC[j] = Math.sin(w2); rowD[j] = Math.cos(w2);
        const v = y * b - t * 0.17; rowE[j] = Math.sin(v); rowF[j] = Math.cos(v);
        const q = t * 0.13 - y * c; rowG[j] = Math.sin(q); rowH[j] = Math.cos(q);
      }
      count.fill(0);
      const R = 190, R2 = R * R, usePtr = ptr.on && hero > 0.05;
      for (let j = 0; j < rows; j++) {
        const y0 = rowY[j];
        for (let i = 0; i < cols; i++) {
          const x0 = colX[i];
          let h = 0.62 * (sX1[i] * rowB[j] + cX1[i] * rowA[j]) + 0.38 * (sX2[i] * rowD[j] + cX2[i] * rowC[j]);
          const g = cXc[i] * rowH[j] - sXc[i] * rowG[j];
          const dpdx = a * colC[i] * rowF[j] + 0.42 * c * g;
          const dpdy = -b * colS[i] * rowE[j] - 0.6 * c * g;
          let dx = (amp * dpdy) / a + lift * 0.35 * h;
          let dy = (-amp * dpdx) / a + lift * h;
          if (usePtr) {
            const rx = x0 - ptr.x, ry = y0 - ptr.y, d2 = rx * rx + ry * ry;
            if (d2 < R2 * 2.2) {
              const f = Math.exp(-d2 / R2) * hero * ptr.glow, d = Math.sqrt(d2) + 1;
              dx += (-ry / d) * f * 16 + (rx / d) * f * 4;
              dy += (rx / d) * f * 16 + (ry / d) * f * 4;
              h += f * 1.1;
            }
          }
          const qn = h > 1 ? 1 : h < -1 ? 0 : (h + 1) / 2;
          const k = (qn * (B - 1) + 0.5) | 0;
          let layer = 0;
          if (agents[j * cols + i] && qn > 0.58) layer = 2;
          else if (qn > 0.87) layer = 1;
          const slot = layer * B + k, n = count[slot], arr = buf[slot];
          arr[n * 2] = x0 + dx; arr[n * 2 + 1] = y0 + dy; count[slot] = n + 1;
        }
      }
      ctx!.clearRect(0, 0, W, H);
      const strength = pal.strength * (0.78 + 0.22 * hero);
      const colours = [pal.dot, pal.crest, pal.agent];
      for (let L = 0; L < 3; L++) {
        const col = colours[L];
        for (let kk = 0; kk < B; kk++) {
          const cnt = count[L * B + kk];
          if (!cnt) continue;
          const qq = kk / (B - 1);
          const alpha = L === 0 ? strength * (0.14 + 0.86 * Math.pow(qq, 1.6))
            : L === 1 ? Math.min(1, strength * (0.85 + 0.6 * qq))
            : Math.min(1, strength * (1.05 + 0.6 * qq));
          const r = (L === 2 ? 1.25 : 0.7) + (1.05 + 0.35 * hero) * qq;
          ctx!.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha.toFixed(3)})`;
          ctx!.beginPath();
          const pts = buf[L * B + kk];
          for (let p = 0; p < cnt; p++) {
            const px = pts[p * 2], py = pts[p * 2 + 1];
            ctx!.moveTo(px + r, py);
            ctx!.arc(px, py, r, 0, TAU);
          }
          ctx!.fill();
        }
      }
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0, last = 0, t = 8, frames = 0;
    const still = () => reduced.matches || !motionOn();

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS - 1) return;
      const dt = Math.min(0.1, last ? (now - last) / 1000 : FRAME_MS / 1000);
      last = now;
      t += dt;
      hero += (heroTarget.current - hero) * Math.min(1, dt * 2);
      ptr.glow += ((ptr.on ? 1 : 0) - ptr.glow) * Math.min(1, dt * 3);
      if (++frames % 30 === 0) readPalette();
      draw(t);
    }
    function start() {
      cancelAnimationFrame(raf);
      raf = 0;
      if (still()) {
        hero = heroTarget.current;
        draw(STILL_T);
        return;
      }
      if (document.visibilityState === "hidden") return;
      last = 0;
      raf = requestAnimationFrame(loop);
    }

    const onMove = (e: PointerEvent) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; };
    const onLeave = () => { ptr.on = false; };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { cancelAnimationFrame(raf); raf = 0; } else start();
    };
    const onResize = () => { resize(); if (still()) draw(STILL_T); };
    const observer = new MutationObserver(() => { readPalette(); if (still()) draw(STILL_T); });

    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    window.addEventListener(MOTION_EVENT, start);
    reduced.addEventListener("change", start);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    readPalette();
    resize();
    start();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      window.removeEventListener(MOTION_EVENT, start);
      reduced.removeEventListener("change", start);
      observer.disconnect();
    };
  }, []);

  // The strength follows the route; a still frame needs a redraw for it.
  useEffect(() => {
    heroTarget.current = isHero ? 1 : 0;
    if (!motionOn() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.dispatchEvent(new Event(MOTION_EVENT));
    }
  }, [isHero]);

  return <canvas ref={ref} className="wf-wave" aria-hidden="true" />;
}
