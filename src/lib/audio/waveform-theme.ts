"use client";

/**
 * Canvas cannot resolve CSS var() — the waveform theme needs concrete color
 * strings, resolved from the same --bt-* tokens the rest of the app uses,
 * re-resolved whenever next-themes flips the root class.
 */
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { darkTheme, defaultTheme } from "@waveform-playlist/ui-components";

function token(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = styles.getPropertyValue(name).trim();
  return v || fallback;
}

export function resolveWaveformTheme(el: HTMLElement, isDark: boolean): Record<string, string> {
  const base = (isDark ? darkTheme : defaultTheme) as unknown as Record<string, string>;
  const s = getComputedStyle(el);
  const surface = token(s, "--bt-surface", String(base.surfaceColor ?? (isDark ? "#161615" : "#ffffff")));
  const ink = token(s, "--bt-ink", isDark ? "#f1f1ef" : "#161615");
  const mutedText = token(s, "--bt-muted", isDark ? "#8f8f89" : "#757570");
  const accent = token(s, "--bt-accent", isDark ? "#5d80ff" : "#2e5cff");
  const line = token(s, "--bt-line", isDark ? "rgba(241, 241, 239, 0.09)" : "rgba(22, 22, 21, 0.09)");
  return {
    backgroundColor: surface,
    surfaceColor: surface,
    waveOutlineColor: surface, // 'inverted' draw mode: area WITHOUT audio
    waveFillColor: accent,     // where peaks are
    waveProgressColor: ink,
    playheadColor: ink,
    selectionColor: isDark ? "rgba(250,250,249,0.18)" : "rgba(17,17,17,0.12)",
    timeColor: mutedText,
    timescaleBackgroundColor: surface,
    borderColor: line,
    textColor: ink,
    textColorMuted: mutedText,
    clipHeaderBackgroundColor: line,
    clipHeaderTextColor: ink,
  };
}

/** Theme for <WaveformPlaylistProvider theme={...}>, tracking next-themes. */
export function useWaveformTheme(): Record<string, string> | null {
  const { resolvedTheme } = useTheme();
  const [theme, setTheme] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    setTheme(resolveWaveformTheme(document.documentElement, resolvedTheme === "dark"));
  }, [resolvedTheme]);
  return theme;
}
