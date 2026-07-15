"use client";

import { useTranslations } from "next-intl";
import { ToolShell } from "@/components/template/tool-shell";
import { Button } from "@/components/ui/button";
import { AudioLines, Pencil, RotateCcw } from "lucide-react";
import { ImportDropzone } from "./ImportDropzone";

/**
 * The /tools/audio landing — the normal ToolShell page (crumb, h1, sub,
 * related tiles, SEO all preserved). Importing audio enters the editor focus
 * mode; if a session already has tracks (after Exit), a summary card offers to
 * re-open the editor; and if a saved session from a previous visit exists, a
 * restore card offers to bring it back. The multi-track editor itself lives in
 * AudioStudio's editor branch, not here.
 */
export function AudioLanding({
  trackCount,
  onFiles,
  onOpenEditor,
  canRestore,
  onRestore,
  onDiscard,
}: {
  trackCount: number;
  onFiles: (files: File[]) => void;
  onOpenEditor: () => void;
  canRestore: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("Tools.AudioEditor");
  const hasTracks = trackCount > 0;

  // A saved session from a previous visit (only offered when the editor is
  // otherwise empty) — restore it or discard it and start fresh.
  const restoreCard = canRestore && !hasTracks && (
    <div className="mb-4 flex flex-col items-start gap-4 rounded-xl border border-[var(--bt-line)] bg-[var(--bt-surface)] p-6 sm:flex-row sm:items-center">
      <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-[var(--bt-fill)] text-[var(--bt-ink)]">
        <RotateCcw className="size-5" />
      </div>
      <div className="flex-1">
        <p className="text-[15px] font-semibold text-[var(--bt-ink)]">{t("restoreTitle")}</p>
        <p className="mt-0.5 text-sm text-[var(--bt-muted)]">{t("restoreHint")}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          {t("discard")}
        </Button>
        <Button onClick={onRestore}>
          <RotateCcw className="me-1.5 size-4" />
          {t("restore")}
        </Button>
      </div>
    </div>
  );

  // No ToolShell primaryAction: the session card below owns the single
  // "Open editor" CTA, so a controls-bar pill would just duplicate it.
  return (
    <ToolShell slug="audio" title={t("title")} sub={t("subtitle")}>
      {restoreCard}
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
