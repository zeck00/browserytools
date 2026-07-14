"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useExportWav, useDynamicEffects, useTrackDynamicEffects } from "@waveform-playlist/browser/tone";
import { usePlaylistData } from "@waveform-playlist/browser";
import type { ClipTrack } from "@waveform-playlist/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadBlob } from "@/lib/download";
import { convertWav, type ExportFormat } from "@/lib/audio/export";

const FORMATS: ExportFormat[] = ["wav", "mp3", "ogg", "flac"];

export function ExportDialog({
  open,
  onOpenChange,
  tracks,
  master,
  perTrack,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tracks: ClipTrack[];
  master: ReturnType<typeof useDynamicEffects>;
  perTrack: ReturnType<typeof useTrackDynamicEffects>;
}) {
  const t = useTranslations("Tools.AudioEditor");
  const { trackStates } = usePlaylistData();
  const { exportWav, isExporting } = useExportWav();
  const [format, setFormat] = useState<ExportFormat>("wav");
  const [converting, setConverting] = useState(false);

  const run = useCallback(async () => {
    try {
      const result = await exportWav(tracks, trackStates, {
        autoDownload: false,
        applyEffects: true,
        effectsFunction: master.createOfflineEffectsFunction(),
        createOfflineTrackEffects: perTrack.createOfflineTrackEffectsFunction,
      });
      setConverting(true);
      const out = await convertWav(result.blob, format);
      downloadBlob(out, `mix.${format}`);
      onOpenChange(false);
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      setConverting(false);
    }
  }, [exportWav, tracks, trackStates, master, perTrack, format, onOpenChange, t]);

  const busy = isExporting || converting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("exportTitle")}</DialogTitle>
        </DialogHeader>
        <label className="flex items-center gap-3 text-sm">
          <span className="opacity-60">{t("format")}</span>
          <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
            <SelectTrigger className="w-32" data-testid="export-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map((f) => (
                <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button onClick={run} disabled={busy || tracks.length === 0} data-testid="export-run">
          {isExporting ? t("exporting") : converting ? t("converting") : t("export")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
