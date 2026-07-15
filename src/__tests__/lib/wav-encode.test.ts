import { describe, it, expect } from "vitest";
import { encodeWav } from "@/lib/audio/wav-encode";

/** Minimal AudioBuffer stand-in — encodeWav only reads these four members. */
function fakeBuffer(channels: number[][], sampleRate: number) {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0].length,
    getChannelData: (c: number) => Float32Array.from(channels[c]),
  } as unknown as AudioBuffer;
}

describe("encodeWav", () => {
  it("writes a valid mono 16-bit PCM WAV header and clamped samples", async () => {
    const buf = fakeBuffer([[0, 0.5, -0.5, 2 /* clamps to 1 */]], 8000);
    const blob = encodeWav(buf);
    expect(blob.type).toBe("audio/wav");
    const view = new DataView(await blob.arrayBuffer());
    const ascii = (o: number) =>
      String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    expect(ascii(0)).toBe("RIFF");
    expect(ascii(8)).toBe("WAVE");
    expect(ascii(12)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(8000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bit depth
    expect(ascii(36)).toBe("data");
    const dataSize = 4 * 1 * 2;
    expect(view.getUint32(40, true)).toBe(dataSize);
    expect(view.getUint32(4, true)).toBe(36 + dataSize);
    // samples (int16 LE): 0, 0.5*0x7fff, -0.5*0x8000, clamp 1 -> 0x7fff
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(view.getInt16(48, true)).toBe(Math.round(-0.5 * 0x8000));
    expect(view.getInt16(50, true)).toBe(0x7fff);
  });

  it("interleaves stereo channels and sizes the buffer for both", async () => {
    const buf = fakeBuffer([[1, 0], [0, 1]], 44100);
    const blob = encodeWav(buf);
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getUint16(22, true)).toBe(2); // stereo
    expect(view.getUint16(32, true)).toBe(4); // block align = 2ch * 2 bytes
    expect(view.getUint32(28, true)).toBe(44100 * 4); // byte rate
    expect(view.getUint32(40, true)).toBe(2 /*frames*/ * 4);
    // frame 0: L=1(0x7fff) R=0 ; frame 1: L=0 R=1(0x7fff)
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(0);
    expect(view.getInt16(48, true)).toBe(0);
    expect(view.getInt16(50, true)).toBe(0x7fff);
  });
});
