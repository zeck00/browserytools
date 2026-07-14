import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveWaveformTheme, FALLBACK } from "@/lib/audio/waveform-theme";

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

  it("falls back to app design tokens when tokens are missing", () => {
    const el = document.createElement("div");
    // No tokens set — should use FALLBACK
    const theme = resolveWaveformTheme(el, true);
    expect(theme.waveFillColor).toBe(FALLBACK.dark.accent);
    expect(String(theme.waveFillColor)).not.toContain("var(");
  });

  it("FALLBACK values are synced with design-tokens.css", () => {
    const css = readFileSync("src/styles/design-tokens.css", "utf8");
    const root = css.split(".dark")[0];
    const dark = css.split(".dark")[1] ?? "";

    // Light fallbacks from :root
    expect(root).toContain(`--bt-surface: ${FALLBACK.light.surface}`);
    expect(root).toContain(`--bt-ink: ${FALLBACK.light.ink}`);
    expect(root).toContain(`--bt-muted: ${FALLBACK.light.muted}`);
    expect(root).toContain(`--bt-accent: ${FALLBACK.light.accent}`);
    expect(root).toContain(`--bt-line: ${FALLBACK.light.line}`);

    // Dark fallbacks from .dark
    expect(dark).toContain(`--bt-surface: ${FALLBACK.dark.surface}`);
    expect(dark).toContain(`--bt-ink: ${FALLBACK.dark.ink}`);
    expect(dark).toContain(`--bt-muted: ${FALLBACK.dark.muted}`);
    expect(dark).toContain(`--bt-accent: ${FALLBACK.dark.accent}`);
    expect(dark).toContain(`--bt-line: ${FALLBACK.dark.line}`);
  });
});
