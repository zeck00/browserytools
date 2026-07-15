"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useDynamicEffects,
  useTrackDynamicEffects,
  effectDefinitions,
  effectCategories,
  getEffectDefinition,
} from "@waveform-playlist/browser/tone";
import { usePlaylistState } from "@waveform-playlist/browser";
import type { ClipTrack } from "@waveform-playlist/core";
import { SliderRow } from "@/components/shared/SliderRow";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X } from "lucide-react";

type ParamValue = number | string | boolean;

// The library's active-effect entries (from @waveform-playlist/browser/tone),
// narrowed to what this panel reads. `params` is the current value bag.
type ActiveLike = {
  instanceId: string;
  effectId: string;
  params?: Record<string, ParamValue>;
};

type EffectParam = (typeof effectDefinitions)[number]["parameters"][number];

function formatNumber(v: number, param: EffectParam): string {
  const step = param.step ?? 0.01;
  const r = step >= 1 ? Math.round(v) : step >= 0.1 ? Number(v.toFixed(1)) : Number(v.toFixed(2));
  return param.unit ? `${r} ${param.unit}` : String(r);
}

/**
 * One effect parameter, controlled by local state so the control reflects the
 * user's own edits without depending on the effects hook re-emitting `params`.
 * Renders by parameter type — number (slider), select (dropdown), boolean
 * (switch) — so the full library catalog is editable, not just numeric effects.
 * Remounted per effect instance via the parent key, so it resets cleanly.
 */
function ParamControl({
  param,
  initial,
  onChange,
}: {
  param: EffectParam;
  initial: ParamValue;
  onChange: (value: ParamValue) => void;
}) {
  const [value, setValue] = useState<ParamValue>(initial);
  const set = (v: ParamValue) => {
    setValue(v);
    onChange(v);
  };

  if (param.type === "number") {
    const num = typeof value === "number" ? value : Number(value);
    return (
      <SliderRow
        label={param.label}
        value={num}
        display={formatNumber(num, param)}
        min={param.min ?? 0}
        max={param.max ?? 1}
        step={param.step ?? 0.01}
        onChange={(v) => set(v)}
      />
    );
  }

  if (param.type === "select") {
    return (
      <label className="flex items-center justify-between gap-3 text-[13px] text-[var(--bt-ink)]">
        <span>{param.label}</span>
        <Select value={String(value)} onValueChange={(v) => set(v)}>
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {param.options?.map((o) => (
              <SelectItem key={String(o.value)} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    );
  }

  // boolean
  return (
    <label className="flex items-center justify-between gap-3 text-[13px] text-[var(--bt-ink)]">
      <span>{param.label}</span>
      <Switch checked={Boolean(value)} onCheckedChange={(c) => set(c)} />
    </label>
  );
}

function AddEffectPicker({ onAdd }: { onAdd: (effectId: string) => void }) {
  const t = useTranslations("Tools.AudioEditor");
  const tc = useTranslations("Common");
  const [open, setOpen] = useState(false);

  const grouped = useMemo(
    () =>
      effectCategories
        .map((cat) => ({ cat, defs: effectDefinitions.filter((d) => d.category === cat.id) }))
        .filter((g) => g.defs.length > 0),
    []
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--bt-line)] bg-[var(--bt-surface)] px-3 text-[13px] font-medium text-[var(--bt-ink)] transition-colors hover:bg-[var(--bt-hover)]"
      >
        <Plus className="size-4 opacity-60" />
        {t("addEffect")}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--bt-line)] bg-[var(--bt-surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--bt-ink)]">{t("addEffect")}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid size-6 place-items-center rounded-md text-[var(--bt-muted)] hover:bg-[var(--bt-hover)] hover:text-[var(--bt-ink)]"
          aria-label={tc("close")}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex max-h-72 flex-col gap-3 overflow-auto">
        {grouped.map(({ cat, defs }) => (
          <div key={cat.id}>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--bt-muted)]">
              {cat.name}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {defs.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  title={def.description}
                  onClick={() => {
                    onAdd(def.id);
                    setOpen(false);
                  }}
                  className="inline-flex h-7 items-center rounded-full border border-[var(--bt-line)] bg-[var(--bt-bg)] px-2.5 text-xs font-medium text-[var(--bt-ink)] transition-colors hover:bg-[var(--bt-hover)]"
                >
                  {def.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
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
  onParam: (instanceId: string, param: string, value: ParamValue) => void;
}) {
  const t = useTranslations("Tools.AudioEditor");
  return (
    <div className="flex flex-col gap-3">
      {active.map((fx) => {
        const def = getEffectDefinition(fx.effectId);
        if (!def) return null;
        return (
          <div
            key={fx.instanceId}
            className="rounded-lg border border-[var(--bt-line)] bg-[var(--bt-surface)] p-3"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--bt-ink)]">{def.name}</span>
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
              {def.parameters.map((p) => (
                <ParamControl
                  key={p.name}
                  param={p}
                  initial={fx.params?.[p.name] ?? p.default}
                  onChange={(v) => onParam(fx.instanceId, p.name, v)}
                />
              ))}
            </div>
          </div>
        );
      })}
      <AddEffectPicker onAdd={onAdd} />
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
