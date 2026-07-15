import { describe, it, expect } from "vitest";
import {
  buildDescriptor,
  serializeEffects,
  type TrackPersistInput,
} from "@/lib/audio/session-serialize";
import type { ClipTrack, AudioClip } from "@waveform-playlist/core";

const SR = 48000;
const clip = (startSample: number, durationSamples: number, offsetSamples = 0): AudioClip =>
  ({
    id: `c-${startSample}`,
    startSample,
    durationSamples,
    offsetSamples,
    sampleRate: SR,
    sourceDurationSamples: durationSamples + offsetSamples,
    gain: 1,
  }) as AudioClip;

const track = (name: string, clips: AudioClip[]): ClipTrack =>
  ({ id: name, name, clips, muted: false, soloed: false, volume: 1, pan: 0 }) as ClipTrack;

describe("buildDescriptor", () => {
  it("serializes clip geometry to seconds and pulls mixer/effects from the aligned input", () => {
    const tracks = [track("Vocals", [clip(0, SR), clip(2 * SR, SR, SR / 2)])];
    const perTrack: TrackPersistInput[] = [
      {
        audioKey: "aud-1",
        mixer: { volume: 0.8, pan: -0.5, muted: true, soloed: false },
        effects: [{ effectId: "reverb", params: { decay: 2, wet: 0.4 } }],
      },
    ];
    const desc = buildDescriptor(tracks, perTrack, [
      { effectId: "compressor", params: { threshold: -20 } },
    ]);

    expect(desc.version).toBe(1);
    expect(desc.tracks).toHaveLength(1);
    const t = desc.tracks[0];
    expect(t.audioKey).toBe("aud-1");
    expect(t.name).toBe("Vocals");
    // mixer comes from perTrack input, NOT the ClipTrack's own fields
    expect(t).toMatchObject({ volume: 0.8, pan: -0.5, muted: true, soloed: false });
    expect(t.clips).toEqual([
      { startTime: 0, duration: 1, offset: 0, gain: 1 },
      { startTime: 2, duration: 1, offset: 0.5, gain: 1 },
    ]);
    expect(t.effects).toEqual([{ effectId: "reverb", params: { decay: 2, wet: 0.4 } }]);
    expect(desc.masterEffects).toEqual([{ effectId: "compressor", params: { threshold: -20 } }]);
  });

  it("preserves fades when present", () => {
    const c = clip(0, SR);
    c.fadeIn = { duration: 0.5 };
    const desc = buildDescriptor(
      [track("T", [c])],
      [{ audioKey: "k", mixer: { volume: 1, pan: 0, muted: false, soloed: false }, effects: [] }],
      []
    );
    expect(desc.tracks[0].clips[0].fadeIn).toEqual({ duration: 0.5 });
    expect(desc.tracks[0].clips[0].fadeOut).toBeUndefined();
  });
});

describe("serializeEffects", () => {
  it("keeps only numeric params (drops the library's non-number values)", () => {
    expect(
      serializeEffects([
        { effectId: "eq3", params: { low: 3, mid: 0, label: "x" as unknown as number } },
      ])
    ).toEqual([{ effectId: "eq3", params: { low: 3, mid: 0 } }]);
  });

  it("handles effects with no params", () => {
    expect(serializeEffects([{ effectId: "reverb" }])).toEqual([{ effectId: "reverb", params: {} }]);
  });
});
