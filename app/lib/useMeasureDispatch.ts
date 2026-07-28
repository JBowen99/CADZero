import { useEffect, useRef } from "react";
import { useMeasureStore } from "~/store/useMeasureStore";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useModelStore } from "~/store/useModelStore";
import { measureUrl } from "~/lib/api";
import { computeClientSide } from "~/lib/measure-client";
import type { MeasureMode, MeasurePick, MeasureResult } from "~/types";

interface MeasureResponseBody {
  results?: MeasureResult[];
  error?: string;
  stderr?: string;
}

async function callMeasure(
  signal: AbortSignal,
  partId: string,
  revId: string | null,
  picks: MeasurePick[],
  mode: MeasureMode,
): Promise<MeasureResult[]> {
  const res = await fetch(measureUrl(partId, revId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ picks, mode, revId: revId ?? undefined }),
    signal,
  });
  const body = (await res.json().catch(() => null)) as MeasureResponseBody | null;
  if (!res.ok) {
    const detail =
      body?.stderr || body?.error || `Measurement failed (status ${res.status})`;
    throw new Error(detail);
  }
  if (!body || !Array.isArray(body.results)) {
    throw new Error("Measurement returned no result list.");
  }
  return body.results;
}

/**
 * Watches the measure store and dispatches measurements whenever the pick
 * buffer changes.
 *
 * Two tiers:
 * 1. **Client-side (instant)** — single-entity measurements (face area, edge
 *    length, vertex position) and vertex–vertex distance are computed from
 *    the already-loaded topology. No network round-trip.
 * 2. **Server-side (debounced 100ms)** — complex pair distances (vertex–edge,
 *    vertex–face, edge–edge, face–face) that need B-rep queries via the
 *    build123d worker.
 *
 * Mounted once in routes/home.tsx.
 */
export function useMeasureDispatch(): void {
  const active = useMeasureStore((s) => s.active);
  const mode = useMeasureStore((s) => s.mode);
  const picks = useMeasureStore((s) => s.picks);
  const revision = useMeasureStore((s) => s.revision);
  const publish = useMeasureStore((s) => s.publish);

  const activeId = useDocumentsStore((s) => s.activeId);
  const previewingRevId = useDocumentsStore((s) => s.previewingRevId);
  const headRevId = useDocumentsStore((s) => s.activeMeta?.headRevId ?? null);
  const topology = useModelStore((s) => s.topology);

  // Stable refs so the effect can read latest values without re-subscribing.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const picksRef = useRef(picks);
  picksRef.current = picks;

  useEffect(() => {
    if (!active) return;
    if (picks.length === 0) return;

    // Tier 1: try client-side computation for instant results.
    const instant = computeClientSide(
      picksRef.current,
      modeRef.current,
      topology,
    );
    if (instant !== null && instant.length > 0) {
      publish(instant, "idle", null);
      return;
    }

    // Tier 2: server dispatch for B-rep queries.
    if (!activeId) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      const reqMode = modeRef.current;
      const reqPicks = picksRef.current;
      if (reqPicks.length === 0) return; // race: picks cleared between schedule + fire
      const revId = previewingRevId ?? headRevId;
      callMeasure(controller.signal, activeId, revId, reqPicks, reqMode)
        .then((results) => {
          publish(results, "idle", null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          const message = err instanceof Error ? err.message : String(err);
          publish([], "error", message);
        });
    }, 100);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, activeId, previewingRevId, headRevId, revision, picks.length, publish, topology]);
}
