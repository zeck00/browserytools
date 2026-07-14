import { test, expect } from "@playwright/test";

// The multi-track editor relies on Web Audio + canvas + styled-components,
// which are stable in Chromium. Firefox/Mobile projects run the catalog smoke
// gate for /tools/audio (one h1, no console errors) in all-tools-smoke.spec.ts;
// this behavioural spec is scoped to Chromium to keep the timeline-interaction
// contract deterministic.
test.describe("Audio Editor (multi-track)", () => {
  // Scope to the desktop Chromium project only. Firefox and Mobile Chrome (a
  // mobile-viewport Chromium) run the catalog smoke gate for /tools/audio in
  // all-tools-smoke.spec.ts; the multi-track editor is not a mobile target, so
  // the timeline-interaction contract runs on desktop Chromium.
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || !!isMobile,
    "timeline interaction contract verified on desktop Chromium"
  );

  /** Minimal 16-bit PCM mono WAV: `seconds` of a 440Hz sine at 44.1kHz. */
  function makeWav(seconds: number): Buffer {
    const sr = 44100;
    const n = sr * seconds;
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++)
      data.writeInt16LE(
        Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 12000),
        i * 2
      );
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(sr, 24);
    header.writeUInt32LE(sr * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
  }

  test("loads files as tracks, splits at playhead, undoes, and exports a WAV", async ({
    page,
  }) => {
    await page.goto("/tools/audio");

    // Two files → two tracks
    await page.locator('[data-testid="audio-file-input"]').setInputFiles([
      { name: "tone-a.wav", mimeType: "audio/wav", buffer: makeWav(2) },
      { name: "tone-b.wav", mimeType: "audio/wav", buffer: makeWav(3) },
    ]);
    // Two imported files → two track-control panels (the filename appears in
    // both the panel and the clip header, so assert the panels by testid).
    await expect(
      page.locator('[data-testid="track-controls-0"]')
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator('[data-testid="track-controls-1"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="track-controls-0"]')
    ).toContainText("tone-a");
    await expect(
      page.locator('[data-testid="track-controls-1"]')
    ).toContainText("tone-b");

    // Select track 0, then position the playhead mid-clip so the split has a
    // real boundary (a split at time 0 is a no-op).
    await expect(page.locator('[data-testid="undo-button"]')).toBeDisabled();
    // Move the playhead off the clip boundary by playing briefly then pausing
    // (a split at time 0 is a no-op). Pause keeps the playhead position.
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    // Select track 0, then split at the paused playhead.
    await page.locator('[data-testid="track-controls-0"]').click();
    await page.locator('[data-testid="split-button"]').click();
    await expect(
      page.locator('[data-testid="undo-button"]')
    ).toBeEnabled(); // split pushed history
    await page.locator('[data-testid="undo-button"]').click();
    await expect(page.locator('[data-testid="undo-button"]')).toBeDisabled();

    // Export the mix as WAV (default format — no ffmpeg conversion needed).
    await page.getByRole("button", { name: /export/i }).click();
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.locator('[data-testid="export-run"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("mix.wav");
  });
});
