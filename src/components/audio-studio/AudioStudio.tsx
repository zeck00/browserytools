"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
  const tracksWithEffects = useMemo(
    () =>
      tracks.map((tr) => ({
        ...tr,
        // `getTrackEffectsFunction` returns @waveform-playlist/playout's
        // TrackEffectsFunction (concrete Tone `Gain`/`ToneAudioNode` params),
        // while ClipTrack.effects is typed against @waveform-playlist/core's
        // TrackEffectsFunction (params erased to `unknown` so core stays
        // Tone-agnostic). The runtime engine invokes this field with real
        // Tone nodes either way — the two declared types are structurally
        // incompatible only because of that intentional erasure, so the cast
        // here is safe.
        effects: perTrack.getTrackEffectsFunction(tr.id) as ClipTrack["effects"],
      })),
    [tracks, perTrack.getTrackEffectsFunction]
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      const added: ClipTrack[] = [];
      for (const file of files) {
        try {
          const buffer = await decodeAudioFile(file);
          if (buffer.duration > LONG_FILE_SECONDS)
            toast.warning(t("longFileWarning", { name: file.name }));
          added.push(makeTrackFromFile(file, buffer));
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
    [t, warnedBig]
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
          tracks={tracksWithEffects}
          onTracksChange={setTracks}
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
                    <TrackControls trackIndex={trackIndex} tracks={tracks} />
                  )}
                  onRemoveTrack={(trackIndex) =>
                    setTracks(tracks.filter((_, i) => i !== trackIndex))
                  }
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
