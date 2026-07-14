import { describe, it, expect, vi } from "vitest";

// Mock the waveform-playlist library which uses styled-components
vi.mock("@waveform-playlist/ui-components", () => ({
  darkTheme: {
    surfaceColor: "#161615",
    waveFillColor: "#5d80ff",
    playheadColor: "#f1f1ef",
  },
  defaultTheme: {
    surfaceColor: "#ffffff",
    waveFillColor: "#2e5cff",
    playheadColor: "#161615",
  },
}));

import { resolveWaveformTheme } from "@/lib/audio/waveform-theme";

describe("resolveWaveformTheme", () => {
  it("maps resolved token values into canvas-safe color strings", () => {
    const el = document.createElement("div");
    el.style.setProperty("--bt-surface", "#ffffff");
    el.style.setProperty("--bt-ink", "#111111");
    el.style.setProperty("--bt-accent", "#1a7f8e");
    el.style.setProperty("--bt-line", "#e5e5e5");
    el.style.setProperty("--bt-muted", "#666666");
    document.body.appendChild(el);
    const theme = resolveWaveformTheme(el, false);
    expect(theme.waveFillColor).toBe("#1a7f8e");
    expect(theme.playheadColor).toBe("#111111");
    // never leak an unresolved var() into canvas
    for (const v of Object.values(theme)) expect(String(v)).not.toContain("var(");
  });

  it("falls back to library defaults when a token is missing", () => {
    const el = document.createElement("div");
    const theme = resolveWaveformTheme(el, true);
    expect(theme.waveFillColor).toBeTruthy();
    expect(String(theme.waveFillColor)).not.toContain("var(");
  });
});
