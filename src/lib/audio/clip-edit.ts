/**
 * Pure clip math for operations the library doesn't ship (delete-region,
 * edge fades). Callers apply results via playoutRef.current.updateTrack()
 * so each operation lands as one undo snapshot.
 */
import type { AudioClip } from "@waveform-playlist/core";

/** Remove audio inside [delStart, delEnd) — Audacity "split delete": leaves a gap. */
export function deleteRegionFromClips(
  clips: AudioClip[],
  delStart: number,
  delEnd: number
): AudioClip[] {
  const out: AudioClip[] = [];
  for (const c of clips) {
    const cStart = c.startSample;
    const cEnd = c.startSample + c.durationSamples;
    if (cEnd <= delStart || cStart >= delEnd) {
      out.push(c); // no overlap
    } else if (cStart >= delStart && cEnd <= delEnd) {
      // fully covered — drop
    } else if (cStart < delStart && cEnd > delEnd) {
      // spans region — split into left + right, gap in between
      out.push({ ...c, durationSamples: delStart - cStart, fadeOut: undefined });
      out.push({
        ...c,
        id: crypto.randomUUID(),
        startSample: delEnd,
        durationSamples: cEnd - delEnd,
        offsetSamples: c.offsetSamples + (delEnd - cStart),
        fadeIn: undefined,
      });
    } else if (cStart < delStart) {
      // tail overlaps — trim right
      out.push({ ...c, durationSamples: delStart - cStart, fadeOut: undefined });
    } else {
      // head overlaps — trim left; absolute position moves to region end (no ripple)
      out.push({
        ...c,
        startSample: delEnd,
        durationSamples: cEnd - delEnd,
        offsetSamples: c.offsetSamples + (delEnd - cStart),
        fadeIn: undefined,
      });
    }
  }
  return out;
}

/** Set a fade on the track's first (in) or last-ending (out) clip, clamped to clip length. */
export function applyEdgeFade(
  clips: AudioClip[],
  direction: "in" | "out",
  durationSec: number
): AudioClip[] {
  if (clips.length === 0) return [];
  const target =
    direction === "in"
      ? clips.reduce((a, b) => (b.startSample < a.startSample ? b : a))
      : clips.reduce((a, b) =>
          b.startSample + b.durationSamples > a.startSample + a.durationSamples ? b : a
        );
  return clips.map((c) => {
    if (c.id !== target.id) return c;
    const maxSec = c.durationSamples / c.sampleRate;
    const fade = { duration: Math.min(durationSec, maxSec) };
    return direction === "in" ? { ...c, fadeIn: fade } : { ...c, fadeOut: fade };
  });
}
