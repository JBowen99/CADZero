import { startTransition, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import type { BackendName, Topology, TriangleMesh } from "~/types";
import { useChatLiveMessagesRef, useChatState } from "~/lib/ai-chat";
import { meshUrl, topologyUrl } from "~/lib/api";
import { useModelStore } from "~/store/useModelStore";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useWorkspaceStore } from "~/store/useWorkspaceStore";

interface BuildInput {
  code?: string;
  language?: BackendName;
  message?: string;
}

interface BuildOutput {
  success?: boolean;
  meshId?: string;
  message?: string;
  stderr?: string;
  triangleCount?: number;
  partId?: string;
  revId?: string;
}

interface BuildPart {
  type: `tool-${string}`;
  toolCallId?: string;
  state?: string;
  input?: BuildInput;
  output?: BuildOutput;
}

function collectBuilds(parts: UIMessage["parts"] | undefined): BuildPart[] {
  if (!parts) return [];
  return (parts as unknown[]).filter(
    (p): p is BuildPart =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as BuildPart).type === "string" &&
      (p as BuildPart).type === "tool-update_model",
  );
}

async function fetchMesh(id: string): Promise<TriangleMesh> {
  const res = await fetch(meshUrl(id));
  if (!res.ok) throw new Error(`mesh fetch failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  if (ab.byteLength < 4) throw new Error("mesh response too small");
  const triangleCount = new DataView(ab).getUint32(0, true);
  const positions = new Float32Array(ab, 4);
  return { positions, triangleCount };
}

async function fetchTopology(id: string): Promise<Topology | null> {
  try {
    const res = await fetch(topologyUrl(id));
    if (!res.ok) return null;
    return (await res.json()) as Topology;
  } catch {
    return null;
  }
}

export function useModelSync() {
  const { messages } = useChatState();
  const liveMessagesRef = useChatLiveMessagesRef();
  const processedRef = useRef<Set<string>>(new Set());
  const wasBuildingRef = useRef(false);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const parts = collectBuilds(last?.parts);
    if (parts.length === 0) {
      if (wasBuildingRef.current) {
        wasBuildingRef.current = false;
        useModelStore.getState().setBuilding(false);
      }
      return;
    }

    let lastResolved: BuildPart | null = null;
    // True while the server is tessellating (not while code is still streaming).
    let building = false;

    for (const part of parts) {
      if (part.state === "output-available" || part.state === "output-error") {
        lastResolved = part;
      } else if (part.state === "input-available") {
        building = true;
      }
    }

    if (building !== wasBuildingRef.current) {
      wasBuildingRef.current = building;
      useModelStore.getState().setBuilding(building);
      const ac = useDocumentsStore.getState().activeClientId;
      if (ac && building) {
        useDocumentsStore.getState().setSaveState(ac, "saving");
      }
    }

    if (!lastResolved) return;
    const tcid = lastResolved.toolCallId;
    if (!tcid || processedRef.current.has(tcid)) return;
    processedRef.current.add(tcid);

    // Prefer live messages so we always have full tool code (display may stub it).
    const liveLast = liveMessagesRef.current[liveMessagesRef.current.length - 1];
    const liveBuilds = collectBuilds(liveLast?.parts);
    const liveResolved =
      liveBuilds.find((p) => p.toolCallId === tcid) ?? lastResolved;

    const { output, input } = liveResolved;
    if (output?.success && output.meshId && input?.code) {
      const language: BackendName = input.language ?? "openscad";
      const code = input.code;
      // Keep the viewport "Rendering…" badge up through mesh fetch.
      wasBuildingRef.current = true;
      useModelStore.getState().setBuilding(true);
      void fetchMesh(output.meshId)
        .then(async (mesh) => {
          const topology =
            language === "build123d"
              ? await fetchTopology(output.meshId!)
              : null;
          // Let chat UI commit before heavy store/viewport updates.
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          startTransition(() => {
            useModelStore.getState().setModel(mesh, code, language, topology);
            useDocumentsStore.getState().patchActiveDoc({
              mesh,
              topology,
              cadCode: code,
              meshCode: code,
              language,
              codeDirty: false,
            });
            wasBuildingRef.current = false;
            useModelStore.getState().setBuilding(false);
          });
        })
        .catch(() => {
          wasBuildingRef.current = false;
          useModelStore.getState().setBuilding(false);
        });
      const docs = useDocumentsStore.getState();
      const active = docs.openDocs.find(
        (d) => d.clientId === docs.activeClientId,
      );
      if (output.partId && active?.partId !== output.partId) {
        void docs.adoptBuiltPart(output.partId);
        void useWorkspaceStore.getState().refresh();
      } else if (output.revId && active?.meta) {
        docs.patchActiveDoc({
          meta: {
            ...active.meta,
            headRevId: output.revId,
            updatedAt: Date.now(),
          },
        });
        void useWorkspaceStore.getState().refresh();
      }
    } else {
      wasBuildingRef.current = false;
      useModelStore.getState().setBuilding(false);
    }
  }, [messages, liveMessagesRef]);
}
