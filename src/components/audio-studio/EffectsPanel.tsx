"use client";

import { useTranslations } from "next-intl";
import {
  useDynamicEffects,
  useTrackDynamicEffects,
} from "@waveform-playlist/browser/tone";
import { usePlaylistState } from "@waveform-playlist/browser";
import type { ClipTrack } from "@waveform-playlist/core";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X } from "lucide-react";

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
          <Button key={def.id} size="sm" variant="outline" onClick={() => onAdd(def.id)}>
            + {t(def.labelKey as Parameters<typeof t>[0])}
          </Button>
        ))}
      </div>
      {active.map((fx) => {
        const def = CURATED.find((d) => d.id === fx.effectId);
        if (!def) return null;
        return (
          <div key={fx.instanceId} className="rounded-md border border-[var(--bt-border)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">{t(def.labelKey as Parameters<typeof t>[0])}</span>
              <Button size="sm" variant="ghost" onClick={() => onRemove(fx.instanceId)} aria-label={t("remove")}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {def.params.map((p) => (
                <label key={p.name} className="flex items-center gap-2 text-xs">
                  <span className="w-16 opacity-60">{p.name}</span>
                  <Slider
                    min={p.min} max={p.max} step={p.step}
                    defaultValue={[(fx.params?.[p.name] as number | undefined) ?? p.default]}
                    onValueChange={([v]) => onParam(fx.instanceId, p.name, v)}
                  />
                </label>
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
    <div className="rounded-lg border border-[var(--bt-border)] p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("effects")}</h2>
      <Tabs defaultValue="track">
        <TabsList>
          <TabsTrigger value="track">
            {t("trackEffects")}{selectedTrack ? `: ${selectedTrack.name}` : ""}
          </TabsTrigger>
          <TabsTrigger value="master">{t("masterEffects")}</TabsTrigger>
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
            <p className="py-4 text-sm opacity-60">{t("selectTrackFirst")}</p>
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
    </div>
  );
}
