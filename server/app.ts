import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { config } from "./env";
import {
  type CredentialStore,
  SUPPORTED_PROVIDERS,
  describeProviderStatus,
} from "./credentials";
import { buildInstructions, type ChatMode } from "./system-prompt";
import type { BackendName } from "./backend-types";
import { checkOpenScad } from "./backends/openscad";
import { checkBuild123d } from "./backends/build123d";
import { exportFor, renderFor } from "./backends";
import type { Topology, TopologySelection } from "./renderer/topology";
import { storeMesh, getMesh, getTopology } from "./mesh-store";
import { listAvailableModels, resolveModelId, setKeyResolver } from "./models";
import {
  getWorkspaceRoot,
  listWorkspaceParts,
  requireWorkspaceRoot,
  setWorkspaceRoot,
} from "./storage/workspace";
import {
  readSettings,
  writeSettings,
  type AppSettings,
} from "./storage/config";
import {
  createPart,
  createRevision,
  deletePart,
  getHeadWithMesh,
  getMeshBlob,
  getPart,
  getRevision,
  listParts,
  listMessages,
  listRevisionSummaries,
  restoreRevision,
  setRevisionLabel,
  updatePartMeta,
  upsertMessageBatch,
} from "./storage/parts";
import type { PartType } from "./storage/types";

export interface ServerOptions {
  credentialStore: CredentialStore;
}

const MAX_TRIANGLES = 500_000;

let credentialStore: CredentialStore | null = null;

export function configureServer(store: CredentialStore): void {
  credentialStore = store;
  setKeyResolver(() => store.get("openrouter"));
}

function requireCredentialStore(): CredentialStore {
  if (!credentialStore) {
    throw new Error(
      "Server not configured. Call configureServer() with a credential store before serving requests.",
    );
  }
  return credentialStore;
}

const EXPORT_FORMATS: Record<string, { ext: string; mime: string }> = {
  stl: { ext: "stl", mime: "model/stl" },
  obj: { ext: "obj", mime: "model/obj" },
  "3mf": { ext: "3mf", mime: "model/3mf" },
  step: { ext: "step", mime: "application/step" },
};

function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/[^\w\-.]+/g, "_").replace(/_+/g, "_");
  return cleaned.length > 0 ? cleaned : "model";
}

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: config.allowedOrigin,
    allowHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.get("/api/health", (c) =>
  c.json({ ok: true, model: config.openrouterModel }),
);

app.get("/api/models", async (c) => {
  const models = await listAvailableModels();
  return c.json({ models });
});

app.get("/api/capabilities", async (c) => {
  const [openscad, build123d] = await Promise.all([
    checkOpenScad(),
    checkBuild123d(),
  ]);
  return c.json({
    openscad: openscad.ok ? { ok: true, version: openscad.version } : { ok: false, error: openscad.error },
    build123d: build123d.ok ? { ok: true, version: build123d.version } : { ok: false, error: build123d.error },
  });
});

app.get("/api/workspace", (c) => {
  const root = getWorkspaceRoot();
  return c.json({ root, configured: root != null, parts: listWorkspaceParts() });
});

app.post("/api/workspace", async (c) => {
  const body = await c.req.json<{ root?: unknown }>().catch(() => null);
  if (!body || typeof body.root !== "string" || body.root.length === 0) {
    return c.json({ error: "root required" }, 400);
  }
  try {
    const abs = setWorkspaceRoot(body.root);
    return c.json({ root: abs, configured: true, parts: listWorkspaceParts() });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "invalid workspace" },
      400,
    );
  }
});

app.get("/api/settings", (c) => c.json(readSettings()));

app.put("/api/settings", async (c) => {
  const body = await c.req.json<AppSettings>().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid settings" }, 400);
  }
  try {
    return c.json(writeSettings(body));
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "settings write failed" },
      400,
    );
  }
});

app.get("/api/provider", (c) => {
  const store = requireCredentialStore();
  return c.json(describeProviderStatus(store));
});

app.put("/api/provider/:name/key", async (c) => {
  const name = c.req.param("name");
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(name)) {
    return c.json({ error: `Unsupported provider: ${name}` }, 400);
  }
  const body = await c.req.json<{ apiKey?: unknown }>().catch(() => null);
  if (!body || typeof body.apiKey !== "string" || body.apiKey.trim().length === 0) {
    return c.json({ error: "apiKey (non-empty string) required" }, 400);
  }
  const store = requireCredentialStore();
  try {
    store.set(name, body.apiKey.trim());
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "credential write failed" },
      400,
    );
  }
  return c.json(describeProviderStatus(store));
});

