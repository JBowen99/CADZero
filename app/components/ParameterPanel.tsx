import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ParamDef } from "~/types";
import { extractScadMeta } from "~/lib/scad-meta";
import { patchScadParam } from "~/lib/scad-patcher";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useModelStore } from "~/store/useModelStore";
import { Slider } from "~/components/ui/slider";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";

const RENDER_DEBOUNCE_MS = 400;

interface GroupedParams {
  group: string;
  params: ParamDef[];
}

export function ParameterPanel() {
  const cadCode = useModelStore((s) => s.cadCode);
  const editActiveCode = useDocumentsStore((s) => s.editActiveCode);
  const renderActiveCode = useDocumentsStore((s) => s.renderActiveCode);
  const isRendering = useModelStore((s) => s.isRendering);

  const meta = useMemo(
    () => extractScadMeta(cadCode ?? ""),
    [cadCode],
  );
  const publicParams = useMemo(
    () => meta.params.filter((p) => p.public),
    [meta.params],
  );

  const groups = useMemo<GroupedParams[]>(() => {
    const map = new Map<string, ParamDef[]>();
    for (const p of publicParams) {
      const g = p.group ?? "Parameters";
      const arr = map.get(g);
      if (arr) arr.push(p);
      else map.set(g, [p]);
    }
    return Array.from(map, ([group, params]) => ({ group, params }));
  }, [publicParams]);

  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRender = useCallback(() => {
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(() => {
      void useDocumentsStore.getState().renderActiveCode();
    }, RENDER_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, []);

  const handleChange = useCallback(
    (name: string, value: number | string | boolean) => {
      const code = useModelStore.getState().cadCode ?? "";
      const patched = patchScadParam(code, name, value);
      if (patched === code) return;
      editActiveCode(patched);
      scheduleRender();
    },
    [editActiveCode, scheduleRender],
  );

  if (publicParams.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          No public parameters
        </p>
        <p className="text-xs text-muted-foreground">
          Ask the assistant to build a parametric model, or declare parameters
          under a{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
            /* [Dimensions] */
          </code>{" "}
          section in the code.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className={cn("space-y-4 p-3", isRendering && "opacity-60")}>
        {groups.map((g) => (
          <div key={g.group} className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {g.group}
            </h4>
            {g.params.map((p) => (
              <ParamRow key={p.name} param={p} onChange={handleChange} />
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function ParamRow({
  param,
  onChange,
}: {
  param: ParamDef;
  onChange: (name: string, value: number | string | boolean) => void;
}) {
  const label = param.desc ?? param.name;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`param-${param.name}`}
          className="truncate text-xs font-medium"
          title={label}
        >
          {label}
        </label>
      </div>
      <ParamControl param={param} onChange={onChange} />
    </div>
  );
}

function ParamControl({
  param,
  onChange,
}: {
  param: ParamDef;
  onChange: (name: string, value: number | string | boolean) => void;
}) {
  const { name, type, value } = param;

  if (type === "number" && param.min !== undefined && param.max !== undefined) {
    const min = param.min;
    const max = param.max;
    const step = param.step ?? (max - min) / 100;
    const numValue = typeof value === "number" ? value : Number(value);
    return (
      <div className="flex items-center gap-2">
        <Slider
          value={[numValue]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => onChange(name, v[0] ?? numValue)}
          className="flex-1"
        />
        <Input
          type="number"
          value={Number.isFinite(numValue) ? numValue : 0}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(name, Number(e.target.value))}
          className="h-7 w-16 text-xs"
        />
      </div>
    );
  }

  if (type === "choice" && param.options) {
    const strValue = typeof value === "string" ? value : String(value);
    return (
      <select
        value={strValue}
        onChange={(e) => {
          const opt = param.options?.find((o) => o === e.target.value);
          onChange(name, opt ?? e.target.value);
        }}
        className="flex h-7 w-full rounded-md border border-border bg-background px-2 text-xs"
      >
        {param.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (type === "bool") {
    const boolValue = value === true || value === "true";
    return (
      <button
        type="button"
        role="switch"
        aria-checked={boolValue}
        onClick={() => onChange(name, !boolValue)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          boolValue ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-background shadow transition-transform",
            boolValue ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    );
  }

  if (type === "number") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? value : Number(value) || 0}
        onChange={(e) => onChange(name, Number(e.target.value))}
        className="h-7 text-xs"
      />
    );
  }

  return (
    <Input
      type="text"
      value={typeof value === "string" ? value : String(value)}
      onChange={(e) => onChange(name, e.target.value)}
      className="h-7 text-xs"
    />
  );
}
