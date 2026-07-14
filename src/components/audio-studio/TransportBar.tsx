"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  usePlaylistControls,
  usePlaylistState,
  usePlaylistData,
  usePlaybackAnimation,
  useClipSplitting,
} from "@waveform-playlist/browser";
import type { ClipTrack } from "@waveform-playlist/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play, Pause, Square, ZoomIn, ZoomOut, Undo2, Redo2, Scissors, Trash2,
} from "lucide-react";

export function TransportBar({ tracks }: { tracks: ClipTrack[] }) {
  const t = useTranslations("Tools.AudioEditor");
  const { play, pause, stop, zoomIn, zoomOut, undo, redo, formatTime } = usePlaylistControls();
  const { canUndo, canRedo, selectionStart, selectionEnd, selectedTrackId } = usePlaylistState();
  const { playoutRef, samplesPerPixel, sampleRate, duration } = usePlaylistData();
  const { isPlaying, currentTime } = usePlaybackAnimation();
  const { splitClipAtPlayhead } = useClipSplitting({ tracks, samplesPerPixel, engineRef: playoutRef });
  const [fadeSec, setFadeSec] = useState(1);

  const selectedTrack = tracks.find((tr) => tr.id === selectedTrackId);

  const requireTrack = useCallback((): ClipTrack | null => {
    if (!selectedTrack) {
      toast.info(t("selectTrackFirst"));
      return null;
    }
    return selectedTrack;
  }, [selectedTrack, t]);

  const deleteSelection = useCallback(async () => {
    const track = requireTrack();
    if (!track) return;
    if (selectionEnd <= selectionStart) {
      toast.info(t("selectionNeeded"));
      return;
    }
    const { deleteRegionFromClips } = await import("@/lib/audio/clip-edit");
    const clips = deleteRegionFromClips(
      track.clips,
      Math.round(selectionStart * sampleRate),
      Math.round(selectionEnd * sampleRate)
    );
    playoutRef.current?.updateTrack(track.id, { ...track, clips });
  }, [requireTrack, selectionStart, selectionEnd, sampleRate, playoutRef, t]);

  const fade = useCallback(
    async (direction: "in" | "out") => {
      const track = requireTrack();
      if (!track) return;
      const { applyEdgeFade } = await import("@/lib/audio/clip-edit");
      playoutRef.current?.updateTrack(track.id, {
        ...track,
        clips: applyEdgeFade(track.clips, direction, fadeSec),
      });
    },
    [requireTrack, fadeSec, playoutRef]
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--bt-border)] px-3 py-2">
      <Button size="sm" variant="outline" onClick={() => (isPlaying ? pause() : play())} aria-label={isPlaying ? t("pause") : t("play")}>
        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <Button size="sm" variant="outline" onClick={stop} aria-label={t("stop")}>
        <Square className="size-4" />
      </Button>
      <span className="mx-2 min-w-24 font-mono text-sm tabular-nums" data-testid="transport-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <Button size="sm" variant="ghost" onClick={zoomIn} aria-label={t("zoomIn")}><ZoomIn className="size-4" /></Button>
      <Button size="sm" variant="ghost" onClick={zoomOut} aria-label={t("zoomOut")}><ZoomOut className="size-4" /></Button>
      <div className="mx-1 h-5 w-px bg-[var(--bt-border)]" />
      <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo} aria-label={t("undo")} data-testid="undo-button">
        <Undo2 className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={redo} disabled={!canRedo} aria-label={t("redo")}><Redo2 className="size-4" /></Button>
      <div className="mx-1 h-5 w-px bg-[var(--bt-border)]" />
      <Button size="sm" variant="ghost" onClick={() => { if (requireTrack()) splitClipAtPlayhead(); }} data-testid="split-button">
        <Scissors className="me-1 size-4" />{t("split")}
      </Button>
      <Button size="sm" variant="ghost" onClick={deleteSelection}>
        <Trash2 className="me-1 size-4" />{t("deleteRegion")}
      </Button>
      <div className="mx-1 h-5 w-px bg-[var(--bt-border)]" />
      <Button size="sm" variant="ghost" onClick={() => fade("in")}>{t("fadeIn")}</Button>
      <Button size="sm" variant="ghost" onClick={() => fade("out")}>{t("fadeOut")}</Button>
      <Input
        type="number" min={0.1} max={30} step={0.1} value={fadeSec}
        onChange={(e) => setFadeSec(Number(e.target.value) || 1)}
        className="h-8 w-16" aria-label={t("fadeSeconds")}
      />
    </div>
  );
}
