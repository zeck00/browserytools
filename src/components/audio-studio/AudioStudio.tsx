"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  WaveformPlaylistProvider,
  Waveform,
  ClipInteractionProvider,
  KeyboardShortcuts,
} from "@waveform-playlist/browser";
import { useDynamicEffects, useTrackDynamicEffects } from "@waveform-playlist/browser/tone";
import type { ClipTrack } from "@waveform-playlist/core";
import { ToolShell } from "@/components/template/tool-shell";
import { useWaveformTheme } from "@/lib/audio/waveform-theme";
import {
  decodeAudioFile,
  makeTrackFromFile,
  estimateDecodedBytes,
  STUDIO_SAMPLE_RATE,
} from "@/lib/audio/import";
import { ImportDropzone } from "./ImportDropzone";
import { TrackControls } from "./TrackControls";
import { TransportBar } from "./TransportBar";
import { EffectsPanel } from "./EffectsPanel";

const BIG_SESSION_BYTES = 500 * 1024 * 1024;
const LONG_FILE_SECONDS = 30 * 60;

export default function AudioStudio() {
  const t = useTranslations("Tools.AudioEditor");
  const [tracks, setTracks] = useState<ClipTrack[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [warnedBig, setWarnedBig] = useState(false);
  const theme = useWaveformTheme();
  const tracksRef = useRef<ClipTrack[]>([]);
  tracksRef.current = tracks;

  // Effects hooks are unconditional (must run every render, even before any
  // tracks are imported) and independent of WaveformPlaylistProvider's React
  // context — they manage their own state/refs and only hand the provider
  // plain functions (`masterEffects`, `getTrackEffectsFunction(id)`) that the
  // provider invokes once per engine (re)build to seed the Tone.js graph.
  // Task 9's ExportDialog reads `master.createOfflineEffectsFunction` and
  // `perTrack.createOfflineTrackEffectsFunction` from these same hook results.
  const master = useDynamicEffects();
  const perTrack = useTrackDynamicEffects();

  // ---------------------------------------------------------------------------
  // Identity-safe per-track effects attachment (undo-history preservation)
  //
  // WaveformPlaylistProvider has a reference-identity fast path: when the
  // `tracks` prop is `===` to the array the engine last emitted via
  // onTracksChange (`engineTracksRef.current`, browser/dist/index.mjs:1975),
  // it skips the full engine rebuild. The full rebuild calls
  // `engine.setTracks()`, which begins with `clearHistory()`
  // (engine/dist/index.mjs:300-301) — destroying undo/redo. So any derived
  // array (a `.map()` over `tracks`) is NEVER reference-equal to the engine
  // echo and forces a rebuild on every clip edit, wiping history.
  //
  // Fix: pass the `tracks` state array straight through, and attach each
  // track's `effects` field ONCE at creation as a STABLE per-id delegating
  // wrapper. The engine preserves the `effects` function field by reference
  // through every round-trip (shallow spread in getState / setTracks /
  // _snapshotTracks / _restoreTracks), so the wrapper survives edits, undo
  // snapshots and the onTracksChange echo without changing identity.
  //
  // The wrapper delegates to the live hook API via a ref, so it never captures
  // a stale `perTrack` object and its own identity never changes.
  const getTrackEffectsFnRef = useRef(perTrack.getTrackEffectsFunction);
  getTrackEffectsFnRef.current = perTrack.getTrackEffectsFunction;
  const effectsWrappersRef = useRef<Map<string, NonNullable<ClipTrack["effects"]>>>(
    new Map()
  );
  const getEffectsWrapper = useCallback(
    (id: string): NonNullable<ClipTrack["effects"]> => {
      const cache = effectsWrappersRef.current;
      const cached = cache.get(id);
      if (cached) return cached;
      // Params are contextually typed as core's TrackEffectsFunction
      // (`unknown, unknown, boolean`). `getTrackEffectsFunction` returns
      // playout's TrackEffectsFunction (concrete `Gain`/`ToneAudioNode`); the
      // two differ only by core's intentional Tone-erasure, so the cast to
      // `ClipTrack["effects"]` is safe — the engine invokes it with real Tone
      // nodes at graph-build time, which captures this track's graph nodes so
      // later add/remove/param edits hot-swap the live chain.
      const wrapper: NonNullable<ClipTrack["effects"]> = (graphEnd, destination, isOffline) =>
        (getTrackEffectsFnRef.current(id) as ClipTrack["effects"])?.(
          graphEnd,
          destination,
          isOffline
        );
      cache.set(id, wrapper);
      return wrapper;
    },
    []
  );

  // Defensive: guarantee every track the engine hands back carries its stable
  // wrapper. In practice the engine preserves the field by reference, so this
  // never actually mutates today — but if a future engine path (e.g. Task 8
  // recording) constructs a track without one, this re-attaches it. MUST mutate
  // the received objects in place (never build a new array): the provider set
  // `engineTracksRef.current` to THIS exact array, so replacing it would break
  // the identity fast-path and clear history. The array is a fresh shallow copy
  // the engine owns internally, so mutating it is safe.
  const handleTracksChange = useCallback(
    (next: ClipTrack[]) => {
      for (const tr of next) {
        const wrapper = getEffectsWrapper(tr.id);
        if (tr.effects !== wrapper) tr.effects = wrapper;
      }
      setTracks(next);
    },
    [getEffectsWrapper]
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      const added: ClipTrack[] = [];
      for (const file of files) {
        try {
          const buffer = await decodeAudioFile(file);
          if (buffer.duration > LONG_FILE_SECONDS)
            toast.warning(t("longFileWarning", { name: file.name }));
          const tr = makeTrackFromFile(file, buffer);
          tr.effects = getEffectsWrapper(tr.id);
          added.push(tr);
        } catch {
          toast.error(t("decodeFailed", { name: file.name }));
        }
      }
      if (added.length === 0) return;
      setTracks((prev) => [...prev, ...added]);
      const bytes = estimateDecodedBytes([...tracksRef.current, ...added]);
      if (!warnedBig && bytes > BIG_SESSION_BYTES) {
        toast.warning(t("bigSessionWarning", { mb: Math.round(bytes / 1024 / 1024) }));
        setWarnedBig(true);
      }
    },
    [t, warnedBig, getEffectsWrapper]
  );

  // Dispose the removed track's live Tone.js effect instances (finding 2:
  // clearTrackEffects is the only path that disposes them) and drop its cached
  // wrapper before removing it from state.
  const removeTrack = useCallback(
    (trackIndex: number) => {
      const removed = tracksRef.current[trackIndex];
      if (removed) {
        perTrack.clearTrackEffects(removed.id);
        effectsWrappersRef.current.delete(removed.id);
      }
      setTracks(tracksRef.current.filter((_, i) => i !== trackIndex));
    },
    [perTrack]
  );

  return (
    <ToolShell
      slug="audio"
      title={t("title")}
      sub={t("subtitle")}
      primaryAction={{
        label: t("export"),
        onClick: () => setExportOpen(true),
        disabled: tracks.length === 0,
      }}
    >
      {tracks.length === 0 ? (
        <ImportDropzone onFiles={importFiles} />
      ) : (
        <WaveformPlaylistProvider
          tracks={tracks}
          onTracksChange={handleTracksChange}
          effects={master.masterEffects}
          sampleRate={STUDIO_SAMPLE_RATE}
          timescale
          waveHeight={96}
          automaticScroll
          controls={{ show: true, width: 200 }}
          {...(theme ? { theme } : {})}
        >
          <ClipInteractionProvider snap>
            <KeyboardShortcuts playback clipSplitting undo />
            <div className="flex flex-col gap-3">
              <TransportBar tracks={tracks} />
              <div className="overflow-x-auto rounded-lg border border-[var(--bt-border)]">
                <Waveform
                  showClipHeaders
                  renderTrackControls={(trackIndex) => (
                    <TrackControls
                      trackIndex={trackIndex}
                      tracks={tracks}
                      onRemove={removeTrack}
                    />
                  )}
                  onRemoveTrack={removeTrack}
                />
              </div>
              <div className="flex items-center gap-3">
                <ImportDropzone onFiles={importFiles} compact />
                {/* TODO(task 8): <RecordControl tracks={tracks} setTracks={setTracks} /> */}
                <span className="ms-auto text-sm opacity-60">
                  {t("trackCount", { count: tracks.length })}
                </span>
              </div>
              <EffectsPanel tracks={tracks} master={master} perTrack={perTrack} />
              {/* TODO(task 9): <ExportDialog open={exportOpen} onOpenChange={setExportOpen} tracks={tracks} /> */}
            </div>
          </ClipInteractionProvider>
        </WaveformPlaylistProvider>
      )}
    </ToolShell>
  );
}
