import { create } from "zustand";
import type { UIMessage } from "ai";
import type {
  BackendName,
  PartDocument,
  PartSummary,
  RevisionDetail,
  StoredMessage,
  TriangleMesh,
} from "~/types";
import {
  checkpointUrl,
  messagesUrl,
  partMeshUrl,
  partsUrl,
  partUrl,
  restoreRevisionUrl,
  revisionUrl,
} from "~/lib/api";
import { deserializeMessages } from "~/lib/chat-persist";
import { useModelStore } from "~/store/useModelStore";
import { useWorkspaceStore } from "~/store/useWorkspaceStore";

const MAX_OPEN_TABS = 8;

export interface OpenDoc {
  clientId: string;
  partId: string | null;
  meta: PartSummary | null;
  mesh: TriangleMesh | null;
  cadCode: string;
  language: BackendName;
  chat: UIMessage[];
  chatLoaded: boolean;
  chatLoading: boolean;
  previewingRevId: string | null;
  pendingName: string | null;
  named: boolean;
  saveState: "saved" | "saving" | "unsaved";
}

interface DocumentsState {
  openDocs: OpenDoc[];
  activeClientId: string | null;
  activeId: string | null;
  activeMeta: PartSummary | null;
  previewingRevId: string | null;
  namePromptOpen: boolean;
  saveSignal: number;
  openPart: (id: string, opts?: { background?: boolean }) => Promise<void>;
  newTab: () => void;
  closeTab: (clientId: string) => void;
  setActive: (clientId: string) => void;
  patchActiveDoc: (patch: Partial<OpenDoc>) => void;
  snapshotChat: (clientId: string, chat: UIMessage[]) => void;
  loadChat: (clientId: string) => Promise<UIMessage[]>;
  setSaveState: (clientId: string, state: OpenDoc["saveState"]) => void;
  rename: (name: string) => Promise<void>;
  adoptBuiltPart: (partId: string) => Promise<void>;
  previewRevision: (revId: string) => Promise<void>;
  exitPreview: () => Promise<void>;
  restoreRevision: (revId: string) => Promise<void>;
  checkpoint: (label: string) => Promise<void>;
  saveActiveNow: () => Promise<void>;
  resolveName: (name: string) => Promise<void>;
  setNamePromptOpen: (open: boolean) => void;
}

async function decodeMesh(res: Response): Promise<TriangleMesh> {
  const ab = await res.arrayBuffer();
  if (ab.byteLength < 4) throw new Error("mesh response too small");
  const triangleCount = new DataView(ab).getUint32(0, true);
  const positions = new Float32Array(ab, 4);
  return { positions, triangleCount };
}

async function fetchMeshNullable(
  partId: string,
  blobId: string | null,
): Promise<TriangleMesh | null> {
  if (!blobId) return null;
  try {
    const res = await fetch(partMeshUrl(partId, blobId));
    if (!res.ok) return null;
    return decodeMesh(res);
  } catch {
    return null;
  }
}

function genClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function deriveActive(openDocs: OpenDoc[], activeClientId: string | null) {
  const doc = openDocs.find((d) => d.clientId === activeClientId) ?? null;
  return {
    activeId: doc?.partId ?? null,
    activeMeta: doc?.meta ?? null,
    previewingRevId: doc?.previewingRevId ?? null,
  };
}

