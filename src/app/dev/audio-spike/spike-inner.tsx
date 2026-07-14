"use client";

import { useMemo, useState, useCallback } from "react";

import {
  WaveformPlaylistProvider,
  Waveform,
  ClipInteractionProvider,
  KeyboardShortcuts,
  usePlaylistControls,
  usePlaylistState,
  usePlaylistData,
  useClipSplitting,
} from "@waveform-playlist/browser";
import { useExportWav } from "@waveform-playlist/browser/tone";
import { createTrack, createClipFromSeconds, type ClipTrack } from "@waveform-playlist/core";
import { useIntegratedRecording } from "@waveform-playlist/recording";

const SR = 48000;
function sineBuffer(freq: number, seconds: number): AudioBuffer {
  const ctx = new OfflineAudioContext(1, SR * seconds, SR);
  const buf = ctx.createBuffer(1, SR * seconds, SR);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR) * 0.4;
  return buf;
}

export default function SpikeInner() {
  const initial = useMemo<ClipTrack[]>(
    () => [
      createTrack({ name: "Sine 440", clips: [createClipFromSeconds({ audioBuffer: sineBuffer(440, 5), startTime: 0 })] }),
      createTrack({ name: "Sine 220", clips: [createClipFromSeconds({ audioBuffer: sineBuffer(220, 5), startTime: 2 })] }),
    ],
    []
  );
  const [tracks, setTracks] = useState<ClipTrack[]>(initial);
  return (
    <WaveformPlaylistProvider tracks={tracks} onTracksChange={setTracks} sampleRate={SR} timescale waveHeight={96}>
      <ClipInteractionProvider>
        <KeyboardShortcuts playback clipSplitting undo />
        <SpikeControls tracks={tracks} setTracks={setTracks} />
        <Waveform showClipHeaders />
      </ClipInteractionProvider>
    </WaveformPlaylistProvider>
  );
}

function SpikeControls({ tracks, setTracks }: { tracks: ClipTrack[]; setTracks: (t: ClipTrack[]) => void }) {
  const { play, pause, stop, undo, redo, zoomIn, zoomOut, setSelectedTrackId, setRecordingActive } = usePlaylistControls();
  const { canUndo, canRedo, selectedTrackId } = usePlaylistState();
  const { trackStates, samplesPerPixel, playoutRef } = usePlaylistData();
  const { splitClipAtPlayhead } = useClipSplitting({ tracks, samplesPerPixel, engineRef: playoutRef });
  const { exportWav, isExporting } = useExportWav();
  const [recStart, setRecStart] = useState(0);
  const rec = useIntegratedRecording(tracks, setTracks, selectedTrackId, { currentTime: recStart });

  const armRecordTrack = useCallback(() => {
    const t = createTrack({ name: "Recording", clips: [] });
    setTracks([...tracks, t]);
    setSelectedTrackId(t.id);
  }, [tracks, setTracks, setSelectedTrackId]);

  const startRec = useCallback(async () => {
    await rec.requestMicAccess();
    setRecStart(0);
    setRecordingActive(true, selectedTrackId ?? undefined);
    const ok = await rec.startRecording();
    if (ok) await play();
  }, [rec, play, setRecordingActive, selectedTrackId]);

  const stopRec = useCallback(() => {
    rec.stopRecording();
    stop();
    setRecordingActive(false);
  }, [rec, stop, setRecordingActive]);

  const doExport = useCallback(async () => {
    const res = await exportWav(tracks, trackStates, { autoDownload: true, filename: "spike-mix" });
    console.log("[spike] export ok", res.duration, res.blob.size);
  }, [exportWav, tracks, trackStates]);

  return (
    <div style={{ display: "flex", gap: 8, padding: 12, flexWrap: "wrap" }}>
      <button onClick={() => play()}>Play</button>
      <button onClick={pause}>Pause</button>
      <button onClick={stop}>Stop</button>
      <button onClick={zoomIn}>+</button>
      <button onClick={zoomOut}>-</button>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
      <button onClick={() => console.log("[spike] split:", splitClipAtPlayhead())}>Split @ playhead</button>
      <button onClick={armRecordTrack}>Arm rec track</button>
      <button onClick={startRec} disabled={rec.isRecording}>Record</button>
      <button onClick={stopRec} disabled={!rec.isRecording}>Stop rec</button>
      <button onClick={doExport} disabled={isExporting}>Export WAV</button>
      <span>{rec.error?.message ?? ""}</span>
    </div>
  );
}
