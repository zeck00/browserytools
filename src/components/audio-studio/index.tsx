"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

function StudioLoading() {
  const t = useTranslations("Tools.AudioEditor");
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm opacity-60">
      {t("loading")}
    </div>
  );
}

// Tone.js / styled-components / worklets are client-only; keep them out of SSR
// and out of every other route's bundle.
const AudioStudio = dynamic(() => import("./AudioStudio"), {
  ssr: false,
  loading: () => <StudioLoading />,
});

export default AudioStudio;
