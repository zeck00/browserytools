"use client";

import { useTranslations } from "next-intl";
import {
  usePlaylistControls,
  usePlaylistData,
  usePlaylistState,
} from "@waveform-playlist/browser";
import type { ClipTrack } from "@waveform-playlist/core";
import { X } from "lucide-react";
import { SliderRow } from "@/components/shared/SliderRow";

/** Mute/Solo pill — the app's pill treatment (landing filter chips): idle uses
 *  --bt-fill + --bt-pill-idle-fg, active uses --bt-pill-active-*. */
function TogglePill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "h-7 rounded-full px-3 text-[11px] font-medium transition-colors " +
        (active
          ? "bg-[var(--bt-pill-active-bg)] text-[var(--bt-pill-active-fg)]"
          : "bg-[var(--bt-fill)] text-[var(--bt-pill-idle-fg)] hover:bg-[var(--bt-fill-hover)]")
      }
    >
      {label}
    </button>
  );
}

function panDisplay(v: number): string {
  if (v < -0.02) return `L${Math.round(-v * 100)}`;
  if (v > 0.02) return `R${Math.round(v * 100)}`;
  return "C";
}

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
        "flex h-full flex-col justify-center gap-2 border-s-2 px-3.5 py-2.5 " +
        (selected ? "border-[var(--bt-accent)]" : "border-transparent")
      }
      // Capture-phase so a pointer-down ANYWHERE in the panel selects the track
      // before a child (e.g. a Radix slider, which swallows the click) handles
      // it — the control still works afterward.
      onPointerDownCapture={() => setSelectedTrackId(track.id)}
      data-testid={`track-controls-${trackIndex}`}
    >
      <div className="flex items-center gap-1">
        <p
          className="flex-1 truncate text-[13px] font-semibold text-[var(--bt-ink)]"
          title={track.name}
        >
          {track.name}
        </p>
        {onRemove && (
          <button
            type="button"
            disabled={removeDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(trackIndex);
            }}
            aria-label={t("remove")}
            data-testid={`remove-track-${trackIndex}`}
            className="grid size-6 shrink-0 place-items-center rounded-md text-[var(--bt-muted)] transition-colors hover:bg-[var(--bt-hover)] hover:text-[var(--bt-ink)] disabled:pointer-events-none disabled:opacity-40"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {/* Selection is handled by the panel's onPointerDownCapture, so touching
          any control here also selects the track and keeps the effects
          inspector in sync with what you're editing. */}
      <div className="flex gap-1.5">
        <TogglePill
          active={state.muted}
          onClick={() => setTrackMute(trackIndex, !state.muted)}
          label={t("mute")}
        />
        <TogglePill
          active={state.soloed}
          onClick={() => setTrackSolo(trackIndex, !state.soloed)}
          label={t("solo")}
        />
      </div>
      <div className="flex flex-col gap-2">
        <SliderRow
          label={t("volume")}
          value={state.volume}
          display={`${Math.round(state.volume * 100)}%`}
          onChange={(v) => setTrackVolume(trackIndex, v)}
          min={0}
          max={1}
          step={0.01}
        />
        <SliderRow
          label={t("pan")}
          value={state.pan}
          display={panDisplay(state.pan)}
          onChange={(v) => setTrackPan(trackIndex, v)}
          min={-1}
          max={1}
          step={0.05}
        />
      </div>
    </div>
  );
}
