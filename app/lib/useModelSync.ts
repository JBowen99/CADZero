import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import type { BackendName, Topology, TriangleMesh } from "~/types";
import { useChatState } from "~/lib/ai-chat";
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
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const last = messages[messages.length - 1];
    const parts = collectBuilds(last?.parts);
    if (parts.length === 0) {
      useModelStore.getState().setBuilding(false);
      return;
    }

    let lastResolved: BuildPart | null = null;
    let building = false;

    for (const part of parts) {
      if (part.state === "output-available" || part.state === "output-error") {
        lastResolved = part;
        building = false;
      } else if (
        part.state === "input-streaming" ||
        part.state === "input-available"
      ) {
        building = true;
      }
    }

    useModelStore.getState().setBuilding(building);

    const ac = useDocumentsStore.getState().activeClientId;
    if (ac && building) {
      useDocumentsStore.getState().setSaveState(ac, "saving");
    }

    if (!lastResolved) return;
    const tcid = lastResolved.toolCallId;
    if (!tcid || processedRef.current.has(tcid)) return;
    processedRef.current.add(tcid);

    const { output, input } = lastResolved;
    if (output?.success && output.meshId && input?.code) {
      const language: BackendName = input.language ?? "openscad";
      void fetchMesh(output.meshId).then(async (mesh) => {
        const topology =
          language === "build123d" ? await fetchTopology(output.meshId!) : null;
        useModelStore
          .getState()
          .setModel(mesh, input.code!, language, topology);
        useDocumentsStore.getState().patchActiveDoc({
          mesh,
          topology,
          cadCode: input.code!,
          meshCode: input.code!,
          language,
          codeDirty: false,
        });
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
    }
  }, [messages]);
}
