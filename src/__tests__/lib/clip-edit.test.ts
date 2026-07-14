import { describe, it, expect } from "vitest";
import { deleteRegionFromClips, applyEdgeFade } from "@/lib/audio/clip-edit";
import type { AudioClip } from "@waveform-playlist/core";

const SR = 48000;
const clip = (startSample: number, durationSamples: number, offsetSamples = 0): AudioClip =>
  ({
    id: `c-${startSample}-${durationSamples}`,
    startSample,
    durationSamples,
    offsetSamples,
    sampleRate: SR,
    sourceDurationSamples: durationSamples + offsetSamples,
    gain: 1,
  }) as AudioClip;

describe("deleteRegionFromClips", () => {
  it("keeps clips that do not overlap the region", () => {
    const out = deleteRegionFromClips([clip(0, 100)], 200, 300);
    expect(out).toHaveLength(1);
    expect(out[0].startSample).toBe(0);
  });

  it("drops clips fully inside the region", () => {
    expect(deleteRegionFromClips([clip(100, 50)], 100, 150)).toHaveLength(0);
    expect(deleteRegionFromClips([clip(110, 20)], 100, 150)).toHaveLength(0);
  });

  it("splits a clip that spans the whole region into two, preserving source offsets", () => {
    const out = deleteRegionFromClips([clip(0, 1000)], 200, 300);
    expect(out).toHaveLength(2);
    const [left, right] = out;
    expect(left.startSample).toBe(0);
    expect(left.durationSamples).toBe(200);
    expect(left.offsetSamples).toBe(0);
    expect(right.startSample).toBe(300); // gap left where the region was
    expect(right.durationSamples).toBe(700);
    expect(right.offsetSamples).toBe(300);
    expect(right.id).not.toBe(left.id);
  });

  it("trims the tail of a clip whose end overlaps the region", () => {
    const out = deleteRegionFromClips([clip(0, 1000)], 800, 1200);
    expect(out).toHaveLength(1);
    expect(out[0].durationSamples).toBe(800);
  });

  it("trims the head of a clip whose start overlaps the region (position stays absolute — no ripple)", () => {
    const out = deleteRegionFromClips([clip(500, 1000, 50)], 300, 700);
    expect(out).toHaveLength(1);
    expect(out[0].startSample).toBe(700);
    expect(out[0].durationSamples).toBe(800);
    expect(out[0].offsetSamples).toBe(250); // 50 + (700-500)
  });
});

describe("applyEdgeFade", () => {
  it("fades in the earliest clip and clamps to clip length", () => {
    const clips = [clip(1000, 2 * SR), clip(0, SR)]; // second is earliest, 1s long
    const out = applyEdgeFade(clips, "in", 5);
    const first = out.find((c) => c.startSample === 0)!;
    expect(first.fadeIn).toEqual({ duration: 1 }); // clamped from 5s to 1s
    expect(out.find((c) => c.startSample === 1000)!.fadeIn).toBeUndefined();
  });

  it("fades out the clip that ends last", () => {
    const clips = [clip(0, SR), clip(1000, 2 * SR)];
    const out = applyEdgeFade(clips, "out", 0.5);
    expect(out.find((c) => c.startSample === 1000)!.fadeOut).toEqual({ duration: 0.5 });
  });

  it("returns clips unchanged (new array) when empty", () => {
    expect(applyEdgeFade([], "in", 1)).toEqual([]);
  });
});
