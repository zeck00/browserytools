"use client";

import dynamic from "next/dynamic";

// Tone.js / styled-components / worklets are client-only; keep them out of SSR
// and out of every other route's bundle.
const AudioStudio = dynamic(() => import("./AudioStudio"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center text-sm opacity-60">
      Loading…
    </div>
  ),
});

export default AudioStudio;
