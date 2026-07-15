/**
 * Serialize / rehydrate the editor session for IndexedDB persistence.
 *
 * `buildDescriptor` is pure (JSON-only) so it's unit-testable; it references
 * audio blobs by key rather than embedding them. `rehydrate` rebuilds the
 * ClipTracks (audio + clip geometry + fades + mixer via createTrack) from the
 * descriptor and stored blobs, and returns the effect chains for the caller to
 * re-apply through the effects hooks once the engine is mounted.
 */
import {
  createTrack,
  createClipFromSeconds,
  type ClipTrack,
  type AudioClip,
  type Fade,
} from "@waveform-playlist/core";

export interface SerializedEffect {
  effectId: string;
  params: Record<string, number>;
}

export interface SerializedClip {
  startTime: number;
  duration: number;
  offset: number;
  gain: number;
  fadeIn?: Fade;
  fadeOut?: Fade;
}

export interface SerializedTrack {
  audioKey: string;
  name: string;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  clips: SerializedClip[];
  effects: SerializedEffect[];
}

export interface SessionDescriptor {
  version: 1;
  tracks: SerializedTrack[];
  masterEffects: SerializedEffect[];
}

/** Per-track data the caller supplies alongside each ClipTrack (index-aligned). */
export interface TrackPersistInput {
  audioKey: string;
  mixer: { volume: number; pan: number; muted: boolean; soloed: boolean };
  effects: SerializedEffect[];
}

/** Keep only numeric params (our curated effects) from a library active-effect bag. */
export function serializeEffects(
  active: { effectId: string; params?: Record<string, number | string | boolean> }[]
): SerializedEffect[] {
  return active.map((fx) => {
    const params: Record<string, number> = {};
    for (const [k, v] of Object.entries(fx.params ?? {})) {
      if (typeof v === "number") params[k] = v;
    }
    return { effectId: fx.effectId, params };
  });
}

export function buildDescriptor(
  tracks: ClipTrack[],
  perTrack: TrackPersistInput[],
  masterEffects: SerializedEffect[]
): SessionDescriptor {
  return {
    version: 1,
    tracks: tracks.map((track, i) => {
      const info = perTrack[i];
      return {
        audioKey: info.audioKey,
        name: track.name,
        volume: info.mixer.volume,
        pan: info.mixer.pan,
        muted: info.mixer.muted,
        soloed: info.mixer.soloed,
        clips: track.clips.map((c: AudioClip) => ({
          startTime: c.startSample / c.sampleRate,
          duration: c.durationSamples / c.sampleRate,
          offset: c.offsetSamples / c.sampleRate,
          gain: c.gain,
          ...(c.fadeIn ? { fadeIn: c.fadeIn } : {}),
          ...(c.fadeOut ? { fadeOut: c.fadeOut } : {}),
        })),
        effects: info.effects,
      };
    }),
    masterEffects,
  };
}

export interface RehydrateResult {
  tracks: ClipTrack[];
  /** Audio-blob keys for the restored tracks, index-aligned with `tracks`, so
   *  the caller can keep reusing the same stored blobs (no re-encode / orphan). */
  audioKeys: string[];
  /** Per-restored-track effect chains, index-aligned with `tracks`. */
  trackEffects: SerializedEffect[][];
  masterEffects: SerializedEffect[];
}

/**
 * Rebuild tracks from a descriptor + stored blobs. Tracks whose audio blob is
 * missing or fails to decode are skipped (with their effect chains) so a
 * partial session still restores what it can.
 */
export async function rehydrate(
  descriptor: SessionDescriptor,
  loadAudio: (key: string) => Promise<Blob | undefined>,
  decode: (blob: Blob) => Promise<AudioBuffer>
): Promise<RehydrateResult> {
  const tracks: ClipTrack[] = [];
  const audioKeys: string[] = [];
  const trackEffects: SerializedEffect[][] = [];

  for (const st of descriptor.tracks) {
    let buffer: AudioBuffer;
    try {
      const blob = await loadAudio(st.audioKey);
      if (!blob) continue;
      buffer = await decode(blob);
    } catch {
      continue;
    }
    const clips = st.clips.map((c) =>
      createClipFromSeconds({
        audioBuffer: buffer,
        startTime: c.startTime,
        duration: c.duration,
        offset: c.offset,
        gain: c.gain,
        ...(c.fadeIn ? { fadeIn: c.fadeIn } : {}),
        ...(c.fadeOut ? { fadeOut: c.fadeOut } : {}),
      })
    );
    tracks.push(
      createTrack({
        name: st.name,
        volume: st.volume,
        pan: st.pan,
        muted: st.muted,
        soloed: st.soloed,
        clips,
      })
    );
    audioKeys.push(st.audioKey);
    trackEffects.push(st.effects);
  }

  return { tracks, audioKeys, trackEffects, masterEffects: descriptor.masterEffects };
}
