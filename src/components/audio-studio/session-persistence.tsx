"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { usePlaylistData } from "@waveform-playlist/browser";
import { useDynamicEffects, useTrackDynamicEffects } from "@waveform-playlist/browser/tone";
import type { ClipTrack } from "@waveform-playlist/core";
import { encodeWav } from "@/lib/audio/wav-encode";
import { putAudio, putDescriptor } from "@/lib/audio/session-store";
import {
  buildDescriptor,
  serializeEffects,
  type SerializedEffect,
  type TrackPersistInput,
} from "@/lib/audio/session-serialize";

const DEBOUNCE_MS = 700;

/**
 * Autosaves the editor session to IndexedDB (debounced) so an accidental
 * refresh can restore it. Lives inside WaveformPlaylistProvider so it can read
 * live mixer state (trackStates); source audio is encoded to a WAV blob once
 * per track (keyed via sourceKeysRef) and reused thereafter. Sets dirtyRef
 * while a change is pending so the beforeunload guard only warns about
 * genuinely-unsaved edits. Renders nothing.
 */
export function SessionPersistence({
  tracks,
  master,
  perTrack,
  sourceKeysRef,
  dirtyRef,
}: {
  tracks: ClipTrack[];
  master: ReturnType<typeof useDynamicEffects>;
  perTrack: ReturnType<typeof useTrackDynamicEffects>;
  sourceKeysRef: MutableRefObject<Map<string, string>>;
  dirtyRef: MutableRefObject<boolean>;
}) {
  const { trackStates } = usePlaylistData();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest values for the debounced/unmount save, without re-subscribing.
  const latest = useRef({ tracks, trackStates, master, perTrack });
  latest.current = { tracks, trackStates, master, perTrack };

  const save = useRef(async () => {
    const { tracks, trackStates, master, perTrack } = latest.current;
    const keptTracks: ClipTrack[] = [];
    const inputs: TrackPersistInput[] = [];
    for (let i = 0; i < tracks.length; i++) {
      const tr = tracks[i];
      const src = tr.clips[0]?.audioBuffer;
      const state = trackStates[i];
      if (!src || !state) continue; // no audio yet (e.g. empty armed record track)
      let key = sourceKeysRef.current.get(tr.id);
      if (!key) {
        key = crypto.randomUUID();
        sourceKeysRef.current.set(tr.id, key);
        try {
          await putAudio(key, encodeWav(src));
        } catch {
          sourceKeysRef.current.delete(tr.id);
          continue; // couldn't persist audio — skip this track this round
        }
      }
      keptTracks.push(tr);
      inputs.push({
        audioKey: key,
        mixer: {
          volume: state.volume,
          pan: state.pan,
          muted: state.muted,
          soloed: state.soloed,
        },
        effects: serializeEffects(perTrack.trackEffectsState.get(tr.id) ?? []),
      });
    }
    const masterEffects: SerializedEffect[] = serializeEffects(master.activeEffects);
    try {
      await putDescriptor(buildDescriptor(keptTracks, inputs, masterEffects));
      dirtyRef.current = false;
    } catch {
      /* best-effort persistence — leave dirty so the next change retries */
    }
  }).current;

  useEffect(() => {
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), DEBOUNCE_MS);
    // Depend on the signals that change the session.
  }, [tracks, trackStates, perTrack.trackEffectsState, master.activeEffects, dirtyRef, save]);

  // Flush on unmount (e.g. exiting the editor) so the latest state is persisted.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void save();
    };
  }, [save]);

  return null;
}

export interface PendingEffects {
  trackEffects: SerializedEffect[][];
  masterEffects: SerializedEffect[];
}

/**
 * Re-applies restored effect chains after the engine has mounted. The library's
 * addEffect / addEffectToTrack return void, so params must be set afterwards
 * using the instanceIds that appear in the hooks' state once the adds commit.
 * Pass 1 adds every effect (in order) on mount; pass 2 waits until the active
 * instances appear, then sets params by insertion order. A safety timer calls
 * onDone regardless so a mismatch can never wedge the restore. Renders nothing.
 */
export function RestoreEffectsApplier({
  pending,
  tracks,
  master,
  perTrack,
  onDone,
}: {
  pending: PendingEffects;
  tracks: ClipTrack[];
  master: ReturnType<typeof useDynamicEffects>;
  perTrack: ReturnType<typeof useTrackDynamicEffects>;
  onDone: () => void;
}) {
  const { isReady } = usePlaylistData();
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const [armed, setArmed] = useState(false);

  const finish = useRef(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }).current;

  // Wait until the engine is ready AND has had a beat to settle before touching
  // the effect graph — adding effects mid-build corrupts engine track state
  // (breaks track selection). A short delay after isReady avoids that race.
  useEffect(() => {
    if (!isReady) return;
    const t = setTimeout(() => setArmed(true), 250);
    return () => clearTimeout(t);
  }, [isReady]);

  // Pass 1: once armed, add every effect once, then arm a safety timeout.
  useEffect(() => {
    if (!armed || startedRef.current) return;
    startedRef.current = true;
    pending.trackEffects.forEach((list, i) => {
      const id = tracks[i]?.id;
      if (!id) return;
      list.forEach((fx) => perTrack.addEffectToTrack(id, fx.effectId));
    });
    pending.masterEffects.forEach((fx) => master.addEffect(fx.effectId));
    const timer = setTimeout(finish, 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  // Pass 2: once the added instances exist, set params by order, then finish.
  useEffect(() => {
    if (!startedRef.current || doneRef.current) return;
    const trackReady = pending.trackEffects.every((list, i) => {
      const id = tracks[i]?.id;
      if (!id) return true;
      return (perTrack.trackEffectsState.get(id)?.length ?? 0) >= list.length;
    });
    if (!trackReady || master.activeEffects.length < pending.masterEffects.length) return;

    pending.trackEffects.forEach((list, i) => {
      const id = tracks[i]?.id;
      if (!id) return;
      const active = perTrack.trackEffectsState.get(id) ?? [];
      list.forEach((fx, j) => {
        const inst = active[j];
        if (!inst) return;
        for (const [p, v] of Object.entries(fx.params)) {
          perTrack.updateTrackEffectParameter(id, inst.instanceId, p, v);
        }
      });
    });
    pending.masterEffects.forEach((fx, j) => {
      const inst = master.activeEffects[j];
      if (!inst) return;
      for (const [p, v] of Object.entries(fx.params)) {
        master.updateParameter(inst.instanceId, p, v);
      }
    });
    finish();
  });

  return null;
}
