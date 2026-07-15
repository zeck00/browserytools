"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  WaveformPlaylistProvider,
  Waveform,
  ClipInteractionProvider,
  KeyboardShortcuts,
} from "@waveform-playlist/browser";
import { useDynamicEffects, useTrackDynamicEffects } from "@waveform-playlist/browser/tone";
import { createTrack, type ClipTrack } from "@waveform-playlist/core";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorModeStore } from "@/store/editor-mode-store";
import { useWaveformTheme } from "@/lib/audio/waveform-theme";
import {
  decodeAudioFile,
  makeTrackFromFile,
  estimateDecodedBytes,
  STUDIO_SAMPLE_RATE,
} from "@/lib/audio/import";
import {
  hasSession,
  getDescriptor,
  getAudio,
  clearSession,
} from "@/lib/audio/session-store";
import { rehydrate } from "@/lib/audio/session-serialize";
import { AudioLanding } from "./AudioLanding";
import { ImportDropzone } from "./ImportDropzone";
import { TrackControls } from "./TrackControls";
import { TransportBar } from "./TransportBar";
import { EffectsPanel } from "./EffectsPanel";
import { RecordControl, type LiveRecordingState } from "./RecordControl";
import { ExportDialog } from "./ExportDialog";
import {
  SessionPersistence,
  RestoreEffectsApplier,
  type PendingEffects,
} from "./session-persistence";

const BIG_SESSION_BYTES = 500 * 1024 * 1024;
const LONG_FILE_SECONDS = 30 * 60;

