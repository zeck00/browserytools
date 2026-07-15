"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useDynamicEffects,
  useTrackDynamicEffects,
} from "@waveform-playlist/browser/tone";
import { usePlaylistState } from "@waveform-playlist/browser";
import type { ClipTrack } from "@waveform-playlist/core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SliderRow } from "@/components/shared/SliderRow";
import { Plus, X } from "lucide-react";

type EffectParam = { name: string; min: number; max: number; step: number; default: number };
const CURATED: { id: string; labelKey: string; params: EffectParam[] }[] = [
  {
    id: "eq3",
    labelKey: "effectEq3",
    params: [
      { name: "low", min: -24, max: 24, step: 0.5, default: 0 },
      { name: "mid", min: -24, max: 24, step: 0.5, default: 0 },
      { name: "high", min: -24, max: 24, step: 0.5, default: 0 },
    ],
  },
  {
    id: "reverb",
    labelKey: "effectReverb",
    params: [
      { name: "decay", min: 0.1, max: 10, step: 0.1, default: 1.5 },
      { name: "wet", min: 0, max: 1, step: 0.01, default: 0.35 },
    ],
  },
  {
    id: "feedbackDelay",
    labelKey: "effectFeedbackDelay",
    params: [
      { name: "delayTime", min: 0.01, max: 1, step: 0.01, default: 0.25 },
      { name: "feedback", min: 0, max: 0.95, step: 0.01, default: 0.4 },
      { name: "wet", min: 0, max: 1, step: 0.01, default: 0.35 },
    ],
  },
  {
    id: "compressor",
    labelKey: "effectCompressor",
    params: [
      { name: "threshold", min: -60, max: 0, step: 1, default: -24 },
      { name: "ratio", min: 1, max: 20, step: 0.5, default: 4 },
      { name: "attack", min: 0.001, max: 1, step: 0.001, default: 0.003 },
      { name: "release", min: 0.01, max: 1, step: 0.01, default: 0.25 },
    ],
  },
];

// Narrows the library's ActiveEffect / TrackActiveEffect entries (from
// @waveform-playlist/browser/tone) to the fields this panel reads. Verified
// against node_modules/@waveform-playlist/browser/dist/tone.d.ts: the active
// parameter bag is named `params` (not `parameters`), values are
// `number | string | boolean` (our curated effects only ever store numbers),
// and `bypassed` is a required boolean there — optional here is a safe widening.
type ActiveLike = {
  instanceId: string;
  effectId: string;
  params?: Record<string, number | string | boolean>;
  bypassed?: boolean;
};

function formatParam(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  if (step >= 0.1) return value.toFixed(1);
  return value.toFixed(2);
}

/**
 * One effect parameter, controlled by local state so the slider reflects the
 * user's own drags without depending on the effects hook re-emitting `params`
 * per tick (it seeds from the active param value / curated default). Remounted
 * per effect instance via the parent's `key`, so switching tracks or re-adding
 * an effect resets cleanly.
 */
function EffectParamRow({
  param,
  initial,
  onChange,
}: {
  param: EffectParam;
  initial: number;
  onChange: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SliderRow
      label={param.name}
      value={value}
      display={formatParam(value, param.step)}
      min={param.min}
      max={param.max}
      step={param.step}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

function EffectChain({
  active,
  onAdd,
  onRemove,
  onParam,
}: {
  active: ActiveLike[];
  onAdd: (effectId: string) => void;
  onRemove: (instanceId: string) => void;
  onParam: (instanceId: string, param: string, value: number) => void;
}) {
  const t = useTranslations("Tools.AudioEditor");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {CURATED.map((def) => (
          <button
            key={def.id}
            type="button"
            onClick={() => onAdd(def.id)}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--bt-line)] bg-[var(--bt-surface)] px-2.5 text-xs font-medium text-[var(--bt-ink)] transition-colors hover:bg-[var(--bt-hover)]"
          >
            <Plus className="size-3.5 opacity-60" />
            {t(def.labelKey as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>
      {active.map((fx) => {
        const def = CURATED.find((d) => d.id === fx.effectId);
        if (!def) return null;
        return (
          <div
            key={fx.instanceId}
            className="rounded-lg border border-[var(--bt-line)] bg-[var(--bt-surface)] p-3"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--bt-ink)]">
                {t(def.labelKey as Parameters<typeof t>[0])}
              </span>
              <button
                type="button"
                onClick={() => onRemove(fx.instanceId)}
                aria-label={t("remove")}
                className="grid size-6 place-items-center rounded-md text-[var(--bt-muted)] transition-colors hover:bg-[var(--bt-hover)] hover:text-[var(--bt-ink)]"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {def.params.map((p) => (
                <EffectParamRow
                  key={p.name}
                  param={p}
                  initial={(fx.params?.[p.name] as number | undefined) ?? p.default}
                  onChange={(v) => onParam(fx.instanceId, p.name, v)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EffectsPanel({
  tracks,
  master,
  perTrack,
}: {
  tracks: ClipTrack[];
  master: ReturnType<typeof useDynamicEffects>;
  perTrack: ReturnType<typeof useTrackDynamicEffects>;
}) {
  const t = useTranslations("Tools.AudioEditor");
  const { selectedTrackId } = usePlaylistState();
  const selectedTrack = tracks.find((tr) => tr.id === selectedTrackId);

  return (
    <Tabs defaultValue="track" className="flex flex-col gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="track" className="flex-1">
          {t("trackEffects")}
        </TabsTrigger>
        <TabsTrigger value="master" className="flex-1">
          {t("masterEffects")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="track">
        {selectedTrack ? (
          <EffectChain
            active={perTrack.trackEffectsState.get(selectedTrack.id) ?? []}
            onAdd={(id) => perTrack.addEffectToTrack(selectedTrack.id, id)}
            onRemove={(iid) => perTrack.removeEffectFromTrack(selectedTrack.id, iid)}
            onParam={(iid, p, v) => perTrack.updateTrackEffectParameter(selectedTrack.id, iid, p, v)}
          />
        ) : (
          <p className="py-4 text-sm text-[var(--bt-muted)]">{t("selectTrackFirst")}</p>
        )}
      </TabsContent>
      <TabsContent value="master">
        <EffectChain
          active={master.activeEffects}
          onAdd={master.addEffect}
          onRemove={master.removeEffect}
          onParam={master.updateParameter}
        />
      </TabsContent>
    </Tabs>
  );
}
