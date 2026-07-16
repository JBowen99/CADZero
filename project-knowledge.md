# Project Knowledge — CADZero

Hard-won context for anyone (human or AI) working on this codebase. Captures
non-obvious decisions, gotchas, and conventions learned while building the MVP
frontend. Update this as the project evolves.

---

## What this is

An AI-native parametric CAD application. Users describe parts in natural
language; the app generates parametric CAD code (OpenSCAD / Build123D), executes
a modeling backend, and renders the resulting mesh in a Three.js viewport.

**Current state:** MVP frontend wrapped in an **Electron desktop shell**, plus a
**TypeScript AI-chat backend** (`server/`) that streams chat from the Vercel AI
SDK over OpenRouter. The AI conversation is real (streaming + context), and
**OpenSCAD geometry generation is wired end-to-end**: in Build mode the model
calls an `update_model` tool whose server-side `execute` runs the `openscad` CLI
and streams a parsed triangle mesh back to the viewport. Plan / Chat / Build
modes are user-selectable. **Persistence is live** (Phases 0–4): parts are
`.cadz` SQLite files in a workspace, with PDM revision history, multi-part tabs,
and per-part chat persistence. **The Code tab is now a full editor** (CodeMirror
6): edit code, Render to preview the mesh (ephemeral, no checkpoint), ⌘/Ctrl+S
to save the code as a new `manual` revision, with dirty indicators, an
out-of-sync viewport warning, and a discard/save guard before builds/restores.
Build123D *rendering* is still deferred (the editor offers a Python grammar but
only OpenSCAD can execute). See `AI CAD MVP Project Specification.md` for the
full vision.

> Note on the spec: the spec said *Python backend + WebSocket*. The AI layer was
> deliberately moved to **TypeScript + HTTP streaming** (Vercel AI SDK). The CAD
> kernel also landed in **TypeScript** (Node spawns the `openscad` binary); no
> Python service exists. The dummy WebSocket / connection layer is still mocked.

### MVP frontend layout

```
+----------------------------------------------------------+
|  Toolbar (app name, backend selector, export, theme)     |
+----------------------------------+-----------------------+
|  Part tabs (left panel only)     | Chat|Code|History tabs|
+----------------------------------+-----------------------+
|                                  |                       |
|          Viewport (R3F)          |    active panel       |
|          orbit / pan / zoom      |   (resizable panel)   |
|          grid, view cube         |                       |
+----------------------------------+-----------------------+
```

The viewport and right panel are a horizontal `ResizablePanelGroup` (drag the
handle). Default split is 70% / 30%; right panel min 20%, max 55%. **There is no
bottom status bar (removed).** The multi-part `TabBar` lives above the **viewport
only** (inside the left `ResizablePanel`, not full-width); the right `SidePanel`
has its own `Chat | Code | History` tab row. Panel-size persistence is
intentionally deferred — a storage layer will be added later.

---

## Tech stack

| Layer            | Choice                                                  |
| ---------------- | ------------------------------------------------------- |
| Framework        | React Router 8 (Framework Mode), **SPA** (`ssr: false`) |
| UI               | React 19, TypeScript                                    |
| Styling          | Tailwind CSS v4 (via `@tailwindcss/vite`), shadcn/ui (new-york) |
| 3D viewport      | three.js + @react-three/fiber + @react-three/drei       |
| State            | Zustand                                                 |
| Package manager  | **pnpm** (pnpm-lock.yaml)                               |
| Build tool       | Vite 8                                                  |
| Desktop shell    | **Electron 43** (renderer = the React Router app)       |
| Packaging        | electron-builder (Linux: AppImage + deb)               |
| AI chat backend  | **Hono** (`server/`) + **Vercel AI SDK v7** + OpenRouter |
| Tool schemas     | **zod 4** (added for AI SDK `tool()` input schemas)        |
| CAD kernel       | **OpenSCAD** (external CLI binary, spawned by Node)        |
| Persistence      | **better-sqlite3** — one `.cadz` SQLite file per part (`server/storage/`) |

**Path alias:** `~/*` → `./app/*`

---

## Commands

```bash
pnpm install          # install deps
pnpm dev              # web dev server on http://localhost:5173
pnpm dev:server       # AI chat backend (Hono) on http://localhost:8787
pnpm dev:all          # backend + web dev server together (concurrently)
pnpm dev:desktop      # native Electron app + HMR (loads the dev server)
pnpm run typecheck    # react-router typegen && tsc  (ALWAYS run before committing)
pnpm run build        # production build (SPA)
pnpm build:desktop    # build renderer + electron main (no packaging)
pnpm package:linux    # build + electron-builder -> release/*.AppImage / *.deb
```

---

## Project structure

```
app/
├── components/
│   ├── ui/                  # shadcn primitives (auto-generated, do not hand-edit)
│   ├── Toolbar.tsx
│   ├── Viewport.tsx         # R3F Canvas; off-thread geometry; imperative camera fit (FitController), view modes (shaded/solid/wireframe), grid+gizmo toggles, Frame btn + F hotkey; top-left badge = "Rendering…" while isRendering else amber "Out of sync" when the shown mesh ≠ current code (click → re-render)
│   ├── ChatPanel.tsx        # message list (native scroll; no avatars — user=right / AI=left text-bubble style, no separators) + composer; attachments render ABOVE the textarea; mode + model Selects with labels (container-query-hidden when the panel is narrow) + attach/send icon buttons (Radix tooltips) below the input; vision guard strips images on send + red warning
│   ├── ChatMessage.tsx      # memoized; renders text parts + image parts + update_model tool parts (CodeBlock + render status/stderr); restore-event messages render as a centered rounded (rounded-lg) muted pill with a RotateCcw icon (detected via message.kind === "restore")
│   ├── CodeBlock.tsx        # read-only code display with copy (used by ChatMessage tool-call cards)
│   ├── CodeEditor.tsx       # CodeMirror 6 wrapper (forwardRef exposing undo/redo; cpp() grammar for OpenSCAD, python() for build123d; Mod-Enter → onRender; dark/light via next-themes). Used only by CodeView
│   ├── CodeView.tsx         # right-panel Code tab: editable CodeMirror; header has Undo/Redo + Render (▶, ⌘/Ctrl+Enter); inline error banner on render failure; reads shared isRendering
│   ├── CodeDirtyGuardDialog.tsx # discard/save/cancel modal shown before a build/restore/preview clobbers unsaved code edits (drives useDocumentsStore.codeDirtyGuard)
│   ├── SidePanel.tsx        # right panel container with [Chat | Code | History] tab switch; Code tab shows a ● when the active doc has unsaved code edits
│   ├── TabBar.tsx           # multi-part tabs (above viewport ONLY, inside the left ResizablePanel — NOT full width): switch/close/new; switch+close-active disabled while busy
│   ├── HistoryPanel.tsx     # PDM revision timeline: list/preview/restore/checkpoint; refetches on activeMeta.updatedAt. **Native scroll** (NOT radix ScrollArea — its overlay scrollbar clipped the right edge; uses the same `overflow-y-auto overflow-x-hidden` + `min-w-0` flex pattern as ChatPanel). List items show a **version number** (`v1`=oldest … `vN`=newest, computed as `revs.length - index` since the list is newest-first) instead of per-source icons (source type still shown in the subtitle text). `isHead`/"current" badge = `rev.revId === activeMeta.headRevId`.
│   ├── NamePrompt.tsx       # Save-time name dialog (drives resolveName: PATCH existing part or POST-create a chat-only part)
│   ├── ExportDialog.tsx     # Export modal: non-dismissable while exporting (no X, Escape/overlay suppressed); indeterminate Loader2 spinner + filename + live elapsed-seconds counter; driven by useModelStore.exportJob
│   ├── WorkspaceSetup.tsx   # first-run / change-workspace modal (path input; dismissible only when not first-run)
│   ├── PartsBrowser.tsx     # dialog: list workspace parts, Open / New / Delete
│   └── RubiksGizmo.tsx      # plain 3x3x3 clickable view-cube gizmo (click any cubie → tween camera to that direction; face-center=axis view, edge/corner=iso); X/Y/Z/-X/-Y/-Z labels on the 6 face-center cubies; sits in drei GizmoHelper
├── lib/
│   ├── utils.ts             # cn() helper (required by shadcn) + sanitizeFileName() + downloadBlob() (blob <a download>, used by export)
│   ├── ai-chat.tsx          # ChatProvider: useChat({ throttle: 50 }); SPLIT into Actions/Status/State/HasMessages contexts (NOT one whole-object context); transport injects mode/model/cadCode/language
│   ├── api.ts               # chatApiUrl / meshUrl(id) / renderUrl / capabilitiesUrl / modelsUrl / exportUrl(id, format, revId?) / revisionsUrl(id) / revisionUrl(id,revId) / checkpointUrl / restoreRevisionUrl / messagesUrl (derived from VITE_AI_API_URL)
│   ├── images.ts            # image-attach helpers: data-URL + canvas downscale (>1600px), limits (≤4, ≤5MB), buildImageParts/extractImageFiles
│   ├── mesh-worker.ts       # Web Worker: computeVertexNormals + Ritter bounding sphere (transferable Float32Array)
│   ├── mesh-worker-client.ts# singleton worker + id-correlated buildMesh() promise
│   ├── useModelSync.ts      # watches the LAST chat message; on finished update_model fetches binary /api/mesh/:id -> setModel + patchActiveDoc. **Also keeps meta.headRevId fresh:** when building on an EXISTING part (`active.partId === output.partId`) it patches `meta` with `headRevId: output.revId` + bumps `updatedAt` — `adoptBuiltPart` returns early in that case so without this the History "current" badge lands one revision behind (stale headRevId). `updatedAt` change also makes HistoryPanel's list refetch.
│   ├── useTabChatSync.ts    # multi-part: on activeClientId change, snapshots useChat.messages -> outgoing doc.chat, restores incoming (lazy-loads from disk if !chatLoaded)
│   ├── useRestoreWithNote.ts # wraps store `restoreRevision` + injects a restore note into chat (so the AI has it in context + user sees it). Fetches the revisions list to get the version# + label/message, appends a UIMessage { role:"user", kind:"restore", text:"Restored to vN (\"label\")…" }. Active doc → setMessages; tab-switch race → snapshotChat into that doc. Used by BOTH restore call sites (HistoryPanel + Viewport).
│   ├── useChatPersist.ts    # debounced (~600ms) disk persist of active doc's chat; flush-on-switch + beforeunload; PUT /api/parts/:id/messages
│   └── chat-persist.ts      # serialize/deserialize UIMessage <-> StoredMessage (parts_json = full message JSON; extracts producedRevId from tool parts)
├── services/
│   └── websocket.ts         # DummyWebSocketClient — swap for real WS later (CAD progress)
├── store/
│   ├── useModelStore.ts     # mesh (TriangleMesh), cadCode, language, backend, isBuilding, isRendering, isExporting + exportJob {filename,format}|null, setModel, setCode, setCadCode (mesh-safe — edits don't clear the viewport), setBuilding, setRendering, clear, exportModel(format, ctx)
│   ├── useChatModeStore.ts  # ChatMode = "plan" | "chat" | "build" (default "build")
│   ├── useSettingsStore.ts  # model + lastOpenDocIds; hydrates from /api/settings, debounced PUT on change
│   ├── useWorkspaceStore.ts # single workspace root + parts list; init/refresh/setRoot over /api/workspace
│   ├── useDocumentsStore.ts # multi-part TABS: openDocs[] + activeClientId; denormalized activeId/activeMeta/previewingRevId; each OpenDoc also carries cadCode + meshCode (code that produced mesh → drives out-of-sync) + codeDirty; actions: openPart/newTab/closeTab/setActive/patchActiveDoc/editActiveCode/renderActiveCode/flushActiveCode/guardCodeDirty/discardActiveCodeEdits/preview/restore/checkpoint (FIFO cap 8)
│   └── useConnectionStore.ts
├── types/
│   └── index.ts             # ChatMode, TriangleMesh (positions: Float32Array), BackendName, ModelingBackend, etc.
├── routes/
│   ├── home.tsx             # the workspace; <Workspace> (inside ChatProvider) calls useModelSync + useTabChatSync; boots (settings+workspace), reopens ALL last-open tabs (first active, rest background), syncs lastOpenDocIds from openDocs
│   └── +types/*             # AUTO-GENERATED by react-router typegen (gitignored)
├── vite-env.d.ts            # augments ImportMetaEnv with VITE_AI_API_URL
├── app.css                  # Tailwind import + shadcn design tokens
└── root.tsx                 # ThemeProvider + Toaster + Layout
```

