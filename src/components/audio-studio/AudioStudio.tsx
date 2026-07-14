"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  WaveformPlaylistProvider,
  Waveform,
  ClipInteractionProvider,
  KeyboardShortcuts,
} from "@waveform-playlist/browser";
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

const BIG_SESSION_BYTES = 500 * 1024 * 1024;
const LONG_FILE_SECONDS = 30 * 60;

export default function AudioStudio() {
  const t = useTranslations("Tools.AudioEditor");
  const [tracks, setTracks] = useState<ClipTrack[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [warnedBig, setWarnedBig] = useState(false);
  const theme = useWaveformTheme();

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
      setTracks((prev) => {
        const next = [...prev, ...added]; // append-only keeps undo history
        const bytes = estimateDecodedBytes(next);
        if (!warnedBig && bytes > BIG_SESSION_BYTES) {
          toast.warning(t("bigSessionWarning", { mb: Math.round(bytes / 1024 / 1024) }));
          setWarnedBig(true);
        }
        return next;
      });
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
          tracks={tracks}
          onTracksChange={setTracks}
          sampleRate={STUDIO_SAMPLE_RATE}
          timescale
          waveHeight={96}
          automaticScroll
          {...(theme ? { theme } : {})}
        >
          <ClipInteractionProvider snap>
            <KeyboardShortcuts playback clipSplitting undo />
            <div className="flex flex-col gap-3">
              {/* TODO(task 6): <TransportBar tracks={tracks} /> */}
              <div className="overflow-x-auto rounded-lg border border-[var(--bt-border)]">
                <Waveform showClipHeaders />
                {/* TODO(task 5): renderTrackControls + onRemoveTrack props on Waveform */}
              </div>
              <div className="flex items-center gap-3">
                <ImportDropzone onFiles={importFiles} compact />
                {/* TODO(task 8): <RecordControl tracks={tracks} setTracks={setTracks} /> */}
                <span className="ms-auto text-sm opacity-60">
                  {t("trackCount", { count: tracks.length })}
                </span>
              </div>
              {/* TODO(task 7): <EffectsPanel tracks={tracks} /> */}
              {/* TODO(task 9): <ExportDialog open={exportOpen} onOpenChange={setExportOpen} tracks={tracks} /> */}
            </div>
          </ClipInteractionProvider>
        </WaveformPlaylistProvider>
      )}
    </ToolShell>
  );
}
