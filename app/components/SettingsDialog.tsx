import { useEffect, useState } from "react";
import {
  ExternalLink,
  Grid3x3,
  KeyRound,
  Lightbulb,
  Loader2,
  Palette,
  RotateCcw,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Slider } from "~/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { useProvidersStore } from "~/store/useProvidersStore";
import {
  DEFAULT_GRID,
  DEFAULT_LIGHTING,
  useSettingsStore,
} from "~/store/useSettingsStore";
import type { GridSettings, LightingSettings } from "~/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const setKey = useProvidersStore((s) => s.setKey);
  const configured = useProvidersStore(
    (s) => Boolean(s.providers.openrouter?.configured),
  );
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("providers");

  useEffect(() => {
    if (open) {
      setValue("");
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    const ok = await setKey("openrouter", trimmed);
    setBusy(false);
    if (ok) {
      toast.success("API key saved");
      onOpenChange(false);
    } else {
      toast.error("Couldn't save the API key", {
        description: "The backend may not support storing keys in this mode.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure AI providers and viewport appearance. Keys are stored
            encrypted with your OS keychain.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="providers">
              <KeyRound className="size-3.5" />
              Providers
            </TabsTrigger>
            <TabsTrigger value="lighting">
              <Sun className="size-3.5" />
              Lighting
            </TabsTrigger>
            <TabsTrigger value="grid">
              <Grid3x3 className="size-3.5" />
              Grid
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="mt-4">
            <ProvidersPanel
              value={value}
              setValue={setValue}
              configured={configured}
              busy={busy}
              onSubmit={submit}
            />
          </TabsContent>

          <TabsContent value="lighting" className="mt-4">
            <LightingPanel />
          </TabsContent>

          <TabsContent value="grid" className="mt-4">
            <GridPanel />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {tab === "providers" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submit()}
                disabled={busy || !value.trim()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ProvidersPanelProps {
  value: string;
  setValue: (v: string) => void;
  configured: boolean;
  busy: boolean;
  onSubmit: () => void;
}

function ProvidersPanel({
  value,
  setValue,
  configured,
  busy,
  onSubmit,
}: ProvidersPanelProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <KeyRound className="size-3" />
          OpenRouter API key
        </label>
        {configured ? (
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Configured
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">Not set</span>
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) onSubmit();
        }}
        placeholder={configured ? "Enter a new key to replace it" : "sk-or-v1-…"}
        type="password"
        className="font-mono text-sm"
        autoFocus
      />
      <a
        href="https://openrouter.ai/keys"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
      >
        Get a key at openrouter.ai/keys
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

function LightingPanel() {
  const lighting = useSettingsStore((s) => s.lighting);
  const setLighting = useSettingsStore((s) => s.setLighting);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lights
        </h4>
        <SliderRow
          label="Ambient intensity"
          value={lighting.ambientIntensity}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => setLighting({ ambientIntensity: v })}
        />
        <SliderRow
          label="Key light intensity"
          value={lighting.directionalIntensity}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => setLighting({ directionalIntensity: v })}
        />
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Key light direction
        </h4>
        <SliderRow
          label="Azimuth"
          value={lighting.azimuth}
          min={0}
          max={360}
          step={1}
          format={(v) => `${Math.round(v)}°`}
          onChange={(v) => setLighting({ azimuth: v })}
        />
        <SliderRow
          label="Elevation"
          value={lighting.elevation}
          min={-10}
          max={90}
          step={1}
          format={(v) => `${Math.round(v)}°`}
          onChange={(v) => setLighting({ elevation: v })}
        />
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Shading
        </h4>
        <SliderRow
          label="Roughness"
          value={lighting.roughness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setLighting({ roughness: v })}
        />
        <SliderRow
          label="Metalness"
          value={lighting.metalness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setLighting({ metalness: v })}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Lightbulb className="size-3" />
            Rim light (backlight for contrast)
          </div>
          <Button
            type="button"
            variant={lighting.rimLight ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-[11px]"
            aria-pressed={lighting.rimLight}
            onClick={() => setLighting({ rimLight: !lighting.rimLight })}
          >
            {lighting.rimLight ? "On" : "Off"}
          </Button>
        </div>
        {lighting.rimLight && (
          <SliderRow
            label="Rim intensity"
            value={lighting.rimIntensity}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => setLighting({ rimIntensity: v })}
          />
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rendering
        </h4>
        <SliderRow
          label="Tone mapping exposure"
          value={lighting.toneMappingExposure}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => setLighting({ toneMappingExposure: v })}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Palette className="size-3" />
            Soft contact shadow
          </div>
          <Button
            type="button"
            variant={lighting.contactShadows ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-[11px]"
            aria-pressed={lighting.contactShadows}
            onClick={() => setLighting({ contactShadows: !lighting.contactShadows })}
          >
            {lighting.contactShadows ? "On" : "Off"}
          </Button>
        </div>
        <ColorRow
          label="Model color"
          value={lighting.modelColor}
          onChange={(v) => setLighting({ modelColor: v })}
        />
      </section>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={() => setLighting(DEFAULT_LIGHTING satisfies LightingSettings)}
      >
        <RotateCcw className="size-3.5" />
        Reset to defaults
      </Button>
    </div>
  );
}

function GridPanel() {
  const grid = useSettingsStore((s) => s.grid);
  const setGrid = useSettingsStore((s) => s.setGrid);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Spacing
        </h4>
        <SliderRow
          label="Cell size"
          value={grid.cellSize}
          min={0.5}
          max={50}
          step={0.5}
          format={(v) => `${v}`}
          onChange={(v) => setGrid({ cellSize: v })}
        />
        <SliderRow
          label="Section size"
          value={grid.sectionSize}
          min={5}
          max={200}
          step={5}
          format={(v) => `${v}`}
          onChange={(v) => setGrid({ sectionSize: v })}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Cells stay near these sizes when zoomed in and coarsen automatically
          as you zoom out so the grid stays readable.
        </p>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Orientation
        </h4>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Grid3x3 className="size-3" />
            View grid from below
          </div>
          <Button
            type="button"
            variant={grid.viewFromBelow ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-[11px]"
            aria-pressed={grid.viewFromBelow}
            onClick={() => setGrid({ viewFromBelow: !grid.viewFromBelow })}
          >
            {grid.viewFromBelow ? "On" : "Off"}
          </Button>
        </div>
      </section>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={() => setGrid(DEFAULT_GRID satisfies GridSettings)}
      >
        <RotateCcw className="size-3.5" />
        Reset to defaults
      </Button>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase text-muted-foreground">
          {value}
        </span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="size-7 cursor-pointer rounded-md border bg-transparent p-0"
        />
      </div>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: SliderRowProps) {
  const display = format
    ? format(value)
    : Number.isInteger(step)
      ? `${Math.round(value)}`
      : value.toFixed(2);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {display}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(arr) => onChange(arr[0] ?? value)}
      />
    </div>
  );
}
