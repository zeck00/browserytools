"use client";

import { useTranslations } from "next-intl";
import { ToolShell } from "@/components/template/tool-shell";
import { Button } from "@/components/ui/button";
import { AudioLines, Pencil } from "lucide-react";
import { ImportDropzone } from "./ImportDropzone";

/**
 * The /tools/audio landing — the normal ToolShell page (crumb, h1, sub,
 * related tiles, SEO all preserved). Importing audio enters the editor focus
 * mode; if a session already has tracks (after Exit), a summary card offers to
 * re-open the editor. The multi-track editor itself lives in AudioStudio's
 * editor branch, not here.
 */
export function AudioLanding({
  trackCount,
  onFiles,
  onOpenEditor,
}: {
  trackCount: number;
  onFiles: (files: File[]) => void;
  onOpenEditor: () => void;
}) {
  const t = useTranslations("Tools.AudioEditor");
  const hasTracks = trackCount > 0;

  // No ToolShell primaryAction: the session card below owns the single
  // "Open editor" CTA, so a controls-bar pill would just duplicate it.
  return (
    <ToolShell slug="audio" title={t("title")} sub={t("subtitle")}>
      {hasTracks ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-start gap-4 rounded-xl border border-[var(--bt-line)] bg-[var(--bt-surface)] p-6 sm:flex-row sm:items-center">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-[var(--bt-fill)] text-[var(--bt-ink)]">
              <AudioLines className="size-5" />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-[var(--bt-ink)]">
                {t("trackCount", { count: trackCount })}
              </p>
              <p className="mt-0.5 text-sm text-[var(--bt-muted)]">
                {t("sessionReady")}
              </p>
            </div>
            <Button onClick={onOpenEditor}>
              <Pencil className="me-1.5 size-4" />
              {t("openEditor")}
            </Button>
          </div>
          <ImportDropzone onFiles={onFiles} compact />
        </div>
      ) : (
        <ImportDropzone onFiles={onFiles} />
      )}
    </ToolShell>
  );
}