function sendMeshBody(
  c: Context,
  mesh: { triangleCount: number; positions: Buffer } | null,
) {
  if (!mesh) return c.json({ error: "mesh not found" }, 404);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(mesh.triangleCount);
  return c.body(Buffer.concat([header, mesh.positions]), 200, {
    "Content-Type": "application/octet-stream",
  });
}

function workspaceOr400(c: Context): string | Response {
  const root = getWorkspaceRoot();
  if (!root) return c.json({ error: "No workspace configured" }, 400);
  return root;
}

app.get("/api/parts", (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  return c.json(listParts(root));
});

app.post("/api/parts", async (c) => {
  let root: string;
  try {
    root = requireWorkspaceRoot();
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "No workspace" },
      400,
    );
  }
  const body: {
    name?: string;
    type?: PartType;
    language?: BackendName;
  } = await c.req.json().catch(() => ({}));
  const meta = createPart(root, {
    name:
      body.name && body.name.trim().length > 0
        ? body.name.trim()
        : "Untitled",
    type: body.type ?? "part",
    language: body.language ?? "openscad",
  });
  return c.json(meta, 201);
});

app.get("/api/parts/:id", (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const id = c.req.param("id");
  const meta = getPart(root, id);
  if (!meta) return c.json({ error: "part not found" }, 404);
  const head = getHeadWithMesh(root, id);
  return c.json({
    meta,
    code: head?.code ?? null,
    language: head?.language ?? meta.language,
    headRevId: head?.headRevId ?? null,
    meshBlobId: head?.meshBlobId ?? null,
  });
});

app.patch("/api/parts/:id", async (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const body: {
    name?: string;
    type?: PartType;
    language?: unknown;
  } | null = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid body" }, 400);
  if (body.language !== undefined) {
    return c.json(
      { error: "A part's backend language is immutable." },
      409,
    );
  }
  const meta = updatePartMeta(root, c.req.param("id"), body);
  if (!meta) return c.json({ error: "part not found" }, 404);
  return c.json(meta);
});

app.delete("/api/parts/:id", (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const ok = deletePart(root, c.req.param("id"));
  if (!ok) return c.json({ error: "part not found" }, 404);
  return c.json({ ok: true });
});

app.get("/api/parts/:id/meshes/:blobId", (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const mesh = getMeshBlob(root, c.req.param("id"), c.req.param("blobId"));
  return sendMeshBody(c, mesh);
});

app.get("/api/parts/:id/topology/:blobId", (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const mesh = getMeshBlob(root, c.req.param("id"), c.req.param("blobId"));
  if (!mesh) return c.json({ error: "mesh not found" }, 404);
  if (!mesh.topology) return c.json({ error: "no topology" }, 404);
  return c.json(mesh.topology);
});

