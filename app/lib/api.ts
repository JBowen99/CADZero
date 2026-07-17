const isElectron =
  typeof window !== "undefined" &&
  Boolean(
    (window as { electronAPI?: { isElectron?: boolean } }).electronAPI
      ?.isElectron,
  );

const AI_API_URL = isElectron
  ? "app://bundle/api/chat"
  : import.meta.env.VITE_AI_API_URL ?? "http://localhost:8787/api/chat";

const API_BASE = AI_API_URL.replace(/\/chat\/?$/, "");

export const chatApiUrl = AI_API_URL;
export const meshUrl = (id: string) => `${API_BASE}/mesh/${id}`;
export const topologyUrl = (id: string) => `${API_BASE}/topology/${id}`;
export const renderUrl = `${API_BASE}/render`;
export const capabilitiesUrl = `${API_BASE}/capabilities`;
export const modelsUrl = `${API_BASE}/models`;
export const workspaceUrl = `${API_BASE}/workspace`;
export const settingsUrl = `${API_BASE}/settings`;
export const partsUrl = `${API_BASE}/parts`;
export const partUrl = (id: string) => `${API_BASE}/parts/${id}`;
export const partMeshUrl = (id: string, blobId: string) =>
  `${API_BASE}/parts/${id}/meshes/${blobId}`;
export const partTopologyUrl = (id: string, blobId: string) =>
  `${API_BASE}/parts/${id}/topology/${blobId}`;
export const exportUrl = (
  id: string,
  format: string,
  revId?: string | null,
) =>
  `${API_BASE}/parts/${id}/export/${format}${
    revId ? `?revId=${encodeURIComponent(revId)}` : ""
  }`;
export const revisionsUrl = (id: string) => `${partUrl(id)}/revisions`;
export const revisionUrl = (id: string, revId: string) =>
  `${partUrl(id)}/revisions/${revId}`;
export const checkpointUrl = (id: string) => `${partUrl(id)}/checkpoint`;
export const restoreRevisionUrl = (id: string, revId: string) =>
  `${partUrl(id)}/revisions/${revId}/restore`;
export const messagesUrl = (id: string) => `${partUrl(id)}/messages`;
