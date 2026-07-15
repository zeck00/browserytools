/**
 * Encode an AudioBuffer to a 16-bit PCM WAV Blob. Used to persist a track's
 * source audio to IndexedDB (uniform for imported and recorded tracks) so a
 * session survives an accidental refresh; on restore the blob is decoded back
 * to an AudioBuffer. Uncompressed, but IndexedDB handles the size and the
 * editor already warns on very large sessions.
 */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const len = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;

  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
      offset += 2;
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}