```
server/                       # AI chat backend (TypeScript, runs standalone now)
├── app.ts                    # Hono app: POST /api/chat (update_model tool, stopWhen: stepCountIs(4) self-correction, MAX_TRIANGLES=500k cap), GET /api/models, /api/mesh/:id (BINARY float32 frame), POST /api/render (render arbitrary code → ephemeral meshId, NO revision, HTTP 200+ok:false on compile error), POST /api/parts/:id/revisions (createRevision source:"manual", code-only), GET /api/parts/:id/export/:format (stl|obj|3mf; re-renders code via OpenSCAD, streams bytes; ?revId= exports a specific revision), /api/capabilities, /api/health
├── index.ts                  # Node bootstrap only (serve() via @hono/node-server) — standalone entry
├── env.ts                    # OPENROUTER_* / PORT / ALLOWED_ORIGIN / OPENSCAD_PATH; assertConfig()
├── models.ts                 # loads models.config.json, validates ids vs OpenRouter /api/v1/models (5-min cache), resolveModelId(); exposes supportsVision from architecture.input_modalities
├── models.config.json        # whitelist of selectable model ids + "default" (the UI model picker source)
├── backend-types.ts          # BackendName = "openscad" | "build123d"
├── system-prompt.ts          # BASE_PROMPT + buildInstructions(mode, cadCode, language); Y-up viewport / Z-up OpenSCAD coordinate convention + code→viewport face mapping; attached-image guidance; BUILD retry-on-error policy
├── backends/openscad.ts      # runScadToOutput(code, ext) shared helper; renderScad(code) → STL Buffer (parseStl); exportScad(code, ext) → arbitrary-format Buffer; checkOpenScad()
├── renderer/stl.ts           # parseStl(Buffer) -> { positions:number[], triangleCount } (binary + ASCII)
├── mesh-store.ts             # ephemeral Map<meshId, TriangleMesh> (LRU, capped 64)
├── storage/                  # PERSISTENCE — .cadz sqlite part files + workspace + settings (Phase 0+)
│   ├── schema.ts             # SCHEMA_SQL + SCHEMA_VERSION (meta kv, revisions, messages, meshes)
│   ├── db.ts                 # openPartDb(): LRU cache (16) of better-sqlite3 conns; journal_mode=DELETE (self-contained .cadz); migrate()
│   ├── types.ts              # PartType, PartMeta, RevisionRecord, MessageRecord, StoredMesh, sheet-metal/assembly shapes
│   ├── parts.ts              # part CRUD + createRevision (auto-advances head, optional cached mesh), listRevisions, getMeshBlob, upsertMessage
│   ├── config.ts             # getWorkspaceRoot() (WORKSPACE_DIR env ?? app config), atomic config.json + <workspace>/.cadzero/settings.json
│   └── workspace.ts          # requireWorkspaceRoot(), setWorkspaceRoot() (mkdir -p), listWorkspaceParts()
├── .env                      # gitignored — your real OpenRouter key goes here
└── .env.example              # committed template
```

```
electron/                    # Electron main process (Node side, NOT the React app)
├── main.ts                  # BrowserWindow, app:// protocol (serves renderer + PROXIES /api/* to the backend), dev-vs-packaged loading
├── preload.ts               # contextBridge stub (contextIsolation-safe) exposes { isElectron }
└── vite.config.ts           # bundles main+preload -> dist-electron/*.cjs (CommonJS)
```

`dist-electron/` and `release/` are build outputs (gitignored). The renderer
build (`build/client/`) is still produced by `react-router build` and is the
exact same SPA as the web app — Electron just loads it.

---

## Key conventions

- **Backend interface is the contract.** `app/types/index.ts` defines
  `ModelingBackend` (`create` / `modify` / `render` / `export`). The frontend
  never cares which CAD engine is running. When the CAD kernel lands, implement
  this same shape; the UI won't change.
- **The frontend performs NO geometry operations.** It only renders meshes and
  ships prompts. All CAD work happens backend-side.
- **AI chat is real and streaming.** A single `useChat({ throttle: 50 })`
  instance lives in `ChatProvider` (`app/lib/ai-chat.tsx`), wrapped around the
  whole workspace in `home.tsx`. It is exposed via FOUR narrow contexts —
  `useChatActions` (stable `sendMessage`/`stop`/`regenerate`/`setMessages`),
  `useChatStatus` (status transitions only), `useChatState` (`messages`+`error`,
  per-throttled-token), `useChatHasMessages` (boolean). **Do NOT put the whole
  `chat` object in one context** — it re-renders the ENTIRE app tree on every
  token (that was the whole-app freeze bug). `ChatMessage` is `React.memo`'d so
  prior messages skip re-render. Message history (context) is held client-side by
  `useChat` and re-sent each turn; it is ALSO persisted per-part to the `.cadz`
  (Phase 4) and lazy-loaded on tab activate (see `chat-persist.ts`).
- **CAD generation is real (OpenSCAD).** In Build mode the model calls the
  `update_model` tool (`server/app.ts`) with `{ code, language, message }`.
  The server's `execute` writes the code to a temp `.scad`, runs
  `openscad -o out.stl`, parses the STL (`server/renderer/stl.ts`) into a flat
  `positions` array, stores it in the ephemeral `server/mesh-store.ts`, and
  returns `{ success, meshId, triangleCount, stderr? }`. The client's
  `useModelSync` (`app/lib/useModelSync.ts`) watches the chat messages for a
  finished tool part, then `GET /api/mesh/:meshId` and calls
  `useModelStore.setModel(mesh, code, language)`. Plan/Chat modes instruct the
  model NOT to call the tool, so no geometry changes.