export default function AudioStudio() {
  const t = useTranslations("Tools.AudioEditor");
  const [tracks, setTracks] = useState<ClipTrack[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [warnedBig, setWarnedBig] = useState(false);
  const [recordingState, setRecordingState] = useState<LiveRecordingState | undefined>(undefined);
  const theme = useWaveformTheme();
  const tracksRef = useRef<ClipTrack[]>([]);
  tracksRef.current = tracks;

  // Session persistence (Part C): source-audio blob keys (trackId -> IndexedDB
  // key), a dirty flag the beforeunload guard reads, whether a restorable
  // session exists, and effect chains queued for re-application after restore.
  const sourceKeysRef = useRef<Map<string, string>>(new Map());
  const dirtyRef = useRef(false);
  const [savedSessionAvailable, setSavedSessionAvailable] = useState(false);
  const [pendingEffects, setPendingEffects] = useState<PendingEffects | null>(null);

  // Editor focus mode (editor-mode-store): while active, the editor stamps
  // :root[data-editor="on"] so the shell hides the rail, drops the content
  // gutter and hides the SEO zone (rail/app-shell CSS modules). Cleared on
  // exit and on unmount so navigating away never strands the flag.
  const { active: editorActive, enter: enterEditor, exit: exitEditor } =
    useEditorModeStore();
  useEffect(() => {
    const el = document.documentElement;
    if (editorActive) el.dataset.editor = "on";
    else delete el.dataset.editor;
    return () => {
      delete el.dataset.editor;
    };
  }, [editorActive]);

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

  // Task 8 recording: RecordControl needs to create a brand-new track for the
  // armed record slot. Wrapper attachment must happen at creation time (see
  // the comment above), so RecordControl never calls core's `createTrack`
  // directly — it asks AudioStudio to do it, keeping the single attachment
  // point importFiles already established.
  const createArmedTrack = useCallback(
    (name: string): ClipTrack => {
      const track = createTrack({ name, clips: [] });
      track.effects = getEffectsWrapper(track.id);
      return track;
    },
    [getEffectsWrapper]
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      // Dropping files instead of restoring = start fresh: drop the old saved
      // session (and its blobs) so autosave writes a clean one.
      if (savedSessionAvailable) {
        await clearSession().catch(() => {});
        setSavedSessionAvailable(false);
      }
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
      // Importing audio opens the editor focus mode.
      enterEditor();
    },
    [t, warnedBig, getEffectsWrapper, enterEditor, savedSessionAvailable]
  );

  // Dispose the removed track's live Tone.js effect instances (finding 2:
  // clearTrackEffects is the only path that disposes them) and drop its cached
  // wrapper before removing it from state.
  //
  // Guard (review finding 2): if the track being removed is the one currently
  // armed/recording, `useIntegratedRecording`'s `stopRecording` would still
  // fire later against a `trackId` no longer present in `tracks`, which the
  // hook itself detects and turns into "Recording completed but track ...
  // no longer exists" — surfaced to the user as `rec.error` and rendered via
  // `t("micDenied")`, i.e. the take silently drops with a misleading
  // "mic access denied" message even though permission was fine. Block the
  // removal at the source instead of letting the take fail downstream.
  const removeTrack = useCallback(
    (trackIndex: number) => {
      const removed = tracksRef.current[trackIndex];
      if (!removed) return;
      if (recordingState?.isRecording && recordingState.trackId === removed.id) {
        toast.info(t("recording"));
        return;
      }
      perTrack.clearTrackEffects(removed.id);
      effectsWrappersRef.current.delete(removed.id);
      setTracks(tracksRef.current.filter((_, i) => i !== trackIndex));
    },
    [perTrack, recordingState, t]
  );

  const restoreSession = useCallback(async () => {
    const descriptor = await getDescriptor().catch(() => undefined);
    if (!descriptor) {
      setSavedSessionAvailable(false);
      return;
    }
    const { tracks: restored, audioKeys, trackEffects, masterEffects } = await rehydrate(
      descriptor,
      getAudio,
      decodeAudioFile
    );
    if (restored.length === 0) {
      toast.error(t("restoreFailed"));
      setSavedSessionAvailable(false);
      return;
    }
    // Reuse the stored blobs: map each restored track's new id to its key +
    // attach the effects wrapper at "creation" (same contract as import).
    restored.forEach((tr, i) => {
      sourceKeysRef.current.set(tr.id, audioKeys[i]);
      tr.effects = getEffectsWrapper(tr.id);
    });
    setTracks(restored);
    setPendingEffects({ trackEffects, masterEffects });
    setSavedSessionAvailable(false);
    enterEditor();
  }, [t, getEffectsWrapper, enterEditor]);

  const discardSession = useCallback(async () => {
    await clearSession().catch(() => {});
    sourceKeysRef.current.clear();
    setSavedSessionAvailable(false);
  }, []);

  // On mount, decide what to do with a saved session. `editorActive` can only
  // be true here after a client-side (SPA) navigation back into the editor —
  // a full reload resets the Zustand store. In that case the in-memory tracks
  // were lost on unmount, so auto-restore them straight back into the editor
  // (or drop to the landing if nothing was saved). On a fresh visit / reload,
  // offer the restore prompt instead.
  useEffect(() => {
    if (tracksRef.current.length > 0) return;
    const returnedToEditor = useEditorModeStore.getState().active;
    let cancelled = false;
    hasSession()
      .then((has) => {
        if (cancelled) return;
        if (returnedToEditor) {
          if (has) restoreSession();
          else exitEditor();
        } else if (has) {
          setSavedSessionAvailable(true);
        }
      })
      .catch(() => {
        if (!cancelled && returnedToEditor) exitEditor();
      });
    return () => {
      cancelled = true;
    };
  }, [restoreSession, exitEditor]);

  // beforeunload guard: warn only when there are genuinely unsaved edits (the
  // debounced autosave hasn't flushed yet), so a normal saved state never nags.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Landing: normal ToolShell page (SEO/crumb/title/related kept). Importing
  // audio, or "Open editor" on a resumed session, enters the editor.
  if (!editorActive) {
    return (
      <AudioLanding
        trackCount={tracks.length}
        onFiles={importFiles}
        onOpenEditor={enterEditor}
        canRestore={savedSessionAvailable}
        onRestore={restoreSession}
        onDiscard={discardSession}
      />
    );
  }

  // Editor focus mode: a full-width workspace inside the content region (the
  // top bar stays; the rail is hidden via :root[data-editor]). 4.5rem = the
  // 56px sticky top bar + the tools <main>'s py-2.
  return (
    <WaveformPlaylistProvider
      tracks={tracks}
      onTracksChange={handleTracksChange}
      effects={master.masterEffects}
      sampleRate={STUDIO_SAMPLE_RATE}
      timescale
      waveHeight={160}
      automaticScroll
      controls={{ show: true, width: 240 }}
      {...(theme ? { theme } : {})}
    >
      <ClipInteractionProvider snap>
        <KeyboardShortcuts playback clipSplitting undo />
        <div className="flex h-[calc(100dvh-4.5rem)] flex-col bg-[var(--bt-bg)] text-[var(--bt-ink)]">
          {/* header — Exit · title · transport · Export */}
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--bt-line)] px-4 py-2.5">
            <Button variant="ghost" size="sm" onClick={exitEditor} aria-label={t("exit")}>
              <ArrowLeft className="me-1 size-4" />
              {t("exit")}
            </Button>
            <span className="text-sm font-semibold text-[var(--bt-ink)]">
              {t("title")}
            </span>
            <div className="mx-1 hidden h-5 w-px bg-[var(--bt-line)] sm:block" />
            <TransportBar tracks={tracks} />
            <div className="ms-auto flex items-center gap-3">
              <span className="hidden text-xs text-[var(--bt-muted)] sm:inline">
                {t("trackCount", { count: tracks.length })}
              </span>
              <Button
                size="sm"
                onClick={() => setExportOpen(true)}
                disabled={tracks.length === 0}
              >
                <Download className="me-1.5 size-4" />
                {t("export")}
              </Button>
            </div>
          </header>

          {/* body — track lanes (main) + effects inspector (aside) */}
          <div className="flex min-h-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-auto">
                <Waveform
                  showClipHeaders
                  renderTrackControls={(trackIndex) => (
                    <TrackControls
                      trackIndex={trackIndex}
                      tracks={tracks}
                      onRemove={removeTrack}
                      removeDisabled={
                        recordingState?.isRecording &&
                        recordingState.trackId === tracks[trackIndex]?.id
                      }
                    />
                  )}
                  onRemoveTrack={removeTrack}
                  recordingState={recordingState}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-[var(--bt-line)] px-4 py-2.5">
                <ImportDropzone onFiles={importFiles} compact />
                <RecordControl
                  tracks={tracks}
                  setTracks={setTracks}
                  onRecordingState={setRecordingState}
                  createArmedTrack={createArmedTrack}
                />
              </div>
            </main>

            <aside className="flex w-80 shrink-0 flex-col overflow-auto border-s border-[var(--bt-line)] bg-[var(--bt-surface)]">
              <div className="border-b border-[var(--bt-line)] px-4 py-3">
                <h2 className="text-[13px] font-semibold text-[var(--bt-ink)]">
                  {t("effects")}
                </h2>
              </div>
              <div className="p-4">
                <EffectsPanel tracks={tracks} master={master} perTrack={perTrack} />
              </div>
            </aside>
          </div>

          <ExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            tracks={tracks}
            master={master}
            perTrack={perTrack}
          />
          <SessionPersistence
            tracks={tracks}
            master={master}
            perTrack={perTrack}
            sourceKeysRef={sourceKeysRef}
            dirtyRef={dirtyRef}
          />
          {pendingEffects && (
            <RestoreEffectsApplier
              pending={pendingEffects}
              tracks={tracks}
              master={master}
              perTrack={perTrack}
              onDone={() => setPendingEffects(null)}
            />
          )}
        </div>
      </ClipInteractionProvider>
    </WaveformPlaylistProvider>
  );
}
