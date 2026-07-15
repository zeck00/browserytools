"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const { isPlaying } = usePlaybackAnimation();
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

  const divider = <div className="mx-1 h-5 w-px bg-[var(--bt-line)]" />;

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <Button size="sm" variant="ghost" onClick={() => (isPlaying ? pause() : play())} aria-label={isPlaying ? t("pause") : t("play")}>
        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <Button size="sm" variant="ghost" onClick={stop} aria-label={t("stop")}>
        <Square className="size-4" />
      </Button>
      <span
        className="mx-2 min-w-[7.5rem] text-center font-mono text-[13px] tabular-nums text-[var(--bt-ink)]"
        data-testid="transport-time"
      >
        <LiveTime formatTime={formatTime} /> / {formatTime(duration)}
      </span>
      <Button size="sm" variant="ghost" onClick={zoomIn} aria-label={t("zoomIn")}><ZoomIn className="size-4" /></Button>
      <Button size="sm" variant="ghost" onClick={zoomOut} aria-label={t("zoomOut")}><ZoomOut className="size-4" /></Button>
      {divider}
      <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo} aria-label={t("undo")} data-testid="undo-button">
        <Undo2 className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={redo} disabled={!canRedo} aria-label={t("redo")}><Redo2 className="size-4" /></Button>
      {divider}
      <Button size="sm" variant="ghost" onClick={() => { if (requireTrack()) splitClipAtPlayhead(); }} data-testid="split-button">
        <Scissors className="me-1 size-4" />{t("split")}
      </Button>
      <Button size="sm" variant="ghost" onClick={deleteSelection}>
        <Trash2 className="me-1 size-4" />{t("deleteRegion")}
      </Button>
      {divider}
      <Button size="sm" variant="ghost" onClick={() => fade("in")}>{t("fadeIn")}</Button>
      <Button size="sm" variant="ghost" onClick={() => fade("out")}>{t("fadeOut")}</Button>
      <Input
        type="number" min={0.1} max={30} step={0.1} value={fadeSec}
        onChange={(e) => setFadeSec(Number(e.target.value) || 1)}
        className="h-8 w-14" aria-label={t("fadeSeconds")}
      />
    </div>
  );
}

/**
 * Live current-time readout for the transport clock.
 *
 * `usePlaybackAnimation().currentTime` is React state that the library only
 * updates on pause/stop/seek/loop-boundaries — it does NOT tick during
 * playback (the 60fps position updates only ever touch `currentTimeRef` and
 * the shared frame-callback registry, never `setState`). Rendering
 * `formatTime(currentTime)` directly therefore freezes the clock while
 * playing.
 *
 * This mirrors the library's own `AudioPosition` component exactly
 * (node_modules/@waveform-playlist/browser/dist/index.mjs ~L3588-3610):
 *  - while playing, a registered frame callback imperatively writes
 *    `formatTime(time)` into the span's `textContent` at animation-frame
 *    rate, bypassing React re-renders;
 *  - an unconditional effect (no dependency array, runs after every render)
 *    re-syncs `textContent` from `currentTimeRef.current` whenever not
 *    playing. This is what keeps the readout correct immediately after
 *    pause/stop/seek even though the frame callback has gone quiet: this
 *    component re-renders on those transitions because
 *    `usePlaybackAnimation()` subscribes to the whole animation context, and
 *    the context value object is recreated whenever ANY of its state
 *    (including the `currentTime` state field) changes — so no explicit
 *    `currentTime` dependency is needed here, exactly as in `AudioPosition`.
 *  - the initial render (and every render) also renders
 *    `formatTime(currentTimeRef.current)` as JSX children so the correct
 *    paused position is visible immediately on mount, before any effect
 *    runs.
 */
function LiveTime({ formatTime }: { formatTime: (seconds: number) => string }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const { isPlaying, currentTimeRef, registerFrameCallback, unregisterFrameCallback } = usePlaybackAnimation();

  useEffect(() => {
    const id = "transport-bar-current-time";
    if (isPlaying) {
      registerFrameCallback(id, ({ time }) => {
        if (spanRef.current) {
          spanRef.current.textContent = formatTime(time);
        }
      });
    }
    return () => unregisterFrameCallback(id);
  }, [isPlaying, formatTime, registerFrameCallback, unregisterFrameCallback]);

  useEffect(() => {
    if (!isPlaying && spanRef.current) {
      spanRef.current.textContent = formatTime(currentTimeRef.current ?? 0);
    }
  });

  return <span ref={spanRef}>{formatTime(currentTimeRef.current ?? 0)}</span>;
}
