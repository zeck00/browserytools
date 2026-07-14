"use client";

import { getFFmpeg } from "@/lib/media/ffmpeg";

export type ExportFormat = "wav" | "mp3" | "ogg" | "flac";

export const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

export function buildFfmpegArgs(
  format: Exclude<ExportFormat, "wav">,
  inName: string,
  outName: string
): string[] {
  switch (format) {
    case "mp3":
      return ["-i", inName, "-c:a", "libmp3lame", "-b:a", "192k", outName];
    case "ogg":
      return ["-i", inName, "-c:a", "libvorbis", "-q:a", "5", outName];
    case "flac":
      return ["-i", inName, "-c:a", "flac", outName];
  }
}

/** Convert a rendered WAV blob to the requested format via the shared ffmpeg singleton. */
export async function convertWav(wav: Blob, format: ExportFormat): Promise<Blob> {
  if (format === "wav") return wav;
  const ffmpeg = await getFFmpeg();
  const id = crypto.randomUUID();
  const inName = `mix-${id}.wav`;
  const outName = `mix-${id}.${format}`;
  await ffmpeg.writeFile(inName, new Uint8Array(await wav.arrayBuffer()));
  try {
    await ffmpeg.exec(buildFfmpegArgs(format, inName, outName));
    const data = (await ffmpeg.readFile(outName)) as Uint8Array;
    return new Blob([data.slice().buffer as ArrayBuffer], { type: MIME_BY_FORMAT[format] });
  } finally {
    await ffmpeg.deleteFile(inName).catch(() => {});
    await ffmpeg.deleteFile(outName).catch(() => {});
  }
}