- **Modes are user-controlled, not model-decided.** `useChatModeStore`
  (`plan|chat|build`) is set by a `Select` in the `ChatPanel` footer (next to
  the model picker — there is no longer a top mode bar). The selected mode +
  model + current `cadCode`/`language` are injected into the request body by
  the transport's `prepareSendMessagesRequest` (reads live store state, so no
  stale closures) and turned into the model `instructions` via
  `buildInstructions(mode, cadCode, language)` server-side. The model never
  switches modes on its own.
- **Model picker is server-driven.** `server/models.config.json` is the
  whitelist; `listAvailableModels()` (`server/models.ts`) intersects it with
  OpenRouter's live `GET /api/v1/models` (5-min in-process cache, fails open —
  returns the raw config ids if OpenRouter is unreachable) and returns
  `{id, name}`. `GET /api/models` is what the client polls on mount. The
  selected id lives in `useSettingsStore`; `ChatPanel` auto-selects the first
  entry if none is set. `POST /api/chat` accepts `model` in the body and
  resolves it through `resolveModelId()` (unknown id → config default).
  `OPENROUTER_MODEL` env is now only a last-resort fallback.
- **Image attachments (vision).** The composer supports paste / drag-drop /
  paperclip image attach (≤4 images, ≤5 MB each, downscaled >1600px via canvas in
  `app/lib/images.ts`). Attaching is **gated on the selected model's
  `supportsVision` flag** (sourced from OpenRouter `architecture.input_modalities`
  in `server/models.ts`). AI SDK v7 `sendMessage({ text, files })` carries
  `FileUIPart` data-URLs straight through the transport → `convertToModelMessages`
  → OpenRouter `image_url`; **no server transport changes were needed**.
  `ChatMessage` renders image parts as thumbnails. A `ScanEye` icon in the model
  dropdown/trigger shows vision capability. Attach/send are icon buttons in the
  footer row with Radix tooltips. **Attachments render ABOVE the textarea.**
  **Vision guard on send:** if the user switches to a non-vision model while
  images are attached, `submit()` computes `files = visionModel ? images :
  undefined` — the images are **dropped** (text-only send) and a red
  `text-destructive` "Images won't be sent — model can't read images" warning
  shows bottom-right of the composer on the same line as the ⌘/Ctrl+Enter hint.
  (Attaching itself is also disabled when `!visionModel`, so this mainly guards
  the attach-then-switch-model case.)
- **OpenSCAD self-correction.** `streamText` uses `stopWhen: stepCountIs(4)`, so
  when a Build's `update_model` tool returns `{success:false, stderr}`, the model
  sees the error and retries within the same turn (up to ~3 times). The BUILD-mode
  prompt + the tool's failure `message` tell it to read the stderr line and fix.
  A `MAX_TRIANGLES = 500_000` cap in the tool returns a clear "too dense" error
  the model resolves by lowering `$fn`.
- **Keep the chat composer interactive while busy.** The textarea is NOT
  disabled while the assistant streams or OpenSCAD renders — `submit()` guards
  against sending mid-busy, so the user can compose the next prompt. Don't
  re-add `disabled={busy}` on the Textarea.
- **Tool part shape (client).** `useChat` assembles each tool call into one
  `UIMessage` part with `type: "tool-update_model"`, `state` in
  `input-streaming|input-available|output-available|output-error`, plus
  `input` (the code) and `output` (the render result). `ChatMessage` and
  `useModelSync` both detect parts by `p.type === "tool-update_model"`. Don't
  read `message.content` — iterate `message.parts`.
- **OpenSCAD must be on PATH** (or set `OPENSCAD_PATH`). If missing, build turns
  return `{success:false, stderr:"spawn openscad ENOENT"}` (shown in the chat
  card + status bar "OpenSCAD: not found"); Plan/Chat still work. Install on
  Fedora with `sudo dnf install openscad`.
- **Documents are persistent (Phase 1).** A *part* is a `.cadz` SQLite file in
  the workspace. The renderer never touches sqlite/fs — it only talks HTTP
  (`/api/parts/*`, `/api/workspace`, `/api/settings`). **Builds auto-persist:**
  `makeUpdateModelTool({workspaceRoot, partId})` is constructed *per request*
  (not a module const) so `execute` closes over the active part; on a successful
  render it `createRevision`s the code + cached mesh into the part's `.cadz`,
  auto-creating an "Untitled" part on the very first build (`partId` null →
  `createPart`). The tool output now carries `partId` + `revId`. The client
  transport injects `partId: useDocumentsStore.getState().activeId` into the chat
  body (same getState-at-send pattern as mode/model/cadCode). `useModelSync`
  reads the new `partId`/`revId`, calls `adoptBuiltPart` + `refresh` +
  `pushOpenDoc`. **`adoptBuiltPart` returns early when the active doc already has
  that partId** (the normal build-on-existing-part case) — so `useModelSync` also
  patches `meta.headRevId`/`updatedAt` from `output.revId` in that branch;
  without it the History "current" badge drifts one revision behind (the
  frontend meta is never re-fetched for same-part builds). **The ephemeral
  `/api/mesh/:id` is unchanged** — it still serves the *live* build; the revision's cached blob (`GET /api/parts/:id/meshes/:blobId`)
  serves the *reload/open* path. `useModelStore` is the active-doc projection
  (Viewport/CodeView read it unchanged); `useDocumentsStore` owns the partId +
  coordinates. **Chat is persisted per-part** (Phase 4: `/api/parts/:id/messages`,
  lazy-loaded on tab activate); switching tabs swaps the conversation via
  `useTabChatSync`, and the current code is also injected as AI context each turn.
- **Settings hydrate before the model picker auto-selects.** `useSettingsStore`
  `load()`s from `/api/settings` on boot (model + lastOpenDocIds). `ChatPanel`'s
  auto-select-first-model effect is **gated on `settingsLoaded`** so it doesn't
  clobber a persisted model in a race. Settings persist via a 400 ms debounced
  PUT; the file lives at `<workspace>/.cadzero/settings.json`. `lastOpenDocIds[0]`
  is reopened on launch (guarded by a `useRef` so it runs once, not on every
  `parts` refresh).
- **Saving is automatic but now visible.** Every build → a revision, chat →
  debounced disk write, settings → disk. There's no traditional "Save to a
  location" — parts live as `.cadz` files in the single workspace. What's
  exposed: per-doc `saveState` (`saved` | `saving` | `unsaved`) shown as a
  TabBar marker (● = unsaved/blank, spinner = saving);
  a **Save button** (Toolbar) + **⌘/Ctrl+S** that force-flushes chat
  (`saveSignal` → `useChatPersist` flush). A blank tab (no `partId`) is
  `unsaved`; the **first Save of an unnamed part opens `NamePrompt`** →
  `resolveName` either PATCHes an existing (built) part or POST-creates a
  chat-only part. Naming: a blank tab carries a `pendingName` (editable via
  `PartNameControl` even before build); `adoptBuiltPart` applies it on first
  build. **Rename refreshes the workspace list** (`rename` calls
  `useWorkspaceStore.refresh()`) so PartsBrowser matches — that was the
  "rename doesn't save" bug.
