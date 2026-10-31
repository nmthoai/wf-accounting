// The colour theme: a cookie the server reads, so the first paint is already right.
// "system" follows the device; the server can't see the device, so it renders dark
// and THEME_SCRIPT corrects it before paint.
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "wf-theme";

export function parseTheme(value: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "dark";
}

/** The theme the page shows for a choice, without the device (system → dark). */
export function serverTheme(theme: Theme): "light" | "dark" {
  return theme === "light" ? "light" : "dark";
}

// Runs in <head> before the body paints.
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var c=m?m[1]:"dark";var t=c==="light"?"light":c==="system"&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";var d=document.documentElement;d.setAttribute("data-theme",t);d.classList.toggle("dark",t==="dark")}catch(e){}})()`;