app.get("/api/parts/:id/export/:format", async (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const partId = c.req.param("id");
  const format = c.req.param("format").toLowerCase();
  const spec = EXPORT_FORMATS[format];
  if (!spec) {
    return c.json({ error: `unsupported export format: ${format}` }, 400);
  }

  const revId = c.req.query("revId");
  let code: string | null = null;
  let exportLanguage: BackendName = "openscad";
  if (revId) {
    const rev = getRevision(root, partId, revId);
    code = rev?.code ?? null;
    exportLanguage = rev?.language ?? "openscad";
  } else {
    const head = getHeadWithMesh(root, partId);
    code = head?.code ?? null;
    exportLanguage = head?.language ?? "openscad";
  }
  if (!code) {
    return c.json({ error: "part has no code to export" }, 400);
  }
  if (format === "step" && exportLanguage !== "build123d") {
    return c.json(
      { error: "STEP export requires a Build123D part (B-rep kernel)." },
      400,
    );
  }

  const rendered = await exportFor(exportLanguage, code, spec.ext);
  if (!rendered.ok || !rendered.data) {
    return c.json(
      {
        error: `${exportLanguage} export failed`,
        stderr: rendered.stderr || "unknown error",
      },
      400,
    );
  }

  const meta = getPart(root, partId);
  const filename = `${sanitizeFileName(meta?.name ?? "model")}.${spec.ext}`;
  return c.body(new Uint8Array(rendered.data), 200, {
    "Content-Type": spec.mime,
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

app.get("/api/parts/:id/revisions", (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  return c.json(listRevisionSummaries(root, c.req.param("id")));
});

app.get("/api/parts/:id/revisions/:revId", (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const rev = getRevision(root, c.req.param("id"), c.req.param("revId"));
  if (!rev) return c.json({ error: "revision not found" }, 404);
  return c.json(rev);
});

app.post("/api/parts/:id/revisions/:revId/restore", (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const rev = restoreRevision(root, c.req.param("id"), c.req.param("revId"));
  if (!rev) return c.json({ error: "revision not found" }, 404);
  const meta = getPart(root, c.req.param("id"));
  return c.json({ meta, rev });
});

app.post("/api/parts/:id/revisions", async (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const body: {
    code?: string;
    language?: BackendName;
    message?: string;
    label?: string;
  } = await c.req.json().catch(() => null);
  if (!body || typeof body.code !== "string") {
    return c.json({ error: "code required" }, 400);
  }
  const partId = c.req.param("id");
  const existingMeta = getPart(root, partId);
  if (!existingMeta) return c.json({ error: "part not found" }, 404);
  if (
    body.language !== undefined &&
    body.language !== existingMeta.language
  ) {
    return c.json(
      { error: "A part's backend language is immutable." },
      409,
    );
  }
  const language: BackendName = existingMeta.language;

  let mesh: { positions: number[] | Float32Array; triangleCount: number } | null = null;
  let topology: Topology | null = null;
  let renderError: string | null = null;
  const rendered = await renderFor(language, body.code);
  if (rendered.ok && rendered.mesh) {
    const m = rendered.mesh;
    if (m.triangleCount > MAX_TRIANGLES) {
      renderError = `The model is ${m.triangleCount.toLocaleString()} triangles — too dense to preview. Saved the code without geometry.`;
    } else {
      mesh = m;
      topology = rendered.topology ?? null;
    }
  } else {
    renderError =
      rendered.stderr?.trim() ||
      `${language === "build123d" ? "Build123D" : "OpenSCAD"} failed to render the saved code. Saved the code without geometry.`;
  }

  const rev = createRevision(root, partId, {
    code: body.code,
    language,
    source: "manual",
    message: body.message?.trim() || "Manual edit",
    label: body.label?.trim() || null,
    mesh,
    topology,
  });
  if (!rev) return c.json({ error: "part not found" }, 404);
  const meta = getPart(root, partId);
  return c.json({ meta, rev, renderError }, 201);
});

app.patch("/api/parts/:id/revisions/:revId", async (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const body: { label?: string } | null = await c.req
    .json()
    .catch(() => null);
  if (!body) return c.json({ error: "invalid body" }, 400);
  const rev = setRevisionLabel(
    root,
    c.req.param("id"),
    c.req.param("revId"),
    body.label?.trim() ?? null,
  );
  if (!rev) return c.json({ error: "revision not found" }, 404);
  return c.json(rev);
});

app.get("/api/parts/:id/messages", (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  return c.json(listMessages(root, c.req.param("id")));
});

app.put("/api/parts/:id/messages", async (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const body: { messages?: unknown } = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) {
    return c.json({ error: "messages array required" }, 400);
  }
  const msgs = (body.messages as Array<{
    msgId: string;
    role: "user" | "assistant";
    partsJson: string;
    createdAt?: number;
    producedRevId?: string | null;
  }>).filter(
    (m) =>
      typeof m?.msgId === "string" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.partsJson === "string",
  );
  upsertMessageBatch(root, c.req.param("id"), msgs);
  return c.json({ ok: true, count: msgs.length });
});

app.get("/api/mesh/:id", (c) => {
  const mesh = getMesh(c.req.param("id"));
  if (!mesh) return c.json({ error: "mesh not found" }, 404);
  const positions = Buffer.from(Float32Array.from(mesh.positions).buffer);
  return sendMeshBody(c, { triangleCount: mesh.triangleCount, positions });
});

app.get("/api/topology/:id", (c) => {
  const topology = getTopology(c.req.param("id"));
  if (!topology) return c.json({ error: "topology not found" }, 404);
  return c.json(topology);
});

app.post("/api/render", async (c) => {
  const body = await c.req
    .json<{ code?: string; language?: BackendName }>()
    .catch(() => null);
  if (!body || typeof body.code !== "string") {
    return c.json({ ok: false, message: "code required" }, 400);
  }
  const language: BackendName =
    body.language === "build123d" ? "build123d" : "openscad";
  const rendered = await renderFor(language, body.code);
  if (!rendered.ok || !rendered.mesh) {
    return c.json({
      ok: false,
      message: `${language === "build123d" ? "Build123D" : "OpenSCAD"} failed to render the model.`,
      stderr: rendered.stderr || "Unknown render error.",
    });
  }
  const mesh = rendered.mesh;
  if (mesh.triangleCount > MAX_TRIANGLES) {
    return c.json({
      ok: false,
      message: `The model is ${mesh.triangleCount.toLocaleString()} triangles — too dense to handle smoothly.`,
      stderr: "",
    });
  }
  const meshId = storeMesh(mesh, rendered.topology ?? null);
  return c.json({
    ok: true,
    meshId,
    triangleCount: mesh.triangleCount,
    stderr: rendered.stderr || "",
  });
});

function makeUpdateModelTool(opts: {
  workspaceRoot: string | null;
  partId: string | null;
}) {
  return tool({
    description:
      "Update the CAD model. Provide the COMPLETE script for the active backend (not a diff); it will be executed and rendered to a mesh. Only call this in BUILD mode.",
    inputSchema: z.object({
      code: z
        .string()
        .describe("The full, self-contained script for the model (OpenSCAD or Build123D Python, matching the part's language)."),
      language: z
        .enum(["openscad", "build123d"])
        .describe("The modeling language. Must match the active part's language."),
      message: z
        .string()
        .describe("A short user-facing description of what changed."),
    }),
    execute: async ({ code, language, message }) => {
      if (opts.workspaceRoot && opts.partId) {
        const existing = getPart(opts.workspaceRoot, opts.partId);
        if (existing && existing.language !== language) {
          return {
            success: false,
            message: `This is a ${existing.language} part — its backend is locked at creation and can't change. Call update_model again with language="${existing.language}" and a complete ${existing.language} script.`,
            stderr: "",
            durationMs: 0,
          };
        }
      }
      const rendered = await renderFor(language, code);
      if (!rendered.ok || !rendered.mesh) {
        const backendLabel = language === "build123d" ? "Build123D" : "OpenSCAD";
        return {
          success: false,
          message:
            `${backendLabel} failed to render the model. Read the stderr below — it names the line number of the problem. Fix that issue in the full script and call update_model again.`,
          stderr: rendered.stderr || "Unknown render error.",
          durationMs: rendered.durationMs,
        };
      }
      const mesh = rendered.mesh;
      if (mesh.triangleCount > MAX_TRIANGLES) {
        const hint =
          language === "build123d"
            ? "Use coarser mesh tolerances, simplify the geometry, or use fewer repeated features"
            : "Reduce $fn, simplify the geometry, or use fewer repeated features";
        return {
          success: false,
          message: `The model is ${mesh.triangleCount.toLocaleString()} triangles — too dense to handle smoothly. ${hint}, then call update_model again.`,
          stderr: "",
          durationMs: rendered.durationMs,
        };
      }
      const topology = rendered.topology ?? null;
      const meshId = storeMesh(mesh, topology);

      let partId = opts.partId;
      let revId: string | null = null;
      if (opts.workspaceRoot) {
        if (!partId) {
          const created = createPart(opts.workspaceRoot, {
            name: "Untitled",
            type: "part",
            language,
          });
          partId = created.id;
        }
        const rev = createRevision(opts.workspaceRoot, partId, {
          code,
          language,
          source: "chat",
          message: message ?? null,
          mesh: {
            positions: mesh.positions,
            triangleCount: mesh.triangleCount,
          },
          topology,
        });
        revId = rev?.revId ?? null;
      }

      return {
        success: true,
        message,
        stderr: rendered.stderr || "",
        meshId,
        triangleCount: mesh.triangleCount,
        durationMs: rendered.durationMs,
        partId,
        revId,
      };
    },
  });
}

interface ChatRequestBody {
  messages: UIMessage[];
  mode?: ChatMode;
  model?: string;
  cadCode?: string | null;
  language?: BackendName;
  partId?: string | null;
  selection?: TopologySelection[];
  codeExternallyModified?: boolean;
}

app.post("/api/chat", async (c) => {
  const { messages, mode, model, cadCode, language, partId, selection, codeExternallyModified } =
    await c.req.json<ChatRequestBody>();

  const safeMode: ChatMode =
    mode === "plan" || mode === "build" ? mode : "chat";
  const safeLanguage: BackendName = language ?? "openscad";
  const modelId = await resolveModelId(model);
  const safeSelection = Array.isArray(selection) ? selection : [];

  let workspaceRoot: string | null = null;
  try {
    workspaceRoot = requireWorkspaceRoot();
  } catch {
    workspaceRoot = null;
  }

  const apiKey = requireCredentialStore().get("openrouter");
  if (!apiKey) {
    return c.json(
      {
        error:
          "No OpenRouter API key configured. Open Settings (gear icon) and add your key, then try again.",
      },
      401,
    );
  }
  const openrouter = createOpenRouter({ apiKey });

  const result = streamText({
    model: openrouter.chat(modelId),
    instructions: buildInstructions(
      safeMode,
      cadCode ?? null,
      safeLanguage,
      safeSelection,
      codeExternallyModified === true,
    ),
    messages: await convertToModelMessages(messages),
    tools: {
      update_model: makeUpdateModelTool({
        workspaceRoot,
        partId: partId ?? null,
      }),
    },
    stopWhen: stepCountIs(4),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        if (error == null) return "unknown error";
        if (typeof error === "string") return error;
        if (error instanceof Error) return error.message;
        return JSON.stringify(error);
      },
    }),
  });
});