- **The Code tab is a real editor (CodeMirror 6).** Deps (all declared directly
  — pnpm blocks transitive imports, see gotcha #6): `@uiw/react-codemirror`,
  `codemirror`, `@codemirror/view`, `@codemirror/commands`,
  `@codemirror/lang-python`, `@codemirror/lang-cpp`, `@codemirror/theme-one-dark`.
  Grammar: `cpp()` for OpenSCAD (C-like approximation — no real SCAD grammar),
  `python()` for build123d. `CodeEditor` is `forwardRef` exposing `{undo,redo}`
  (calls `@codemirror/commands` on the internal view); the Code toolbar has
  Undo/Redo buttons, and native Ctrl+Z / Ctrl+Shift+Z work. `key={clientId}`
  remounts the editor on doc switch (a clean undo boundary; per-doc undo history
  is NOT retained across switches). Editor value = `useModelStore.cadCode` (the
  active-doc projection); the editor is controlled, but `@uiw/react-codemirror`
  only dispatches when its incoming `value` differs from its own buffer, so
  typing doesn't fight the store.
- **Editing code must NOT clear the viewport mesh.** `editActiveCode(code)`
  patches the doc's `cadCode` + `codeDirty:true` and calls
  `useModelStore.setCadCode(code)` — **not** `setCode` (which clears `mesh`).
  `setCadCode` updates only `cadCode` so the viewport keeps showing the last
  mesh (and the AI chat context `cadCode`, injected each turn, stays live).
- **`codeDirty` is its own concept — orthogonal to chat `saveState`.** A doc can
  have unsaved chat AND dirty code independently. The dirty dot shows in BOTH
  the document tab (`TabBar`: `saveState==="unsaved" || codeDirty`) and the Code
  sub-tab (`SidePanel`). Render/saving clear it; editing sets it; a build or
  restore/preview that replaces the code also clears it (see below).
- **Render = ephemeral preview, NOT a checkpoint.** `renderActiveCode()` POSTs
  to `POST /api/render` (part-independent — works for brand-new tabs with no
  `partId`; runs `renderScad` → `parseStl` → `MAX_TRIANGLES` → ephemeral
  `storeMesh`; returns `{ok, meshId, triangleCount, stderr}`, HTTP 200 with
  `ok:false` on compile/triangle errors so the client doesn't branch on status),
  decodes the mesh into the doc, and **keeps `codeDirty`** — rendering does not
  save. `useModelStore.isRendering` (set in a try/finally in `renderActiveCode`)
  drives the Code-tab Render button spinner AND the Viewport's top-left badge:
  while rendering it shows a non-clickable **"Rendering…"** spinner, otherwise
  it falls back to the amber **"Out of sync"** badge. Render is triggered by the
  ▶ button or **Mod-Enter** (a CodeMirror keymap, scoped to the editor — no
  conflict with the chat textarea's Mod-Enter). Render failures surface as a
  dismissible inline banner in the Code tab (full stderr, line numbers).
- **Out-of-sync detection uses a `meshCode` snapshot.** Each `OpenDoc` stores
  `meshCode` = the code that produced its current `mesh` (set at every
  mesh-assignment: open, render, preview, restore, build; left untouched on
  edit). Stale = `mesh != null && cadCode !== meshCode`. Because it's a
  value snapshot (not a boolean), **undo-back-to-original auto-clears the
  warning.** It lives on the doc so it survives tab switches; the Viewport
  computes it via a `useDocumentsStore` selector (no model-store change).
- **Save = a new `manual` revision (code-only).** `saveActiveNow()` (Toolbar
  Save / ⌘/Ctrl+S) now also `flushActiveCode()`s: `POST /api/parts/:id/revisions`
  → `createRevision(..., source:"manual", message:"Manual edit")`, **code-only
  (no mesh blob)**, which advances `head_rev_id` + clears `codeDirty`, then the
  existing `saveSignal++` flushes chat. For an unnamed/new doc it chains into
  `resolveName` (create part first) so one Save persists code + chat in one
  flow. `flushActiveCode` is a no-op unless `partId && codeDirty`, and on failure
  leaves `codeDirty` so the user can retry. Known limitation (accepted): a
  manually-saved revision has `mesh_blob_id` null, so **reopening it later shows
  code + empty viewport until you Render** (within a session the client mesh
  persists, so no perceived loss).
- **Dirty guard before builds/restores/preview.** `guardCodeDirty()` returns a
  promise (store-driven `CodeDirtyGuardDialog`, the `NamePrompt` pattern): if the
  active doc isn't dirty it resolves `true` immediately, else the dialog offers
  **Save** (`saveActiveNow` then proceed) / **Discard** (`discardActiveCodeEdits`
  reverts `cadCode` to the last persisted code — re-fetches head if `partId`,
  else `meshCode ?? ""` — and clears `codeDirty`) / **Cancel** (abort). It is
  prepended to `restoreRevision` + `previewRevision` (store-level → all callers
  covered), and to `ChatPanel.submit`/`guardedRegenerate` **only in build mode**
  (chat/plan turns produce no revision, so no clobber). `restoreRevision`,
  `previewRevision`, `exitPreview` set `codeDirty:false` (they replace the buffer
  with a persisted revision's code). A successful AI build also clears it
  (`useModelSync` build-success patch). Deferred: external code changes
  (build/restore) still enter CodeMirror's undo stack (would need
  `Transaction.addToHistory.of(false)`); undo/redo buttons are always enabled
  (no public `canUndo` without internals).
- **build123d in the editor:** the editor offers the Python grammar, but
  `POST /api/render` rejects non-openscad and the Render button is disabled
  with a tooltip — only OpenSCAD can execute.
- **`saveState` must always be redeemable.** `useChatPersist` only flips a doc
  to `"saving"` when it can actually persist (`partId && chatLoaded`); it must
  never set `"saving"` for a doc whose chat isn't loaded yet, because `persist`
  early-returns when `!chatLoaded` (to avoid writing stale/empty chat) — which
  would strand the spinner on `"saving"` forever (the original "Save just
  spins" bug, hit on reload when the active part's chat loads as empty).
- **Export is real (STL/OBJ/3MF).** `Toolbar`'s export menu calls
  `useModelStore.exportModel(format, { partId, revId?, name })`, which
  `GET /api/parts/:id/export/:format` — the server re-renders the **stored
  revision code** (`getHeadWithMesh`, or `getRevision(revId)` when `?revId=` is
  passed, so a history **preview exports the previewed revision**) through the
  OpenSCAD CLI via `exportScad(code, ext)` and streams the bytes back with a
  `Content-Disposition` filename. The client `fetch` → `blob` → `downloadBlob`
  (`<a download>`) — works in web + Electron. **This is a full parametric
  re-render, not a mesh dump.** During export, `exportJob {filename, format}` is
  set so the global `ExportDialog` shows: an indeterminate spinner + filename + a
  live elapsed-seconds counter. **No determinate progress bar** — OpenSCAD's mesh
  export is an opaque blocking CLI call with no progress signal. The dialog is
  **non-dismissable while running** (close button hidden; Escape / overlay clicks
  `preventDefault`; `onOpenChange` ignored) and auto-closes when the store clears
  `exportJob` on completion. **STEP is deferred** — OpenSCAD cannot emit it (B-rep
  kernel required; FreeCAD/OpenCASCADE path noted for later). Gating: `Toolbar`
  refuses export with a toast when `!activeId` (unsaved tab) — a saved/built part
  always has stored code.
- **Restore writes a note into the chat (so the AI has it in context).**
  Restoring a revision (`useRestoreWithNote`, used by BOTH HistoryPanel + the
  Viewport preview banner) appends a `UIMessage` with `role:"user"` + a `text`
  part (`Restored to vN ("label")…`) + a custom `kind:"restore"` marker. The text
  part reaches the model (sent as a user turn — the user is informing the
  assistant of the revert); the `kind` field is message-level metadata, ignored
  by `convertToModelMessages`. `ChatMessage` detects `kind==="restore"` and
  renders a **centered rounded muted pill** with a `RotateCcw` icon (not a chat
  bubble) so it reads as an event. The note persists + round-trips: it's saved by
  the normal `useChatPersist` debounce, and `chat-persist.ts` stores the **full
  message JSON** in `parts_json` (so `kind` survives reload). If a non-`user`
  role were used it would NOT survive the round-trip — `serializeMessage`
  collapses role to `user|assistant` and the server's message PUT filters roles
  to those two, so a `system` role would be dropped; that's why the note is
  `user`-role with a UI marker instead.
- **No comments in code** unless explicitly requested (house style).

---

## AI chat backend (`server/`)

Standalone **Hono** app streaming chat via the **Vercel AI SDK v7** through
**OpenRouter**. Designed to run as a separate process now and to be embedded
**in-process inside Electron's main process later** with zero app-code changes
(that's why the Hono `app` in `app.ts` is kept separate from the Node `serve()`
bootstrap in `index.ts`).

- **Endpoints:** `POST /api/chat` (AI SDK UI-message stream), `GET /api/models`
  (whitelisted, OpenRouter-validated model picker source), `GET /api/health`.
  CORS is locked to `ALLOWED_ORIGIN` (default `http://localhost:5173`).
- **OpenRouter wiring:** `@openrouter/ai-sdk-provider`'s `createOpenRouter()`
  + `openrouter.chat(MODEL)`. The model id per request comes from
  `resolveModelId(req.body.model)` — NOT a fixed env. Edit the model menu by
  editing `server/models.config.json` (ids must match OpenRouter's exactly or
  they get filtered out).
- **Server response:** `streamText(...)` → `toUIMessageStream({ stream })` →
  `createUIMessageStreamResponse({ stream })`. We override `toUIMessageStream`'s
  `onError` to **forward the real error text** (the default masks it to
  `"An error occurred."`). This is fine for a local desktop app and lets the UI
  tell auth/model errors apart — the API key itself is never in the message.
- **Errors → client:** `useChat` exposes `error` (an `Error`) and sets
  `status` to `'error'`. `describeChatError()` (`app/lib/ai-chat.tsx`) classifies
  it: network/down vs auth (401) vs model. `ChatPanel` renders a dismissible
  banner with **Retry** (`regenerate()`); there is no dedicated chat-error
  pill (the bottom status bar was removed). The banner is the single detailed
  error UI — don't duplicate it.
- **Env:** loaded via Node 22's native `--env-file-if-exists=server/.env` (no
  dotenv dep). `server/.env` is gitignored; copy from `server/.env.example`.
- **Context** is maintained client-side by `useChat` (full message history is
  POSTed each turn). Chat history is ALSO persisted per-part to the `.cadz`
  `messages` table (Phase 4) and restored on open — see `server/storage/`.

### Storage / persistence layer (`server/storage/`)

A **document-based persistence layer** for parts, revisions, chat, and settings.
**All live** (Phases 0–4): the `.cadz` SQLite container, workspace, settings,
part CRUD + build auto-revision, PDM revision history (checkpoint/restore),
multi-part tabs, and per-part chat persistence (linear). Chat forking UI is the
only remaining (deferred) piece.

Design decisions (locked during planning — see the plan in chat history):
- **One part = one `.cadz` file**, and a `.cadz` is a **SQLite database**
  (`better-sqlite3`, v12 — note: types ship separately as `@types/better-sqlite3`).
  Chosen for real PDM-style revision history + chat-DAG + cached meshes in one
  queryable, transactional, atomic file. Trade-off: not git-diff-able (git the
  workspace folder for human-readable history; the `.cadz` is a binary asset).
- **Workspace = a single folder root** the app manages (and the user may
  `git init`). All parts live as `<id>.cadz` inside it. The root is resolved by
  `getWorkspaceRoot()`: **`WORKSPACE_DIR` env ?? `config.json`'s `workspaceRoot`**.
  The env var is a dev/automation override and is **not** persisted — set the
  root via `POST /api/workspace` to persist it.
- **App config** lives in `~/.cadzero/config.json` (override dir with `CADZ_HOME`
  env). It currently holds only `workspaceRoot`. Electron will later point
  `CADZ_HOME` at `app.getPath('userData')`.
- **UI settings** live in `<workspaceRoot>/.cadzero/settings.json` (so they
  travel with the project) — model, panelSplit, viewMode, grid/gizmo toggles,
  lastOpenDocIds. `GET/PUT /api/settings`. Read is lenient (returns `{}` if no
  workspace); write requires a workspace.
- **Schema** (`server/storage/schema.ts`): a `meta` key-value table +
  `revisions` (code PDM tree, `parent_rev_id` + `mesh_blob_id` + `label`) +
  `messages` (chat DAG, `parent_msg_id` + `produced_rev_id` → links a chat turn
  to the revision it created) + `meshes` (Float32 `positions` BLOB). All
  `CREATE ... IF NOT EXISTS`; `meta.schema_version` gates migrations. **The
  migrator is a real versioned ladder now** (`addColumnIfMissing` via
  `PRAGMA table_info`): v1→v2 added `revisions.label`. Bump `SCHEMA_VERSION`
  and add a guarded step for future column changes — existing `.cadz` files are
  upgraded on first open.
- **Revisions are a DAG; HEAD is a pointer.** `createRevision` always advances
  `meta.head_rev_id`. `restoreRevision(revId)` creates a *child* of an older rev
  (`source:"fork"`, **references** the source's `mesh_blob_id` — no copy) and
  makes it HEAD (unified forward-fork: old work stays in history). `checkpoint`
  tags the current HEAD revision's `label` (no new node). `createRevision` input
  takes either `mesh` (store new blob) or `meshBlobId` (reference existing).
- **Connection cache**: `openPartDb()` keeps an LRU of 16 open better-sqlite3
  handles keyed by absolute path. `journal_mode = DELETE` + `synchronous = NORMAL`
  (NOT WAL) — chosen so a `.cadz` is **self-contained at rest** (no `-wal`/`-shm`
  sidecars) for clean copy/share/move. DELETE sacrifices write concurrency,
  fine for a single-writer desktop app.
- **`createRevision()` always advances `head_rev_id`** to the new revision,
  regardless of `parentRevId`. Linear history = `parentRevId` defaults to current
  head; forking/branching = pass an older `parentRevId`. This is the foundation
  for both the PDM revision browser and chat forking.
- **Mesh blobs** are stored as raw Float32 `Buffer`s; `storeMeshBlob()` accepts
  `number[] | Float32Array` (the existing `parseStl` produces `number[]`, so the
  `update_model` wiring can hand a rendered mesh straight in).

Endpoints added in `server/app.ts`: `GET/POST /api/workspace`,
`GET/PUT /api/settings`, part CRUD (`/api/parts/*`), revision routes
(`GET /api/parts/:id/revisions`, `GET …/revisions/:revId`,
`POST …/checkpoint`, `POST …/revisions/:revId/restore`,
`PATCH …/revisions/:revId`), and chat routes (`GET/PUT …/messages`). The build
tool (`makeUpdateModelTool`) auto-creates a revision (cached mesh) on every
successful render.

> Native-build note: `better-sqlite3` has an install script; pnpm v11 blocks it
> until approved. We set `better-sqlite3: true` under `allowBuilds` in
> `pnpm-workspace.yaml` and ran `pnpm rebuild better-sqlite3`. It runs in the
> backend (Node), NOT the renderer — so `contextIsolation`/`sandbox` are
> unaffected. When the backend embeds in Electron main, it needs an
> `@electron/rebuild` step for the Electron ABI (flagged as a packaging task).

---

### Backend gotchas

15. **AI SDK v7 renamed `system` → `instructions`.** `streamText({ system })`
    still works but is **deprecated**; use `instructions`. `convertToModelMessages`
    is async (`await` it) — it resolves file/data-URL parts. Client `useChat`
    takes a **`transport`** (`new DefaultChatTransport({ api })`), not a bare
    `api` string.
16. **The client renders `UIMessage.parts`, not `content`.** Each message is
    `{ id, role, parts: [{ type: 'text', text }, ...] }`. Iterate parts; don't
    read `message.content`. (Future: tool/data parts for meshes.)
17. **`useChat` is one instance shared via React context — but SPLIT, not whole.**
    `ChatProvider` (`app/lib/ai-chat.tsx`) runs `useChat({ throttle: 50 })` once
    and exposes it through four narrow contexts (`useChatActions`/`useChatStatus`/
    `useChatState`/`useChatHasMessages`). Never call `useChat()` per-component
    (you get separate chat states), and never stuff the whole `chat` object into
    one context — it's a fresh object every render and re-renders the entire app
    on every token (full freeze). The action methods are stable (backed by a
    `useRef` chat instance inside the SDK), so the actions context never changes.
18. **Server files ARE typechecked by the root `pnpm typecheck`** (tsconfig
    `include: ["**/*"]`). They are NOT bundled into the client (the client never
    imports `server/`). Obey `verbatimModuleSyntax` → use `import type`.
19. **esbuild build script must be approved.** `tsx` needs esbuild; pnpm v11
    blocks its postinstall until you set `esbuild: true` under `allowBuilds` in
    `pnpm-workspace.yaml` (done). If `dev:server` errors with a missing esbuild
    binary, run `pnpm rebuild esbuild`.
20. **Electron renderer talks to the backend via the `app://` proxy, NOT
    directly.** The renderer's origin is `app://bundle` (packaged) or
    `http://localhost:5173` (dev:desktop) — both would hit CORS fetching
    `localhost:8787` directly. So the renderer uses `app://bundle/api/…`
    (detected via `window.electronAPI.isElectron`), and `electron/main.ts`'s
    protocol handler forwards `/api/*` to the backend. **Do NOT remove the
    proxy or point the renderer at `localhost:8787` in Electron** — fetches will
    fail with "Failed to fetch" (= "can't reach backend"). Web dev (no
    Electron) still uses `localhost:8787` directly with CORS
    `ALLOWED_ORIGIN=http://localhost:5173`.
21. **"Backend down" surfaces as a *browser* fetch error, message varies by
    browser.** When the AI backend isn't running, `useChat`'s fetch rejects
    before any HTTP response, so `error.message` is the browser's wording —
    Chrome `"Failed to fetch"`, Safari `"Load failed"`, Firefox
    `"NetworkError..."`. `describeChatError()` regexes these
    (`/failed to fetch|network|load failed|.../i`) into the "Can't reach the AI
    backend" banner. **`regenerate()` retries the last user message** — it does
    not need the user to retype. Add new error categories to that function.

---

## shadcn / UI notes

- `components.json` is at repo root; aliases point at `~/components`,
  `~/lib/utils`, etc. CSS file is `app/app.css`.
- Add components with: `pnpm dlx shadcn@latest add <name> --yes`
- shadcn auto-installed two deps worth knowing about:
  - **`next-themes`** — required by `app/components/ui/sonner.tsx`. We wrap the
    app in `<ThemeProvider attribute="class" defaultTheme="dark">` in `root.tsx`.
    Dark mode tokens live under `.dark` in `app/app.css`.
  - **`radix-ui`** (the umbrella package) — used by button/tooltip/etc.
- `app/app.css` holds the shadcn OKLCH design tokens (`:root` + `.dark`) and the
  `@theme inline` mapping. Don't delete these.
- **Brand accent = yellow `--primary`, tuned per theme.** The stock shadcn
  "neutral" palette is fully grayscale by default; we recolored `--primary`
  (and `--ring` / `--sidebar-primary`) to a brand yellow in `app/app.css` —
  deep gold `oklch(0.60 0.14 75)` in light (legible as text on white AND takes
  white text as a fill) and bright yellow `oklch(0.82 0.16 85)` in dark (mirrors
  `chart-4`; near-black text on top). `--primary-foreground` stays white (light)
  / near-black (dark). `--accent` is intentionally LEFT neutral — it's the calm
  hover/surface fill; `primary` (yellow) is reserved for branded/selected/CTA
  states. So the selected viewport toggles, active document tabs (`TabBar`), the
  active side-panel tab (`SidePanel`), the **CAD`Zero`** wordmark (`text-primary`
  on "Zero" in `Toolbar`), the Send button, user chat bubbles, and focus rings
  all read as the brand color automatically through the token. **Don't
  reintroduce hardcoded Tailwind palette colors** (e.g. `bg-amber-500`) for these
  — they bypass the theme tokens and won't react to light/dark. Nudge the yellow
  brightness at `app/app.css` `:root` `--primary` (light) and `.dark` `--primary`
  (dark).

---

## Electron / desktop shell

- **React Router owns the renderer; Electron owns only main + preload.** Do NOT
  bring in `electron-vite` to take over the renderer build — RR 8 Framework Mode
  has its own opinions and they conflict. The desktop `build`/`dev` reuse
  `react-router build`/`react-router dev` unchanged; only the Node side is new.
- **Two run modes** (`electron/main.ts` decides via `app.isPackaged`):
  - Dev (`!app.isPackaged`): loads `http://localhost:5173` — full Vite HMR.
  - Packaged: registers a privileged **`app://`** scheme and serves
    `build/client/*` via `protocol.handle`, then loads `app://bundle/index.html`.
- **Why `app://` and not `file://` / `loadFile`:** RR's SPA build emits
  **absolute** asset paths (`/assets/entry.client-…js`, and inline
  `import("/assets/…")`). Under `file://` those resolve to the filesystem root
  and break. The `app://` origin makes `/assets/…` resolve correctly with zero
  changes to Vite `base` or the RR config. (We never touch `vite.config.ts`.)
- **main + preload are bundled to CommonJS `.cjs`.** `package.json` has
  `"type": "module"`, which would make `.js` outputs ESM — but a **sandboxed
  preload must be CJS** (`sandbox: true`). Emitting `.cjs` sidesteps both: Node
  treats `.cjs` as CJS regardless of package type. The Vite config externals
  `electron` + all Node builtins and targets `node22`.
- **Secure window defaults — keep them:** `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. The renderer is pure browser code.
- **Resolve paths with `app.getAppPath()`**, NOT `import.meta.url` / `__dirname`.
  In the bundled CJS output `import.meta.url` is unreliable, and `__dirname`
  isn't typed in ESM source. `app.getAppPath()` works uniformly in dev (project
  root) and packaged (`app.asar`), and Electron patches `fs` to read inside asar
  transparently — so the `app://` handler's `readFile`/`stat`/`existsSync` work
  on the packed archive without extra setup.
- **`webPreferences.preload`** points at `dist-electron/preload.cjs`. We include
  `dist-electron/**` and `build/client/**` in electron-builder `files`, so both
  ship inside the asar.
- **`main` field** in package.json is `dist-electron/main.cjs` — that's what
  `electron .` and the packaged app execute.
- **The desktop app proxies `/api/*` to the backend (no CORS).** The `app://`
  protocol handler in `electron/main.ts` now routes any `app://bundle/api/…`
  request to the running backend (`http://localhost:8787` by default, override
  with `ELECTRON_BACKEND_URL`), forwarding method/content-type/body and adding
  `Access-Control-Allow-Origin: *`. The renderer detects Electron
  (`window.electronAPI.isElectron`, set by the preload) and uses
  `app://bundle/api` as its API base in `app/lib/api.ts` — so all fetches are
  same-origin to the protocol and never hit browser CORS. The `app` scheme is
  registered with `corsEnabled: true`. This fixes the "can't reach backend /
  stuck save spinner" in the Electron shell.
- **The desktop app still needs the backend running as a separate process**
  (`pnpm dev:server`) — the proxy forwards to it; it does not embed it. So in
  the packaged Electron app you must run the server too (embedding the Hono
  `app` in-process is still the self-containment prerequisite).

---



### 1. React Router `+types/*` errors are NOT real errors
Editors show `Cannot find module './+types/home'` for route modules. These types
are generated by `react-router typegen` (run via `pnpm typecheck`). They are
absent until then. **Always run `pnpm run typecheck` before trusting errors.**

### 2. SPA mode is required (not optional)
`react-router.config.ts` has `ssr: false`. React Three Fiber's `<Canvas>` needs
WebGL, which is browser-only; SSR will break. Don't switch SSR back on without
wrapping the viewport in a client-only boundary.

### 3. `w-screen` / `100vw` causes horizontal overflow
`100vw` includes the vertical-scrollbar width, so the page becomes wider than
the viewport and the rightmost panel slides off-screen. **Use `w-full`** for
full-width app shells. We also pin `overflow-hidden` on `html, body`.

### 4. Flexbox scroll: every scroll container needs `min-h-0`
A flex child with `flex-1` defaults to `min-height: auto`, so it grows to fit
content and pushes siblings (e.g. the chat composer) off-screen instead of
scrolling. **Add `min-h-0` (and usually `overflow-hidden`)** to any flex item
that should scroll internally. This bit the chat panel — the message list is now
  a plain `<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">`
  (native scroll, not Radix `ScrollArea`, because Radix's overlay scrollbar was
  clipping right-aligned message bubbles / cutting content off on the right; native
  scroll reserves its own gutter). The History tab uses this **same** pattern (it
  initially used `ScrollArea` and the right edge was cut off). Still needs a
  height-constrained parent to scroll.

### 5. react-resizable-panels v4 API differs from docs/older versions
shadcn's `resizable` now installs **v4**, which is NOT API-compatible with v2/v3:
- The orientation prop is **`orientation="horizontal"`**, NOT `direction`.
- The handle is the `Separator` primitive (shadcn exposes `ResizableHandle`).
- **Size units: numbers = PIXELS, strings = PERCENTAGES.** This is the big one.
  `defaultSize={30}` = 30px (a tiny panel); `defaultSize="30%"` = 30%.
  `minSize`/`maxSize`/`defaultSize` all accept `number | string`. If a panel is
  mysteriously tiny and won't grow, you passed a number where you meant a percent
  string. We use strings everywhere (`"70%"`, `"20%"`, `"55%"`).

### 6. pnpm strict node_modules blocks transitive imports
Under pnpm, only declared dependencies are at top-level `node_modules`. You
**cannot** import a transitive dep (e.g. `three-stdlib`, which lives under
`.pnpm/`) directly — it'll fail to resolve. Either add it as a real dependency,
or derive types another way (we dropped an unused OrbitControls ref rather than
importing `three-stdlib`'s type).

### 7. `react-router typegen` prints deprecation warnings
`The envFile option is deprecated, please use envDir: false instead.` appears on
every `typecheck`/`build`. Harmless; ignore it.

### 8. The Three.js bundle is large (~1 MB / ~300 KB gzip)
The viewport chunk dominates the build. Acceptable for an MVP. When it matters,
lazy-load the viewport with `React.lazy` + a route-level split.

### 9. NEVER load the packaged app with `file://` / `loadFile`
React Router's SPA build writes absolute paths (`/assets/...`) into
`index.html`, including inline dynamic imports. `file://` resolves those against
the filesystem root → blank window / failed module loads. Use the `app://`
custom protocol (see "Electron / desktop shell"). Setting Vite `base: './'` is a
tempting shortcut but doesn't reliably rewrite RR's inline `import("...")`
strings — the protocol is the robust fix.

### 10. Electron main/preload MUST ship as CommonJS (`.cjs`)
Two reasons collide: (a) `package.json` is `"type": "module"`, so a `.js` output
is treated as ESM and a sandboxed preload can't be ESM; (b) `sandbox: true`
requires a CJS preload. Bundling to `.cjs` solves both. Don't switch the preload
to ESM unless you also turn sandboxing off (we don't want to).

### 11. Don't use `import.meta.url` / `__dirname` in electron main
The CJS bundle doesn't preserve `import.meta.url`, and `__dirname` isn't
declared in ESM source (TS error). Use `app.getAppPath()` for all path roots.

### 12. pnpm v11 blocks scripts on unapproved build deps
After adding Electron, pnpm wrote `allowBuilds: { electron-winstaller: "set
this to true or false" }` into `pnpm-workspace.yaml` and then **failed every
`pnpm <script>`** with `ERR_PNPM_IGNORED_BUILDS` until resolved. We set
`electron-winstaller: false` (it's a Windows-only packaging dep we don't need).
If a script mysteriously fails right after installing something, check this file
and approve/decline explicitly.

### 13. electron-builder requires package metadata
It errors out without `version`, and the **`.deb`** target (via the bundled
`fpm`/Ruby) additionally requires `homepage`. We set `version`/`description`/
`author`/`homepage` in package.json. (`homepage` is a placeholder
`https://example.com` — replace with the real repo/site before a public
release.)

### 14. `.deb` build needs `libcrypt.so.1` on the host
electron-builder's bundled `fpm` is a Ruby binary; that Ruby fails with
`cannot open shared object file: libcrypt.so.1` on minimal/Fedora hosts.
**AppImage builds fine without it.** For `.deb`, install the lib once:
`sudo dnf install libxcrypt-compat` (Fedora) / `sudo apt install libcrypt1`
(Debian).

### 15. Web Workers under Vite + RR + Electron (and the typing trick)
We use the standard Vite pattern: `new Worker(new URL("./mesh-worker.ts",
import.meta.url), { type: "module" })`. Vite emits the worker as its own chunk
(`build/client/assets/mesh-worker-*.js`) and RR's SPA build + Electron's
`app://` loader both serve it unchanged — no special config.
- **Don't `import three` inside a worker.** Three's main entry pulls in
  DOM-touching classes (`Texture`, etc.). We hand-rolled the normals + Ritter
  bounding-sphere loops instead (pure math, ~40 LOC). Worth it.
- **tsconfig has only `DOM`/`ES2022` libs — no `WebWorker`.** So `self` inside
  the worker is typed as `Window`, and `self.postMessage(msg, [transfer])`
  doesn't match (Window's signature requires `targetOrigin`). Work around it
  with a narrow local cast at the top of the worker file:
  `const ctx = self as unknown as { onmessage: …; postMessage(msg, transfer: Transferable[]): void }`.
- **Always transfer `Float32Array.buffer`, never the typed array.** And once
  transferred, the source is neutered — only build throwaway buffers for the
  transfer. `mesh-worker-client.ts` correlates requests by an incrementing id
  so a single shared worker can serve concurrent `buildMesh()` calls safely.

---

## R3F viewport specifics

- `<Canvas>` uses an internal `ResizeObserver`, so it resizes automatically when
  the resizable panel is dragged — no manual resize wiring needed.
- drei components in use: `OrbitControls` (`makeDefault`, damping, `onStart`/`onEnd`
  for interaction tracking), `Grid` (infinite, toggleable), `GizmoHelper` +
  custom `RubiksGizmo` (a plain 3x3x3 view cube with X/Y/Z/-X/-Y/-Z labels on the
  six face-center cubies; click any cubie → `tweenCamera(that direction)`; toggleable), `Bounds` (used as a plain measuring container —
  **NOT** declarative `fit`; fitting is driven imperatively by `FitController`).
- **Coordinate convention / Z-up→Y-up import rotation:** the viewport is a
  right-handed Y-up world (+X right, +Y up, +Z toward viewer = front). OpenSCAD is
  natively Z-up, so the model group in `Viewport.tsx` is wrapped in
  `<group rotation={[-Math.PI/2,0,0]}>` to map code +Z → viewport +Y (so idiomatic
  OpenSCAD — `cube([w,d,h])` with height on Z, `cylinder(h=…)`, `linear_extrude` —
  stands upright on the XZ grid). Under this rotation code (x,y,z) → viewport
  (x, z, -y), i.e. code +Y → viewport back(-Z), code -Y → viewport front(+Z). The
  system prompt (`server/system-prompt.ts`) documents this convention and the
  code→viewport face mapping for the model. The gizmo's labels match the VIEWPORT
  axes (Y on top, Z on the front), so they agree with what the user sees.
- **three.js CANNOT parse CSS `var()` or `oklch()`.** We previously passed
  `var(--color-background)` to `<color attach="background">` — it silently fell
  back to a bright color and broke dark mode. Fix: the Canvas is **transparent**
  (`gl: { alpha: true }`, no `<color>`) and the wrapper div uses Tailwind
  `bg-background` (theme-correct CSS) so the DOM shows through. Grid line colors
  are resolved at runtime via a DOM probe (`getComputedStyle` → canvas-2D
  normalization → hex) in `resolveTokenColor()`, recomputed on theme change.
  **Mesh surface** uses a single plain neutral hex (`#d4d4d8` — works on both
  light & dark backgrounds); **edges** are resolved the same DOM-probe way as the
  grid — `resolveTokenColor("var(--color-primary)")` (the brand yellow per theme),
  threaded as an `edgeColor` prop into `Scene` and recomputed on theme change
  (gold in light, bright yellow in dark; same color for wireframe + solid edges,
  fallback `#eab308`). Axis (RGB) + gizmo colors stay plain hex (scene
  constants, not UI tokens).
- **Camera framing is interaction-gated.** `FitController` (a child of `<Bounds>`,
  calls `useBounds()`) auto-frames a finished mesh ONLY when the user is not
  controlling the camera (`OrbitControls` `onStart`/`onEnd` → `interactingRef`).
  While orbiting/panning/zooming, nothing reorients the camera (that was the
  jitter). drei's built-in `start`-cancels-animation is the backstop. Two fit
  fns are exposed via refs: `doFit` (auto-fit on new mesh — **preserves the
  current camera angle**, drei `reset().fit()`) and `doFrame` (the Frame button +
  **`F` hotkey** — **also reorients to the front-right-top iso corner** via
  `Bounds.moveTo(center + FRONT_RIGHT_TOP_DIR·distance).lookAt(center)`, where
  `FRONT_RIGHT_TOP_DIR = (140,110,160).normalize()` matches the default camera).
  The hotkey is guarded to skip when typing in chat or when modifiers are held.
- **View modes:** Shaded (surface, no edges) / Solid (surface + creased edges via
  `EdgesGeometry` at 20° threshold, surface uses `polygonOffset` to avoid
  z-fighting) / Wireframe (edges only, no surface — NOT every triangle edge, just
  structural creases). `EdgesGeometry` is built lazily (only in Solid/Wireframe)
  and disposed on swap/unmount.
- **Viewport toolbar** (top-right): view-mode segmented group (mesh-gated;
  Shaded=`Disc`, Solid=`Box`, Wireframe=`Grid3x3`) · grid + view-cube visibility
  toggles (always visible; view-cube toggle uses the `Compass` icon) · Frame
  button (mesh-gated). **All six buttons use Radix tooltips** (`side="bottom"`,
  in the global `TooltipProvider`) instead of native `title` attrs.
- **Geometry is built off the main thread.** `Viewport.tsx`'s `useEffect`
  converts `mesh.positions` to a `Float32Array`, transfers it to the singleton
  Web Worker (`mesh-worker.ts`) which computes per-vertex normals (same
  algorithm as three's non-indexed `computeVertexNormals`) + a Ritter bounding
  sphere, and returns both as transferable `Float32Array`s. The main thread
  only attaches them to a `BufferGeometry`. While a new mesh prepares, the
  previous mesh stays visible (no flicker) and a "Processing mesh…" badge
  shows. Old geometries are `.dispose()`d via a ref so GPU memory doesn't leak.
  Lifting this out of the R3F tree (the worker call lives in the outer
  component, not inside `<Canvas>`) is what keeps the textarea/camera
  responsive during large renders.
- Empty state (no mesh) shows a dashed hint. (The old "Generating model…"
  overlay was removed once chat stopped driving the viewport; the viewport no
  longer reacts to chat status.)

---

## What's live vs. mocked

| Layer                          | Status                                                    |
| ------------------------------ | --------------------------------------------------------- |
| AI chat (`server/`, `useChat`) | **LIVE** — streams from OpenRouter via Vercel AI SDK      |
| `update_model` tool → OpenSCAD → mesh → viewport | **LIVE** — requires `openscad` binary installed |
| Plan / Chat / Build modes      | **LIVE** — user-selectable via footer Select; drive system prompt + tool use |
| Model picker                   | **LIVE** — `GET /api/models` (config ∩ live OpenRouter, incl. `supportsVision`) → footer Select with `ScanEye` vision icon, stored in `useSettingsStore` |
| Off-main-thread geometry       | **LIVE** — Web Worker builds normals + bounding sphere (no UI hitch on large meshes) |
| Image attachments (vision)     | **LIVE** — paste / drag-drop / paperclip; gated on per-model `supportsVision`; ≤4 imgs, ≤5 MB, downscaled; **non-vision model strips images on send + red warning** |
| OpenSCAD auto-retry            | **LIVE** — `stopWhen: stepCountIs(4)` + `MAX_TRIANGLES=500_000` cap; model self-corrects from stderr |
| Chat ↔ Code panel swap         | **LIVE** — `[Chat|Code|History]` tabs in `SidePanel` |
| Editable Code tab (CodeMirror 6) | **LIVE** — edit code; `codeDirty` dot in the doc tab + Code sub-tab; Render ▶ / Mod-Enter → `POST /api/render` (ephemeral, no checkpoint); ⌘/Ctrl+S → `POST /api/parts/:id/revisions` (`source:"manual"`, code-only); undo/redo buttons + native shortcuts; out-of-sync viewport badge ↔ "Rendering…" badge; discard/save guard before build/restore/preview. OpenSCAD only (build123d grammar shown but Render disabled) |
| Mesh transport                 | **LIVE** — `GET /api/mesh/:id` returns a BINARY frame `[Uint32 triangleCount][Float32 positions…]` (`application/octet-stream`); client decodes via `arrayBuffer()` + zero-copy `Float32Array` view (was JSON `number[]` — caused load-time freeze) |
| Viewport view modes / controls | **LIVE** — Shaded/Solid/Wireframe, grid + view-cube toggles, Frame btn + `F` hotkey (reorients to front-right-top iso corner + fits), Radix tooltips on all top-right buttons, interaction-gated camera, dark-mode-correct |
| OpenSCAD capability check      | **LIVE** — `GET /api/capabilities` (now checked server-side only; the bottom `StatusBar` was removed, so no UI surface currently shows it)  |
| `app/dummy/`                   | **DELETED** — retired now that real OpenSCAD is wired     |
| `app/services/websocket.ts`    | **Mocked** — `DummyWebSocketClient`; becomes real WS for CAD progress |
| Export in `useModelStore`      | **LIVE** — `GET /api/parts/:id/export/:format` re-renders the part's code via the OpenSCAD CLI (stl/obj/3mf) and streams bytes back; client fetches → blob → `<a download>` (works in web + Electron). Exports the previewed revision when `?revId=` is set. A non-dismissable `ExportDialog` (indeterminate spinner + filename + elapsed timer) shows during export. **STEP is deferred** — OpenSCAD can't emit it (needs a B-rep kernel like FreeCAD/OpenCASCADE). |
| Save UX (Save button + ⌘/Ctrl+S, per-tab `saveState` indicators, name-on-first-save) | **LIVE** — force-flushes chat; NamePrompt names/creates the part; rename now refreshes the workspace list |
| Connection status              | **Mocked** — reflects the dummy WS, not the AI backend    |
| Storage: `.cadz` SQLite container (`server/storage/`) | **LIVE** — part/revision/message/mesh schema; openPartDb LRU; journal_mode=DELETE for self-contained files |
| Storage: workspace + settings (`/api/workspace`, `/api/settings`) | **LIVE** — single workspace root (env `WORKSPACE_DIR` or app config), UI settings in `<workspace>/.cadzero/settings.json` |
| Storage: part save/open + build auto-revision (`/api/parts/*`, `/api/parts/:id/meshes/:blobId`) | **LIVE** — builds auto-create a revision (and an Untitled part on first build); reload reopens the last part (code+mesh); New/Open/Rename/Delete in Toolbar + PartsBrowser |
| Storage: PDM revision browser + checkpoint/restore | **LIVE** — History tab lists revisions (cached-mesh preview is instant); version numbers (`v1`…`vN`) replace per-source icons; **native scroll** (not Radix ScrollArea — fixes right-edge cutoff); "current" badge stays fresh (`useModelSync` patches `meta.headRevId` on same-part builds); manual checkpoint tags HEAD; restore = forward-fork (reuses source mesh) **+ injects a restore note into chat** (AI context + centered pill in the UI); read-only preview disables build |
| Storage: multi-part tabs + swap-on-activate chat | **LIVE** — openDocs[] + TabBar; single useChat swapped per active tab (mesh kept warm, instant re-render); reopen all last-open tabs on launch; switch/close disabled while busy (FIFO cap 8) |
| Storage: chat disk persistence (`/api/parts/:id/messages`) | **LIVE** — per-tab conversation survives reload (lazy-loaded on tab activate); full UIMessage JSON in `parts_json`, linear `parent_msg_id` chain, `produced_rev_id` links chat↔revision; debounced persist + flush-on-switch + beforeunload |
| Storage: chat forking UI (branch switcher / fork-from-here) | **Deferred** — DAG columns already populated (linear), so branching is a pure client add-on later (no migration) |

The tool result (`BackendResult`-shaped) is what drives the viewport via
`useModelStore.setModel`; a failed render leaves the previous mesh in place.

---

## Next steps

1. **Install OpenSCAD** on any dev/deploy machine (`sudo dnf install openscad`
   on Fedora, or set `OPENSCAD_PATH`). Without it, build turns fail gracefully.
2. **Real export ✅ DONE** — `GET /api/parts/:id/export/:format` (stl/obj/3mf)
   re-renders the part's code via the OpenSCAD CLI and streams bytes back; the
   client blob-downloads it. A non-dismissable `ExportDialog` shows progress
   (indeterminate spinner + elapsed timer). STEP is still deferred (needs a B-rep
   kernel like FreeCAD/OpenCASCADE).
3. **Real WebSocket transport** replacing `DummyWebSocketClient` (for CAD
   progress / long renders), or keep HTTP streaming for everything.
4. Embed the Hono backend in Electron's main process (import `app` from
   `server/app.ts`, call `serve()` in-process) so the desktop app is
   self-contained.
5. **Storage / persistence — in progress (Phase plan):**
   - **Phase 0 ✅ DONE** — `.cadz` SQLite container (`server/storage/`), workspace
     root, and `/api/settings` are live. Part-domain functions exist (create/list/
     get/update/delete, createRevision, listRevisions, getMeshBlob, upsertMessage)
     but are **not yet mounted as routes or wired to the UI**.
   - **Phase 1 ✅ DONE** — part CRUD routes (`/api/parts/*`), workspace picker,
     first-run `WorkspaceSetup` modal, `useWorkspaceStore` + `useDocumentsStore`
     (single-doc), `useSettingsStore` persistence (model + lastOpenDocIds),
     `Toolbar` doc controls + `PartsBrowser`, reload reopens last part. Builds
     auto-create a revision (and an Untitled part on first build) via the
     per-request `makeUpdateModelTool`. Chat is NOT persisted yet (Phase 4).
   - **Phase 2 ✅ DONE** — PDM revision history. History tab (right panel),
     `previewRevision` (read-only time-travel; cached mesh = instant; build
     disabled while previewing), `restoreRevision` (unified forward-fork, reuses
     the source mesh blob), `checkpoint` (tags current HEAD `label`). Schema
     migrated v1→v2 (`revisions.label`) via a real versioned ladder. Preview
     disables chat send + shows a viewport banner.
   - **Phase 3 ✅ DONE** — multi-part tabs. `useDocumentsStore` refactored to
     `openDocs[]` + `activeClientId` (denormalized `activeId/activeMeta/
     previewingRevId` keep selectors stable). `TabBar` (full-width); single
     `useChat` **swapped per tab** via `useTabChatSync` (snapshot outgoing →
     restore incoming); mesh kept warm per doc → instant re-render on switch.
     `useModelSync` now uses a **session `processedRef: Set<toolCallId>`** so
     restored conversations don't re-fire the ephemeral mesh fetch. New tab =
     blank (`partId:null`) until first build auto-creates it. Reopen **all**
     last-open tabs on launch (first active, rest background). FIFO cap 8;
     switch/close disabled while busy.
   - **Phase 4 ✅ DONE** — chat disk persistence (linear). `/api/parts/:id/messages`
     (GET/PUT) over the existing `messages` table; `upsertMessageBatch` writes a
     **full-replace linear chain** (`parent_msg_id` = previous msg) so
     regenerate/truncate cleanly drops orphans. `chat-persist.ts` serializes the
     whole UIMessage to `parts_json` + extracts `produced_rev_id` from tool parts
     (completes the chat↔revision link). **Lazy hydration**: chat loads on first
     tab activate (`chatLoaded`/`chatLoading` per OpenDoc; `loadChat`), not on
     open — honors "mesh warm, chat loads on demand". `useChatPersist` debounces
     (~600ms) writes to the active doc; flushes the outgoing doc on tab switch
     and the active doc on `beforeunload`. No forking UI (linear) — branching is
     a future pure-client add-on since the DAG columns are already populated.
    - **Phase 5 (next, optional)** — sheet-metal meta slot + assembly manifest
      (stored stubs, no ops), OR chat branching UI (switcher / fork-from-here),
      OR STEP export (via FreeCAD/OpenCASCADE — OpenSCAD can't emit STEP).
   - **Phase 3** — multi-part **tabs** (`useDocumentsStore` open-doc list), swap-on-
     activate single `useChat` (serialize outgoing messages, restore incoming),
     mesh LRU so switching tabs re-renders instantly while chat loads lazily,
     reopen-last-docs-on-launch.
   - **Phase 4** — chat **DAG + forking**: `parent_msg_id` storage surfaced in UI
     (branch switcher, "fork from here"); validate `UIMessage.parts` round-trips
     through `parts_json` (watch image data-URL bloat + `tool-update_model` parts).
   - **Phase 5** — sheet-metal meta slot + assembly manifest (stored stubs, no ops).
    UI prefs (panel split, view mode, grid/gizmo toggles, lastOpenDocIds) now
    persist via `/api/settings` → `<workspace>/.cadzero/settings.json`; the
    frontend stores still need to be wired to read/write them. **Code editor +
    live render/save ✅ DONE** (CodeMirror 6; ephemeral Render; manual-revision
    save; out-of-sync warning; dirty guard). Remaining editor polish: isolate
    external (build/restore) code changes from the undo stack; a real OpenSCAD
    grammar; `canUndo`/`canRedo`-aware button disabled state. Build123D
    *execution* backend as an alternative `ModelingBackend` (the editor already
    offers its Python grammar).
6. **Optional perf headroom:** R3F runs `frameloop="always"` with damping +
   1024² shadows + `preserveDrawingBuffer`; switching to `frameloop="demand"`
   (invalidate on change) and dropping `preserveDrawingBuffer` would reclaim
   frame budget if the viewport ever feels heavy on low-end GPUs.