export const useDocumentsStore = create<DocumentsState>((set, get) => {
  function buildState(openDocs: OpenDoc[], activeClientId: string | null) {
    return { openDocs, activeClientId, ...deriveActive(openDocs, activeClientId) };
  }

  function setActiveDocFields(fields: Partial<OpenDoc>) {
    set((s) => {
      const openDocs = s.openDocs.map((d) =>
        d.clientId === s.activeClientId ? { ...d, ...fields } : d,
      );
      return buildState(openDocs, s.activeClientId);
    });
  }

  function mirrorToModel(proj: {
    mesh: TriangleMesh | null;
    cadCode: string;
    language: BackendName;
  }) {
    if (proj.mesh) {
      useModelStore.getState().setModel(proj.mesh, proj.cadCode, proj.language);
    } else {
      useModelStore.getState().setCode(proj.cadCode, proj.language);
    }
  }

  function mirrorActiveToModel(doc: OpenDoc | null) {
    if (!doc) {
      useModelStore.getState().clear();
      return;
    }
    mirrorToModel(doc);
  }

  return {
    openDocs: [],
    activeClientId: null,
    activeId: null,
    activeMeta: null,
    previewingRevId: null,
    namePromptOpen: false,
    saveSignal: 0,

    openPart: async (id, opts) => {
      const existing = get().openDocs.find((d) => d.partId === id);
      if (existing) {
        if (!opts?.background) get().setActive(existing.clientId);
        return;
      }
      const res = await fetch(partUrl(id));
      if (!res.ok) return;
      const data: PartDocument = await res.json();
      const mesh = await fetchMeshNullable(id, data.meshBlobId);
      const doc: OpenDoc = {
        clientId: genClientId(),
        partId: id,
        meta: data.meta,
        mesh,
        cadCode: data.code ?? "",
        language: data.language,
        chat: [],
        chatLoaded: false,
        chatLoading: false,
        previewingRevId: null,
        pendingName: null,
        named: true,
        saveState: "saved",
      };

      set((s) => {
        let openDocs = [...s.openDocs, doc];
        let activeClientId = opts?.background
          ? s.activeClientId
          : doc.clientId;
        while (openDocs.length > MAX_OPEN_TABS) {
          const removed = openDocs[0];
          openDocs = openDocs.slice(1);
          if (removed.clientId === activeClientId) {
            activeClientId = openDocs[0]?.clientId ?? null;
          }
        }
        return buildState(openDocs, activeClientId);
      });

      if (!opts?.background) mirrorActiveToModel(doc);
    },

    newTab: () => {
      const doc: OpenDoc = {
        clientId: genClientId(),
        partId: null,
        meta: null,
        mesh: null,
        cadCode: "",
        language: "openscad",
        chat: [],
        chatLoaded: true,
        chatLoading: false,
        previewingRevId: null,
        pendingName: null,
        named: false,
        saveState: "unsaved",
      };
      set((s) => {
        let openDocs = [...s.openDocs, doc];
        let activeClientId = doc.clientId;
        while (openDocs.length > MAX_OPEN_TABS) {
          const removed = openDocs[0];
          openDocs = openDocs.slice(1);
          if (removed.clientId === activeClientId) {
            activeClientId = openDocs[0]?.clientId ?? null;
          }
        }
        return buildState(openDocs, activeClientId);
      });
      useModelStore.getState().clear();
    },

    closeTab: (clientId) => {
      set((s) => {
        const idx = s.openDocs.findIndex((d) => d.clientId === clientId);
        if (idx === -1) return {};
        const openDocs = s.openDocs.filter((d) => d.clientId !== clientId);
        let activeClientId = s.activeClientId;
        if (activeClientId === clientId) {
          const neighbor =
            openDocs[idx] ?? openDocs[idx - 1] ?? openDocs[0] ?? null;
          activeClientId = neighbor?.clientId ?? null;
        }
        return buildState(openDocs, activeClientId);
      });
      const active = get().openDocs.find(
        (d) => d.clientId === get().activeClientId,
      );
      mirrorActiveToModel(active ?? null);
    },

    setActive: (clientId) => {
      set((s) => buildState(s.openDocs, clientId));
      const doc = get().openDocs.find((d) => d.clientId === clientId) ?? null;
      mirrorActiveToModel(doc);
    },

    patchActiveDoc: (patch) => {
      setActiveDocFields(patch);
    },

    snapshotChat: (clientId, chat) => {
      set((s) => ({
        openDocs: s.openDocs.map((d) =>
          d.clientId === clientId ? { ...d, chat, chatLoaded: true } : d,
        ),
      }));
    },

    loadChat: async (clientId) => {
      const doc = get().openDocs.find((d) => d.clientId === clientId);
      if (!doc) return [];
      if (doc.chatLoaded) return doc.chat;
      set((s) => ({
        openDocs: s.openDocs.map((d) =>
          d.clientId === clientId ? { ...d, chatLoading: true } : d,
        ),
      }));
      let loaded: UIMessage[] = [];
      if (doc.partId) {
        try {
          const res = await fetch(messagesUrl(doc.partId));
          if (res.ok) {
            const records: StoredMessage[] = await res.json();
            loaded = deserializeMessages(records);
          }
        } catch {
          /* leave empty */
        }
      }
      set((s) => ({
        openDocs: s.openDocs.map((d) =>
          d.clientId === clientId
            ? { ...d, chat: loaded, chatLoaded: true, chatLoading: false }
            : d,
        ),
      }));
      return loaded;
    },

    rename: async (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const activeClientId = get().activeClientId;
      const active = get().openDocs.find((d) => d.clientId === activeClientId);
      if (!active) return;
      if (!active.partId) {
        set((s) => ({
          openDocs: s.openDocs.map((d) =>
            d.clientId === activeClientId
              ? { ...d, pendingName: trimmed }
              : d,
          ),
        }));
        return;
      }
      const res = await fetch(partUrl(active.partId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) return;
      const meta: PartSummary = await res.json();
      set((s) => {
        const openDocs = s.openDocs.map((d) =>
          d.clientId === activeClientId
            ? { ...d, meta, named: true, pendingName: null }
            : d,
        );
        return buildState(openDocs, s.activeClientId);
      });
      void useWorkspaceStore.getState().refresh();
    },

    adoptBuiltPart: async (partId) => {
      const activeClientId = get().activeClientId;
      const active = get().openDocs.find(
        (d) => d.clientId === activeClientId,
      );
      if (!active || active.partId === partId) return;
      const res = await fetch(partUrl(partId));
      if (!res.ok) return;
      const data: PartDocument = await res.json();
      let meta = data.meta;
      let named = active.named;
      if (active.pendingName && data.meta.name === "Untitled") {
        const r = await fetch(partUrl(partId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: active.pendingName }),
        });
        if (r.ok) meta = await r.json();
        named = true;
      }
      const pendingName = null;
      set((s) => {
        const openDocs = s.openDocs.map((d) =>
          d.clientId === activeClientId
            ? { ...d, partId, meta, named, pendingName, saveState: "saved" as const }
            : d,
        );
        return buildState(openDocs, s.activeClientId);
      });
      void useWorkspaceStore.getState().refresh();
    },

    previewRevision: async (revId) => {
      const partId = get().activeId;
      if (!partId) return;
      const res = await fetch(revisionUrl(partId, revId));
      if (!res.ok) return;
      const detail: RevisionDetail = await res.json();
      const mesh = await fetchMeshNullable(partId, detail.meshBlobId);
      if (mesh) {
        useModelStore.getState().setModel(mesh, detail.code, detail.language);
      } else {
        useModelStore.getState().setCode(detail.code, detail.language);
      }
      setActiveDocFields({
        previewingRevId: revId,
        mesh: mesh ?? null,
        cadCode: detail.code,
        language: detail.language,
      });
    },

    exitPreview: async () => {
      const partId = get().activeId;
      setActiveDocFields({ previewingRevId: null });
      if (!partId) return;
      const res = await fetch(partUrl(partId));
      if (!res.ok) return;
      const data: PartDocument = await res.json();
      const mesh = await fetchMeshNullable(partId, data.meshBlobId);
      mirrorToModel({ mesh, cadCode: data.code ?? "", language: data.language });
      setActiveDocFields({
        mesh,
        cadCode: data.code ?? "",
        language: data.language,
      });
    },

    restoreRevision: async (revId) => {
      const partId = get().activeId;
      if (!partId) return;
      const res = await fetch(restoreRevisionUrl(partId, revId), {
        method: "POST",
      });
      if (!res.ok) return;
      const { meta } = (await res.json()) as { meta: PartSummary };
      setActiveDocFields({ previewingRevId: null, meta });
      const docRes = await fetch(partUrl(partId));
      if (!docRes.ok) return;
      const data: PartDocument = await docRes.json();
      const mesh = await fetchMeshNullable(partId, data.meshBlobId);
      mirrorToModel({ mesh, cadCode: data.code ?? "", language: data.language });
      setActiveDocFields({
        mesh,
        cadCode: data.code ?? "",
        language: data.language,
      });
    },

    checkpoint: async (label) => {
      const partId = get().activeId;
      if (!partId) return;
      const res = await fetch(checkpointUrl(partId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (res.ok) {
        const meta = get().activeMeta;
        if (meta) setActiveDocFields({ meta: { ...meta, updatedAt: Date.now() } });
      }
    },

    setSaveState: (clientId, state) => {
      set((s) => ({
        openDocs: s.openDocs.map((d) =>
          d.clientId === clientId ? { ...d, saveState: state } : d,
        ),
      }));
    },

    setNamePromptOpen: (open) => set({ namePromptOpen: open }),

    saveActiveNow: async () => {
      const active = get().openDocs.find(
        (d) => d.clientId === get().activeClientId,
      );
      if (!active) return;
      if (!active.partId) {
        if (active.pendingName && active.pendingName.trim()) {
          await get().resolveName(active.pendingName.trim());
        } else {
          set({ namePromptOpen: true });
        }
        return;
      }
      if (!active.named) {
        set({ namePromptOpen: true });
        return;
      }
      set((s) => ({ saveSignal: s.saveSignal + 1 }));
    },

    resolveName: async (name) => {
      const activeClientId = get().activeClientId;
      if (!activeClientId) return;
      const active = get().openDocs.find((d) => d.clientId === activeClientId);
      if (!active) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      let meta: PartSummary;
      if (active.partId) {
        const res = await fetch(partUrl(active.partId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) throw new Error(`Rename failed (status ${res.status})`);
        meta = await res.json();
      } else {
        const res = await fetch(partsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, language: active.language }),
        });
        if (!res.ok) throw new Error(`Create failed (status ${res.status})`);
        meta = await res.json();
      }
      set((s) => {
        const openDocs = s.openDocs.map((d) =>
          d.clientId === activeClientId
            ? {
                ...d,
                partId: meta.id,
                meta,
                named: true,
                pendingName: null,
                saveState: "saving" as const,
              }
            : d,
        );
        return { namePromptOpen: false, ...buildState(openDocs, s.activeClientId) };
      });
      void useWorkspaceStore.getState().refresh();
      set((s) => ({ saveSignal: s.saveSignal + 1 }));
    },
  };
});
