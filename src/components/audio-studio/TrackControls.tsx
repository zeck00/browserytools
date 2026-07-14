"use client";

import { useTranslations } from "next-intl";
import {
  usePlaylistControls,
  usePlaylistData,
  usePlaylistState,
} from "@waveform-playlist/browser";
import type { ClipTrack } from "@waveform-playlist/core";
import { X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

export function TrackControls({
  trackIndex,
  tracks,
  onRemove,
  removeDisabled,
}: {
  trackIndex: number;
  tracks: ClipTrack[];
  onRemove?: (trackIndex: number) => void;
  /** True while this track is the one actively recording — removing it
   *  mid-take would silently drop the take (review finding 2). The
   *  AudioStudio-level guard in `removeTrack` is the source of truth; this
   *  just keeps the button from looking clickable in that state. */
  removeDisabled?: boolean;
}) {
  const t = useTranslations("Tools.AudioEditor");
  const { setTrackMute, setTrackSolo, setTrackVolume, setTrackPan, setSelectedTrackId } =
    usePlaylistControls();
  const { trackStates } = usePlaylistData();
  const { selectedTrackId } = usePlaylistState();
  const track = tracks[trackIndex];
  const state = trackStates[trackIndex];
  if (!track || !state) return null;
  const selected = selectedTrackId === track.id;

  return (
    <div
      className={
        "flex h-full flex-col justify-center gap-1.5 px-3 py-2 text-xs " +
        (selected ? "bg-[var(--bt-accent)]/10" : "")
      }
      onClick={() => setSelectedTrackId(track.id)}
      data-testid={`track-controls-${trackIndex}`}
    >
      <div className="flex items-center gap-1">
        <p className="flex-1 truncate font-medium" title={track.name}>{track.name}</p>
        {onRemove && (
          <Button
            size="sm"
            variant="ghost"
            className="size-6 shrink-0 p-0"
            disabled={removeDisabled}
            onClick={(e) => { e.stopPropagation(); onRemove(trackIndex); }}
            aria-label={t("remove")}
            data-testid={`remove-track-${trackIndex}`}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={state.muted ? "default" : "outline"}
          className="h-6 px-2 text-[10px]"
          onClick={(e) => { e.stopPropagation(); setTrackMute(trackIndex, !state.muted); }}
          aria-pressed={state.muted}
        >
          {t("mute")}
        </Button>
        <Button
          size="sm"
          variant={state.soloed ? "default" : "outline"}
          className="h-6 px-2 text-[10px]"
          onClick={(e) => { e.stopPropagation(); setTrackSolo(trackIndex, !state.soloed); }}
          aria-pressed={state.soloed}
        >
          {t("solo")}
        </Button>
      </div>
      <label className="flex items-center gap-2">
        <span className="w-8 opacity-60">{t("volume")}</span>
        <Slider
          min={0} max={1} step={0.01} value={[state.volume]}
          onValueChange={([v]) => setTrackVolume(trackIndex, v)}
          className="w-24"
          aria-label={t("volume")}
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="w-8 opacity-60">{t("pan")}</span>
        <Slider
          min={-1} max={1} step={0.05} value={[state.pan]}
          onValueChange={([v]) => setTrackPan(trackIndex, v)}
          className="w-24"
          aria-label={t("pan")}
        />
      </label>
    </div>
  );
}
