"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  usePlaylistControls,
  usePlaylistState,
  usePlaybackAnimation,
} from "@waveform-playlist/browser";
import { useIntegratedRecording } from "@waveform-playlist/recording";
import type { ClipTrack } from "@waveform-playlist/core";
import { STUDIO_SAMPLE_RATE } from "@/lib/audio/import";
import { Button } from "@/components/ui/button";
import { Mic, Square, Plus } from "lucide-react";

export type LiveRecordingState = {
  isRecording: boolean;
  trackId: string;
  startSample: number;
  durationSamples: number;
  peaks: (Int8Array | Int16Array)[];
  bits: 16;
};

export function RecordControl({
  tracks,
  setTracks,
  onRecordingState,
  createArmedTrack,
}: {
  tracks: ClipTrack[];
  setTracks: (t: ClipTrack[]) => void;
  onRecordingState: (rs: LiveRecordingState | undefined) => void;
  /** Creates a new ClipTrack with its stable per-id effects wrapper already
   *  attached (see AudioStudio's `getEffectsWrapper`). Keeps wrapper
   *  attachment in one place — RecordControl must never build tracks with
   *  `createTrack` directly. */
  createArmedTrack: (name: string) => ClipTrack;
}) {
  const t = useTranslations("Tools.AudioEditor");
  const { setSelectedTrackId, setRecordingActive, play, stop } = usePlaylistControls();
  const { selectedTrackId } = usePlaylistState();
  const { getPlaybackTime } = usePlaybackAnimation();
  const [punchIn, setPunchIn] = useState(0);
  const rec = useIntegratedRecording(tracks, setTracks, selectedTrackId, { currentTime: punchIn });

  // Live waveform preview for the armed track.
  useEffect(() => {
    if (rec.isRecording && selectedTrackId) {
      onRecordingState({
        isRecording: true,
        trackId: selectedTrackId,
        startSample: Math.round(punchIn * STUDIO_SAMPLE_RATE),
        durationSamples: Math.floor(rec.duration * STUDIO_SAMPLE_RATE),
        peaks: rec.recordingPeaks,
        bits: 16,
      });
    } else {
      onRecordingState(undefined);
    }
  }, [rec.isRecording, rec.duration, rec.recordingPeaks, selectedTrackId, punchIn, onRecordingState]);

  const addRecordingTrack = useCallback(() => {
    const track = createArmedTrack(`${t("record")} ${tracks.length + 1}`);
    setTracks([...tracks, track]); // append-only: undo history survives
    setSelectedTrackId(track.id);
    // Acquire mic access at ARM time, not at start time. `rec` above is a
    // useIntegratedRecording instance scoped to `selectedTrackId` from THIS
    // render; if we instead awaited requestMicAccess() inside `start`, the
    // stream would land in this hook's state on a later render, but the
    // `startRecording` closure captured by that later `start` call still
    // can't see it in time — validated in a real-browser spike, this fails
    // with "No microphone stream available" on the first click. Requesting
    // here means hasPermission/stream have landed well before the Record
    // button is even enabled (it stays disabled until hasPermission is true).
    void rec.requestMicAccess();
  }, [tracks, setTracks, setSelectedTrackId, createArmedTrack, t, rec]);

  const start = useCallback(async () => {
    if (!rec.hasPermission || !rec.stream) {
      toast.error(rec.hasPermission ? t("micUnavailable") : t("micDenied"));
      return;
    }
    const at = getPlaybackTime();
    setPunchIn(at);
    setRecordingActive(true, selectedTrackId ?? undefined);
    const ok = await rec.startRecording();
    if (ok) await play(at);
    else setRecordingActive(false);
  }, [rec, getPlaybackTime, setRecordingActive, selectedTrackId, play, t]);

  const finish = useCallback(() => {
    rec.stopRecording();
    stop();
    setRecordingActive(false);
  }, [rec, stop, setRecordingActive]);

  const secure = typeof window !== "undefined" && (window.isSecureContext ?? false);
  const armed = tracks.some((tr) => tr.id === selectedTrackId);

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={addRecordingTrack}>
        <Plus className="me-1 size-4" />{t("addRecordingTrack")}
      </Button>
      {rec.isRecording ? (
        <Button size="sm" variant="destructive" onClick={finish} data-testid="stop-record">
          <Square className="me-1 size-4" />{t("stopRecording")}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={!armed || !secure || !rec.hasPermission}
          onClick={start}
          data-testid="start-record"
        >
          <Mic className="me-1 size-4" />{t("record")}
        </Button>
      )}
      {rec.isRecording && <span className="text-sm text-red-500">{t("recording")}</span>}
      {!secure && <span className="text-xs opacity-60">{t("micUnavailable")}</span>}
      {rec.error && <span className="text-xs text-red-500">{t("micDenied")}</span>}
    </div>
  );
}
