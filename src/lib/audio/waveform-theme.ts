"use client";

/**
 * Canvas cannot resolve CSS var() — the waveform theme needs concrete color
 * strings, resolved from the same --bt-* tokens the rest of the app uses,
 * re-resolved whenever next-themes flips the root class.
 */
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Fallbacks are snapshots of the app's --bt-* design tokens (design-tokens.css),
 * used only when a token is missing from the DOM (e.g. bare test environments).
 * They intentionally mirror the app palette, NOT the library's default theme.
 */
export const FALLBACK = {
  light: {
    surface: "#ffffff",
    ink: "#161615",
    muted: "#757570",
    accent: "#2e5cff",
    line: "rgba(22, 22, 21, 0.09)",
    hover: "rgba(22, 22, 21, 0.05)",
  },
  dark: {
    surface: "#161615",
    ink: "#f1f1ef",
    muted: "#8f8f89",
    accent: "#5d80ff",
    line: "rgba(241, 241, 239, 0.09)",
    hover: "rgba(241, 241, 239, 0.07)",
  },
} as const;

function token(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = styles.getPropertyValue(name).trim();
  return v || fallback;
}

export function resolveWaveformTheme(el: HTMLElement, isDark: boolean): Record<string, string> {
  const fallback = FALLBACK[isDark ? "dark" : "light"];
  const s = getComputedStyle(el);
  const surface = token(s, "--bt-surface", fallback.surface);
  const ink = token(s, "--bt-ink", fallback.ink);
  const mutedText = token(s, "--bt-muted", fallback.muted);
  const accent = token(s, "--bt-accent", fallback.accent);
  const line = token(s, "--bt-line", fallback.line);
  const hover = token(s, "--bt-hover", fallback.hover);
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
    // Selected-track colours: the library defaults are a hardcoded light blue
    // that is unreadable in dark mode. Normalise the selected lane/wave to
    // match the unselected ones (surface/accent) and give the selected control
    // panel a subtle themed tint; the crisp selection cue is the accent border
    // TrackControls draws. Keeps both themes readable.
    selectedTrackControlsBackground: hover,
    selectedTrackBackground: surface,
    selectedWaveOutlineColor: surface,
    selectedWaveFillColor: accent,
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
