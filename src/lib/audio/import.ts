"use client";

import { createTrack, createClipFromSeconds, type ClipTrack } from "@waveform-playlist/core";
import { getFFmpeg } from "@/lib/media/ffmpeg";

export const STUDIO_SAMPLE_RATE = 48000;

let decodeCtx: AudioContext | null = null;
function getDecodeContext(): AudioContext {
  if (!decodeCtx) decodeCtx = new AudioContext({ sampleRate: STUDIO_SAMPLE_RATE });
  return decodeCtx;
}

/** Decode any audio file/blob; falls back to ffmpeg.wasm WAV transcode for exotic
 *  containers. Accepts a Blob so restored session blobs decode through the same path. */
export async function decodeAudioFile(file: Blob): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  try {
    return await getDecodeContext().decodeAudioData(bytes.slice(0));
  } catch {
    // Exotic format — transcode to WAV via the shared ffmpeg singleton, then decode.
    const ffmpeg = await getFFmpeg();
    const inName = `in-${crypto.randomUUID()}`;
    const outName = `${inName}.wav`;
    await ffmpeg.writeFile(inName, new Uint8Array(bytes));
    try {
      await ffmpeg.exec(["-i", inName, "-ar", String(STUDIO_SAMPLE_RATE), outName]);
      const wav = (await ffmpeg.readFile(outName)) as Uint8Array;
      return await getDecodeContext().decodeAudioData(wav.slice().buffer);
    } finally {
      await ffmpeg.deleteFile(inName).catch(() => {});
      await ffmpeg.deleteFile(outName).catch(() => {});
    }
  }
}

export function makeTrackFromFile(file: File, buffer: AudioBuffer): ClipTrack {
  const name = file.name.replace(/\.[^.]+$/, "");
  return createTrack({
    name,
    clips: [createClipFromSeconds({ audioBuffer: buffer, startTime: 0, name })],
  });
}

/** Rough decoded footprint: samples × channels × 4 bytes (Float32). */
export function estimateDecodedBytes(tracks: ClipTrack[]): number {
  let bytes = 0;
  for (const t of tracks)
    for (const c of t.clips)
      if (c.audioBuffer) bytes += c.audioBuffer.length * c.audioBuffer.numberOfChannels * 4;
  return bytes;
}
