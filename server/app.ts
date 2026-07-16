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
import { buildInstructions, type ChatMode } from "./system-prompt";
import type { BackendName } from "./backend-types";
import { renderScad, checkOpenScad } from "./backends/openscad";
import { parseStl } from "./renderer/stl";
import { storeMesh, getMesh } from "./mesh-store";
import { listAvailableModels, resolveModelId } from "./models";
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
  checkpoint,
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

const openrouter = createOpenRouter({ apiKey: config.openrouterApiKey });

const MAX_TRIANGLES = 500_000;

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: config.allowedOrigin,
    allowHeaders: ["Content-Type"],
    allowMethods: ["POST", "GET", "OPTIONS"],
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
  const openscad = await checkOpenScad();
  return c.json({
    openscad: openscad.ok ? { ok: true, version: openscad.version } : { ok: false, error: openscad.error },
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
    language?: BackendName;
  } | null = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid body" }, 400);
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

app.post("/api/parts/:id/checkpoint", async (c) => {
  const root = workspaceOr400(c);
  if (typeof root !== "string") return root;
  const body: { label?: string } | null = await c.req.json().catch(() => null);
  const label = body?.label?.trim();
  if (!label) return c.json({ error: "label required" }, 400);
  const rev = checkpoint(root, c.req.param("id"), label);
  if (!rev) return c.json({ error: "no head revision to checkpoint" }, 404);
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

function makeUpdateModelTool(opts: {
  workspaceRoot: string | null;
  partId: string | null;
}) {
  return tool({
    description:
      "Update the CAD model. Provide the COMPLETE OpenSCAD script (not a diff); it will be executed and rendered to a mesh. Only call this in BUILD mode.",
    inputSchema: z.object({
      code: z
        .string()
        .describe("The full, self-contained OpenSCAD script for the model."),
      language: z.literal("openscad").describe("The modeling language."),
      message: z
        .string()
        .describe("A short user-facing description of what changed."),
    }),
    execute: async ({ code, message }) => {
      const rendered = await renderScad(code);
      if (!rendered.ok || !rendered.stl) {
        return {
          success: false,
          message:
            "OpenSCAD failed to render the model. Read the stderr below — it names the line number of the problem. Fix that issue in the full script and call update_model again.",
          stderr: rendered.stderr || "Unknown render error.",
          durationMs: rendered.durationMs,
        };
      }
      const mesh = parseStl(rendered.stl);
      if (mesh.triangleCount > MAX_TRIANGLES) {
        return {
          success: false,
          message: `The model is ${mesh.triangleCount.toLocaleString()} triangles — too dense to handle smoothly. Reduce $fn, simplify the geometry, or use fewer repeated features, then call update_model again.`,
          stderr: "",
          durationMs: rendered.durationMs,
        };
      }
      const meshId = storeMesh(mesh);

      let partId = opts.partId;
      let revId: string | null = null;
      if (opts.workspaceRoot) {
        if (!partId) {
          const created = createPart(opts.workspaceRoot, {
            name: "Untitled",
            type: "part",
            language: "openscad",
          });
          partId = created.id;
        }
        const rev = createRevision(opts.workspaceRoot, partId, {
          code,
          language: "openscad",
          source: "chat",
          message: message ?? null,
          mesh: {
            positions: mesh.positions,
            triangleCount: mesh.triangleCount,
          },
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
}

app.post("/api/chat", async (c) => {
  const { messages, mode, model, cadCode, language, partId } =
    await c.req.json<ChatRequestBody>();

  const safeMode: ChatMode =
    mode === "plan" || mode === "build" ? mode : "chat";
  const safeLanguage: BackendName = language ?? "openscad";
  const modelId = await resolveModelId(model);

  let workspaceRoot: string | null = null;
  try {
    workspaceRoot = requireWorkspaceRoot();
  } catch {
    workspaceRoot = null;
  }

  const result = streamText({
    model: openrouter.chat(modelId),
    instructions: buildInstructions(safeMode, cadCode ?? null, safeLanguage),
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
