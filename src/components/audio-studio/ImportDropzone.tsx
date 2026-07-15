"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";

export function ImportDropzone({
  onFiles,
  compact,
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
}) {
  const t = useTranslations("Tools.AudioEditor");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      onFiles(Array.from(list));
    },
    [onFiles]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handle(e.dataTransfer.files);
      }}
      className={
        "flex cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed transition-colors " +
        (dragOver ? "border-[var(--bt-accent)] bg-[var(--bt-accent)]/5 " : "border-[var(--bt-line)] ") +
        (compact ? "px-4 py-2 text-sm" : "flex-col px-6 py-16")
      }
    >
      <Upload className={compact ? "size-4" : "size-8 opacity-60"} aria-hidden />
      <div className={compact ? "" : "text-center"}>
        <p className="font-medium">{compact ? t("addFiles") : t("dropTitle")}</p>
        {!compact && <p className="mt-1 text-sm opacity-60">{t("dropHint")}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus,.webm"
        multiple
        hidden
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
        data-testid="audio-file-input"
      />
    </div>
  );
}
