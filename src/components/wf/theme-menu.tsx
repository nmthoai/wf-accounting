"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu } from "@base-ui/react/menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { MOTION_EVENT, MOTION_KEY, motionOn } from "@/components/wf/wave-grid";
import { cn } from "@/lib/utils";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "system") return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  return theme;
}

function apply(theme: Theme) {
  const shown = resolve(theme);
  const root = document.documentElement;
  root.setAttribute("data-theme", shown);
  root.classList.toggle("dark", shown === "dark");
}

// System, Light or Dark, plus the moving-background switch. The choice is a cookie
// for a year, so the server renders the right theme with no flash.
export function ThemeMenu({ initial, className }: { initial: Theme; className?: string }) {
  const t = useTranslations("common.theme");
  const [theme, setTheme] = useState<Theme>(initial);
  // The popup isn't server-rendered, so reading the device here can't mismatch.
  const [motion, setMotion] = useState(() => (typeof window === "undefined" ? true : motionOn()));

  // System follows the device and changes with it.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function choose(next: Theme) {
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    apply(next);
  }

  function toggleMotion(on: boolean) {
    setMotion(on);
    try {
      localStorage.setItem(MOTION_KEY, on ? "on" : "off");
    } catch {
      // Private mode: the switch holds for this page only.
    }
    window.dispatchEvent(new Event(MOTION_EVENT));
  }

  const Icon = ICONS[theme];

  return (
    <Menu.Root>
      <Menu.Trigger className={cn("wf-icon-btn", className)} aria-label={t("label")}>
        <Icon aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50">
          <Menu.Popup className="wf-menu">
            <Menu.RadioGroup value={theme} onValueChange={(v) => choose(v as Theme)}>
              <Menu.GroupLabel className="wf-label">{t("label")}</Menu.GroupLabel>
              {(["system", "light", "dark"] as const).map((value) => {
                const ItemIcon = ICONS[value];
                return (
                  <Menu.RadioItem key={value} value={value} closeOnClick className="wf-menu__item">
                    <ItemIcon aria-hidden="true" />
                    <span>{t(value)}</span>
                    <Menu.RadioItemIndicator className="wf-menu__check" render={<Check aria-hidden="true" />} />
                  </Menu.RadioItem>
                );
              })}
            </Menu.RadioGroup>
            <Menu.Separator className="wf-menu__sep" />
            <Menu.CheckboxItem checked={motion} onCheckedChange={toggleMotion} className="wf-menu__item">
              <span className="wf-menu__motion" aria-hidden="true" />
              <span>{t("motion")}</span>
              <Menu.CheckboxItemIndicator className="wf-menu__check" render={<Check aria-hidden="true" />} />
            </Menu.CheckboxItem>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
