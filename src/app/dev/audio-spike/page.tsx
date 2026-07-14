"use client";

import dynamic from "next/dynamic";

// A genuine dynamic `import()` (not `Promise.resolve(AlreadyImportedComponent)`)
// is required here: @waveform-playlist/ui-components reads `window` at module
// top-level (`DevicePixelRatioContext = createContext(getScale())`), so merely
// evaluating the module during Next's SSR pass throws "window is not defined" —
// `ssr: false` alone only skips the *render* call, not the static `import`
// statement that would otherwise sit at the top of this file.
const Spike = dynamic(() => import("./spike-inner"), { ssr: false });

export default function Page() {
  return <Spike />;
}
