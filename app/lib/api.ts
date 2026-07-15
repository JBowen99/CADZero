const AI_API_URL =
  import.meta.env.VITE_AI_API_URL ?? "http://localhost:8787/api/chat";

const API_BASE = AI_API_URL.replace(/\/chat\/?$/, "");

export const chatApiUrl = AI_API_URL;
export const meshUrl = (id: string) => `${API_BASE}/mesh/${id}`;
export const capabilitiesUrl = `${API_BASE}/capabilities`;
export const modelsUrl = `${API_BASE}/models`;
