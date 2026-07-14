import { describe, it, expect } from "vitest";
import { buildFfmpegArgs, MIME_BY_FORMAT } from "@/lib/audio/export";

describe("buildFfmpegArgs", () => {
  it("encodes mp3 with libmp3lame at 192k", () => {
    expect(buildFfmpegArgs("mp3", "in.wav", "out.mp3")).toEqual([
      "-i", "in.wav", "-c:a", "libmp3lame", "-b:a", "192k", "out.mp3",
    ]);
  });
  it("encodes ogg with libvorbis q5", () => {
    expect(buildFfmpegArgs("ogg", "in.wav", "out.ogg")).toEqual([
      "-i", "in.wav", "-c:a", "libvorbis", "-q:a", "5", "out.ogg",
    ]);
  });
  it("encodes flac losslessly", () => {
    expect(buildFfmpegArgs("flac", "in.wav", "out.flac")).toEqual([
      "-i", "in.wav", "-c:a", "flac", "out.flac",
    ]);
  });
  it("has a mime type for every format", () => {
    expect(MIME_BY_FORMAT).toEqual({
      wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", flac: "audio/flac",
    });
  });
});
